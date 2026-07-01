const DEFAULT_BASE_URL =
  process.env.KILSYSTEM_LICENSE_API_URL || 'https://kilsystemangola.com/api/licenses';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BODY_BYTES = 16 * 1024;
const PUBLIC_SERVER_CODES = new Set([
  'license_not_found', 'blocked', 'revoked', 'expired', 'MACHINE_LIMIT',
  'DEMO_ALREADY_USED', 'activation_not_found', 'rate_limited',
]);

function publicError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.isPublicLicenseError = true;
  return error;
}

function createLicenseClient({
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  fetchImpl = globalThis.fetch,
} = {}) {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:') throw new Error('License API requires HTTPS');
  if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation is required');
  const root = url.toString().replace(/\/+$/, '');

  async function post(action, input) {
    const body = JSON.stringify(input ?? {});
    if (Buffer.byteLength(body, 'utf8') > maxBodyBytes) {
      throw publicError('LICENSE_REQUEST_INVALID', 'Pedido de licença inválido.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${root}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body,
        signal: controller.signal,
        redirect: 'error',
      });
      let result = null;
      const declared = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(declared) && declared > maxBodyBytes) {
        throw publicError('LICENSE_RESPONSE_INVALID', 'Resposta de licença inválida.');
      }
      if (response.body && typeof response.body[Symbol.asyncIterator] === 'function') {
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
          const buffer = Buffer.from(chunk);
          size += buffer.length;
          if (size > maxBodyBytes) {
            throw publicError('LICENSE_RESPONSE_INVALID', 'Resposta de licença inválida.');
          }
          chunks.push(buffer);
        }
        try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}
      } else if (typeof response.text === 'function') {
        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > maxBodyBytes) {
          throw publicError('LICENSE_RESPONSE_INVALID', 'Resposta de licença inválida.');
        }
        try { result = JSON.parse(text); } catch {}
      } else {
        result = await response.json().catch(() => null);
      }
      if (!response.ok || result?.ok !== true || !result.data) {
        const code = PUBLIC_SERVER_CODES.has(result?.error?.code)
          ? result.error.code : 'LICENSE_SERVER_ERROR';
        throw publicError(code, 'Não foi possível validar a licença.');
      }
      return result.data;
    } catch (error) {
      if (error?.isPublicLicenseError === true) throw error;
      throw publicError(
        error?.name === 'AbortError' ? 'LICENSE_REQUEST_TIMEOUT' : 'LICENSE_SERVICE_UNAVAILABLE',
        'Não foi possível contactar o serviço de licenças.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    activate: (input) => post('activate', input),
    validate: (input) => post('validate', input),
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_TIMEOUT_MS,
  createLicenseClient,
};

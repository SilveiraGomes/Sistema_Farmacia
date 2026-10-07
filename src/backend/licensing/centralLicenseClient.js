const DEFAULT_BASE_URL =
  process.env.KILSYSTEM_LICENSE_API_URL || 'https://license.kilsystemangola.com';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const PUBLIC_SERVER_CODES = new Set([
  'LICENSE_NOT_FOUND', 'LICENSE_INVALID', 'LICENSE_EXPIRED', 'LICENSE_REVOKED',
  'LICENSE_SUSPENDED', 'DEVICE_LIMIT', 'TRIAL_ALREADY_USED',
  'PRODUCT_NOT_AUTHORIZED', 'DEVICE_NOT_AUTHORIZED',
]);

function publicError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.isPublicLicenseError = true;
  return error;
}

function createCentralLicenseClient({
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  fetchImpl = globalThis.fetch,
} = {}) {
  const url = new URL(baseUrl);
  const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) throw new Error('License API requires HTTPS');
  if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation is required');
  const root = url.toString().replace(/\/+$/, '');

  async function post(path, input) {
    const body = JSON.stringify(input ?? {});
    if (Buffer.byteLength(body, 'utf8') > maxBodyBytes) {
      throw publicError('LICENSE_REQUEST_INVALID', 'Pedido de licença inválido.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${root}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body,
        signal: controller.signal,
        redirect: 'error',
      });
      const declared = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(declared) && declared > maxBodyBytes) {
        throw publicError('INVALID_RESPONSE', 'Resposta de licença inválida.');
      }
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > maxBodyBytes) {
        throw publicError('INVALID_RESPONSE', 'Resposta de licença inválida.');
      }
      let result = null;
      try { result = text ? JSON.parse(text) : null; } catch {}
      if (!response.ok) {
        const code = PUBLIC_SERVER_CODES.has(result?.error_code)
          ? result.error_code : 'INVALID_RESPONSE';
        throw publicError(code, result?.error || `Erro HTTP ${response.status}`);
      }
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw publicError('INVALID_RESPONSE', 'Resposta inválida do servidor de licenças.');
      }
      return result;
    } catch (error) {
      if (error?.isPublicLicenseError === true) throw error;
      throw publicError(
        error?.name === 'AbortError' ? 'LICENSE_REQUEST_TIMEOUT' : 'SERVER_UNAVAILABLE',
        'Sem ligação ao servidor de licenças.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    activate: (input) => post('/api/licenses/activate', input),
    validate: (input) => post('/api/licenses/validate', input),
    refresh: (input) => post('/api/licenses/refresh', input),
    renew: (input) => post('/api/licenses/renew', input),
    deactivate: (input) => post('/api/licenses/deactivate', input),
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_TIMEOUT_MS,
  createCentralLicenseClient,
};

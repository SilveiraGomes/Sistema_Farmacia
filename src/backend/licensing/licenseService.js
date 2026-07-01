const crypto = require('node:crypto');
const { evaluateLicense } = require('./licensePolicy');

function assertLicenseWriteAllowed(status) {
  if (status?.canWrite === true) return;
  const error = new Error('A licença não permite alterações. Renove ou active o sistema.');
  error.code = 'LICENSE_READ_ONLY';
  throw error;
}

function createLicenseService({
  client,
  store,
  publicKey,
  machineFingerprint,
  verifyDocument,
  evaluate = evaluateLicense,
  hashMachineId = (value) => crypto.createHash('sha256').update(value).digest('hex'),
  randomUUID = crypto.randomUUID,
  now = () => Date.now(),
  diagnostic = () => {},
} = {}) {
  if (!client || !store || !machineFingerprint || !verifyDocument) {
    throw new Error('License service dependencies are required');
  }
  let cached = null;
  let state;
  try {
    state = store.loadState?.() ?? { installationId: '', lastTrustedAt: null };
  } catch (error) {
    diagnostic(error);
    state = { installationId: '', lastTrustedAt: null, corrupt: true };
  }
  let exchangeQueue = Promise.resolve();

  function persistState(next = {}) {
    const candidates = [state.lastTrustedAt, next.lastTrustedAt]
      .map((value) => Date.parse(value)).filter(Number.isFinite);
    state = {
      installationId: next.installationId || state.installationId || '',
      lastTrustedAt: candidates.length ? new Date(Math.max(...candidates)).toISOString() : null,
    };
    store.saveState?.(state);
  }

  function machineId() {
    return machineFingerprint();
  }

  function inspect(document) {
    try {
      if (state.corrupt) return { state: 'corrupt', canWrite: false, readOnly: true };
      const stored = document === undefined ? store.load() : document;
      if (!stored) return evaluate(null);
      const rawMachineId = machineId();
      const payload = verifyDocument(stored, publicKey);
      const result = evaluate(payload, {
        now: now(),
        machineHash: hashMachineId(rawMachineId),
        lastTrustedAt: state.lastTrustedAt,
      });
      const trustedNow = new Date(now()).toISOString();
      persistState({
        installationId: payload.installationId,
        lastTrustedAt: [trustedNow, payload.lastValidatedAt, state.lastTrustedAt]
          .filter(Boolean).sort().at(-1),
      });
      return { ...result, plan: payload.plan, expiresAt: payload.expiresAt };
    } catch (error) {
      diagnostic(error);
      return { state: 'corrupt', canWrite: false, readOnly: true, warningDays: null };
    }
  }

  function status() {
    cached = inspect();
    return cached;
  }

  async function exchange(method, licenseKey) {
    const key = String(licenseKey ?? '').trim();
    if (!key || key.length > 256) {
      const error = new Error('Chave de activação inválida.');
      error.code = 'LICENSE_REQUEST_INVALID';
      throw error;
    }
    const installationId = state.installationId || randomUUID();
    if (!state.installationId) persistState({ installationId });
    const result = await client[method]({
      licenseKey: key,
      machineId: machineId(),
      installationId,
    });
    if (!result?.document) {
      const error = new Error('Resposta de licença inválida.');
      error.code = 'LICENSE_RESPONSE_INVALID';
      throw error;
    }
    const payload = verifyDocument(result.document, publicKey);
    if (payload.installationId !== installationId
        || payload.machineHash !== hashMachineId(machineId())) {
      const error = new Error('A licença não corresponde a esta máquina.');
      error.code = 'LICENSE_MACHINE_MISMATCH';
      throw error;
    }
    store.save(result.document);
    cached = inspect(result.document);
    return cached;
  }

  return {
    activate: (licenseKey) => {
      const task = exchangeQueue.then(() => exchange('activate', licenseKey));
      exchangeQueue = task.catch(() => {});
      return task;
    },
    validate: (licenseKey) => {
      const task = exchangeQueue.then(() => exchange('validate', licenseKey));
      exchangeQueue = task.catch(() => {});
      return task;
    },
    machineId,
    status,
    assertWriteAllowed: () => assertLicenseWriteAllowed(status()),
  };
}

module.exports = { assertLicenseWriteAllowed, createLicenseService };

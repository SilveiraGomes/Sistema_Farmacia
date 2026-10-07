const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const os = require('node:os');
const { evaluateCentralLicense } = require('./centralLicensePolicy');

const PRODUCT_CODE = 'KILFARM';
const REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000;

function assertLicenseWriteAllowed(status) {
  if (status?.canWrite === true) return;
  const error = new Error('A licença não permite alterações. Renove ou active o sistema.');
  error.code = 'LICENSE_READ_ONLY';
  throw error;
}

function createCentralLicenseService({
  client, store, publicKey, machineFingerprint, verifyBundle, verifySupportBundle,
  productCode = PRODUCT_CODE,
  appVersion = 'unknown',
  now = () => Date.now(),
  randomUUID = crypto.randomUUID,
  deviceName = os.hostname(),
  osInfo = `${os.platform()} ${os.release()}`,
  diagnostic = () => {},
} = {}) {
  if (!client || !store || !publicKey || !machineFingerprint || !verifyBundle) {
    throw new Error('Central license service dependencies are required');
  }
  const events = new EventEmitter();
  const machineHash = machineFingerprint();
  let timer = null;
  let exchangeQueue = Promise.resolve();
  let state;
  try {
    state = store.load() || {
      bundle: null, lastTrustedTime: null, serverState: null, installationId: randomUUID(),
    };
  } catch (error) {
    diagnostic(error);
    state = {
      bundle: null, lastTrustedTime: null, serverState: null,
      installationId: randomUUID(), corrupt: true,
    };
  }

  function persist(next) {
    state = { ...state, ...next };
    delete state.corrupt;
    store.save(state);
  }

  function status() {
    if (state.corrupt) return {
      state: 'invalid', canWrite: false, readOnly: true,
      warningDays: null, daysRemaining: null, plan: null, expiresAt: null, document: null,
    };
    if (!state.bundle) return evaluateCentralLicense(null);
    let document = state.bundle.documento;
    try {
      document = verifyBundle(state.bundle, publicKey);
    } catch (error) {
      diagnostic(error);
      return evaluateCentralLicense(document, { signatureValid: false });
    }
    return evaluateCentralLicense(document, {
      now: now(), machineHash, productCode,
      lastTrustedTime: state.lastTrustedTime,
      serverState: state.serverState,
      signatureValid: true,
    });
  }

  function verifyResponse(bundle) {
    const document = verifyBundle(bundle, publicKey);
    if (document.product_code !== productCode || document.machine_hash !== machineHash) {
      const error = new Error('A licença não corresponde a este produto ou dispositivo.');
      error.code = document.product_code !== productCode ? 'PRODUCT_NOT_AUTHORIZED' : 'MACHINE_MISMATCH';
      throw error;
    }
    return document;
  }

  function verifySupportResponse(bundle) {
    if (typeof verifySupportBundle !== 'function') {
      throw new Error('Support access verifier is unavailable');
    }
    const document = verifySupportBundle(bundle, publicKey);
    const expectedLicenseId = state.bundle?.documento?.license_id;
    if (!expectedLicenseId || document.license_id !== expectedLicenseId
        || document.product_code !== productCode || document.machine_hash !== machineHash) {
      const error = new Error('O acesso de suporte não corresponde a esta instalação.');
      error.code = 'SUPPORT_DEVICE_MISMATCH';
      throw error;
    }
    const currentTime = now();
    const issuedAt = Date.parse(document.issued_at);
    const expiresAt = Date.parse(document.expires_at);
    if (issuedAt > currentTime + 5 * 60 * 1000 || expiresAt <= currentTime) {
      const error = new Error('O código de suporte expirou.');
      error.code = 'SUPPORT_CODE_EXPIRED';
      throw error;
    }
    return document;
  }

  async function activate(licenseKey) {
    const key = String(licenseKey ?? '').trim();
    if (!key || key.length > 256) {
      const error = new Error('Chave de activação inválida.');
      error.code = 'LICENSE_REQUEST_INVALID';
      throw error;
    }
    const bundle = await client.activate({
      license_key: key,
      machine_hash: machineHash,
      product_code: productCode,
      installation_id: state.installationId,
      device_name: deviceName,
      os_info: osInfo,
      app_version: appVersion,
    });
    verifyResponse(bundle);
    persist({ bundle, lastTrustedTime: new Date(now()).toISOString(), serverState: null });
    const next = status();
    events.emit('state-changed', next);
    return next;
  }

  async function revalidate(method) {
    if (!state.bundle?.documento?.license_id) {
      const error = new Error('Licença ainda não activada.');
      error.code = 'NOT_ACTIVATED';
      throw error;
    }
    try {
      const bundle = await client[method]({
        license_id: state.bundle.documento.license_id,
        machine_hash: machineHash,
      });
      verifyResponse(bundle);
      persist({ bundle, lastTrustedTime: new Date(now()).toISOString(), serverState: null });
      const next = status();
      events.emit('state-changed', next);
      return next;
    } catch (error) {
      const serverStates = {
        LICENSE_REVOKED: 'revoked', LICENSE_SUSPENDED: 'suspended', LICENSE_EXPIRED: 'expired',
      };
      if (serverStates[error?.code]) persist({ serverState: serverStates[error.code] });
      events.emit('state-changed', status());
      throw error;
    }
  }

  function queued(operation) {
    const task = exchangeQueue.then(operation);
    exchangeQueue = task.catch(() => {});
    return task;
  }

  const service = {
    activate: (key) => queued(() => activate(key)),
    validate: (key) => queued(() => key ? activate(key) : revalidate('validate')),
    refresh: () => queued(() => revalidate('refresh')),
    renew: () => queued(() => revalidate('renew')),
    async deactivate(licenseKey) {
      const key = String(licenseKey ?? '').trim();
      const response = await client.deactivate({ license_key: key, machine_hash: machineHash });
      store.clear();
      state = { bundle: null, lastTrustedTime: null, serverState: null, installationId: state.installationId };
      events.emit('state-changed', status());
      return response;
    },
    machineId: () => machineHash,
    async redeemSupportAccess(code) {
      const supportCode = String(code ?? '').trim().toUpperCase();
      if (!/^KSR-[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/.test(supportCode)) {
        const error = new Error('Código de suporte inválido.');
        error.code = 'SUPPORT_CODE_INVALID';
        throw error;
      }
      const licenseId = state.bundle?.documento?.license_id;
      if (!licenseId) {
        const error = new Error('Esta instalação ainda não possui uma licença activa.');
        error.code = 'NOT_ACTIVATED';
        throw error;
      }
      const bundle = await client.redeemSupportAccess({
        support_code: supportCode,
        license_id: licenseId,
        machine_hash: machineHash,
        product_code: productCode,
      });
      return verifySupportResponse(bundle);
    },
    status,
    hasFeature: (code) => status().document?.features?.includes(code) ?? false,
    assertWriteAllowed: () => assertLicenseWriteAllowed(status()),
    onStateChanged(listener) {
      events.on('state-changed', listener);
      return () => events.off('state-changed', listener);
    },
    startScheduler() {
      if (timer) return;
      timer = setInterval(() => {
        if (!state.bundle) return;
        service.refresh().catch(() => {});
      }, REFRESH_INTERVAL_MS);
      timer.unref?.();
    },
    stopScheduler() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
  return service;
}

module.exports = { PRODUCT_CODE, REFRESH_INTERVAL_MS, assertLicenseWriteAllowed, createCentralLicenseService };

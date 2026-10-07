const DAY_MS = 24 * 60 * 60 * 1000;
const CLOCK_TOLERANCE_MS = 60 * 1000;
const WRITABLE_STATES = new Set(['active', 'trial_active', 'expiring', 'offline_grace']);

function canWrite(stateOrResult) {
  const state = typeof stateOrResult === 'string' ? stateOrResult : stateOrResult?.state;
  return WRITABLE_STATES.has(state);
}

function result(state, document = null, daysRemaining = null) {
  const writable = canWrite(state);
  return {
    state,
    canWrite: writable,
    readOnly: !writable,
    warningDays: state === 'expiring' ? daysRemaining : null,
    daysRemaining,
    plan: document?.plan_code ?? null,
    expiresAt: document?.expires_at ?? null,
    document,
  };
}

function evaluateCentralLicense(document, options = {}) {
  if (!document) return result('unactivated');
  if (['revoked', 'suspended', 'expired'].includes(options.serverState)) {
    return result(options.serverState, document);
  }
  if (options.signatureValid === false || document.product_code !== options.productCode) {
    return result('invalid');
  }
  if (document.machine_hash !== options.machineHash) return result('machine_mismatch', document);

  const now = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
  const lastTrusted = Date.parse(options.lastTrustedTime ?? '');
  if (Number.isFinite(lastTrusted) && now < lastTrusted - CLOCK_TOLERANCE_MS) {
    return result('clock_tampered', document);
  }
  if (document.perpetual) {
    return result(document.license_type === 'TRIAL' ? 'trial_active' : 'active', document);
  }

  const expiresAt = Date.parse(document.expires_at);
  if (!Number.isFinite(expiresAt)) return result('invalid', document);
  const daysRemaining = Math.ceil((expiresAt - now) / DAY_MS);
  if (now >= expiresAt) {
    return now - expiresAt <= document.offline_policy.grace_days * DAY_MS
      ? result('offline_grace', document, daysRemaining)
      : result('expired', document, daysRemaining);
  }

  const lastValidated = Date.parse(document.last_validated_at);
  if (!Number.isFinite(lastValidated)) return result('invalid', document);
  if (now - lastValidated > document.offline_policy.offline_days * DAY_MS) {
    return result('offline_grace', document, daysRemaining);
  }
  if (document.license_type === 'TRIAL') return result('trial_active', document, daysRemaining);
  if (daysRemaining <= 30) return result('expiring', document, daysRemaining);
  return result('active', document, daysRemaining);
}

module.exports = { CLOCK_TOLERANCE_MS, WRITABLE_STATES, canWrite, evaluateCentralLicense };

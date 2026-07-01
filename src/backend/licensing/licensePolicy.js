const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_OFFLINE_GRACE_DAYS = 7;
const OFFLINE_LIMIT_MS = MAX_OFFLINE_GRACE_DAYS * DAY_MS;
const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;
const WARNING_DAYS = [30, 15, 7, 3, 1];
const WRITABLE_STATES = new Set(['demo_active', 'paid_active', 'expiring', 'offline_grace']);

function canWrite(stateOrResult) {
  const state = typeof stateOrResult === 'string' ? stateOrResult : stateOrResult?.state;
  return WRITABLE_STATES.has(state);
}

function result(state, warningDays = null) {
  const writable = canWrite(state);
  return { state, canWrite: writable, readOnly: !writable, warningDays };
}

function evaluateLicense(payload, options = {}) {
  if (!payload) return result('unactivated');

  const now = options.now instanceof Date
    ? options.now.getTime()
    : Number(options.now ?? Date.now());
  const expiresAt = Date.parse(payload.expiresAt);
  const lastValidatedAt = Date.parse(payload.lastValidatedAt);
  const nextValidationAt = Date.parse(payload.nextValidationAt);
  const lastTrustedAt = options.lastTrustedAt == null ? NaN : Date.parse(options.lastTrustedAt);

  if (options.revoked === true || payload.status === 'revoked' || payload.revoked === true) {
    return result('revoked');
  }
  if (payload.machineHash !== options.machineHash) return result('machine_mismatch');
  if (Number.isFinite(lastTrustedAt) && now + CLOCK_TOLERANCE_MS < lastTrustedAt) {
    return result('clock_tampered');
  }
  if (!Number.isFinite(expiresAt) || now >= expiresAt) return result('expired');

  if (Number.isFinite(nextValidationAt) && now > nextValidationAt) {
    if (now - nextValidationAt <= OFFLINE_LIMIT_MS) {
      return result('offline_grace');
    }
    return result('expired');
  }

  const remainingDays = Math.ceil((expiresAt - now) / DAY_MS);
  const warningDays = [...WARNING_DAYS].reverse()
    .find((threshold) => remainingDays <= threshold);
  if (warningDays) return result('expiring', warningDays);
  return result(payload.plan === 'demo' ? 'demo_active' : 'paid_active');
}

module.exports = {
  CLOCK_TOLERANCE_MS,
  MAX_OFFLINE_GRACE_DAYS,
  OFFLINE_LIMIT_MS,
  WARNING_DAYS,
  canWrite,
  evaluateLicense,
};

const crypto = require('node:crypto');

const MAX_PAYLOAD_BYTES = 16384;
const MAX_ENCODED_PAYLOAD_LENGTH = Math.ceil(MAX_PAYLOAD_BYTES * 4 / 3);
const MAX_SIGNATURE_LENGTH = 4096;
const ENVELOPE_FIELDS = ['algorithm', 'payload', 'signature'];
const REQUIRED_FIELDS = [
  'customerId', 'expiresAt', 'features', 'installationId', 'issuedAt', 'lastValidatedAt',
  'licenseId', 'machineHash', 'nextValidationAt', 'plan', 'product', 'version',
];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid payload structure');
  }
  const keys = Object.keys(payload).sort();
  if (JSON.stringify(keys) !== JSON.stringify(REQUIRED_FIELDS)) {
    throw new Error('Invalid payload schema');
  }
  if (payload.version !== 1) throw new Error('Unsupported payload version');
  for (const field of ['licenseId', 'product', 'customerId']) {
    if (typeof payload[field] !== 'string'
        || Buffer.byteLength(payload[field], 'utf8') === 0
        || Buffer.byteLength(payload[field], 'utf8') > 512) {
      throw new Error(`Invalid payload field: ${field}`);
    }
  }
  if (!Array.isArray(payload.features)
      || payload.features.some((item) => typeof item !== 'string'
        || Buffer.byteLength(item, 'utf8') === 0
        || Buffer.byteLength(item, 'utf8') > 128)) {
    throw new Error('Invalid features field');
  }
  if (typeof payload.machineHash !== 'string' || !/^[0-9a-f]{64}$/.test(payload.machineHash)) {
    throw new Error('Invalid machineHash');
  }
  if (typeof payload.installationId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        payload.installationId
      )) {
    throw new Error('Invalid installationId');
  }
  if (!['demo', 'one_year', 'two_years', 'three_years'].includes(payload.plan)) {
    throw new Error('Invalid license plan');
  }
  const timestamps = {};
  for (const field of ['issuedAt', 'expiresAt', 'lastValidatedAt', 'nextValidationAt']) {
    if (typeof payload[field] !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(payload[field])) {
      throw new Error(`Invalid UTC date: ${field}`);
    }
    const timestamp = Date.parse(payload[field]);
    if (!Number.isFinite(timestamp)
        || new Date(timestamp).toISOString() !== payload[field].replace(/Z$/, '.000Z')) {
      throw new Error(`Invalid UTC date: ${field}`);
    }
    timestamps[field] = timestamp;
  }
  if (timestamps.issuedAt > timestamps.expiresAt
      || timestamps.issuedAt > timestamps.lastValidatedAt
      || timestamps.lastValidatedAt > timestamps.nextValidationAt
      || timestamps.nextValidationAt > timestamps.expiresAt) {
    throw new Error('Invalid license validation chronology');
  }
}

function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new Error('Invalid Base64URL encoding');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new Error('Invalid Base64URL encoding');
  }
  return decoded;
}

function verifyLicenseDocument(document, publicKey) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Invalid license document');
  }
  if (JSON.stringify(Object.keys(document).sort()) !== JSON.stringify(ENVELOPE_FIELDS)) {
    throw new Error('Invalid license document envelope');
  }
  if (document.algorithm !== 'RS256') throw new Error('Unexpected license algorithm');
  if (typeof document.payload !== 'string' || typeof document.signature !== 'string') {
    throw new Error('Invalid license document fields');
  }
  if (document.payload.length > MAX_ENCODED_PAYLOAD_LENGTH
      || document.signature.length > MAX_SIGNATURE_LENGTH) {
    throw new Error('License document exceeds size limit');
  }
  const payloadBytes = decodeBase64Url(document.payload);
  const signatureBytes = decodeBase64Url(document.signature);
  if (payloadBytes.length > MAX_PAYLOAD_BYTES) throw new Error('License document exceeds size limit');

  let payload;
  let json;
  try {
    json = payloadBytes.toString('utf8');
    payload = JSON.parse(json);
  } catch {
    throw new Error('Invalid license payload JSON');
  }
  validatePayload(payload);
  if (JSON.stringify(canonicalize(payload)) !== json) {
    throw new Error('License payload JSON is not canonical');
  }

  let valid = false;
  try {
    if (publicKey instanceof crypto.KeyObject && publicKey.type !== 'public') {
      throw new Error('Invalid key');
    }
    const keyInput = publicKey instanceof crypto.KeyObject
      ? publicKey.export({ type: 'spki', format: 'pem' })
      : publicKey;
    const key = crypto.createPublicKey(keyInput);
    if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails?.modulusLength < 2048) {
      throw new Error('Invalid key');
    }
    valid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(document.payload),
      key,
      signatureBytes
    );
  } catch {
    throw new Error('Invalid license signature');
  }
  if (!valid) throw new Error('Invalid license signature');
  return payload;
}

module.exports = { verifyLicenseDocument };

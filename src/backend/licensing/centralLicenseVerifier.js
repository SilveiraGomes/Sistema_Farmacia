const crypto = require('node:crypto');

const REQUIRED_DOCUMENT_FIELDS = [
  'customer_id', 'expires_at', 'features', 'issued_at', 'last_validated_at',
  'license_id', 'license_key', 'license_schema_version', 'license_type',
  'machine_hash', 'max_devices', 'next_online_deadline', 'offline_policy',
  'perpetual', 'plan_code', 'product_code',
];

function validateCentralLicenseDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Invalid license document');
  }
  if (JSON.stringify(Object.keys(document).sort()) !== JSON.stringify([...REQUIRED_DOCUMENT_FIELDS].sort())) {
    throw new Error('Invalid license document schema');
  }
  for (const field of ['license_id', 'customer_id', 'product_code', 'plan_code', 'license_type', 'machine_hash']) {
    if (typeof document[field] !== 'string' || document[field].length === 0 || document[field].length > 512) {
      throw new Error(`Invalid license document field: ${field}`);
    }
  }
  if (document.license_key !== null && typeof document.license_key !== 'string') {
    throw new Error('Invalid license_key');
  }
  if (!Array.isArray(document.features) || document.features.some((item) => typeof item !== 'string')) {
    throw new Error('Invalid license features');
  }
  if (typeof document.perpetual !== 'boolean' || !Number.isInteger(document.max_devices)
      || !Number.isInteger(document.license_schema_version)) {
    throw new Error('Invalid license metadata');
  }
  if (!document.offline_policy || !Number.isInteger(document.offline_policy.offline_days)
      || !Number.isInteger(document.offline_policy.grace_days)) {
    throw new Error('Invalid offline policy');
  }
  for (const field of ['issued_at', 'last_validated_at', 'next_online_deadline']) {
    if (typeof document[field] !== 'string' || !Number.isFinite(Date.parse(document[field]))) {
      throw new Error(`Invalid license date: ${field}`);
    }
  }
  if (!document.perpetual
      && (typeof document.expires_at !== 'string' || !Number.isFinite(Date.parse(document.expires_at)))) {
    throw new Error('Invalid license expiration');
  }
}

function verifyCentralLicenseBundle(bundle, publicKey) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)
      || !bundle.documento || typeof bundle.assinatura_b64 !== 'string'
      || Object.keys(bundle).some((key) => !['documento', 'assinatura_b64'].includes(key))) {
    throw new Error('Invalid license bundle');
  }
  validateCentralLicenseDocument(bundle.documento);
  if (!/^[A-Za-z0-9_-]+$/.test(bundle.assinatura_b64)) {
    throw new Error('Invalid license signature encoding');
  }
  try {
    const key = crypto.createPublicKey(publicKey);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('Invalid key type');
    const valid = crypto.verify(
      null,
      Buffer.from(JSON.stringify(bundle.documento)),
      key,
      Buffer.from(bundle.assinatura_b64, 'base64url'),
    );
    if (!valid) throw new Error('Invalid license signature');
  } catch {
    throw new Error('Invalid license signature');
  }
  return bundle.documento;
}

module.exports = { validateCentralLicenseDocument, verifyCentralLicenseBundle };

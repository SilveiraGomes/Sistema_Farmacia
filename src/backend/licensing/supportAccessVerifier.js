const crypto = require('node:crypto');

const REQUIRED_SUPPORT_FIELDS = [
  'expires_at', 'grant_id', 'issued_at', 'license_id', 'machine_hash',
  'product_code', 'scope', 'support_schema_version',
];

const REQUIRED_SCOPE = ['users.list', 'users.recover_access'];

function validateSupportAccessDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Invalid support access document');
  }
  if (JSON.stringify(Object.keys(document).sort()) !== JSON.stringify([...REQUIRED_SUPPORT_FIELDS].sort())) {
    throw new Error('Invalid support access document schema');
  }
  for (const field of ['grant_id', 'license_id', 'product_code', 'machine_hash']) {
    if (typeof document[field] !== 'string' || document[field].length === 0 || document[field].length > 512) {
      throw new Error(`Invalid support access field: ${field}`);
    }
  }
  if (document.support_schema_version !== 1) {
    throw new Error('Unsupported support access schema');
  }
  if (!Array.isArray(document.scope)
      || JSON.stringify([...document.scope].sort()) !== JSON.stringify([...REQUIRED_SCOPE].sort())) {
    throw new Error('Invalid support access scope');
  }
  for (const field of ['issued_at', 'expires_at']) {
    if (typeof document[field] !== 'string' || !Number.isFinite(Date.parse(document[field]))) {
      throw new Error(`Invalid support access date: ${field}`);
    }
  }
  const issuedAt = Date.parse(document.issued_at);
  const expiresAt = Date.parse(document.expires_at);
  if (expiresAt <= issuedAt || expiresAt - issuedAt > 20 * 60 * 1000) {
    throw new Error('Invalid support access lifetime');
  }
}

function verifySupportAccessBundle(bundle, publicKey) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)
      || !bundle.documento || typeof bundle.assinatura_b64 !== 'string'
      || Object.keys(bundle).some((key) => !['documento', 'assinatura_b64'].includes(key))) {
    throw new Error('Invalid support access bundle');
  }
  validateSupportAccessDocument(bundle.documento);
  if (!/^[A-Za-z0-9_-]+$/.test(bundle.assinatura_b64)) {
    throw new Error('Invalid support access signature encoding');
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
    if (!valid) throw new Error('Invalid signature');
  } catch {
    throw new Error('Invalid support access signature');
  }
  return bundle.documento;
}

module.exports = {
  REQUIRED_SCOPE,
  validateSupportAccessDocument,
  verifySupportAccessBundle,
};

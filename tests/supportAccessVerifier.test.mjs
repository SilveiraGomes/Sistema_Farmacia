import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  validateSupportAccessDocument,
  verifySupportAccessBundle,
} = require('../src/backend/licensing/supportAccessVerifier.js');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });

function document(overrides = {}) {
  return {
    support_schema_version: 1,
    grant_id: 'grant-1',
    license_id: 'license-1',
    product_code: 'KILFARM',
    machine_hash: 'a'.repeat(64),
    scope: ['users.list', 'users.recover_access'],
    issued_at: '2026-10-07T10:00:00+00:00',
    expires_at: '2026-10-07T10:15:00+00:00',
    ...overrides,
  };
}

function signedBundle(doc = document()) {
  return {
    documento: doc,
    assinatura_b64: crypto.sign(null, Buffer.from(JSON.stringify(doc)), privateKey).toString('base64url'),
  };
}

test('accepts an exact, correctly signed support grant', () => {
  const doc = document();
  assert.deepEqual(verifySupportAccessBundle(signedBundle(doc), publicPem), doc);
});

test('rejects modified, expanded, overlong or incorrectly scoped grants', () => {
  const original = signedBundle();
  original.documento.product_code = 'KILHOTEL';
  assert.throws(() => verifySupportAccessBundle(original, publicPem), /signature/i);
  assert.throws(() => validateSupportAccessDocument(document({ extra: true })), /schema/i);
  assert.throws(() => validateSupportAccessDocument(document({ expires_at: '2026-10-07T10:30:00+00:00' })), /lifetime/i);
  assert.throws(() => validateSupportAccessDocument(document({ scope: ['users.list'] })), /scope/i);
});

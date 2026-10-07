import assert from 'node:assert/strict';
import { createHash, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EXPECTED_PRODUCTION_KEY_FINGERPRINT = '0506b0e56aae9ded825e2d8ee73a964b4fa68b49d535c3049b38c24e3a991e70';
const keyPath = fileURLToPath(new URL('../resources/license-public.pem', import.meta.url));
const publicKey = createPublicKey(readFileSync(keyPath));

assert.equal(publicKey.asymmetricKeyType, 'ed25519', 'A chave pública de produção deve ser Ed25519.');
const fingerprint = createHash('sha256')
  .update(publicKey.export({ type: 'spki', format: 'der' }))
  .digest('hex');
assert.equal(
  fingerprint,
  EXPECTED_PRODUCTION_KEY_FINGERPRINT,
  'A chave pública empacotada não corresponde ao servidor de licenças de produção.',
);

console.log(`Chave Ed25519 de produção verificada: ${fingerprint}`);

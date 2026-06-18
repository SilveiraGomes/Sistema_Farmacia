import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  hashPassword,
  verifyPassword,
  createTemporaryPassword,
  PASSWORD_HASH_PREFIX,
} = require('../src/backend/security/passwords.js');

test('hashPassword stores a salted pbkdf2 password hash', () => {
  const hash = hashPassword('SenhaForte123!');

  assert.equal(typeof hash, 'string');
  assert.ok(hash.startsWith(PASSWORD_HASH_PREFIX));
  assert.notEqual(hash, 'SenhaForte123!');
  assert.equal(verifyPassword('SenhaForte123!', hash), true);
  assert.equal(verifyPassword('senha-errada', hash), false);
});

test('hashPassword uses a different salt for each hash', () => {
  const first = hashPassword('SenhaForte123!');
  const second = hashPassword('SenhaForte123!');

  assert.notEqual(first, second);
  assert.equal(verifyPassword('SenhaForte123!', first), true);
  assert.equal(verifyPassword('SenhaForte123!', second), true);
});

test('createTemporaryPassword returns a readable strong temporary password', () => {
  const password = createTemporaryPassword();

  assert.match(password, /^[A-HJ-NP-Za-km-z2-9]{12}$/);
});

test('verifyPassword rejects hashes with extra fields', () => {
  const hash = hashPassword('SenhaForte123!');

  assert.equal(verifyPassword('SenhaForte123!', `${hash}$extra`), false);
});

test('verifyPassword rejects hashes with a different iteration count', () => {
  const password = 'SenhaForte123!';
  const iterations = 119999;
  const salt = 'fixed-salt';
  const hash = crypto
    .pbkdf2Sync(password, salt, iterations, 32, 'sha256')
    .toString('base64url');
  const storedHash = `${PASSWORD_HASH_PREFIX}$${iterations}$${salt}$${hash}`;

  assert.equal(verifyPassword(password, storedHash), false);
});

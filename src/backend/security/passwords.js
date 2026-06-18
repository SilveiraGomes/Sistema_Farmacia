const crypto = require('crypto');

const PASSWORD_HASH_PREFIX = 'pbkdf2_sha256';
const ITERATIONS = 120000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('A senha deve ter pelo menos 8 caracteres.');
  }
}

function hashPassword(password) {
  assertPassword(password);

  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto
    .pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString('base64url');

  return `${PASSWORD_HASH_PREFIX}$${ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 4) {
    return false;
  }

  const [prefix, iterationsRaw, salt, expectedHash] = parts;
  if (prefix !== PASSWORD_HASH_PREFIX || !iterationsRaw || !salt || !expectedHash) {
    return false;
  }

  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations !== ITERATIONS) {
    return false;
  }

  const actualHash = crypto
    .pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST)
    .toString('base64url');

  const expected = Buffer.from(expectedHash);
  const actual = Buffer.from(actualHash);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function createTemporaryPassword(length = 12) {
  let password = '';
  for (let index = 0; index < length; index += 1) {
    const byte = crypto.randomInt(0, TEMP_PASSWORD_ALPHABET.length);
    password += TEMP_PASSWORD_ALPHABET[byte];
  }
  return password;
}

module.exports = {
  PASSWORD_HASH_PREFIX,
  hashPassword,
  verifyPassword,
  createTemporaryPassword,
};

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_BYTES = 64 * 1024;

function validateDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)
      || document.algorithm !== 'RS256'
      || typeof document.payload !== 'string'
      || typeof document.signature !== 'string'
      || Object.keys(document).some((key) => !['algorithm', 'payload', 'signature'].includes(key))) {
    throw new Error('Invalid license document');
  }
}

function createLicenseStore({ directory, safeStorage, filename = 'license.dat',
  maxBytes = DEFAULT_MAX_BYTES, fsImpl = fs } = {}) {
  if (!directory || !safeStorage) throw new Error('License store dependencies are required');
  const filePath = path.join(directory, filename);
  const statePath = path.join(directory, 'license.state');

  function readEncrypted(target, validator, absent = null) {
    if (!fsImpl.existsSync(target)) return absent;
    const stat = fsImpl.statSync(target);
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) throw new Error('License file exceeds size limit');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure license encryption is unavailable');
    try {
      const plaintext = safeStorage.decryptString(fsImpl.readFileSync(target));
      if (Buffer.byteLength(plaintext, 'utf8') > maxBytes) throw new Error('License file exceeds size limit');
      const value = JSON.parse(plaintext);
      validator(value);
      return value;
    } catch (error) {
      if (/size limit/i.test(error.message)) throw error;
      throw new Error('License file is corrupt');
    }
  }

  function writeEncrypted(target, value, validator) {
    validator(value);
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure license encryption is unavailable');
    const encrypted = safeStorage.encryptString(JSON.stringify(value));
    if (!Buffer.isBuffer(encrypted) || encrypted.length <= 0 || encrypted.length > maxBytes) {
      throw new Error('Encrypted license exceeds size limit');
    }
    fsImpl.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${target}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    try {
      fsImpl.writeFileSync(temporaryPath, encrypted, { mode: 0o600, flag: 'wx' });
      fsImpl.renameSync(temporaryPath, target);
    } finally {
      try { if (fsImpl.existsSync(temporaryPath)) fsImpl.unlinkSync(temporaryPath); } catch {}
    }
  }

  return {
    path: filePath,
    load() {
      return readEncrypted(filePath, validateDocument);
    },
    save(document) {
      writeEncrypted(filePath, document, validateDocument);
    },
    loadState() {
      return readEncrypted(statePath, (state) => {
        if (!state || typeof state !== 'object' || typeof state.installationId !== 'string'
            || (state.lastTrustedAt !== null && typeof state.lastTrustedAt !== 'string')) {
          throw new Error('Invalid license state');
        }
      }, { installationId: '', lastTrustedAt: null });
    },
    saveState(state) {
      writeEncrypted(statePath, state, (value) => {
        if (!value || typeof value.installationId !== 'string'
            || (value.lastTrustedAt !== null && typeof value.lastTrustedAt !== 'string')) {
          throw new Error('Invalid license state');
        }
      });
    },
    remove() {
      if (fsImpl.existsSync(filePath)) fsImpl.unlinkSync(filePath);
    },
  };
}

module.exports = { createLicenseStore };

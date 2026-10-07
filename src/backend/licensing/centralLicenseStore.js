const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_BYTES = 128 * 1024;

function validateState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)
      || typeof state.installationId !== 'string'
      || (state.lastTrustedTime !== null && typeof state.lastTrustedTime !== 'string')
      || (state.serverState !== null && !['revoked', 'suspended', 'expired'].includes(state.serverState))
      || (state.bundle !== null && typeof state.bundle !== 'object')) {
    throw new Error('Invalid central license state');
  }
}

function createCentralLicenseStore({
  directory,
  safeStorage,
  filename = 'license-v2.dat',
  maxBytes = DEFAULT_MAX_BYTES,
  fsImpl = fs,
} = {}) {
  if (!directory || !safeStorage) throw new Error('License store dependencies are required');
  const filePath = path.join(directory, filename);

  return {
    path: filePath,
    load() {
      if (!fsImpl.existsSync(filePath)) return null;
      const stat = fsImpl.statSync(filePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) {
        throw new Error('License file exceeds size limit');
      }
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Secure license encryption is unavailable');
      }
      try {
        const plaintext = safeStorage.decryptString(fsImpl.readFileSync(filePath));
        if (Buffer.byteLength(plaintext, 'utf8') > maxBytes) throw new Error('License file exceeds size limit');
        const state = JSON.parse(plaintext);
        validateState(state);
        return state;
      } catch (error) {
        if (/size limit/i.test(error.message)) throw error;
        throw new Error('License file is corrupt');
      }
    },
    save(state) {
      validateState(state);
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Secure license encryption is unavailable');
      }
      const encrypted = safeStorage.encryptString(JSON.stringify(state));
      if (!Buffer.isBuffer(encrypted) || encrypted.length <= 0 || encrypted.length > maxBytes) {
        throw new Error('Encrypted license exceeds size limit');
      }
      fsImpl.mkdirSync(directory, { recursive: true, mode: 0o700 });
      const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      try {
        fsImpl.writeFileSync(temporaryPath, encrypted, { mode: 0o600, flag: 'wx' });
        fsImpl.renameSync(temporaryPath, filePath);
      } finally {
        try { if (fsImpl.existsSync(temporaryPath)) fsImpl.unlinkSync(temporaryPath); } catch {}
      }
    },
    clear() {
      if (fsImpl.existsSync(filePath)) fsImpl.unlinkSync(filePath);
    },
  };
}

module.exports = { createCentralLicenseStore, validateState };

const crypto = require('node:crypto');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

function readMachineGuid() {
  const output = execFileSync(
    'reg.exe',
    ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
    { encoding: 'utf8', windowsHide: true, timeout: 5000 }
  );
  return output.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i)?.[1] ?? '';
}

function readSystemUuid() {
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command',
      '(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID'],
    { encoding: 'utf8', windowsHide: true, timeout: 5000 }
  );
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function createMachineFingerprint(dependencies = {}) {
  const platform = dependencies.platform ?? os.platform;
  if (platform() !== 'win32') throw new Error('Machine fingerprint requires Windows');

  const getMachineGuid = dependencies.getMachineGuid ?? readMachineGuid;
  const getSystemUuid = dependencies.getSystemUuid ?? readSystemUuid;
  let identifier = '';
  for (const [name, reader] of [['machine-guid', getMachineGuid], ['system-uuid', getSystemUuid]]) {
    try {
      const value = normalize(reader());
      if (value && !/^f{8}-f{4}-f{4}-f{4}-f{12}$/.test(value)) {
        identifier = `${name}:${value}`;
        break;
      }
    } catch {
      // A second stable Windows identifier may still be available.
    }
  }
  if (!identifier) throw new Error('No stable machine identifier is available');
  return crypto.createHash('sha256').update(identifier, 'utf8').digest('hex');
}

module.exports = { createMachineFingerprint };

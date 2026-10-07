import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCentralLicenseService } = require('../src/backend/licensing/centralLicenseService.js');

const NOW = Date.parse('2026-10-07T10:00:00Z');

function grant(overrides = {}) {
  return {
    support_schema_version: 1,
    grant_id: 'grant-1',
    license_id: 'license-1',
    product_code: 'KILFARM',
    machine_hash: 'machine-1',
    scope: ['users.list', 'users.recover_access'],
    issued_at: '2026-10-07T10:00:00Z',
    expires_at: '2026-10-07T10:15:00Z',
    ...overrides,
  };
}

function createService(document = grant()) {
  let request;
  const service = createCentralLicenseService({
    client: {
      redeemSupportAccess: async (input) => {
        request = input;
        return { documento: document, assinatura_b64: 'signed' };
      },
    },
    store: {
      load: () => ({
        installationId: 'installation-1',
        bundle: { documento: { license_id: 'license-1' } },
        lastTrustedTime: null,
        serverState: null,
      }),
      save: () => {},
      clear: () => {},
    },
    publicKey: 'public-key',
    machineFingerprint: () => 'machine-1',
    verifyBundle: (bundle) => bundle.documento,
    verifySupportBundle: (bundle) => bundle.documento,
    now: () => NOW,
  });
  return { service, getRequest: () => request };
}

test('redeems a formatted support code for the current license and machine', async () => {
  const { service, getRequest } = createService();
  const result = await service.redeemSupportAccess('ksr-abcd-efgh-jklm-npqr');
  assert.equal(result.grant_id, 'grant-1');
  assert.deepEqual(getRequest(), {
    support_code: 'KSR-ABCD-EFGH-JKLM-NPQR',
    license_id: 'license-1',
    machine_hash: 'machine-1',
    product_code: 'KILFARM',
  });
});

test('rejects malformed, expired and cross-device support grants', async () => {
  const malformed = createService().service;
  await assert.rejects(() => malformed.redeemSupportAccess('master-password'), /inválido/i);

  const expired = createService(grant({ expires_at: '2026-10-07T09:59:00Z' })).service;
  await assert.rejects(() => expired.redeemSupportAccess('KSR-ABCD-EFGH-JKLM-NPQR'), /expirou/i);

  const anotherMachine = createService(grant({ machine_hash: 'machine-2' })).service;
  await assert.rejects(() => anotherMachine.redeemSupportAccess('KSR-ABCD-EFGH-JKLM-NPQR'), /instalação/i);
});

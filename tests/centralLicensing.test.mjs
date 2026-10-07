import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createCentralLicenseClient, DEFAULT_BASE_URL } = require('../src/backend/licensing/centralLicenseClient');
const { evaluateCentralLicense } = require('../src/backend/licensing/centralLicensePolicy');
const { createCentralLicenseService, PRODUCT_CODE } = require('../src/backend/licensing/centralLicenseService');
const { verifyCentralLicenseBundle } = require('../src/backend/licensing/centralLicenseVerifier');
const { formatLicenseKey } = await import('../src/licensing/licenseUi.mjs');

function document(overrides = {}) {
  return {
    license_id: '11111111-1111-4111-8111-111111111111',
    license_key: null,
    customer_id: '22222222-2222-4222-8222-222222222222',
    product_code: 'KILFARM',
    plan_code: 'COMMERCIAL_1Y',
    license_type: 'COMMERCIAL',
    machine_hash: 'machine-hash',
    issued_at: '2026-09-01 00:00:00',
    expires_at: '2027-09-01 00:00:00',
    perpetual: false,
    max_devices: 1,
    features: ['vendas', 'stock'],
    offline_policy: { offline_days: 7, grace_days: 7 },
    last_validated_at: '2026-10-07T06:00:00+00:00',
    next_online_deadline: '2026-10-14T06:00:00+00:00',
    license_schema_version: 1,
    ...overrides,
  };
}

function signingFixture() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const sign = (doc) => ({
    documento: doc,
    assinatura_b64: crypto.sign(null, Buffer.from(JSON.stringify(doc)), privateKey).toString('base64url'),
  });
  return { publicKeyPem, sign };
}

test('central client targets the production v2 licensing server', () => {
  assert.equal(DEFAULT_BASE_URL, 'https://license.kilsystemangola.com');
  assert.equal(PRODUCT_CODE, 'KILFARM');
  assert.equal(formatLicenseKey('kils-kilfarm-aaaa-bbbb-cccc'), 'KILS-KILFARM-AAAA-BBBB-CCCC');
});

test('Ed25519 verifier accepts a genuine bundle and rejects tampering', () => {
  const { publicKeyPem, sign } = signingFixture();
  const bundle = sign(document());
  assert.equal(verifyCentralLicenseBundle(bundle, publicKeyPem).product_code, 'KILFARM');
  const tampered = { ...bundle, documento: { ...bundle.documento, product_code: 'KILHOTEL' } };
  assert.throws(() => verifyCentralLicenseBundle(tampered, publicKeyPem), /signature/i);
});

test('central policy implements active, offline grace, mismatch and suspension states', () => {
  const base = document();
  const options = {
    now: Date.parse('2026-10-07T07:00:00Z'),
    machineHash: 'machine-hash',
    productCode: 'KILFARM',
    lastTrustedTime: '2026-10-07T06:00:00Z',
    signatureValid: true,
  };
  assert.equal(evaluateCentralLicense(base, options).state, 'active');
  assert.equal(evaluateCentralLicense(base, { ...options, now: Date.parse('2026-10-16T07:00:00Z') }).state, 'offline_grace');
  assert.equal(evaluateCentralLicense(base, { ...options, machineHash: 'another-machine' }).state, 'machine_mismatch');
  assert.equal(evaluateCentralLicense(base, { ...options, serverState: 'suspended' }).state, 'suspended');
});

test('central client uses snake_case contract and direct API response', async () => {
  let request;
  const fetchImpl = async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ documento: {}, assinatura_b64: 'abc' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = createCentralLicenseClient({ fetchImpl });
  await client.activate({
    license_key: 'KILS-KILFARM-AAAA-BBBB-CCCC',
    machine_hash: 'machine-hash',
    product_code: 'KILFARM',
    installation_id: 'installation-id',
  });
  assert.equal(request.url, 'https://license.kilsystemangola.com/api/licenses/activate');
  assert.equal(request.body.product_code, 'KILFARM');
  assert.equal(request.body.machine_hash, 'machine-hash');
});

test('service activates, persists and sends the KILFARM contract', async () => {
  const { publicKeyPem, sign } = signingFixture();
  let stored = null;
  let activationInput = null;
  const bundle = sign(document());
  const service = createCentralLicenseService({
    client: {
      async activate(input) { activationInput = input; return bundle; },
      async validate() { return bundle; },
      async refresh() { return bundle; },
      async renew() { return bundle; },
      async deactivate() { return { ok: true }; },
    },
    store: {
      load: () => stored,
      save: (value) => { stored = structuredClone(value); },
      clear: () => { stored = null; },
    },
    publicKey: publicKeyPem,
    machineFingerprint: () => 'machine-hash',
    verifyBundle: verifyCentralLicenseBundle,
    randomUUID: () => 'installation-id',
    now: () => Date.parse('2026-10-07T07:00:00Z'),
    appVersion: '1.0.1',
    deviceName: 'PHARMACY-01',
    osInfo: 'win32 test',
  });

  const status = await service.activate('KILS-KILFARM-AAAA-BBBB-CCCC');
  assert.equal(status.state, 'active');
  assert.equal(status.canWrite, true);
  assert.equal(activationInput.product_code, 'KILFARM');
  assert.equal(activationInput.installation_id, 'installation-id');
  assert.equal(stored.bundle.documento.license_id, bundle.documento.license_id);
});

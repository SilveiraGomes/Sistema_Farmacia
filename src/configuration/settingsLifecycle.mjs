import { getStoredBranding } from '../data/branding.mjs';
import { getStoredInvoiceA4Settings } from '../data/invoiceSettings.mjs';
import { createSafeDefaultSnapshot } from './catalogKeys.mjs';

function assertDependency(name, value) {
  if (typeof value !== 'function') throw new TypeError(`${name} deve ser uma funcao.`);
}

class SnapshotValidationError extends Error {
  constructor() {
    super('Snapshot de configuracoes invalido.');
    this.name = 'SnapshotValidationError';
  }
}

function invalidSnapshot() {
  throw new SnapshotValidationError();
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateSnapshot(snapshot) {
  if (!isRecord(snapshot)
    || !isRecord(snapshot.settings)
    || !isRecord(snapshot.catalogs)
    || !isRecord(snapshot.definitions)
    || !isRecord(snapshot.definitions.settings)
    || !isRecord(snapshot.definitions.catalogs)
    || !isRecord(snapshot.migrations)
    || typeof snapshot.migrations.legacyLocalStoragePending !== 'boolean') {
    return invalidSnapshot();
  }

  const expected = createSafeDefaultSnapshot();
  for (const [group, expectedSettings] of Object.entries(expected.settings)) {
    const groupSettings = snapshot.settings[group];
    if (!isRecord(groupSettings)) return invalidSnapshot();

    for (const name of Object.keys(expectedSettings)) {
      const setting = groupSettings[name];
      const expectedKey = `${group}.${name}`;
      if (!isRecord(setting)
        || setting.key !== expectedKey
        || !Object.prototype.hasOwnProperty.call(setting, 'value')
        || !Number.isInteger(setting.version)
        || setting.version < 0
        || typeof setting.readable !== 'boolean') {
        return invalidSnapshot();
      }
    }
  }

  for (const catalogKey of Object.keys(expected.catalogs)) {
    const options = snapshot.catalogs[catalogKey];
    if (!Array.isArray(options)) return invalidSnapshot();

    for (const option of options) {
      if (!isRecord(option)
        || typeof option.code !== 'string'
        || !option.code.trim()
        || typeof option.name !== 'string'
        || !option.name.trim()
        || !Number.isInteger(option.order)
        || option.order < 0
        || typeof option.active !== 'boolean'
        || typeof option.system !== 'boolean'
        || !isRecord(option.metadata)
        || typeof option.metadataReadable !== 'boolean'
        || !Number.isInteger(option.version)
        || option.version < 0) {
        return invalidSnapshot();
      }
    }
  }

  return snapshot;
}

export function readLegacySettings() {
  let storage;
  try {
    storage = globalThis.localStorage;
  } catch {
    return {};
  }
  if (!storage) return {};

  const branding = getStoredBranding(storage);
  const invoiceA4 = getStoredInvoiceA4Settings(storage);
  return {
    branding: {
      pharmacyName: branding.pharmacyName,
      taxId: invoiceA4.pharmacyTaxId,
      address: [invoiceA4.pharmacyAddress, invoiceA4.pharmacyCity].filter(Boolean).join('\n'),
      phone: invoiceA4.pharmacyPhone,
      email: invoiceA4.pharmacyEmail,
      logoDataUrl: branding.logoDataUrl,
    },
    invoiceA4,
  };
}

function safeFallback() {
  return {
    snapshot: createSafeDefaultSnapshot(),
    error: 'Nao foi possivel validar as configuracoes. A aplicacao esta em modo somente leitura.',
    readOnly: true,
  };
}

export async function loadSettingsSnapshot({
  loadSnapshot,
  importLegacy,
  readLegacy,
  canEdit = false,
  migrationVersion = 1,
}) {
  assertDependency('loadSnapshot', loadSnapshot);
  assertDependency('importLegacy', importLegacy);
  assertDependency('readLegacy', readLegacy);

  let snapshot;
  try {
    snapshot = validateSnapshot(await loadSnapshot());
  } catch {
    return safeFallback();
  }
  const readOnly = !canEdit;
  if (!snapshot?.migrations?.legacyLocalStoragePending || !canEdit) {
    return { snapshot, error: '', readOnly };
  }

  try {
    const data = readLegacy();
    const migrationResult = await importLegacy({ migrationVersion, data });
    const migratedSnapshot = migrationResult?.settings && migrationResult?.catalogs
      ? migrationResult
      : await loadSnapshot();
    return { snapshot: validateSnapshot(migratedSnapshot), error: '', readOnly: false };
  } catch (error) {
    if (error instanceof SnapshotValidationError) return safeFallback();
    return {
      snapshot,
      error: 'A migracao das configuracoes antigas nao foi concluida. Use Atualizar para tentar novamente.',
      readOnly: true,
    };
  }
}

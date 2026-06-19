function assertDependency(name, value) {
  if (typeof value !== 'function') throw new TypeError(`${name} deve ser uma funcao.`);
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

  const snapshot = await loadSnapshot();
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
    return { snapshot: migratedSnapshot, error: '', readOnly: false };
  } catch {
    return {
      snapshot,
      error: 'A migracao das configuracoes antigas nao foi concluida. Use Atualizar para tentar novamente.',
      readOnly: true,
    };
  }
}

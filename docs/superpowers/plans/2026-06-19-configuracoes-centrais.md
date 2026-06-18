# Configurações Centrais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar Configurações a fonte global SQLite das preferências e catálogos usados pelo sistema, com migração, auditoria, atualização imediata, backup e preparação de empacotamento Electron.

**Architecture:** O backend mantém um registo tipado, três tabelas SQLite e um serviço transacional exposto por IPC. O frontend carrega um snapshot num `SettingsContext`, administra secções e catálogos inline e alimenta os formulários por hooks. A migração importa dados existentes sem duplicação; backup e restauro ficam isolados num serviço Electron.

**Tech Stack:** Electron 35, React 19, Sequelize 6, SQLite3, Node test runner, Vite 5, PostCSS/Tailwind CSS, electron-builder.

---

## Mapa de ficheiros

- Create: `src/backend/services/configurationRegistry.js` — esquema, padrões e seeds.
- Create: `src/backend/services/configurationService.js` — snapshot, mutações, migração e auditoria.
- Create: `src/backend/services/backupService.js` — criação, retenção, validação e restauro.
- Create: `src/configuration/SettingsContext.jsx` — snapshot React e hooks.
- Create: `src/configuration/catalogKeys.mjs` — chaves estáveis usadas pelo frontend.
- Create: `src/components/settings/SettingsSectionNav.jsx` — navegação incorporada.
- Create: `src/components/settings/CatalogEditor.jsx` — CRUD inline de opções.
- Create: `src/components/settings/SettingField.jsx` — campo com ícone, tooltip e erro.
- Modify: `src/backend/database.js` — modelos e relações.
- Modify: `src/backend/ipcHandlers.js` — rotas e erros seguros.
- Modify: `main.js` — injeção do serviço de backup e reinício controlado.
- Modify: `src/App.jsx` — `SettingsProvider` dentro da sessão autenticada.
- Modify: `src/components/Configuracoes.jsx` — página funcional sem novas modais.
- Modify: `src/components/Vendas.jsx` — formas de pagamento e padrões centrais.
- Modify: `src/components/Operacao.jsx` — turnos centrais.
- Modify: `src/components/Financeiro.jsx` — catálogos financeiros centrais.
- Modify: `src/components/Estoque.jsx` — unidades/localizações centrais e categorias oficiais.
- Modify: `src/components/Clientes.jsx` — estados técnicos centrais.
- Modify: `src/components/Documentos.jsx` — tipos/estados técnicos centrais.
- Modify: `src/components/Relatorios.jsx`, `src/components/ReportA4.jsx`, `src/components/Vendas.jsx`, `src/components/InvoiceA4.jsx` — identidade/configuração SQLite.
- Modify: `package.json`, `package-lock.json` — empacotamento em diretório.
- Modify: `src/assets/tailwind.css`, generate `src/assets/output.css` — interface de Configurações.
- Create: `tests/configurationRegistry.test.mjs`.
- Create: `tests/configurationSchema.test.mjs`.
- Create: `tests/configurationService.test.mjs`.
- Create: `tests/configurationIpc.test.mjs`.
- Create: `tests/settingsContextSource.test.mjs`.
- Create: `tests/settingsUiSource.test.mjs`.
- Create: `tests/settingsConsumersSource.test.mjs`.
- Create: `tests/backupService.test.mjs`.
- Create: `tests/packagingReadiness.test.mjs`.

## Fase 1 — Fundação SQLite e serviço

### Task 1: Registo tipado e seeds

**Files:**
- Create: `tests/configurationRegistry.test.mjs`
- Create: `src/backend/services/configurationRegistry.js`

- [ ] **Step 1: Escrever o teste do contrato do registo**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  SETTING_DEFINITIONS,
  CATALOG_DEFINITIONS,
  validateSettingValue,
} = require('../src/backend/services/configurationRegistry');

test('registry declares unique typed settings and catalogs', () => {
  assert.equal(SETTING_DEFINITIONS['sales.defaultTaxRate'].type, 'number');
  assert.equal(SETTING_DEFINITIONS['documents.headerText'].type, 'text');
  assert.equal(CATALOG_DEFINITIONS.payment_methods.editable, true);
  assert.equal(CATALOG_DEFINITIONS.document_statuses.editable, false);
  assert.equal(new Set(Object.keys(SETTING_DEFINITIONS)).size, Object.keys(SETTING_DEFINITIONS).length);
});

test('validateSettingValue enforces registered bounds', () => {
  assert.equal(validateSettingValue('sales.defaultTaxRate', 14), 14);
  assert.throws(
    () => validateSettingValue('sales.defaultTaxRate', -1),
    /Valor fora do limite permitido/,
  );
});

test('catalog seeds expose stable codes', () => {
  assert.deepEqual(
    CATALOG_DEFINITIONS.operation_shifts.options.map((item) => item.code),
    ['manha', 'tarde', 'noite'],
  );
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/configurationRegistry.test.mjs`

Expected: FAIL com `MODULE_NOT_FOUND`.

- [ ] **Step 3: Criar o registo completo**

O módulo deve exportar objetos congelados. Usar esta forma para cada entrada:

```js
function titleFromCode(code) {
  return code.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function editable(codes) {
  return Object.freeze({
    editable: true,
    options: codes.map((code, index) => ({ code, name: titleFromCode(code), order: index, system: false })),
  });
}

function technical(codes) {
  return Object.freeze({
    editable: false,
    options: codes.map((code, index) => ({ code, name: titleFromCode(code), order: index, system: true })),
  });
}

const SETTING_DEFINITIONS = Object.freeze({
  'company.identity': { group: 'company', type: 'object', defaultValue: {
    pharmacyName: 'Sistema de Farmacia', taxId: '', address: '', phone: '', email: '', logoDataUrl: '',
  } },
  'documents.headerText': { group: 'documents', type: 'text', defaultValue: 'Sistema de Farmacia' },
  'documents.currency': { group: 'documents', type: 'text', defaultValue: 'AKZ' },
  'documents.fiscal': { group: 'documents', type: 'object', defaultValue: {
    validationNumber: '999/AGT/2026', softwareName: 'KILSYSTEM', fiscalRegime: 'Regime: Exclusao',
    showQrCode: true, showTotalInWords: true, bankAccounts: [], series: {},
  } },
  'sales.defaultPaymentMethod': { group: 'sales', type: 'catalog-code', catalog: 'payment_methods', defaultValue: 'dinheiro' },
  'sales.defaultTaxRate': { group: 'sales', type: 'number', min: 0, max: 100, defaultValue: 0 },
  'sales.maxDiscount': { group: 'sales', type: 'number', min: 0, defaultValue: 580.2 },
  'sales.rounding': { group: 'sales', type: 'enum', values: ['centimos', 'unidade'], defaultValue: 'centimos' },
  'sales.finalConsumerLabel': { group: 'sales', type: 'text', defaultValue: 'Consumidor final' },
  'stock.lowStockThreshold': { group: 'stock', type: 'number', min: 0, defaultValue: 25 },
  'stock.expiryAlertDays': { group: 'stock', type: 'number', min: 0, defaultValue: 30 },
  'alerts.dashboardEnabled': { group: 'alerts', type: 'boolean', defaultValue: true },
  'alerts.defaultMessage': { group: 'alerts', type: 'text', defaultValue: '' },
  'backup.options': { group: 'backup', type: 'object', defaultValue: {
    frequency: 'manual', folderPath: '', retentionCount: 7,
  } },
  'migration.legacyLocalStorageVersion': { group: 'migration', type: 'number', min: 0, defaultValue: 0 },
});

const CATALOG_DEFINITIONS = Object.freeze({
  payment_methods: editable(['dinheiro', 'tpa', 'transferencia', 'credito']),
  operation_shifts: editable(['manha', 'tarde', 'noite']),
  expense_categories: editable(['infraestrutura', 'recursos-humanos', 'servicos', 'fornecedores', 'marketing', 'outro']),
  revenue_categories: editable(['servico', 'rendimento-extra', 'ajuste-caixa', 'outro']),
  loss_reasons: editable(['expiracao', 'danificado', 'furto', 'consumo-interno', 'obsolescencia', 'outro']),
  stock_units: editable(['unidade', 'caixa', 'frasco', 'blister']),
  stock_locations: editable(['loja', 'armazem']),
  client_statuses: technical(['activo', 'pendente', 'inactivo']),
  document_types: technical(['factura', 'recibo', 'proforma', 'nota-credito']),
  document_statuses: technical(['emitido', 'pago', 'pendente', 'anulado', 'convertido']),
  financial_entry_types: technical(['expense', 'revenue', 'loss']),
  financial_statuses: technical(['pendente', 'paga', 'cancelada']),
  operation_statuses: technical(['aberto', 'fechado', 'bloqueado']),
});
```

Implementar `validateSettingValue` para `text`, `number`, `boolean`, `object`, `enum` e `catalog-code`, retornando cópia normalizada e rejeitando chaves desconhecidas.

- [ ] **Step 4: Executar e confirmar GREEN**

Run: `node --test tests/configurationRegistry.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/configurationRegistry.test.mjs src/backend/services/configurationRegistry.js
git commit -m "feat: define system settings registry"
```

### Task 2: Modelos e migração do esquema

**Files:**
- Create: `tests/configurationSchema.test.mjs`
- Modify: `src/backend/database.js`

- [ ] **Step 1: Escrever testes das tabelas e índices**

```js
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { connectDB, getModels, syncDatabaseSchema } = require('../src/backend/database');

async function createDatabaseFixture() {
  const userDataPath = await mkdtemp(join(tmpdir(), 'farmacia-settings-schema-'));
  const app = { getPath: () => userDataPath };
  const db = await connectDB(app, 'development');
  await syncDatabaseSchema(db);
  return {
    db,
    models: getModels(),
    async cleanup() {
      await db.close();
      await rm(userDataPath, { recursive: true, force: true });
    },
  };
}

test('syncDatabaseSchema creates central configuration tables', async () => {
  const fixture = await createDatabaseFixture();
  try {
    const tables = await fixture.db.getQueryInterface().showAllTables();
    assert.ok(tables.includes('ConfiguracoesSistema'));
    assert.ok(tables.includes('OpcoesCatalogo'));
    assert.ok(tables.includes('AuditoriasConfiguracao'));
    assert.ok(fixture.models.ConfiguracaoSistema);
  } finally {
    await fixture.cleanup();
  }
});

test('catalog code is unique inside one catalog', async () => {
  const fixture = await createDatabaseFixture();
  try {
    await fixture.models.OpcaoCatalogo.create({ catalogo: 'payment_methods', codigo: 'dinheiro', nome: 'Dinheiro' });
    await assert.rejects(
      fixture.models.OpcaoCatalogo.create({ catalogo: 'payment_methods', codigo: 'dinheiro', nome: 'Numerario' }),
    );
  } finally {
    await fixture.cleanup();
  }
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/configurationSchema.test.mjs`

Expected: FAIL porque os modelos não existem.

- [ ] **Step 3: Definir os modelos**

Em `defineModels`, criar:

```js
const ConfiguracaoSistema = db.define('ConfiguracaoSistema', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  chave: { type: DataTypes.STRING, allowNull: false, unique: true },
  grupo: { type: DataTypes.STRING, allowNull: false },
  tipo: { type: DataTypes.STRING, allowNull: false },
  valor_json: { type: DataTypes.TEXT, allowNull: false },
  versao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  atualizado_por_usuario_id: { type: DataTypes.INTEGER },
}, { tableName: 'ConfiguracoesSistema' });

const OpcaoCatalogo = db.define('OpcaoCatalogo', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  catalogo: { type: DataTypes.STRING, allowNull: false },
  codigo: { type: DataTypes.STRING, allowNull: false },
  nome: { type: DataTypes.STRING, allowNull: false },
  ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  sistema: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  metadados_json: { type: DataTypes.TEXT, allowNull: false, defaultValue: '{}' },
  versao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  atualizado_por_usuario_id: { type: DataTypes.INTEGER },
}, { tableName: 'OpcoesCatalogo', indexes: [{ unique: true, fields: ['catalogo', 'codigo'] }] });

const AuditoriaConfiguracao = db.define('AuditoriaConfiguracao', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  ator_usuario_id: { type: DataTypes.INTEGER },
  tipo_alvo: { type: DataTypes.STRING, allowNull: false },
  alvo_chave: { type: DataTypes.STRING, allowNull: false },
  acao: { type: DataTypes.STRING, allowNull: false },
  valor_anterior_json: { type: DataTypes.TEXT },
  valor_novo_json: { type: DataTypes.TEXT },
  data_evento: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'AuditoriasConfiguracao' });
```

Adicionar relações opcionais com `Usuario`, incluir modelos no retorno e garantir que `syncDatabaseSchema` preserve dados existentes. Exportar `defineModels` para os testes:

```js
module.exports = {
  connectDB,
  defineModels,
  getModels,
  syncDatabaseSchema,
  get sequelize() { return sequelize; },
};
```

Remover o ramo MySQL fictício: desenvolvimento e produção usam SQLite em `app.getPath('userData')`; testes continuam a criar Sequelize em memória diretamente.

- [ ] **Step 4: Executar testes de esquema**

Run: `node --test tests/configurationSchema.test.mjs tests/databaseSchema.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/configurationSchema.test.mjs src/backend/database.js
git commit -m "feat: add configuration database schema"
```

### Task 3: Snapshot, seed e atualização transacional

**Files:**
- Create: `tests/configurationService.test.mjs`
- Create: `src/backend/services/configurationService.js`

- [ ] **Step 1: Escrever testes do seed e snapshot**

Preparar o fixture explícito no início do teste:

```js
import { beforeEach, afterEach } from 'node:test';
import { Op, Sequelize } from 'sequelize';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { defineModels } = require('../src/backend/database');
const { createConfigurationService } = require('../src/backend/services/configurationService');
let db;
let models;
let service;

beforeEach(async () => {
  db = new Sequelize('sqlite::memory:', { logging: false });
  models = defineModels(db);
  await db.sync({ force: true });
  service = createConfigurationService({ db, models });
});

afterEach(async () => { await db.close(); });
```

```js
test('seedDefaults is idempotent and preserves customized values', async () => {
  await service.seedDefaults();
  await models.ConfiguracaoSistema.update(
    { valor_json: JSON.stringify(14), versao: 2 },
    { where: { chave: 'sales.defaultTaxRate' } },
  );
  await service.seedDefaults();

  const row = await models.ConfiguracaoSistema.findOne({ where: { chave: 'sales.defaultTaxRate' } });
  assert.equal(JSON.parse(row.valor_json), 14);
  assert.equal(row.versao, 2);
});

test('getSnapshot returns grouped settings and catalogs', async () => {
  await service.seedDefaults();
  const snapshot = await service.getSnapshot();
  assert.equal(snapshot.settings.sales.defaultTaxRate.value, 0);
  assert.ok(snapshot.catalogs.payment_methods.some((item) => item.code === 'dinheiro'));
  assert.equal(snapshot.migrations.legacyLocalStoragePending, true);
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/configurationService.test.mjs`

Expected: FAIL com `MODULE_NOT_FOUND`.

- [ ] **Step 3: Implementar serialização e seed**

Criar `createConfigurationService({ db, models })`. Implementar helpers puros:

```js
function parseJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

function serializeSetting(row) {
  return {
    key: row.chave,
    value: parseJson(row.valor_json, null),
    version: row.versao,
    updatedAt: row.updatedAt,
  };
}
```

`seedDefaults` usa `findOrCreate` para configurações e opções. `getSnapshot` agrupa pelas definições, inclui ativos e inativos, expõe `editable/system` e calcula a migração pendente pela chave `migration.legacyLocalStorageVersion`.

- [ ] **Step 4: Escrever testes de atualização e concorrência**

```js
test('updateSection validates versions and writes audit atomically', async () => {
  await service.seedDefaults();
  const result = await service.updateSection({
    actorUserId: 1,
    section: 'sales',
    values: { 'sales.defaultTaxRate': 14 },
    expectedVersions: { 'sales.defaultTaxRate': 1 },
  });
  assert.equal(result.settings.sales.defaultTaxRate.value, 14);
  assert.equal(await models.AuditoriaConfiguracao.count(), 1);
  await assert.rejects(
    service.updateSection({
      actorUserId: 1,
      section: 'sales',
      values: { 'sales.defaultTaxRate': 10 },
      expectedVersions: { 'sales.defaultTaxRate': 1 },
    }),
    /Configuração alterada por outra sessão/,
  );
});
```

- [ ] **Step 5: Executar o novo teste e confirmar RED**

Run: `node --test tests/configurationService.test.mjs`

Expected: FAIL porque `updateSection` não existe.

- [ ] **Step 6: Implementar `updateSection`**

Validar que todas as chaves pertencem à secção, chamar `validateSettingValue`, atualizar com `where: { chave, versao: expectedVersion }`, incrementar versão e criar auditoria na mesma transação. Retornar `getSnapshot()` após commit.

- [ ] **Step 7: Executar e confirmar GREEN**

Run: `node --test tests/configurationService.test.mjs`

Expected: PASS.

- [ ] **Step 8: Acrescentar reserva atómica de números documentais**

Escrever um teste com duas chamadas concorrentes e exigir números diferentes e sequenciais. Implementar `reserveNextDocumentNumber({ actorUserId, documentType })` dentro de transação, atualizando `documents.fiscal.series[documentType].nextNumber`, auditando a reserva e retornando texto como `FAT027/26`.

- [ ] **Step 9: Commit**

```bash
git add tests/configurationService.test.mjs src/backend/services/configurationService.js
git commit -m "feat: add transactional configuration service"
```

### Task 4: CRUD de catálogos, proteção e migração

**Files:**
- Modify: `tests/configurationService.test.mjs`
- Modify: `src/backend/services/configurationService.js`

- [ ] **Step 1: Escrever testes de CRUD e proteção**

```js
test('catalog CRUD preserves stable codes and history', async () => {
  await service.seedDefaults();
  const created = await service.createCatalogOption({
    actorUserId: 1,
    catalogKey: 'payment_methods',
    data: { name: 'Multicaixa Express' },
  });
  assert.equal(created.code, 'multicaixa-express');

  const updated = await service.updateCatalogOption({
    actorUserId: 1,
    optionId: created.id,
    data: { name: 'Multicaixa' },
    expectedVersion: created.version,
  });
  assert.equal(updated.code, 'multicaixa-express');
  assert.equal(updated.name, 'Multicaixa');
});

test('technical and required catalog options cannot be deactivated', async () => {
  await service.seedDefaults();
  const technical = await models.OpcaoCatalogo.findOne({
    where: { catalogo: 'document_statuses', codigo: 'anulado' },
  });
  await assert.rejects(
    service.deactivateCatalogOption({ actorUserId: 1, optionId: technical.id }),
    /Opção técnica protegida/,
  );
});

test('cannot deactivate the last active payment method', async () => {
  await models.OpcaoCatalogo.update(
    { ativo: false },
    { where: { catalogo: 'payment_methods', codigo: { [Op.ne]: 'dinheiro' } } },
  );
  const option = await models.OpcaoCatalogo.findOne({
    where: { catalogo: 'payment_methods', codigo: 'dinheiro' },
  });
  await assert.rejects(
    service.deactivateCatalogOption({ actorUserId: 1, optionId: option.id }),
    /Mantenha ao menos uma forma de pagamento ativa/,
  );
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/configurationService.test.mjs`

Expected: FAIL por métodos ausentes.

- [ ] **Step 3: Implementar mutações de catálogo**

Implementar os métodos definidos na especificação. Regras obrigatórias:

```js
function assertEditableCatalog(catalogKey) {
  const definition = CATALOG_DEFINITIONS[catalogKey];
  if (!definition) throw configurationError('Catálogo desconhecido.');
  if (!definition.editable) throw configurationError('Opção técnica protegida.');
  return definition;
}

function slugCode(name) {
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
```

Bloquear opção padrão e turno aberto consultando `ConfiguracaoSistema` e `TurnoOperacional`. `reorderCatalogOptions` valida o conjunto exato de opções ativas.

- [ ] **Step 4: Escrever teste de importação sem duplicação**

```js
test('importLegacySettings imports existing values once without duplicates', async () => {
  await service.seedDefaults();
  await service.importLegacySettings({
    actorUserId: 1,
    migrationVersion: 1,
    data: {
      branding: { pharmacyName: 'Farmacia Central', logoDataUrl: '' },
      invoiceA4: { documentHeaderText: 'Farmacia Central\nNIF: 5000' },
      discoveredCatalogValues: { payment_methods: ['TPA', 'tpa', 'Multicaixa'] },
    },
  });
  assert.equal(await models.OpcaoCatalogo.count({
    where: { catalogo: 'payment_methods', codigo: 'tpa' },
  }), 1);
  assert.equal((await service.getSnapshot()).migrations.legacyLocalStoragePending, false);
  await assert.rejects(
    service.importLegacySettings({ actorUserId: 1, migrationVersion: 1, data: {} }),
    /Migração já concluída/,
  );
});
```

- [ ] **Step 5: Implementar importação transacional**

Mapear branding para `company.identity`, invoice A4 para `documents.headerText`/`documents.fiscal` e valores descobertos para os catálogos permitidos. Normalizar por código e nome; dados SQLite já persistidos têm prioridade.

- [ ] **Step 6: Executar todos os testes do serviço**

Run: `node --test tests/configurationRegistry.test.mjs tests/configurationSchema.test.mjs tests/configurationService.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/configurationService.test.mjs src/backend/services/configurationService.js
git commit -m "feat: manage and migrate settings catalogs"
```

### Task 5: Rotas IPC e permissões

**Files:**
- Create: `tests/configurationIpc.test.mjs`
- Modify: `src/backend/ipcHandlers.js`

- [ ] **Step 1: Escrever testes das rotas**

```js
test('configuration routes separate read and edit permissions', async () => {
  const calls = [];
  const routes = buildRouteMap({
    configurationService: fakeConfigurationService(calls),
    assertPermission: async (_userId, permission) => calls.push(permission),
    authService: activeSessionService(9),
  });
  await routes['configuration.snapshot']();
  await routes['configuration.updateSection']({ section: 'sales', values: {}, expectedVersions: {} });
  assert.deepEqual(calls.slice(0, 2), ['configuracoes.ver', 'configuracoes.editar']);
});

test('catalog mutation passes authenticated actor id', async () => {
  const service = recordingConfigurationService();
  const routes = buildRouteMap({ configurationService: service, ...authorizedUser(7) });
  await routes['configuration.catalog.create']({ catalogKey: 'payment_methods', data: { name: 'Novo' } });
  assert.equal(service.lastCall.actorUserId, 7);
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/configurationIpc.test.mjs`

Expected: FAIL porque as rotas não existem.

- [ ] **Step 3: Adicionar rotas e mensagens seguras**

Dentro de `buildRouteMap`, criar o helper com as dependências fechadas:

```js
function catalogMutation(method) {
  return (data = {}) => withPermission(dependencies, 'configuracoes.editar', (actorUserId) => (
    dependencies.configurationService[method]({ actorUserId, ...data })
  ));
}
```

Adicionar:

```js
'configuration.snapshot': () => withPermission(dependencies, 'configuracoes.ver', () => (
  dependencies.configurationService.getSnapshot()
)),
'configuration.updateSection': (data) => withPermission(dependencies, 'configuracoes.editar', (actorUserId) => (
  dependencies.configurationService.updateSection({ actorUserId, ...data })
)),
'configuration.importLegacy': (data) => withPermission(dependencies, 'configuracoes.editar', (actorUserId) => (
  dependencies.configurationService.importLegacySettings({ actorUserId, ...data })
)),
'configuration.document.reserveNumber': (data) => withPermission(dependencies, 'vendas.criar', (actorUserId) => (
  dependencies.configurationService.reserveNextDocumentNumber({ actorUserId, ...data })
)),
'configuration.catalog.create': catalogMutation('createCatalogOption'),
'configuration.catalog.update': catalogMutation('updateCatalogOption'),
'configuration.catalog.reorder': catalogMutation('reorderCatalogOptions'),
'configuration.catalog.activate': catalogMutation('activateCatalogOption'),
'configuration.catalog.deactivate': catalogMutation('deactivateCatalogOption'),
```

Adicionar as mensagens do serviço a `SAFE_ERROR_MESSAGES` e injetar o serviço em `init`.

- [ ] **Step 4: Executar testes IPC**

Run: `node --test tests/configurationIpc.test.mjs tests/ipcRouteMap.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/configurationIpc.test.mjs tests/ipcRouteMap.test.mjs src/backend/ipcHandlers.js
git commit -m "feat: expose configuration IPC routes"
```

## Fase 2 — Contexto e interface

### Task 6: `SettingsContext`, hooks e migração do navegador

**Files:**
- Create: `tests/settingsContextSource.test.mjs`
- Create: `src/configuration/catalogKeys.mjs`
- Create: `src/configuration/SettingsContext.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Escrever testes de fonte do contexto**

```js
test('SettingsContext loads snapshot and exposes catalog hook', async () => {
  const source = await readFile('src/configuration/SettingsContext.jsx', 'utf8');
  assert.match(source, /request\('configuration\.snapshot'/);
  assert.match(source, /function useCatalog/);
  assert.match(source, /includeInactive/);
  assert.match(source, /readLegacySettings/);
  assert.match(source, /configuration\.importLegacy/);
});

test('App wraps authenticated modules with SettingsProvider', async () => {
  const source = await readFile('src/App.jsx', 'utf8');
  assert.match(source, /<SettingsProvider>/);
  assert.match(source, /<OperationProvider>/);
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/settingsContextSource.test.mjs`

Expected: FAIL por arquivos ausentes.

- [ ] **Step 3: Implementar o contrato do frontend**

`catalogKeys.mjs` exporta as chaves congeladas. `SettingsContext` implementa:

```jsx
const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ snapshot: null, isLoading: true, error: '', readOnly: false });

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const snapshot = await request('configuration.snapshot');
      const migrated = await migrateLegacyIfNeeded(snapshot);
      setState({ snapshot: migrated, isLoading: false, error: '', readOnly: false });
    } catch (error) {
      setState({ snapshot: createSafeDefaultSnapshot(), isLoading: false, error: error.message, readOnly: true });
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);
  return <SettingsContext.Provider value={{ ...state, refresh, applySnapshot }}>{children}</SettingsContext.Provider>;
}
```

`useCatalog` filtra ativos por padrão e inclui a opção inativa selecionada quando `selectedCode` for fornecido.

- [ ] **Step 4: Implementar migração única de `localStorage`**

`readLegacySettings` usa `getStoredBranding` e `getStoredInvoiceA4Settings`; envia `migrationVersion: 1` somente quando o snapshot marca pendência. Após sucesso, não volta a usar esses getters como fonte operacional.

- [ ] **Step 5: Executar testes**

Run: `node --test tests/settingsContextSource.test.mjs tests/branding.test.mjs tests/invoiceSettings.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/settingsContextSource.test.mjs src/configuration src/App.jsx
git commit -m "feat: add live settings context"
```

### Task 7: Página incorporada de Configurações

**Files:**
- Create: `tests/settingsUiSource.test.mjs`
- Create: `src/components/settings/SettingsSectionNav.jsx`
- Create: `src/components/settings/SettingField.jsx`
- Create: `src/components/settings/CatalogEditor.jsx`
- Modify: `src/components/Configuracoes.jsx`
- Modify: `src/assets/tailwind.css`
- Generate: `src/assets/output.css`

- [ ] **Step 1: Escrever testes de estrutura e linguagem visual**

```js
test('Configuracoes is inline and uses accessible icons and tooltips', async () => {
  const source = await readFile('src/components/Configuracoes.jsx', 'utf8');
  assert.match(source, /SettingsSectionNav/);
  assert.match(source, /CatalogEditor/);
  assert.match(source, /SettingField/);
  assert.match(source, /useSettings/);
  assert.doesNotMatch(source, /modal-backdrop/);
  assert.doesNotMatch(source, /SettingsModal/);
});

test('CatalogEditor supports inline lifecycle actions', async () => {
  const source = await readFile('src/components/settings/CatalogEditor.jsx', 'utf8');
  assert.match(source, /aria-label="Adicionar opção"/);
  assert.match(source, /aria-label="Editar opção"/);
  assert.match(source, /aria-label="Desativar opção"/);
  assert.match(source, /aria-label="Ativar opção"/);
  assert.match(source, /title=/);
  assert.doesNotMatch(source, /<strong>/);
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/settingsUiSource.test.mjs`

Expected: FAIL por componentes ausentes.

- [ ] **Step 3: Criar componentes focados**

`SettingField` recebe `icon`, `label`, `help`, `error`, `children` e renderiza tooltip acessível. `SettingsSectionNav` renderiza botões com ícones Lucide e `aria-current`. `CatalogEditor` mantém rascunho local, edita em linha, ordena com `ArrowUp`/`ArrowDown` e chama as rotas IPC.

- [ ] **Step 4: Reescrever `Configuracoes.jsx` sem modal**

Usar estado `activeSection`, rascunho por secção e `saveSection`:

```jsx
async function saveSection(section) {
  const values = buildSectionValues(section, drafts[section]);
  const expectedVersions = buildExpectedVersions(section, snapshot);
  try {
    const next = await request('configuration.updateSection', { section, values, expectedVersions });
    applySnapshot(next);
    setStatus({ tone: 'success', message: 'Configurações guardadas.' });
  } catch (error) {
    setStatus({ tone: 'error', message: error.message });
  }
}
```

Renderizar sete secções aprovadas. Catálogos protegidos usam `CatalogEditor readOnly` e mostram origem.

- [ ] **Step 5: Adicionar CSS sem excesso de negrito**

Criar `.settings-layout`, `.settings-section-nav`, `.settings-workspace`, `.setting-field`, `.setting-help`, `.catalog-editor`, `.catalog-row` e estados. Títulos e botões usam `font-weight: 400` ou `500`; tooltips são visíveis em foco e hover.

- [ ] **Step 6: Gerar CSS e executar testes**

Run: `npm run build:tailwind`

Expected: exit code 0.

Run: `node --test tests/settingsUiSource.test.mjs tests/invoiceA4Component.test.mjs`

Expected: PASS após atualizar o teste antigo de Configurações para o novo contrato.

- [ ] **Step 7: Commit**

```bash
git add tests/settingsUiSource.test.mjs tests/invoiceA4Component.test.mjs src/components/Configuracoes.jsx src/components/settings src/assets/tailwind.css src/assets/output.css
git commit -m "feat: rebuild settings as inline workspace"
```

## Fase 3 — Consumidores e backup

### Task 8: Vendas, Operação e Financeiro consomem catálogos

**Files:**
- Create: `tests/settingsConsumersSource.test.mjs`
- Modify: `src/components/Vendas.jsx`
- Modify: `src/components/Operacao.jsx`
- Modify: `src/components/Financeiro.jsx`
- Modify: `src/data/salesWorkflow.mjs`

- [ ] **Step 1: Escrever testes que rejeitam listas fixas**

```js
test('sales operation and finance consume central catalogs', async () => {
  const sales = await readFile('src/components/Vendas.jsx', 'utf8');
  const operation = await readFile('src/components/Operacao.jsx', 'utf8');
  const finance = await readFile('src/components/Financeiro.jsx', 'utf8');

  assert.match(sales, /useCatalog\(CATALOG_KEYS\.PAYMENT_METHODS/);
  assert.doesNotMatch(sales, /const paymentMethods = \[/);
  assert.match(operation, /useCatalog\(CATALOG_KEYS\.OPERATION_SHIFTS/);
  assert.doesNotMatch(operation, /const shiftNames = \[/);
  assert.match(finance, /CATALOG_KEYS\.EXPENSE_CATEGORIES/);
  assert.match(finance, /CATALOG_KEYS\.REVENUE_CATEGORIES/);
  assert.match(finance, /CATALOG_KEYS\.LOSS_REASONS/);
  assert.doesNotMatch(finance, /const expenseCategories = \[/);
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/settingsConsumersSource.test.mjs`

Expected: FAIL porque os componentes ainda contêm listas.

- [ ] **Step 3: Migrar Vendas**

Usar `useCatalog(CATALOG_KEYS.PAYMENT_METHODS)`. Mapear `option.metadata.icon` para um mapa local de componentes Lucide, mantendo apenas a apresentação local. Usar `sales.defaultPaymentMethod`, imposto, desconto, arredondamento e consumidor final do snapshot.

- [ ] **Step 4: Migrar Operação**

Usar catálogo de turnos ativos; se o turno atualmente aberto estiver inativo, incluí-lo via `selectedCode`. Enviar código e nome ao backend; histórico mantém o nome persistido.

- [ ] **Step 5: Migrar Financeiro**

Substituir turnos, categorias e motivos pelas opções centrais. Tipos/estados vêm dos catálogos protegidos. Recalcular defaults quando a opção atual ficar indisponível.

- [ ] **Step 6: Executar testes dos consumidores**

Run: `node --test tests/settingsConsumersSource.test.mjs tests/salesWorkflow.test.mjs tests/operationUiSource.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/settingsConsumersSource.test.mjs src/components/Vendas.jsx src/components/Operacao.jsx src/components/Financeiro.jsx src/data/salesWorkflow.mjs
git commit -m "feat: feed operational selects from settings"
```

### Task 9: Stock, Clientes, Documentos e documentos A4

**Files:**
- Modify: `tests/settingsConsumersSource.test.mjs`
- Modify: `src/components/Estoque.jsx`
- Modify: `src/components/Clientes.jsx`
- Modify: `src/components/Documentos.jsx`
- Modify: `src/components/Relatorios.jsx`
- Modify: `src/components/Vendas.jsx`
- Modify: `src/components/Dashboard.jsx`
- Modify: `src/data/invoiceA4.mjs`

- [ ] **Step 1: Acrescentar testes das fontes oficiais**

```js
test('remaining selects use catalogs or official services', async () => {
  const stock = await readFile('src/components/Estoque.jsx', 'utf8');
  const clients = await readFile('src/components/Clientes.jsx', 'utf8');
  const documents = await readFile('src/components/Documentos.jsx', 'utf8');
  const dashboard = await readFile('src/components/Dashboard.jsx', 'utf8');
  assert.match(stock, /CATALOG_KEYS\.STOCK_UNITS/);
  assert.match(stock, /CATALOG_KEYS\.STOCK_LOCATIONS/);
  assert.match(stock, /buildStockFormOptions/);
  assert.match(clients, /CATALOG_KEYS\.CLIENT_STATUSES/);
  assert.match(documents, /CATALOG_KEYS\.DOCUMENT_TYPES/);
  assert.match(documents, /CATALOG_KEYS\.DOCUMENT_STATUSES/);
  assert.match(dashboard, /stock\.lowStockThreshold/);
  assert.match(dashboard, /alerts\.dashboardEnabled/);
});

test('print consumers no longer read localStorage settings', async () => {
  const sales = await readFile('src/components/Vendas.jsx', 'utf8');
  const reports = await readFile('src/components/Relatorios.jsx', 'utf8');
  assert.doesNotMatch(sales, /getStoredBranding|getStoredInvoiceA4Settings/);
  assert.doesNotMatch(reports, /getStoredBranding|getStoredInvoiceA4Settings/);
  assert.match(sales, /useSettings/);
  assert.match(reports, /useSettings/);
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/settingsConsumersSource.test.mjs`

Expected: FAIL pelas fontes antigas.

- [ ] **Step 3: Migrar consumidores restantes**

Stock usa catálogos somente para unidades/localizações e mantém `buildStockFormOptions` para categorias reais. Clientes e Documentos usam catálogos técnicos em modo somente leitura. Vendas/Relatórios constroem branding e definições A4 a partir de `snapshot.settings`. Dashboard usa os limites e a ativação de alertas do snapshot.

- [ ] **Step 4: Adaptar view model A4**

Criar `buildDocumentSettingsFromSnapshot(snapshot)` em `src/data/invoiceA4.mjs`, convertendo `company.identity`, `documents.headerText` e `documents.fiscal` para o contrato existente. Testar a função em `tests/invoiceA4.test.mjs`.

Vendas chama `configuration.document.reserveNumber` imediatamente antes de finalizar uma nova factura; o número devolvido substitui o número demonstrativo. Erros preservam o carrinho e impedem emissão duplicada.

- [ ] **Step 5: Executar testes**

Run: `node --test tests/settingsConsumersSource.test.mjs tests/invoiceA4.test.mjs tests/reportUiSource.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/settingsConsumersSource.test.mjs tests/invoiceA4.test.mjs src/components/Estoque.jsx src/components/Clientes.jsx src/components/Documentos.jsx src/components/Relatorios.jsx src/components/Vendas.jsx src/components/Dashboard.jsx src/data/invoiceA4.mjs
git commit -m "feat: connect remaining settings consumers"
```

### Task 10: Backup, restauro e diálogo nativo

**Files:**
- Create: `tests/backupService.test.mjs`
- Create: `src/backend/services/backupService.js`
- Modify: `src/backend/ipcHandlers.js`
- Modify: `main.js`
- Modify: `src/components/Configuracoes.jsx`

- [ ] **Step 1: Escrever testes do serviço com diretório temporário**

Criar um fixture que usa `mkdtemp`, um SQLite real no diretório temporário e limpa tudo em `afterEach`:

```js
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sequelize } from 'sequelize';

let tempDir;
let folderPath;
let dbPath;
let db;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'farmacia-backup-'));
  folderPath = join(tempDir, 'backups');
  dbPath = join(tempDir, 'database.sqlite');
  await mkdir(folderPath);
  db = new Sequelize({ dialect: 'sqlite', storage: dbPath, logging: false });
  await db.authenticate();
});

afterEach(async () => {
  if (db) await db.close().catch(() => {});
  await rm(tempDir, { recursive: true, force: true });
});
```

```js
test('createBackup copies database and enforces retention', async () => {
  const times = [
    new Date('2026-06-19T10:30:00Z'),
    new Date('2026-06-19T10:31:00Z'),
    new Date('2026-06-19T10:32:00Z'),
  ];
  const service = createBackupService({ db, dbPath, now: () => times.shift() });
  await service.createBackup({ folderPath, retentionCount: 2 });
  await service.createBackup({ folderPath, retentionCount: 2 });
  await service.createBackup({ folderPath, retentionCount: 2 });
  const files = await service.listBackups({ folderPath });
  assert.equal(files.length, 2);
});

test('restore validates sqlite before replacing current database', async () => {
  const invalidFile = join(tempDir, 'invalid.sqlite');
  await writeFile(invalidFile, 'not a sqlite database');
  const service = createBackupService({ db, dbPath });
  await assert.rejects(service.restoreBackup({ filePath: invalidFile }), /Backup SQLite inválido/);
  assert.equal(await readFile(dbPath, 'utf8'), 'current');
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/backupService.test.mjs`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Implementar serviço seguro**

Usar `VACUUM INTO` para criar uma cópia SQLite consistente, nomes `farmacia-YYYYMMDD-HHmmss.sqlite`, arquivo temporário, validação `PRAGMA quick_check`, backup de segurança e substituição atómica. Antes do restauro, fechar a conexão; depois do sucesso, reiniciar. Nunca aceitar pasta diferente da persistida nas opções.

Implementar `startBackupScheduler({ getOptions, createBackup, now, setTimer })`: manual não agenda; diário/semanal calcula a próxima execução e impede duas execuções simultâneas. Testar o agendamento com relógio e timer injetados.

- [ ] **Step 4: Adicionar rotas IPC**

Adicionar `configuration.backup.chooseFolder`, `configuration.backup.create`, `configuration.backup.list`, `configuration.backup.chooseRestoreFile` e `configuration.backup.restore`. Todas exigem `configuracoes.editar`. `dialog.showOpenDialog` é injetado por `main.js`; restauro chama `app.relaunch()` e `app.exit(0)` somente após sucesso.

- [ ] **Step 5: Integrar a secção de backup**

Botões inline com ícones e tooltips chamam as rotas. Restauro usa `confirmSensitiveAction` existente. Mostrar lista dos backups e resultado da última ação.

- [ ] **Step 6: Executar testes**

Run: `node --test tests/backupService.test.mjs tests/configurationIpc.test.mjs tests/settingsUiSource.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/backupService.test.mjs tests/configurationIpc.test.mjs tests/settingsUiSource.test.mjs src/backend/services/backupService.js src/backend/ipcHandlers.js src/components/Configuracoes.jsx main.js
git commit -m "feat: add safe database backup and restore"
```

## Fase 4 — Verificação e preparação do executável

### Task 11: Preparação de empacotamento e verificação integrada

**Files:**
- Create: `tests/packagingReadiness.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify only if verification reveals a defect in files already listed.

- [ ] **Step 1: Escrever teste de configuração de empacotamento**

```js
test('package defines unpacked Electron verification', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.main, 'main.js');
  assert.match(pkg.scripts['pack:dir'], /electron-builder --dir/);
  assert.ok(pkg.build.files.includes('dist/**/*'));
  assert.ok(pkg.build.files.includes('src/backend/**/*'));
  assert.ok(pkg.build.files.includes('preload.js'));
  assert.equal(pkg.build.asar, true);
  assert.ok(pkg.build.asarUnpack.includes('node_modules/sqlite3/**/*'));
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/packagingReadiness.test.mjs`

Expected: FAIL porque `pack:dir` e `build` não existem.

- [ ] **Step 3: Instalar e configurar electron-builder**

Run: `npm install --save-dev electron-builder`

Adicionar a `package.json`:

```json
{
  "scripts": {
    "pack:dir": "npm run build && electron-builder --dir"
  },
  "build": {
    "appId": "ao.kilsystem.farmacia",
    "productName": "Farmacia ESAYOS",
    "asar": true,
    "directories": { "output": "release" },
    "files": [
      "dist/**/*",
      "src/backend/**/*",
      "main.js",
      "preload.js",
      "package.json"
    ],
    "asarUnpack": ["node_modules/sqlite3/**/*"],
    "extraMetadata": { "main": "main.js" }
  }
}
```

- [ ] **Step 4: Executar verificações focadas**

Run: `node --test tests/packagingReadiness.test.mjs`

Expected: PASS.

Run: `node --check main.js`

Expected: exit code 0.

- [ ] **Step 5: Executar toda a suíte e builds**

Run: `npm test`

Expected: zero falhas.

Run: `npm run build:tailwind`

Expected: exit code 0.

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 6: Gerar pacote não instalável de validação**

Run: `npm run pack:dir`

Expected: aplicação desempacotada criada em `release/` sem erro. Não criar instalador nesta etapa.

- [ ] **Step 7: Inspeção funcional no Electron**

Verificar:

```text
1. Configurações abre sem modal nova.
2. Ícones e tooltips funcionam por rato e teclado.
3. Guardar cada secção atualiza consumidores abertos.
4. Criar, editar, ordenar e desativar opções funciona.
5. Opções técnicas permanecem bloqueadas.
6. Vendas, Operação, Financeiro, Stock, Clientes e Documentos recebem os catálogos corretos.
7. Factura e relatório usam identidade SQLite.
8. Backup manual e retenção funcionam.
9. Restauro inválido não altera a base.
10. O pacote desempacotado inicia com a base em userData.
```

- [ ] **Step 8: Commit final**

```bash
git add package.json package-lock.json tests/packagingReadiness.test.mjs
git commit -m "build: prepare Electron packaging validation"
```

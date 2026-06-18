# Abertura e Fechamento de Dia e Turnos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist operational day and shift control in SQLite and block sales/financial operations unless one day and one shift are open for the pharmacy.

**Architecture:** Add operational models to the backend SQLite schema, a dedicated `operationService`, IPC routes protected by permissions, and a React operation context that gates Vendas, Financeiro, Dashboard, and the new Operacao screen. The backend owns day/shift rules; the frontend renders state and disables risky actions.

**Tech Stack:** React 19, Vite, Electron IPC, Sequelize, SQLite, Node test runner, lucide-react.

---

## Current Constraint

`git status --short` currently fails with `fatal: not a git repository`. This plan uses verification checkpoints instead of commit steps. If the workspace is initialized as Git before implementation, commit after each task with the task-specific message listed at the end of that task.

## File Structure

- Modify `src/backend/services/permissionCatalog.js`: add `operacao.*` permissions and profile assignments.
- Modify `src/backend/database.js`: define `DiaOperacional` and `TurnoOperacional`, associations, and SQLite migration helpers.
- Create `src/backend/services/operationService.js`: day/shift business rules and state serializer.
- Modify `src/backend/ipcHandlers.js`: add operation routes and safe operational error messages.
- Create `src/operation/OperationContext.jsx`: shared frontend state, actions, refresh, and operation guard.
- Create `src/components/Operacao.jsx`: page for opening/closing day and shifts.
- Modify `src/components/Navbar.jsx`: add Operacao menu entry.
- Modify `src/App.jsx`: add view title, permission, provider, and route.
- Modify `src/components/Vendas.jsx`: disable hold/finalize when operational session is closed.
- Modify `src/components/Financeiro.jsx`: disable manual financial entries when operational session is closed.
- Modify `src/components/Dashboard.jsx`: show operational status card/alert.
- Modify `src/assets/tailwind.css` and regenerate `src/assets/output.css`: operation UI and blocked-action styles.
- Test `tests/permissionCatalog.test.mjs`: permission coverage.
- Test `tests/databaseSchema.test.mjs`: schema and migration coverage.
- Create `tests/operationService.test.mjs`: backend service behavior.
- Modify `tests/ipcRouteMap.test.mjs`: route and safe error coverage.
- Create `tests/operationUiSource.test.mjs`: source-level UI wiring assertions matching the project’s existing component test style.

---

### Task 1: Add Operational Permissions

**Files:**
- Modify: `src/backend/services/permissionCatalog.js`
- Modify: `tests/permissionCatalog.test.mjs`

- [ ] **Step 1: Write the failing permission test**

Append this test to `tests/permissionCatalog.test.mjs`:

```js
test('operation permissions are cataloged and assigned by profile', () => {
  const keys = getPermissionKeys();
  const admin = DEFAULT_PROFILES.find((profile) => profile.nome === ADMINISTRATOR_PROFILE);
  const pharmacist = DEFAULT_PROFILES.find((profile) => profile.nome === 'Farmaceutico');
  const cashier = DEFAULT_PROFILES.find((profile) => profile.nome === 'Caixa');
  const stockManager = DEFAULT_PROFILES.find((profile) => profile.nome === 'Gestor de Stock');
  const operationPermissions = [
    'operacao.ver',
    'operacao.abrir_dia',
    'operacao.fechar_dia',
    'operacao.abrir_turno',
    'operacao.fechar_turno',
  ];

  for (const permission of operationPermissions) {
    assert.ok(keys.includes(permission), `${permission} should exist`);
    assert.ok(admin.permissoes.includes(permission), `admin should include ${permission}`);
  }

  assert.ok(pharmacist.permissoes.includes('operacao.ver'));
  assert.ok(pharmacist.permissoes.includes('operacao.abrir_turno'));
  assert.ok(pharmacist.permissoes.includes('operacao.fechar_turno'));
  assert.equal(pharmacist.permissoes.includes('operacao.abrir_dia'), false);
  assert.equal(pharmacist.permissoes.includes('operacao.fechar_dia'), false);

  assert.ok(cashier.permissoes.includes('operacao.ver'));
  assert.ok(cashier.permissoes.includes('operacao.abrir_turno'));
  assert.ok(cashier.permissoes.includes('operacao.fechar_turno'));
  assert.equal(cashier.permissoes.includes('operacao.abrir_dia'), false);
  assert.equal(cashier.permissoes.includes('operacao.fechar_dia'), false);

  assert.deepEqual(
    operationPermissions.filter((permission) => stockManager.permissoes.includes(permission)),
    ['operacao.ver'],
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- tests/permissionCatalog.test.mjs
```

Expected: FAIL because `operacao.ver` and related permission keys are not in the catalog.

- [ ] **Step 3: Implement permission catalog changes**

In `src/backend/services/permissionCatalog.js`, add these permission objects after the dashboard permission:

```js
  { chave: 'operacao.ver', modulo: 'Operacao', acao: 'ver', descricao: 'Ver abertura e fechamento operacional' },
  { chave: 'operacao.abrir_dia', modulo: 'Operacao', acao: 'abrir_dia', descricao: 'Abrir dia operacional' },
  { chave: 'operacao.fechar_dia', modulo: 'Operacao', acao: 'fechar_dia', descricao: 'Fechar dia operacional' },
  { chave: 'operacao.abrir_turno', modulo: 'Operacao', acao: 'abrir_turno', descricao: 'Abrir turno operacional' },
  { chave: 'operacao.fechar_turno', modulo: 'Operacao', acao: 'fechar_turno', descricao: 'Fechar turno operacional' },
```

Add profile permissions:

```js
// Farmaceutico permissions
'operacao.ver',
'operacao.abrir_turno',
'operacao.fechar_turno',

// Caixa permissions
'operacao.ver',
'operacao.abrir_turno',
'operacao.fechar_turno',

// Gestor de Stock permissions
'operacao.ver',
```

Administrator automatically receives all permissions through `ALL_PERMISSION_KEYS`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm test -- tests/permissionCatalog.test.mjs
```

Expected: PASS.

Commit if Git is available:

```powershell
git add src/backend/services/permissionCatalog.js tests/permissionCatalog.test.mjs
git commit -m "feat: add operation permissions"
```

---

### Task 2: Add SQLite Operational Schema

**Files:**
- Modify: `src/backend/database.js`
- Modify: `tests/databaseSchema.test.mjs`

- [ ] **Step 1: Write the failing schema test**

Append this test to `tests/databaseSchema.test.mjs`:

```js
test('syncDatabaseSchema creates operational day and shift tables', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-operation-schema-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');

  try {
    await syncDatabaseSchema(db);

    const dayColumns = await db.query('PRAGMA table_info(DiaOperacionals)', {
      type: db.QueryTypes.SELECT,
    });
    const shiftColumns = await db.query('PRAGMA table_info(TurnoOperacionals)', {
      type: db.QueryTypes.SELECT,
    });
    const dayNames = dayColumns.map((column) => column.name);
    const shiftNames = shiftColumns.map((column) => column.name);

    for (const column of [
      'data_operacional',
      'status',
      'saldo_inicial',
      'saldo_final_informado',
      'total_vendas',
      'total_despesas',
      'total_perdas',
      'diferenca_caixa',
      'observacao_abertura',
      'observacao_fechamento',
      'aberto_por_usuario_id',
      'fechado_por_usuario_id',
      'aberto_em',
      'fechado_em',
    ]) {
      assert.ok(dayNames.includes(column), `DiaOperacionals should include ${column}`);
    }

    for (const column of [
      'dia_operacional_id',
      'nome',
      'status',
      'saldo_inicial',
      'saldo_final_informado',
      'total_vendas',
      'total_despesas',
      'total_perdas',
      'diferenca_caixa',
      'observacao_abertura',
      'observacao_fechamento',
      'aberto_por_usuario_id',
      'fechado_por_usuario_id',
      'aberto_em',
      'fechado_em',
    ]) {
      assert.ok(shiftNames.includes(column), `TurnoOperacionals should include ${column}`);
    }
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm test -- tests/databaseSchema.test.mjs
```

Expected: FAIL because `DiaOperacionals` and `TurnoOperacionals` do not exist.

- [ ] **Step 3: Define models and associations**

In `src/backend/database.js`, inside `defineModels(db)` after `TransacaoFinanceira`, add:

```js
  const DiaOperacional = db.define("DiaOperacional", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    data_operacional: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: "Aberto" },
    saldo_inicial: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
    saldo_final_informado: { type: DataTypes.DECIMAL(10, 2) },
    total_vendas: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
    total_despesas: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
    total_perdas: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
    diferenca_caixa: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
    observacao_abertura: { type: DataTypes.TEXT },
    observacao_fechamento: { type: DataTypes.TEXT },
    aberto_por_usuario_id: { type: DataTypes.INTEGER },
    fechado_por_usuario_id: { type: DataTypes.INTEGER },
    aberto_em: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    fechado_em: { type: DataTypes.DATE },
  });

  const TurnoOperacional = db.define("TurnoOperacional", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    dia_operacional_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: DiaOperacional, key: "id" } },
    nome: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: "Aberto" },
    saldo_inicial: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
    saldo_final_informado: { type: DataTypes.DECIMAL(10, 2) },
    total_vendas: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
    total_despesas: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
    total_perdas: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
    diferenca_caixa: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
    observacao_abertura: { type: DataTypes.TEXT },
    observacao_fechamento: { type: DataTypes.TEXT },
    aberto_por_usuario_id: { type: DataTypes.INTEGER },
    fechado_por_usuario_id: { type: DataTypes.INTEGER },
    aberto_em: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    fechado_em: { type: DataTypes.DATE },
  });
```

Add associations after `TransacaoFinanceira` associations:

```js
  DiaOperacional.hasMany(TurnoOperacional, { foreignKey: "dia_operacional_id" });
  TurnoOperacional.belongsTo(DiaOperacional, { foreignKey: "dia_operacional_id" });
  DiaOperacional.belongsTo(Usuario, { as: "abertoPor", foreignKey: "aberto_por_usuario_id" });
  DiaOperacional.belongsTo(Usuario, { as: "fechadoPor", foreignKey: "fechado_por_usuario_id" });
  TurnoOperacional.belongsTo(Usuario, { as: "abertoPor", foreignKey: "aberto_por_usuario_id" });
  TurnoOperacional.belongsTo(Usuario, { as: "fechadoPor", foreignKey: "fechado_por_usuario_id" });
```

Add both models to the return object:

```js
    DiaOperacional,
    TurnoOperacional,
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm test -- tests/databaseSchema.test.mjs
```

Expected: PASS.

Commit if Git is available:

```powershell
git add src/backend/database.js tests/databaseSchema.test.mjs
git commit -m "feat: add operation schema"
```

---

### Task 3: Implement Operation Service Rules

**Files:**
- Create: `src/backend/services/operationService.js`
- Create: `tests/operationService.test.mjs`

- [ ] **Step 1: Write failing service tests**

Create `tests/operationService.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, syncDatabaseSchema } = require('../src/backend/database.js');
const operationService = require('../src/backend/services/operationService.js');

async function withDb(callback) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-operation-service-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };
  const db = await connectDB(fakeApp, 'development');

  try {
    await syncDatabaseSchema(db);
    await callback();
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

test('openDay creates one open operational day and rejects a second one', async () => {
  await withDb(async () => {
    const day = await operationService.openDay({
      actorUserId: 1,
      data: { operationalDate: '2026-06-18', openingBalance: 25000, note: 'Inicio do dia' },
    });

    assert.equal(day.status, 'Aberto');
    assert.equal(day.data_operacional, '2026-06-18');
    assert.equal(Number(day.saldo_inicial), 25000);

    await assert.rejects(
      () => operationService.openDay({ actorUserId: 1, data: { operationalDate: '2026-06-18', openingBalance: 0 } }),
      /Ja existe um dia operacional aberto\./,
    );
  });
});

test('openShift requires an open day and rejects a second open shift', async () => {
  await withDb(async () => {
    await assert.rejects(
      () => operationService.openShift({ actorUserId: 1, data: { name: 'Manha', openingBalance: 5000 } }),
      /Nao ha dia operacional aberto\./,
    );

    await operationService.openDay({
      actorUserId: 1,
      data: { operationalDate: '2026-06-18', openingBalance: 25000 },
    });
    const shift = await operationService.openShift({
      actorUserId: 2,
      data: { name: 'Manha', openingBalance: 5000, note: 'Caixa 1' },
    });

    assert.equal(shift.status, 'Aberto');
    assert.equal(shift.nome, 'Manha');

    await assert.rejects(
      () => operationService.openShift({ actorUserId: 2, data: { name: 'Tarde', openingBalance: 0 } }),
      /Ja existe um turno operacional aberto\./,
    );
  });
});

test('closeDay is blocked while a shift is open and succeeds after closing the shift', async () => {
  await withDb(async () => {
    await operationService.openDay({
      actorUserId: 1,
      data: { operationalDate: '2026-06-18', openingBalance: 10000 },
    });
    await operationService.openShift({
      actorUserId: 2,
      data: { name: 'Manha', openingBalance: 10000 },
    });

    await assert.rejects(
      () => operationService.closeDay({ actorUserId: 1, data: { closingBalance: 12000 } }),
      /Feche o turno aberto antes de fechar o dia\./,
    );

    const shift = await operationService.closeShift({
      actorUserId: 2,
      data: { closingBalance: 12000, note: 'Sem diferenca' },
    });
    const day = await operationService.closeDay({
      actorUserId: 1,
      data: { closingBalance: 12000, note: 'Dia encerrado' },
    });

    assert.equal(shift.status, 'Fechado');
    assert.equal(day.status, 'Fechado');
    assert.equal(Number(day.saldo_final_informado), 12000);
  });
});

test('getOperationalState and assertOperationalSessionOpen reflect blocking state', async () => {
  await withDb(async () => {
    let state = await operationService.getOperationalState();
    assert.equal(state.canOperate, false);
    assert.equal(state.message, 'Abra o dia operacional antes de iniciar operacoes.');
    await assert.rejects(
      () => operationService.assertOperationalSessionOpen(),
      /Abra o dia operacional antes de iniciar operacoes\./,
    );

    await operationService.openDay({
      actorUserId: 1,
      data: { operationalDate: '2026-06-18', openingBalance: 10000 },
    });
    state = await operationService.getOperationalState();
    assert.equal(state.canOperate, false);
    assert.equal(state.message, 'Abra um turno antes de vender ou lancar despesas.');

    await operationService.openShift({
      actorUserId: 2,
      data: { name: 'Manha', openingBalance: 10000 },
    });
    state = await operationService.getOperationalState();
    assert.equal(state.canOperate, true);
    assert.equal(state.message, '');
    await operationService.assertOperationalSessionOpen();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test -- tests/operationService.test.mjs
```

Expected: FAIL because `src/backend/services/operationService.js` does not exist.

- [ ] **Step 3: Implement `operationService.js`**

Create `src/backend/services/operationService.js`:

```js
const { getModels } = require("../database");

const STATUS_OPEN = "Aberto";
const STATUS_CLOSED = "Fechado";

const SAFE_OPERATION_ERRORS = Object.freeze([
  "Abra o dia operacional antes de iniciar operacoes.",
  "Abra um turno antes de vender ou lancar despesas.",
  "Ja existe um dia operacional aberto.",
  "Ja existe um turno operacional aberto.",
  "Feche o turno aberto antes de fechar o dia.",
  "Nao ha dia operacional aberto.",
  "Nao ha turno operacional aberto.",
]);

function createOperationError(message) {
  const error = new Error(message);
  error.code = "OPERATION_STATE_INVALID";
  return error;
}

function normalizeMoney(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw createOperationError("Informe um valor de caixa valido.");
  }
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function findOpenDay() {
  const { DiaOperacional } = getModels();
  return DiaOperacional.findOne({ where: { status: STATUS_OPEN }, order: [["aberto_em", "DESC"]] });
}

async function findOpenShift() {
  const { TurnoOperacional } = getModels();
  return TurnoOperacional.findOne({ where: { status: STATUS_OPEN }, order: [["aberto_em", "DESC"]] });
}

function serializeDay(day) {
  if (!day) return null;
  const raw = typeof day.toJSON === "function" ? day.toJSON() : day;
  return {
    id: raw.id,
    data_operacional: raw.data_operacional,
    status: raw.status,
    saldo_inicial: Number(raw.saldo_inicial ?? 0),
    saldo_final_informado: raw.saldo_final_informado === null ? null : Number(raw.saldo_final_informado ?? 0),
    total_vendas: Number(raw.total_vendas ?? 0),
    total_despesas: Number(raw.total_despesas ?? 0),
    total_perdas: Number(raw.total_perdas ?? 0),
    diferenca_caixa: Number(raw.diferenca_caixa ?? 0),
    observacao_abertura: raw.observacao_abertura ?? "",
    observacao_fechamento: raw.observacao_fechamento ?? "",
    aberto_por_usuario_id: raw.aberto_por_usuario_id,
    fechado_por_usuario_id: raw.fechado_por_usuario_id,
    aberto_em: raw.aberto_em,
    fechado_em: raw.fechado_em,
  };
}

function serializeShift(shift) {
  if (!shift) return null;
  const raw = typeof shift.toJSON === "function" ? shift.toJSON() : shift;
  return {
    id: raw.id,
    dia_operacional_id: raw.dia_operacional_id,
    nome: raw.nome,
    status: raw.status,
    saldo_inicial: Number(raw.saldo_inicial ?? 0),
    saldo_final_informado: raw.saldo_final_informado === null ? null : Number(raw.saldo_final_informado ?? 0),
    total_vendas: Number(raw.total_vendas ?? 0),
    total_despesas: Number(raw.total_despesas ?? 0),
    total_perdas: Number(raw.total_perdas ?? 0),
    diferenca_caixa: Number(raw.diferenca_caixa ?? 0),
    observacao_abertura: raw.observacao_abertura ?? "",
    observacao_fechamento: raw.observacao_fechamento ?? "",
    aberto_por_usuario_id: raw.aberto_por_usuario_id,
    fechado_por_usuario_id: raw.fechado_por_usuario_id,
    aberto_em: raw.aberto_em,
    fechado_em: raw.fechado_em,
  };
}

async function getOperationalState() {
  const openDay = await findOpenDay();
  const openShift = await findOpenShift();
  const canOperate = Boolean(openDay && openShift);
  const message = !openDay
    ? "Abra o dia operacional antes de iniciar operacoes."
    : !openShift
      ? "Abra um turno antes de vender ou lancar despesas."
      : "";

  return {
    canOperate,
    message,
    day: serializeDay(openDay),
    shift: serializeShift(openShift),
  };
}

async function openDay({ actorUserId, data = {} }) {
  const { DiaOperacional } = getModels();
  const existingDay = await findOpenDay();
  if (existingDay) {
    throw createOperationError("Ja existe um dia operacional aberto.");
  }

  return DiaOperacional.create({
    data_operacional: data.operationalDate || todayKey(),
    status: STATUS_OPEN,
    saldo_inicial: normalizeMoney(data.openingBalance),
    observacao_abertura: normalizeText(data.note),
    aberto_por_usuario_id: actorUserId,
    aberto_em: new Date(),
  });
}

async function openShift({ actorUserId, data = {} }) {
  const { TurnoOperacional } = getModels();
  const openDay = await findOpenDay();
  if (!openDay) {
    throw createOperationError("Nao ha dia operacional aberto.");
  }

  const existingShift = await findOpenShift();
  if (existingShift) {
    throw createOperationError("Ja existe um turno operacional aberto.");
  }

  return TurnoOperacional.create({
    dia_operacional_id: openDay.id,
    nome: normalizeText(data.name) || "Manha",
    status: STATUS_OPEN,
    saldo_inicial: normalizeMoney(data.openingBalance),
    observacao_abertura: normalizeText(data.note),
    aberto_por_usuario_id: actorUserId,
    aberto_em: new Date(),
  });
}

async function closeShift({ actorUserId, data = {} }) {
  const openShift = await findOpenShift();
  if (!openShift) {
    throw createOperationError("Nao ha turno operacional aberto.");
  }

  const closingBalance = normalizeMoney(data.closingBalance);
  const expectedBalance = Number(openShift.saldo_inicial ?? 0) +
    Number(openShift.total_vendas ?? 0) -
    Number(openShift.total_despesas ?? 0) -
    Number(openShift.total_perdas ?? 0);

  await openShift.update({
    status: STATUS_CLOSED,
    saldo_final_informado: closingBalance,
    diferenca_caixa: Math.round((closingBalance - expectedBalance + Number.EPSILON) * 100) / 100,
    observacao_fechamento: normalizeText(data.note),
    fechado_por_usuario_id: actorUserId,
    fechado_em: new Date(),
  });

  return openShift;
}

async function closeDay({ actorUserId, data = {} }) {
  const openDay = await findOpenDay();
  if (!openDay) {
    throw createOperationError("Nao ha dia operacional aberto.");
  }

  const openShift = await findOpenShift();
  if (openShift) {
    throw createOperationError("Feche o turno aberto antes de fechar o dia.");
  }

  const closingBalance = normalizeMoney(data.closingBalance);
  const expectedBalance = Number(openDay.saldo_inicial ?? 0) +
    Number(openDay.total_vendas ?? 0) -
    Number(openDay.total_despesas ?? 0) -
    Number(openDay.total_perdas ?? 0);

  await openDay.update({
    status: STATUS_CLOSED,
    saldo_final_informado: closingBalance,
    diferenca_caixa: Math.round((closingBalance - expectedBalance + Number.EPSILON) * 100) / 100,
    observacao_fechamento: normalizeText(data.note),
    fechado_por_usuario_id: actorUserId,
    fechado_em: new Date(),
  });

  return openDay;
}

async function assertOperationalSessionOpen() {
  const state = await getOperationalState();
  if (!state.canOperate) {
    throw createOperationError(state.message);
  }
  return state;
}

module.exports = {
  SAFE_OPERATION_ERRORS,
  assertOperationalSessionOpen,
  closeDay,
  closeShift,
  getOperationalState,
  openDay,
  openShift,
};
```

- [ ] **Step 4: Run service tests to verify pass**

Run:

```powershell
npm test -- tests/operationService.test.mjs
```

Expected: PASS.

Commit if Git is available:

```powershell
git add src/backend/services/operationService.js tests/operationService.test.mjs
git commit -m "feat: add operation service"
```

---

### Task 4: Add IPC Routes and Safe Errors

**Files:**
- Modify: `src/backend/ipcHandlers.js`
- Modify: `tests/ipcRouteMap.test.mjs`

- [ ] **Step 1: Write failing IPC route tests**

In `tests/ipcRouteMap.test.mjs`, update `createRouteDependencies` to include:

```js
    operationService: {
      getOperationalState: async () => ({ canOperate: false, message: 'Abra o dia operacional antes de iniciar operacoes.' }),
      openDay: async (payload) => {
        calls.push(['openDay', payload]);
        return payload;
      },
      closeDay: async (payload) => {
        calls.push(['closeDay', payload]);
        return payload;
      },
      openShift: async (payload) => {
        calls.push(['openShift', payload]);
        return payload;
      },
      closeShift: async (payload) => {
        calls.push(['closeShift', payload]);
        return payload;
      },
    },
```

Update expected actions in `buildRouteMap exposes auth, user, and profile IPC actions` by adding:

```js
    'operation.state',
    'operation.openDay',
    'operation.closeDay',
    'operation.openShift',
    'operation.closeShift',
```

Append:

```js
test('operation routes require the expected permissions', async () => {
  const calls = [];
  const routes = buildRouteMap(createRouteDependencies(calls));

  await routes['operation.state']();
  await routes['operation.openDay']({ openingBalance: 1000 });
  await routes['operation.closeDay']({ closingBalance: 1200 });
  await routes['operation.openShift']({ name: 'Manha', openingBalance: 1000 });
  await routes['operation.closeShift']({ closingBalance: 1200 });

  assert.deepEqual(calls, [
    ['assertPermission', 42, 'operacao.ver'],
    ['assertPermission', 42, 'operacao.abrir_dia'],
    ['openDay', { actorUserId: 42, data: { openingBalance: 1000 } }],
    ['assertPermission', 42, 'operacao.fechar_dia'],
    ['closeDay', { actorUserId: 42, data: { closingBalance: 1200 } }],
    ['assertPermission', 42, 'operacao.abrir_turno'],
    ['openShift', { actorUserId: 42, data: { name: 'Manha', openingBalance: 1000 } }],
    ['assertPermission', 42, 'operacao.fechar_turno'],
    ['closeShift', { actorUserId: 42, data: { closingBalance: 1200 } }],
  ]);
});

test('handleAppRequest preserves safe operation state errors', async () => {
  const result = await handleAppRequest({
    'operation.blocked': async () => {
      const error = new Error('Abra um turno antes de vender ou lancar despesas.');
      error.code = 'OPERATION_STATE_INVALID';
      throw error;
    },
  }, { action: 'operation.blocked' });

  assert.deepEqual(result, {
    ok: false,
    error: {
      message: 'Abra um turno antes de vender ou lancar despesas.',
      code: 'OPERATION_STATE_INVALID',
    },
  });
});
```

- [ ] **Step 2: Run IPC tests to verify failure**

Run:

```powershell
npm test -- tests/ipcRouteMap.test.mjs
```

Expected: FAIL because operation routes are missing and operation error code is not safe.

- [ ] **Step 3: Implement IPC changes**

In `src/backend/ipcHandlers.js`, add import:

```js
const operationService = require("./services/operationService");
```

Extend `SAFE_ERROR_MESSAGES`:

```js
  "Abra o dia operacional antes de iniciar operacoes.",
  "Abra um turno antes de vender ou lancar despesas.",
  "Ja existe um dia operacional aberto.",
  "Ja existe um turno operacional aberto.",
  "Feche o turno aberto antes de fechar o dia.",
  "Nao ha dia operacional aberto.",
  "Nao ha turno operacional aberto.",
  "Informe um valor de caixa valido.",
```

Extend `SAFE_ERROR_CODES`:

```js
  "OPERATION_STATE_INVALID",
```

Add `operationService` to route dependencies:

```js
    operationService,
```

Add operation routes after profile routes:

```js
    "operation.state": () => withPermission(dependencies, "operacao.ver", () => (
      dependencies.operationService.getOperationalState()
    )),
    "operation.openDay": (data = {}) => withPermission(dependencies, "operacao.abrir_dia", (actorUserId) => (
      dependencies.operationService.openDay({ actorUserId, data })
    )),
    "operation.closeDay": (data = {}) => withPermission(dependencies, "operacao.fechar_dia", (actorUserId) => (
      dependencies.operationService.closeDay({ actorUserId, data })
    )),
    "operation.openShift": (data = {}) => withPermission(dependencies, "operacao.abrir_turno", (actorUserId) => (
      dependencies.operationService.openShift({ actorUserId, data })
    )),
    "operation.closeShift": (data = {}) => withPermission(dependencies, "operacao.fechar_turno", (actorUserId) => (
      dependencies.operationService.closeShift({ actorUserId, data })
    )),
```

- [ ] **Step 4: Run IPC tests to verify pass**

Run:

```powershell
npm test -- tests/ipcRouteMap.test.mjs
```

Expected: PASS.

Commit if Git is available:

```powershell
git add src/backend/ipcHandlers.js tests/ipcRouteMap.test.mjs
git commit -m "feat: expose operation ipc routes"
```

---

### Task 5: Add Frontend Operation Context

**Files:**
- Create: `src/operation/OperationContext.jsx`
- Modify: `src/App.jsx`
- Create: `tests/operationUiSource.test.mjs`

- [ ] **Step 1: Write failing source test**

Create `tests/operationUiSource.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('App wraps operational screens with OperationProvider', async () => {
  const source = await readFile('src/App.jsx', 'utf8');

  assert.match(source, /import \{ OperationProvider \} from '\.\/operation\/OperationContext'/);
  assert.match(source, /<OperationProvider>/);
  assert.match(source, /<\/OperationProvider>/);
});

test('OperationContext uses operation IPC routes and exposes canOperate', async () => {
  const source = await readFile('src/operation/OperationContext.jsx', 'utf8');

  assert.match(source, /request\('operation\.state'\)/);
  assert.match(source, /request\('operation\.openDay'/);
  assert.match(source, /request\('operation\.closeDay'/);
  assert.match(source, /request\('operation\.openShift'/);
  assert.match(source, /request\('operation\.closeShift'/);
  assert.match(source, /canOperate/);
  assert.match(source, /useOperation/);
});
```

- [ ] **Step 2: Run source test to verify failure**

Run:

```powershell
npm test -- tests/operationUiSource.test.mjs
```

Expected: FAIL because `OperationContext.jsx` does not exist and `App.jsx` is not wrapped.

- [ ] **Step 3: Create operation context**

Create `src/operation/OperationContext.jsx`:

```jsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { request } from '../services/ipcClient';

const OperationContext = createContext(null);

const EMPTY_STATE = Object.freeze({
  canOperate: false,
  message: 'Abra o dia operacional antes de iniciar operacoes.',
  day: null,
  shift: null,
});

function normalizeState(state) {
  return {
    ...EMPTY_STATE,
    ...(state || {}),
  };
}

export function OperationProvider({ children }) {
  const [state, setState] = useState(EMPTY_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshOperationState = useCallback(async () => {
    setError('');

    try {
      const nextState = normalizeState(await request('operation.state'));
      setState(nextState);
      return nextState;
    } catch (requestError) {
      setError(requestError.message);
      setState(EMPTY_STATE);
      return EMPTY_STATE;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      const nextState = await refreshOperationState();
      if (isMounted) {
        setState(nextState);
      }
    }

    hydrate();
    return () => {
      isMounted = false;
    };
  }, [refreshOperationState]);

  const runOperationAction = useCallback(async (action, data) => {
    setError('');

    try {
      const result = await request(action, data);
      await refreshOperationState();
      return result;
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    }
  }, [refreshOperationState]);

  const value = useMemo(() => ({
    ...state,
    isLoading,
    error,
    refreshOperationState,
    openDay: (data) => runOperationAction('operation.openDay', data),
    closeDay: (data) => runOperationAction('operation.closeDay', data),
    openShift: (data) => runOperationAction('operation.openShift', data),
    closeShift: (data) => runOperationAction('operation.closeShift', data),
  }), [error, isLoading, refreshOperationState, runOperationAction, state]);

  return (
    <OperationContext.Provider value={value}>
      {children}
    </OperationContext.Provider>
  );
}

export function useOperation() {
  const context = useContext(OperationContext);

  if (!context) {
    throw new Error('useOperation deve ser usado dentro de OperationProvider.');
  }

  return context;
}
```

- [ ] **Step 4: Wrap App content**

In `src/App.jsx`, add import:

```jsx
import { OperationProvider } from './operation/OperationContext';
```

Wrap the authenticated app shell:

```jsx
  return (
    <OperationProvider>
      <div className={isMenuCollapsed ? 'app-shell menu-collapsed' : 'app-shell'}>
        {/* existing Navbar/workspace markup stays here */}
      </div>
    </OperationProvider>
  );
```

- [ ] **Step 5: Run source test to verify pass**

Run:

```powershell
npm test -- tests/operationUiSource.test.mjs
```

Expected: PASS.

Commit if Git is available:

```powershell
git add src/operation/OperationContext.jsx src/App.jsx tests/operationUiSource.test.mjs
git commit -m "feat: add operation context"
```

---

### Task 6: Add Operacao Screen and Navigation

**Files:**
- Create: `src/components/Operacao.jsx`
- Modify: `src/components/Navbar.jsx`
- Modify: `src/App.jsx`
- Modify: `tests/operationUiSource.test.mjs`

- [ ] **Step 1: Add failing UI route test**

Append to `tests/operationUiSource.test.mjs`:

```js
test('App and Navbar expose the Operacao screen', async () => {
  const appSource = await readFile('src/App.jsx', 'utf8');
  const navSource = await readFile('src/components/Navbar.jsx', 'utf8');
  const screenSource = await readFile('src/components/Operacao.jsx', 'utf8');

  assert.match(appSource, /import Operacao from '\.\/components\/Operacao'/);
  assert.match(appSource, /operacao: 'Operacao'/);
  assert.match(appSource, /operacao: 'operacao\.ver'/);
  assert.match(appSource, /case 'operacao':\s*return <Operacao \/>;/);
  assert.match(navSource, /id: 'operacao'/);
  assert.match(navSource, /permission: 'operacao\.ver'/);
  assert.match(screenSource, /Abrir Dia/);
  assert.match(screenSource, /Abrir Turno/);
  assert.match(screenSource, /Fechar Turno/);
  assert.match(screenSource, /Fechar Dia/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm test -- tests/operationUiSource.test.mjs
```

Expected: FAIL because `Operacao.jsx` and route wiring are missing.

- [ ] **Step 3: Create `Operacao.jsx`**

Create `src/components/Operacao.jsx`:

```jsx
import React, { useState } from 'react';
import { CalendarDays, Clock3, Lock, PlayCircle, SquareCheckBig, WalletCards } from 'lucide-react';
import { formatKwanza } from '../data/pharmacyData.mjs';
import { useAuth } from '../auth/AuthContext';
import { useOperation } from '../operation/OperationContext';

const shiftNames = ['Manha', 'Tarde', 'Noite'];

const actionDefaults = {
  openingBalance: '',
  closingBalance: '',
  operationalDate: new Date().toISOString().slice(0, 10),
  name: 'Manha',
  note: '',
};

function Operacao() {
  const { hasPermission } = useAuth();
  const operation = useOperation();
  const [modal, setModal] = useState('');
  const [form, setForm] = useState(actionDefaults);
  const currentDay = operation.day;
  const currentShift = operation.shift;

  function openModal(type) {
    setForm(actionDefaults);
    setModal(type);
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitModal() {
    if (modal === 'open-day') {
      await operation.openDay({
        operationalDate: form.operationalDate,
        openingBalance: Number(form.openingBalance || 0),
        note: form.note,
      });
    }
    if (modal === 'open-shift') {
      await operation.openShift({
        name: form.name,
        openingBalance: Number(form.openingBalance || 0),
        note: form.note,
      });
    }
    if (modal === 'close-shift') {
      await operation.closeShift({
        closingBalance: Number(form.closingBalance || 0),
        note: form.note,
      });
    }
    if (modal === 'close-day') {
      await operation.closeDay({
        closingBalance: Number(form.closingBalance || 0),
        note: form.note,
      });
    }
    setModal('');
  }

  return (
    <section className="standard-screen operation-screen">
      <div className="operation-state-grid">
        <StatusCard
          icon={CalendarDays}
          title="Dia operacional"
          status={currentDay?.status || 'Fechado'}
          detail={currentDay ? `Aberto em ${currentDay.data_operacional}` : 'Nenhum dia aberto'}
        />
        <StatusCard
          icon={Clock3}
          title="Turno operacional"
          status={currentShift?.status || 'Fechado'}
          detail={currentShift ? currentShift.nome : 'Nenhum turno aberto'}
        />
        <StatusCard
          icon={WalletCards}
          title="Saldo inicial"
          status={formatKwanza(currentShift?.saldo_inicial ?? currentDay?.saldo_inicial ?? 0)}
          detail="Base do caixa atual"
        />
        <StatusCard
          icon={Lock}
          title="Operacoes"
          status={operation.canOperate ? 'Liberadas' : 'Bloqueadas'}
          detail={operation.message || 'Dia e turno abertos'}
        />
      </div>

      {operation.error ? <div className="operation-notice danger">{operation.error}</div> : null}
      {!operation.canOperate ? <div className="operation-notice">{operation.message}</div> : null}

      <div className="operation-actions panel">
        <button type="button" disabled={!!currentDay || !hasPermission('operacao.abrir_dia')} onClick={() => openModal('open-day')}>
          <PlayCircle size={18} />
          Abrir Dia
        </button>
        <button type="button" disabled={!currentDay || !!currentShift || !hasPermission('operacao.abrir_turno')} onClick={() => openModal('open-shift')}>
          <PlayCircle size={18} />
          Abrir Turno
        </button>
        <button type="button" disabled={!currentShift || !hasPermission('operacao.fechar_turno')} onClick={() => openModal('close-shift')}>
          <SquareCheckBig size={18} />
          Fechar Turno
        </button>
        <button type="button" disabled={!currentDay || !!currentShift || !hasPermission('operacao.fechar_dia')} onClick={() => openModal('close-day')}>
          <SquareCheckBig size={18} />
          Fechar Dia
        </button>
      </div>

      <section className="operation-detail panel">
        <h2>Estado atual</h2>
        <dl>
          <div><dt>Dia</dt><dd>{currentDay?.data_operacional || 'Sem dia aberto'}</dd></div>
          <div><dt>Turno</dt><dd>{currentShift?.nome || 'Sem turno aberto'}</dd></div>
          <div><dt>Aberto por</dt><dd>{currentShift?.aberto_por_usuario_id ?? currentDay?.aberto_por_usuario_id ?? '-'}</dd></div>
          <div><dt>Aberto em</dt><dd>{currentShift?.aberto_em ?? currentDay?.aberto_em ?? '-'}</dd></div>
        </dl>
      </section>

      {modal ? (
        <OperationModal
          modal={modal}
          form={form}
          onChange={updateForm}
          onClose={() => setModal('')}
          onSubmit={submitModal}
        />
      ) : null}
    </section>
  );
}

function StatusCard({ icon: Icon, title, status, detail }) {
  return (
    <article className="standard-metric operation-status-card">
      <span><Icon size={30} /></span>
      <div>
        <h2>{title}</h2>
        <strong>{status}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function OperationModal({ modal, form, onChange, onClose, onSubmit }) {
  const isOpening = modal === 'open-day' || modal === 'open-shift';
  const isDay = modal === 'open-day' || modal === 'close-day';
  const title = {
    'open-day': 'Abrir Dia',
    'open-shift': 'Abrir Turno',
    'close-shift': 'Fechar Turno',
    'close-day': 'Fechar Dia',
  }[modal];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-title-row">
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>x</button>
        </div>
        <div className="form-grid">
          {modal === 'open-day' ? (
            <input type="date" value={form.operationalDate} onChange={(event) => onChange('operationalDate', event.target.value)} />
          ) : null}
          {modal === 'open-shift' ? (
            <select value={form.name} onChange={(event) => onChange('name', event.target.value)} aria-label="Nome do turno">
              {shiftNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          ) : null}
          <input
            type="number"
            min="0"
            placeholder={isOpening ? 'Saldo inicial' : 'Saldo contado'}
            value={isOpening ? form.openingBalance : form.closingBalance}
            onChange={(event) => onChange(isOpening ? 'openingBalance' : 'closingBalance', event.target.value)}
          />
          <textarea
            placeholder={isDay ? 'Observacao do dia' : 'Observacao do turno'}
            value={form.note}
            onChange={(event) => onChange('note', event.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="soft-button" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary-button" onClick={onSubmit}>{title}</button>
        </div>
      </div>
    </div>
  );
}

export default Operacao;
```

- [ ] **Step 4: Wire navbar and App**

In `src/components/Navbar.jsx`, import `CalendarClock`:

```jsx
  CalendarClock,
```

Add menu item after dashboard:

```jsx
  { id: 'operacao', label: 'Operacao', icon: CalendarClock, permission: 'operacao.ver' },
```

In `src/App.jsx`, import:

```jsx
import Operacao from './components/Operacao';
```

Add title and permission:

```jsx
  operacao: 'Operacao',
```

```jsx
  operacao: 'operacao.ver',
```

Add route:

```jsx
      case 'operacao':
        return <Operacao />;
```

- [ ] **Step 5: Run route test**

Run:

```powershell
npm test -- tests/operationUiSource.test.mjs
```

Expected: PASS.

Commit if Git is available:

```powershell
git add src/components/Operacao.jsx src/components/Navbar.jsx src/App.jsx tests/operationUiSource.test.mjs
git commit -m "feat: add operation screen"
```

---

### Task 7: Gate Vendas and Financeiro Operations

**Files:**
- Modify: `src/components/Vendas.jsx`
- Modify: `src/components/Financeiro.jsx`
- Modify: `tests/operationUiSource.test.mjs`

- [ ] **Step 1: Add failing operation guard test**

Append to `tests/operationUiSource.test.mjs`:

```js
test('Vendas and Financeiro block critical actions without an open operation session', async () => {
  const vendasSource = await readFile('src/components/Vendas.jsx', 'utf8');
  const financeiroSource = await readFile('src/components/Financeiro.jsx', 'utf8');

  assert.match(vendasSource, /import \{ useOperation \} from '\.\.\/operation\/OperationContext'/);
  assert.match(vendasSource, /const operation = useOperation\(\)/);
  assert.match(vendasSource, /if \(!operation\.canOperate\) return;/);
  assert.match(vendasSource, /disabled=\{!operation\.canOperate \|\| !cart\.length\}/);
  assert.match(vendasSource, /operation-blocked-banner/);

  assert.match(financeiroSource, /import \{ useOperation \} from '\.\.\/operation\/OperationContext'/);
  assert.match(financeiroSource, /const operation = useOperation\(\)/);
  assert.match(financeiroSource, /if \(!operation\.canOperate\) return;/);
  assert.match(financeiroSource, /disabled=\{!operation\.canOperate\}/);
  assert.match(financeiroSource, /operation-blocked-banner/);
});
```

- [ ] **Step 2: Run guard test to verify failure**

Run:

```powershell
npm test -- tests/operationUiSource.test.mjs
```

Expected: FAIL because Vendas and Financeiro do not import `useOperation`.

- [ ] **Step 3: Gate Vendas**

In `src/components/Vendas.jsx`, add import:

```jsx
import { useOperation } from '../operation/OperationContext';
```

Inside `Vendas()` add:

```jsx
  const operation = useOperation();
```

At the beginning of `holdSale()` add:

```jsx
    if (!operation.canOperate) return;
```

At the beginning of `choosePaymentMethod(mode)` add:

```jsx
    if (!operation.canOperate) return;
```

At the beginning of `finalizeSale(paymentMethod = 'Dinheiro', checkoutData = checkout)` add:

```jsx
    if (!operation.canOperate) return;
```

Before the product area in the returned JSX, add:

```jsx
        {!operation.canOperate ? (
          <div className="operation-blocked-banner">
            {operation.message || 'Abra o dia e o turno antes de vender.'}
          </div>
        ) : null}
```

Update the hold button:

```jsx
          <button type="button" onClick={holdSale} className="soft-button" disabled={!operation.canOperate}>
```

Pass `canOperate` to `InvoiceDetails`:

```jsx
            canOperate={operation.canOperate}
            operationMessage={operation.message}
```

Update `InvoiceDetails` signature:

```jsx
  canOperate,
  operationMessage,
```

Disable payment buttons:

```jsx
              disabled={!canOperate || !cart.length}
              title={!canOperate ? operationMessage : method.label}
```

Pass `canOperate` to `CheckoutPanel`:

```jsx
            canOperate={operation.canOperate}
```

Update `CheckoutPanel` signature and finalize button:

```jsx
  canOperate,
```

```jsx
      <button type="button" className="checkout-finalize" disabled={!canOperate || !checkout.canFinalize} onClick={onFinalize}>
```

- [ ] **Step 4: Gate Financeiro**

In `src/components/Financeiro.jsx`, add import:

```jsx
import { useOperation } from '../operation/OperationContext';
```

Inside `Financeiro()` add:

```jsx
  const operation = useOperation();
```

At the beginning of `openManualEntryModal()` add:

```jsx
    if (!operation.canOperate) return;
```

At the beginning of `saveManualEntry()` add:

```jsx
    if (!operation.canOperate) return;
```

After the toolbar, render:

```jsx
      {!operation.canOperate ? (
        <div className="operation-blocked-banner">
          {operation.message || 'Abra o dia e o turno antes de lancar movimentos financeiros.'}
        </div>
      ) : null}
```

Disable the `Novo Lancamento` button:

```jsx
            <button type="button" disabled={!operation.canOperate} onClick={openManualEntryModal}><PlusCircle size={17} /> Novo Lancamento</button>
```

Disable modal save:

```jsx
                disabled={!operation.canOperate || !manualEntry.description.trim() || !Number(manualEntry.value)}
```

- [ ] **Step 5: Run guard test**

Run:

```powershell
npm test -- tests/operationUiSource.test.mjs
```

Expected: PASS.

Commit if Git is available:

```powershell
git add src/components/Vendas.jsx src/components/Financeiro.jsx tests/operationUiSource.test.mjs
git commit -m "feat: gate operations by shift state"
```

---

### Task 8: Surface Operational State on Dashboard

**Files:**
- Modify: `src/components/Dashboard.jsx`
- Modify: `tests/operationUiSource.test.mjs`

- [ ] **Step 1: Add failing Dashboard state test**

Append to `tests/operationUiSource.test.mjs`:

```js
test('Dashboard surfaces current operation state', async () => {
  const source = await readFile('src/components/Dashboard.jsx', 'utf8');

  assert.match(source, /import \{ useOperation \} from '\.\.\/operation\/OperationContext'/);
  assert.match(source, /const operation = useOperation\(\)/);
  assert.match(source, /Estado operacional/);
  assert.match(source, /operation\.canOperate/);
  assert.match(source, /operation\.shift\?\.nome/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm test -- tests/operationUiSource.test.mjs
```

Expected: FAIL because Dashboard does not use `useOperation`.

- [ ] **Step 3: Add dashboard card and alert**

In `src/components/Dashboard.jsx`, add import:

```jsx
import { useOperation } from '../operation/OperationContext';
```

Inside `Dashboard()` add:

```jsx
  const operation = useOperation();
```

Add a `MetricCard` in the metrics strip:

```jsx
          <MetricCard
            icon={<WalletCards size={34} />}
            title="Estado operacional"
            value={operation.canOperate ? 'Aberto' : 'Bloqueado'}
            detail={operation.shift?.nome || operation.message || 'Sem turno aberto'}
          />
```

Above the chart panel add:

```jsx
        {!operation.canOperate ? (
          <div className="operation-blocked-banner dashboard-operation-alert">
            {operation.message || 'Abra o dia e o turno antes de executar operacoes.'}
          </div>
        ) : null}
```

- [ ] **Step 4: Run Dashboard source test**

Run:

```powershell
npm test -- tests/operationUiSource.test.mjs
```

Expected: PASS.

Commit if Git is available:

```powershell
git add src/components/Dashboard.jsx tests/operationUiSource.test.mjs
git commit -m "feat: show operation state on dashboard"
```

---

### Task 9: Add Operation Styles

**Files:**
- Modify: `src/assets/tailwind.css`
- Generate: `src/assets/output.css`
- Modify: `tests/operationUiSource.test.mjs`

- [ ] **Step 1: Add failing CSS source test**

Append to `tests/operationUiSource.test.mjs`:

```js
test('operation screen and blocked-action styles are defined', async () => {
  const source = await readFile('src/assets/tailwind.css', 'utf8');

  assert.match(source, /\.operation-screen/);
  assert.match(source, /\.operation-state-grid/);
  assert.match(source, /\.operation-actions/);
  assert.match(source, /\.operation-blocked-banner/);
  assert.match(source, /\.operation-notice/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm test -- tests/operationUiSource.test.mjs
```

Expected: FAIL because operation classes are missing.

- [ ] **Step 3: Add CSS**

Append to `src/assets/tailwind.css` before the first major media block:

```css
.operation-screen {
  display: grid;
  gap: 12px;
}

.operation-state-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.operation-status-card small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 400;
}

.operation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  padding: 14px;
}

.operation-actions button {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 14px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  color: var(--ink);
  background: #e8efe7;
}

.operation-actions button:not(:disabled):hover {
  color: white;
  background: var(--brand);
}

.operation-detail {
  padding: 14px;
}

.operation-detail h2 {
  margin: 0 0 10px;
  font-size: 20px;
  font-weight: 400;
}

.operation-detail dl {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.operation-detail dl div {
  padding: 10px;
  border: 1px solid #d8e3d8;
  border-radius: 8px;
  background: white;
}

.operation-detail dt {
  color: var(--muted);
  font-size: 12px;
}

.operation-detail dd {
  margin: 4px 0 0;
  font-size: 14px;
}

.operation-blocked-banner,
.operation-notice {
  padding: 10px 12px;
  border: 1px solid #e1c766;
  border-left: 4px solid #d6a800;
  border-radius: 8px;
  color: #3a3000;
  background: #fff6d8;
  font-size: 14px;
}

.operation-notice.danger {
  border-color: #e3a8a5;
  border-left-color: var(--danger);
  color: #571111;
  background: #ffe8e6;
}

@media (max-width: 1180px) {
  .operation-state-grid,
  .operation-detail dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .operation-state-grid,
  .operation-detail dl {
    grid-template-columns: 1fr;
  }

  .operation-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
```

- [ ] **Step 4: Regenerate CSS**

Run:

```powershell
npm run build:tailwind
```

Expected: exit 0 and `src/assets/output.css` updated.

- [ ] **Step 5: Run CSS test**

Run:

```powershell
npm test -- tests/operationUiSource.test.mjs
```

Expected: PASS.

Commit if Git is available:

```powershell
git add src/assets/tailwind.css src/assets/output.css tests/operationUiSource.test.mjs
git commit -m "style: add operation screen styles"
```

---

### Task 10: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run targeted backend tests**

Run:

```powershell
npm test -- tests/permissionCatalog.test.mjs tests/databaseSchema.test.mjs tests/operationService.test.mjs tests/ipcRouteMap.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run targeted frontend/source tests**

Run:

```powershell
npm test -- tests/operationUiSource.test.mjs tests/vendasComponent.test.mjs tests/salesFinalizationA4Component.test.mjs
```

Expected: all tests pass.

- [ ] **Step 3: Run full suite**

Run:

```powershell
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Run production build**

Run:

```powershell
npm run build
```

Expected: Vite build exits 0.

- [ ] **Step 5: Manual smoke checklist**

Run the app:

```powershell
npm run dev -- --host 127.0.0.1 --port 5501
```

Manual checks:

- Log in as Administrator.
- Open `Operacao`.
- Confirm `Abrir Dia` is enabled when no day is open.
- Open day with saldo inicial `10000`.
- Confirm `Abrir Turno` becomes enabled.
- Open `Manha` shift with saldo inicial `10000`.
- Confirm Dashboard shows operational state as open.
- Confirm Vendas allows finalizing a sale.
- Confirm Financeiro allows `Novo Lancamento`.
- Close shift with saldo contado `10000`.
- Confirm Vendas and Financeiro become blocked.
- Close day with saldo contado `10000`.
- Confirm no second day/shift remains open.

If Git is available, final commit:

```powershell
git add src tests docs
git commit -m "feat: add operational day and shift control"
```

---

## Self-Review

- Spec coverage: schema, service, IPC, permissions, UI, Vendas blocking, Financeiro blocking, Dashboard status, safe errors, and tests are all mapped to tasks.
- Placeholder scan: no `TBD`, `TODO`, or undefined future step is used in implementation instructions.
- Type consistency: service functions use `openDay`, `closeDay`, `openShift`, `closeShift`, `getOperationalState`, and `assertOperationalSessionOpen`; IPC and frontend context use the same names and route keys.
- Scope check: this plan intentionally does not persist every finalized sale or every manual finance row into the operational totals yet; it creates the operational gate and persisted day/shift records, matching the approved first stage.

# Usuarios e Permissoes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add login, editable role-based permissions, real user management, Admin password reset, and authorization checks to Farmacia ESAYOS.

**Architecture:** Keep the current Electron + React + Sequelize structure. Add focused backend services for password hashing, authentication, authorization, users, profiles, and audit, then expose them through IPC. The frontend gets an auth/session layer, login and forced-password-change screens, a real users table, and a permissions matrix driven by the logged-in user's permissions.

**Tech Stack:** Electron IPC, React 19, Vite, Sequelize 6, SQLite in development, Node `crypto`, Node test runner.

---

## File Structure

- Create `src/backend/security/passwords.js`
  - Hash, verify, and generate temporary passwords using Node `crypto`.
- Create `src/backend/services/permissionCatalog.js`
  - Single source of truth for permission keys and default profile grants.
- Create `src/backend/services/auditService.js`
  - Write user/security audit rows.
- Create `src/backend/services/authService.js`
  - Login, logout session state, current session, password change.
- Create `src/backend/services/authorizationService.js`
  - Load permissions for users and assert permission before sensitive operations.
- Create `src/backend/services/userService.js`
  - List, create, update, activate, deactivate, and reset users.
- Create `src/backend/services/profileService.js`
  - List profiles and update editable profile permissions.
- Modify `src/backend/database.js`
  - Add `Perfil`, `Permissao`, `PerfilPermissao`, `AuditoriaUsuario`, user security columns, associations, schema helpers, and seed.
- Modify `src/backend/ipcHandlers.js`
  - Add request/response IPC actions and permission enforcement.
- Modify `preload.js`
  - Expose `window.api.invoke(action, data)` while keeping existing `send`/`receive` compatibility.
- Create `src/services/ipcClient.js`
  - Promise wrapper around `window.api.invoke` with browser-safe fallback errors.
- Create `src/auth/AuthContext.jsx`
  - Session provider, login, logout, password change, permission helpers.
- Create `src/components/Login.jsx`
  - Login screen.
- Create `src/components/ChangePassword.jsx`
  - Forced password change screen.
- Modify `src/App.jsx`
  - Gate app behind auth state and pass permissions to navigation/screens.
- Modify `src/components/Navbar.jsx`
  - Hide menu items without `*.ver` permission.
- Replace `src/components/Usuarios.jsx`
  - Use real IPC data and modals for users, reset, and permissions.
- Create tests:
  - `tests/passwords.test.mjs`
  - `tests/userSecuritySchema.test.mjs`
  - `tests/authService.test.mjs`
  - `tests/authorizationService.test.mjs`

The workspace currently is not a Git repository. Commit steps are intentionally omitted. If Git is initialized before execution, make one commit after each task with the task title as the message.

---

### Task 1: Password Security Utility

**Files:**
- Create: `src/backend/security/passwords.js`
- Test: `tests/passwords.test.mjs`

- [ ] **Step 1: Write failing password utility tests**

Create `tests/passwords.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  hashPassword,
  verifyPassword,
  createTemporaryPassword,
  PASSWORD_HASH_PREFIX,
} = require('../src/backend/security/passwords.js');

test('hashPassword stores a salted pbkdf2 password hash', () => {
  const hash = hashPassword('SenhaForte123!');

  assert.equal(typeof hash, 'string');
  assert.ok(hash.startsWith(PASSWORD_HASH_PREFIX));
  assert.notEqual(hash, 'SenhaForte123!');
  assert.equal(verifyPassword('SenhaForte123!', hash), true);
  assert.equal(verifyPassword('senha-errada', hash), false);
});

test('hashPassword uses a different salt for each hash', () => {
  const first = hashPassword('SenhaForte123!');
  const second = hashPassword('SenhaForte123!');

  assert.notEqual(first, second);
  assert.equal(verifyPassword('SenhaForte123!', first), true);
  assert.equal(verifyPassword('SenhaForte123!', second), true);
});

test('createTemporaryPassword returns a readable strong temporary password', () => {
  const password = createTemporaryPassword();

  assert.match(password, /^[A-HJ-NP-Za-km-z2-9]{12}$/);
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node --test tests/passwords.test.mjs
```

Expected result: fail because `src/backend/security/passwords.js` does not exist.

- [ ] **Step 3: Implement password utility**

Create `src/backend/security/passwords.js`:

```js
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

  const [prefix, iterationsRaw, salt, expectedHash] = storedHash.split('$');
  if (prefix !== PASSWORD_HASH_PREFIX || !iterationsRaw || !salt || !expectedHash) {
    return false;
  }

  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations <= 0) {
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
```

- [ ] **Step 4: Verify password tests pass**

Run:

```powershell
node --test tests/passwords.test.mjs
```

Expected result: pass.

---

### Task 2: Permission Catalog

**Files:**
- Create: `src/backend/services/permissionCatalog.js`
- Test: `tests/permissionCatalog.test.mjs`

- [ ] **Step 1: Write failing catalog tests**

Create `tests/permissionCatalog.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  PERMISSIONS,
  DEFAULT_PROFILES,
  ADMINISTRATOR_PROFILE,
  getPermissionKeys,
} = require('../src/backend/services/permissionCatalog.js');

test('permission catalog contains unique permission keys', () => {
  const keys = getPermissionKeys();
  const unique = new Set(keys);

  assert.ok(keys.includes('usuarios.gerir_permissoes'));
  assert.ok(keys.includes('vendas.cancelar'));
  assert.equal(unique.size, keys.length);
});

test('administrator profile receives all permissions', () => {
  const admin = DEFAULT_PROFILES.find((profile) => profile.nome === ADMINISTRATOR_PROFILE);

  assert.ok(admin);
  assert.equal(admin.permissoes.length, PERMISSIONS.length);
  assert.ok(admin.permissoes.includes('usuarios.gerir_permissoes'));
});

test('cashier profile does not receive admin permissions', () => {
  const cashier = DEFAULT_PROFILES.find((profile) => profile.nome === 'Caixa');

  assert.ok(cashier);
  assert.ok(cashier.permissoes.includes('vendas.criar'));
  assert.equal(cashier.permissoes.includes('usuarios.gerir_permissoes'), false);
});
```

- [ ] **Step 2: Run the failing catalog test**

Run:

```powershell
node --test tests/permissionCatalog.test.mjs
```

Expected result: fail because the catalog file does not exist.

- [ ] **Step 3: Implement permission catalog**

Create `src/backend/services/permissionCatalog.js`:

```js
const ADMINISTRATOR_PROFILE = 'Administrador';

const PERMISSIONS = [
  { chave: 'dashboard.ver', modulo: 'Dashboard', acao: 'ver', descricao: 'Ver dashboard' },
  { chave: 'vendas.ver', modulo: 'Vendas', acao: 'ver', descricao: 'Ver vendas' },
  { chave: 'vendas.criar', modulo: 'Vendas', acao: 'criar', descricao: 'Criar vendas' },
  { chave: 'vendas.cancelar', modulo: 'Vendas', acao: 'cancelar', descricao: 'Cancelar vendas' },
  { chave: 'vendas.desconto', modulo: 'Vendas', acao: 'desconto', descricao: 'Aplicar descontos em vendas' },
  { chave: 'estoque.ver', modulo: 'Estoque', acao: 'ver', descricao: 'Ver estoque' },
  { chave: 'estoque.criar', modulo: 'Estoque', acao: 'criar', descricao: 'Criar itens de estoque' },
  { chave: 'estoque.editar', modulo: 'Estoque', acao: 'editar', descricao: 'Editar estoque' },
  { chave: 'estoque.apagar', modulo: 'Estoque', acao: 'apagar', descricao: 'Apagar itens de estoque' },
  { chave: 'estoque.importar', modulo: 'Estoque', acao: 'importar', descricao: 'Importar estoque' },
  { chave: 'financeiro.ver', modulo: 'Financeiro', acao: 'ver', descricao: 'Ver financeiro' },
  { chave: 'financeiro.criar', modulo: 'Financeiro', acao: 'criar', descricao: 'Criar transacoes financeiras' },
  { chave: 'financeiro.editar', modulo: 'Financeiro', acao: 'editar', descricao: 'Editar financeiro' },
  { chave: 'financeiro.apagar', modulo: 'Financeiro', acao: 'apagar', descricao: 'Apagar transacoes financeiras' },
  { chave: 'clientes.ver', modulo: 'Clientes', acao: 'ver', descricao: 'Ver clientes' },
  { chave: 'clientes.criar', modulo: 'Clientes', acao: 'criar', descricao: 'Criar clientes' },
  { chave: 'clientes.editar', modulo: 'Clientes', acao: 'editar', descricao: 'Editar clientes' },
  { chave: 'clientes.apagar', modulo: 'Clientes', acao: 'apagar', descricao: 'Apagar clientes' },
  { chave: 'relatorios.ver', modulo: 'Relatorios', acao: 'ver', descricao: 'Ver relatorios' },
  { chave: 'relatorios.exportar', modulo: 'Relatorios', acao: 'exportar', descricao: 'Exportar relatorios' },
  { chave: 'configuracoes.ver', modulo: 'Configuracoes', acao: 'ver', descricao: 'Ver configuracoes' },
  { chave: 'configuracoes.editar', modulo: 'Configuracoes', acao: 'editar', descricao: 'Editar configuracoes' },
  { chave: 'usuarios.ver', modulo: 'Usuarios', acao: 'ver', descricao: 'Ver usuarios' },
  { chave: 'usuarios.criar', modulo: 'Usuarios', acao: 'criar', descricao: 'Criar usuarios' },
  { chave: 'usuarios.editar', modulo: 'Usuarios', acao: 'editar', descricao: 'Editar usuarios' },
  { chave: 'usuarios.inativar', modulo: 'Usuarios', acao: 'inativar', descricao: 'Inativar usuarios' },
  { chave: 'usuarios.resetar_senha', modulo: 'Usuarios', acao: 'resetar_senha', descricao: 'Redefinir senha de usuarios' },
  { chave: 'usuarios.gerir_permissoes', modulo: 'Usuarios', acao: 'gerir_permissoes', descricao: 'Gerir perfis e permissoes' },
];

const ALL_PERMISSION_KEYS = PERMISSIONS.map((permission) => permission.chave);

const DEFAULT_PROFILES = [
  {
    nome: ADMINISTRATOR_PROFILE,
    descricao: 'Acesso total ao sistema',
    sistema: true,
    permissoes: ALL_PERMISSION_KEYS,
  },
  {
    nome: 'Farmaceutico',
    descricao: 'Atendimento, vendas, clientes, estoque e relatorios operacionais',
    sistema: true,
    permissoes: [
      'dashboard.ver',
      'vendas.ver',
      'vendas.criar',
      'vendas.desconto',
      'estoque.ver',
      'estoque.criar',
      'estoque.editar',
      'clientes.ver',
      'clientes.criar',
      'clientes.editar',
      'relatorios.ver',
    ],
  },
  {
    nome: 'Caixa',
    descricao: 'Operacao de caixa e consulta basica',
    sistema: true,
    permissoes: [
      'dashboard.ver',
      'vendas.ver',
      'vendas.criar',
      'clientes.ver',
      'clientes.criar',
    ],
  },
  {
    nome: 'Gestor de Stock',
    descricao: 'Gestao de stock e consulta de relatorios',
    sistema: true,
    permissoes: [
      'dashboard.ver',
      'estoque.ver',
      'estoque.criar',
      'estoque.editar',
      'estoque.apagar',
      'estoque.importar',
      'relatorios.ver',
    ],
  },
];

function getPermissionKeys() {
  return [...ALL_PERMISSION_KEYS];
}

function getEssentialAdminPermissions() {
  return ['usuarios.ver', 'usuarios.editar', 'usuarios.gerir_permissoes'];
}

module.exports = {
  ADMINISTRATOR_PROFILE,
  PERMISSIONS,
  DEFAULT_PROFILES,
  getPermissionKeys,
  getEssentialAdminPermissions,
};
```

- [ ] **Step 4: Verify catalog tests pass**

Run:

```powershell
node --test tests/permissionCatalog.test.mjs
```

Expected result: pass.

---

### Task 3: User Security Schema And Bootstrap

**Files:**
- Modify: `src/backend/database.js`
- Test: `tests/userSecuritySchema.test.mjs`

- [ ] **Step 1: Write failing schema tests**

Create `tests/userSecuritySchema.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, syncDatabaseSchema, getModels } = require('../src/backend/database.js');
const { verifyPassword } = require('../src/backend/security/passwords.js');

async function withDatabase(run) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-user-security-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');
  try {
    await syncDatabaseSchema(db);
    await run(db, getModels());
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

test('syncDatabaseSchema creates user security tables and columns', async () => {
  await withDatabase(async (db) => {
    const userColumns = await db.query('PRAGMA table_info(Usuarios)', {
      type: db.QueryTypes.SELECT,
    });
    const userColumnNames = userColumns.map((column) => column.name);

    assert.ok(userColumnNames.includes('perfil_id'));
    assert.ok(userColumnNames.includes('deve_trocar_senha'));
    assert.ok(userColumnNames.includes('ultimo_login_em'));
    assert.ok(userColumnNames.includes('falhas_login'));
    assert.ok(userColumnNames.includes('bloqueado_ate'));

    const tables = await db.getQueryInterface().showAllTables();
    assert.ok(tables.includes('Perfis'));
    assert.ok(tables.includes('Permissaos'));
    assert.ok(tables.includes('PerfilPermissaos'));
    assert.ok(tables.includes('AuditoriaUsuarios'));
  });
});

test('syncDatabaseSchema seeds profiles, permissions, and first admin', async () => {
  await withDatabase(async (db, models) => {
    const adminProfile = await models.Perfil.findOne({ where: { nome: 'Administrador' } });
    const adminUser = await models.Usuario.findOne({ where: { nome_usuario: 'admin' } });
    const permissions = await models.Permissao.findAll();

    assert.ok(adminProfile);
    assert.ok(adminUser);
    assert.equal(adminUser.perfil_id, adminProfile.id);
    assert.equal(adminUser.deve_trocar_senha, true);
    assert.equal(verifyPassword('Admin123!', adminUser.senha_hash), true);
    assert.ok(permissions.length >= 28);
  });
});
```

- [ ] **Step 2: Run the failing schema tests**

Run:

```powershell
node --test tests/userSecuritySchema.test.mjs
```

Expected result: fail because models and seed do not exist.

- [ ] **Step 3: Extend Sequelize models**

Modify `src/backend/database.js` inside `defineModels(db)`:

```js
  const Perfil = db.define("Perfil", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nome: { type: DataTypes.STRING, unique: true, allowNull: false },
    descricao: { type: DataTypes.TEXT },
    sistema: { type: DataTypes.BOOLEAN, defaultValue: false },
    ativo: { type: DataTypes.BOOLEAN, defaultValue: true },
  });

  const Permissao = db.define("Permissao", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    chave: { type: DataTypes.STRING, unique: true, allowNull: false },
    modulo: { type: DataTypes.STRING, allowNull: false },
    acao: { type: DataTypes.STRING, allowNull: false },
    descricao: { type: DataTypes.TEXT },
  });

  const PerfilPermissao = db.define("PerfilPermissao", {
    perfil_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: Perfil, key: "id" } },
    permissao_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: Permissao, key: "id" } },
  });

  const AuditoriaUsuario = db.define("AuditoriaUsuario", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ator_usuario_id: { type: DataTypes.INTEGER },
    usuario_afetado_id: { type: DataTypes.INTEGER },
    acao: { type: DataTypes.STRING, allowNull: false },
    detalhes: { type: DataTypes.TEXT },
    data_evento: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });
```

Extend the existing `Usuario` model with:

```js
    perfil_id: { type: DataTypes.INTEGER, references: { model: Perfil, key: "id" } },
    deve_trocar_senha: { type: DataTypes.BOOLEAN, defaultValue: false },
    ultimo_login_em: { type: DataTypes.DATE },
    falhas_login: { type: DataTypes.INTEGER, defaultValue: 0 },
    bloqueado_ate: { type: DataTypes.DATE },
```

Add associations before the return block:

```js
  Perfil.belongsToMany(Permissao, {
    through: PerfilPermissao,
    foreignKey: "perfil_id",
    otherKey: "permissao_id",
  });
  Permissao.belongsToMany(Perfil, {
    through: PerfilPermissao,
    foreignKey: "permissao_id",
    otherKey: "perfil_id",
  });
  Perfil.hasMany(Usuario, { foreignKey: "perfil_id" });
  Usuario.belongsTo(Perfil, { foreignKey: "perfil_id" });
  AuditoriaUsuario.belongsTo(Usuario, { as: "ator", foreignKey: "ator_usuario_id" });
  AuditoriaUsuario.belongsTo(Usuario, { as: "usuarioAfetado", foreignKey: "usuario_afetado_id" });
```

Include the new models in the returned object:

```js
    Perfil,
    Permissao,
    PerfilPermissao,
    AuditoriaUsuario,
```

- [ ] **Step 4: Add schema helpers and seed**

At the top of `src/backend/database.js`, add:

```js
const { hashPassword } = require("./security/passwords");
const { PERMISSIONS, DEFAULT_PROFILES, ADMINISTRATOR_PROFILE } = require("./services/permissionCatalog");
```

Add helper functions before `syncDatabaseSchema(db)`:

```js
async function ensureSqliteUsuarioSecurityColumns(db) {
  if (db.getDialect() !== "sqlite") {
    return;
  }

  const queryInterface = db.getQueryInterface();
  const tables = await queryInterface.showAllTables();

  if (!hasTable(tables, "Usuarios")) {
    return;
  }

  const columns = await queryInterface.describeTable("Usuarios");
  const userColumns = [
    ["perfil_id", { type: DataTypes.INTEGER }],
    ["deve_trocar_senha", { type: DataTypes.BOOLEAN, defaultValue: false }],
    ["ultimo_login_em", { type: DataTypes.DATE }],
    ["falhas_login", { type: DataTypes.INTEGER, defaultValue: 0 }],
    ["bloqueado_ate", { type: DataTypes.DATE }],
  ];

  for (const [name, definition] of userColumns) {
    if (!columns[name]) {
      await queryInterface.addColumn("Usuarios", name, definition);
    }
  }
}

async function seedPermissionsAndProfiles() {
  const { Perfil, Permissao, Usuario } = getModels();

  for (const permission of PERMISSIONS) {
    await Permissao.findOrCreate({
      where: { chave: permission.chave },
      defaults: permission,
    });
  }

  for (const profile of DEFAULT_PROFILES) {
    const [perfil] = await Perfil.findOrCreate({
      where: { nome: profile.nome },
      defaults: {
        descricao: profile.descricao,
        sistema: profile.sistema,
        ativo: true,
      },
    });

    const permissions = await Permissao.findAll({
      where: { chave: profile.permissoes },
    });
    await perfil.setPermissaos(permissions);
  }

  const userCount = await Usuario.count();
  if (userCount === 0) {
    const adminProfile = await Perfil.findOne({ where: { nome: ADMINISTRATOR_PROFILE } });
    await Usuario.create({
      nome_usuario: "admin",
      senha_hash: hashPassword("Admin123!"),
      nome_completo: "Administrador",
      email: "admin@esayos.local",
      cargo: ADMINISTRATOR_PROFILE,
      perfil_id: adminProfile.id,
      ativo: true,
      deve_trocar_senha: true,
    });
  }
}
```

Update `syncDatabaseSchema(db)`:

```js
async function syncDatabaseSchema(db) {
  await ensureSqliteVendasColumns(db);
  await ensureSqliteFinanceColumns(db);
  await ensureSqliteUsuarioSecurityColumns(db);
  await db.sync({ alter: true });
  await ensureVendasInvoiceIndex(db);
  await seedPermissionsAndProfiles();
}
```

- [ ] **Step 5: Verify schema tests pass**

Run:

```powershell
node --test tests/userSecuritySchema.test.mjs
```

Expected result: pass.

- [ ] **Step 6: Verify existing schema tests still pass**

Run:

```powershell
node --test tests/databaseSchema.test.mjs
```

Expected result: pass.

---

### Task 4: Authorization And Audit Services

**Files:**
- Create: `src/backend/services/auditService.js`
- Create: `src/backend/services/authorizationService.js`
- Test: `tests/authorizationService.test.mjs`

- [ ] **Step 1: Write failing authorization tests**

Create `tests/authorizationService.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, syncDatabaseSchema, getModels } = require('../src/backend/database.js');
const {
  getUserPermissions,
  hasPermission,
  assertPermission,
} = require('../src/backend/services/authorizationService.js');

async function withModels(run) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-authz-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');
  try {
    await syncDatabaseSchema(db);
    await run(getModels());
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

test('administrator has all seeded permissions', async () => {
  await withModels(async ({ Usuario }) => {
    const admin = await Usuario.findOne({ where: { nome_usuario: 'admin' } });
    const permissions = await getUserPermissions(admin.id);

    assert.ok(permissions.includes('usuarios.gerir_permissoes'));
    assert.equal(await hasPermission(admin.id, 'vendas.cancelar'), true);
  });
});

test('assertPermission rejects missing permission', async () => {
  await withModels(async ({ Usuario, Perfil }) => {
    const cashierProfile = await Perfil.findOne({ where: { nome: 'Caixa' } });
    const cashier = await Usuario.create({
      nome_usuario: 'caixa1',
      senha_hash: 'hash',
      nome_completo: 'Caixa Um',
      perfil_id: cashierProfile.id,
      ativo: true,
    });

    await assert.rejects(
      () => assertPermission(cashier.id, 'usuarios.gerir_permissoes'),
      /Permissao insuficiente/
    );
  });
});
```

- [ ] **Step 2: Run the failing authorization tests**

Run:

```powershell
node --test tests/authorizationService.test.mjs
```

Expected result: fail because authorization service does not exist.

- [ ] **Step 3: Implement audit service**

Create `src/backend/services/auditService.js`:

```js
const { getModels } = require('../database');

async function recordUserAudit({ actorUserId = null, targetUserId = null, action, details = {} }) {
  const { AuditoriaUsuario } = getModels();
  return AuditoriaUsuario.create({
    ator_usuario_id: actorUserId,
    usuario_afetado_id: targetUserId,
    acao: action,
    detalhes: JSON.stringify(details),
  });
}

module.exports = {
  recordUserAudit,
};
```

- [ ] **Step 4: Implement authorization service**

Create `src/backend/services/authorizationService.js`:

```js
const { getModels } = require('../database');

async function getUserPermissions(userId) {
  const { Usuario, Perfil, Permissao } = getModels();
  const user = await Usuario.findByPk(userId, {
    include: [
      {
        model: Perfil,
        include: [Permissao],
      },
    ],
  });

  if (!user || !user.Perfil || user.ativo === false) {
    return [];
  }

  return user.Perfil.Permissaos.map((permission) => permission.chave).sort();
}

async function hasPermission(userId, permissionKey) {
  const permissions = await getUserPermissions(userId);
  return permissions.includes(permissionKey);
}

async function assertPermission(userId, permissionKey) {
  const allowed = await hasPermission(userId, permissionKey);
  if (!allowed) {
    const error = new Error('Permissao insuficiente.');
    error.code = 'PERMISSION_DENIED';
    throw error;
  }
}

module.exports = {
  getUserPermissions,
  hasPermission,
  assertPermission,
};
```

- [ ] **Step 5: Verify authorization tests pass**

Run:

```powershell
node --test tests/authorizationService.test.mjs
```

Expected result: pass.

---

### Task 5: Authentication Service

**Files:**
- Create: `src/backend/services/authService.js`
- Test: `tests/authService.test.mjs`

- [ ] **Step 1: Write failing authentication tests**

Create `tests/authService.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, syncDatabaseSchema, getModels } = require('../src/backend/database.js');
const { hashPassword } = require('../src/backend/security/passwords.js');
const {
  login,
  logout,
  getCurrentSession,
  changeOwnPassword,
} = require('../src/backend/services/authService.js');

async function withAuth(run) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-auth-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');
  try {
    await syncDatabaseSchema(db);
    await run(getModels());
  } finally {
    logout();
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

test('login returns safe session for valid credentials', async () => {
  await withAuth(async () => {
    const session = await login({ username: 'admin', password: 'Admin123!' });

    assert.equal(session.user.nome_usuario, 'admin');
    assert.equal(session.user.senha_hash, undefined);
    assert.ok(session.permissions.includes('usuarios.gerir_permissoes'));
    assert.equal(session.mustChangePassword, true);
    assert.equal(getCurrentSession().user.nome_usuario, 'admin');
  });
});

test('login rejects invalid password and increments failures', async () => {
  await withAuth(async ({ Usuario }) => {
    await assert.rejects(
      () => login({ username: 'admin', password: 'errada' }),
      /Credenciais invalidas/
    );

    const admin = await Usuario.findOne({ where: { nome_usuario: 'admin' } });
    assert.equal(admin.falhas_login, 1);
  });
});

test('login rejects inactive user', async () => {
  await withAuth(async ({ Usuario }) => {
    await Usuario.update({ ativo: false }, { where: { nome_usuario: 'admin' } });

    await assert.rejects(
      () => login({ username: 'admin', password: 'Admin123!' }),
      /Usuario inativo/
    );
  });
});

test('changeOwnPassword clears forced password change', async () => {
  await withAuth(async () => {
    await login({ username: 'admin', password: 'Admin123!' });
    const session = await changeOwnPassword({
      currentPassword: 'Admin123!',
      newPassword: 'NovaSenha123!',
    });

    assert.equal(session.mustChangePassword, false);
  });
});
```

- [ ] **Step 2: Run the failing auth tests**

Run:

```powershell
node --test tests/authService.test.mjs
```

Expected result: fail because auth service does not exist.

- [ ] **Step 3: Implement authentication service**

Create `src/backend/services/authService.js`:

```js
const { Op } = require('sequelize');
const { getModels } = require('../database');
const { verifyPassword, hashPassword } = require('../security/passwords');
const { getUserPermissions } = require('./authorizationService');
const { recordUserAudit } = require('./auditService');

const MAX_LOGIN_FAILURES = 5;
const LOCK_MINUTES = 15;

let currentSession = null;

function sanitizeUser(user) {
  return {
    id: user.id,
    nome_usuario: user.nome_usuario,
    nome_completo: user.nome_completo,
    email: user.email,
    cargo: user.cargo,
    perfil_id: user.perfil_id,
    ativo: user.ativo,
    deve_trocar_senha: user.deve_trocar_senha,
    ultimo_login_em: user.ultimo_login_em,
  };
}

async function buildSession(user) {
  const permissions = await getUserPermissions(user.id);
  return {
    user: sanitizeUser(user),
    permissions,
    mustChangePassword: user.deve_trocar_senha === true,
  };
}

async function login({ username, password }) {
  const { Usuario } = getModels();
  const user = await Usuario.findOne({
    where: {
      [Op.or]: [{ nome_usuario: username }, { email: username }],
    },
  });

  if (!user) {
    throw new Error('Credenciais invalidas.');
  }

  if (user.ativo === false) {
    await recordUserAudit({ targetUserId: user.id, action: 'LOGIN_USUARIO_INATIVO' });
    throw new Error('Usuario inativo.');
  }

  if (user.bloqueado_ate && new Date(user.bloqueado_ate) > new Date()) {
    await recordUserAudit({ targetUserId: user.id, action: 'LOGIN_USUARIO_BLOQUEADO' });
    throw new Error('Usuario temporariamente bloqueado.');
  }

  if (!verifyPassword(password, user.senha_hash)) {
    const falhas = Number(user.falhas_login || 0) + 1;
    const updates = { falhas_login: falhas };
    if (falhas >= MAX_LOGIN_FAILURES) {
      updates.bloqueado_ate = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    }
    await user.update(updates);
    await recordUserAudit({ targetUserId: user.id, action: 'LOGIN_FALHA', details: { falhas } });
    throw new Error('Credenciais invalidas.');
  }

  await user.update({
    falhas_login: 0,
    bloqueado_ate: null,
    ultimo_login_em: new Date(),
  });
  await recordUserAudit({ actorUserId: user.id, targetUserId: user.id, action: 'LOGIN_SUCESSO' });

  currentSession = await buildSession(user);
  return currentSession;
}

function logout() {
  currentSession = null;
}

function getCurrentSession() {
  return currentSession;
}

async function refreshCurrentSession() {
  if (!currentSession) {
    return null;
  }
  const { Usuario } = getModels();
  const user = await Usuario.findByPk(currentSession.user.id);
  currentSession = await buildSession(user);
  return currentSession;
}

async function changeOwnPassword({ currentPassword, newPassword }) {
  if (!currentSession) {
    throw new Error('Sessao expirada.');
  }

  const { Usuario } = getModels();
  const user = await Usuario.findByPk(currentSession.user.id);
  if (!user || !verifyPassword(currentPassword, user.senha_hash)) {
    throw new Error('Senha atual invalida.');
  }

  await user.update({
    senha_hash: hashPassword(newPassword),
    deve_trocar_senha: false,
  });
  await recordUserAudit({
    actorUserId: user.id,
    targetUserId: user.id,
    action: 'TROCA_SENHA_PROPRIA',
  });

  return refreshCurrentSession();
}

module.exports = {
  login,
  logout,
  getCurrentSession,
  refreshCurrentSession,
  changeOwnPassword,
  sanitizeUser,
};
```

- [ ] **Step 4: Verify auth tests pass**

Run:

```powershell
node --test tests/authService.test.mjs
```

Expected result: pass.

---

### Task 6: User And Profile Services

**Files:**
- Create: `src/backend/services/userService.js`
- Create: `src/backend/services/profileService.js`
- Test: `tests/userProfileServices.test.mjs`

- [ ] **Step 1: Write failing service tests**

Create `tests/userProfileServices.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, syncDatabaseSchema, getModels } = require('../src/backend/database.js');
const { verifyPassword } = require('../src/backend/security/passwords.js');
const {
  listUsers,
  createUser,
  resetUserPassword,
  deactivateUser,
} = require('../src/backend/services/userService.js');
const {
  listProfiles,
  updateProfilePermissions,
} = require('../src/backend/services/profileService.js');

async function withServices(run) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-users-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');
  try {
    await syncDatabaseSchema(db);
    await run(getModels());
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

test('createUser creates a user with temporary password and no exposed hash', async () => {
  await withServices(async ({ Perfil, Usuario }) => {
    const profile = await Perfil.findOne({ where: { nome: 'Caixa' } });
    const result = await createUser({
      actorUserId: 1,
      data: {
        nome_usuario: 'caixa2',
        nome_completo: 'Caixa Dois',
        email: 'caixa2@esayos.local',
        cargo: 'Caixa',
        perfil_id: profile.id,
      },
    });

    assert.equal(result.user.nome_usuario, 'caixa2');
    assert.equal(result.user.senha_hash, undefined);
    assert.match(result.temporaryPassword, /^[A-HJ-NP-Za-km-z2-9]{12}$/);

    const stored = await Usuario.findOne({ where: { nome_usuario: 'caixa2' } });
    assert.equal(verifyPassword(result.temporaryPassword, stored.senha_hash), true);
    assert.equal(stored.deve_trocar_senha, true);
  });
});

test('resetUserPassword returns one temporary password and marks password change', async () => {
  await withServices(async ({ Perfil, Usuario }) => {
    const profile = await Perfil.findOne({ where: { nome: 'Caixa' } });
    const user = await Usuario.create({
      nome_usuario: 'caixa3',
      nome_completo: 'Caixa Tres',
      senha_hash: 'old',
      perfil_id: profile.id,
      ativo: true,
    });

    const result = await resetUserPassword({ actorUserId: 1, userId: user.id });
    const stored = await Usuario.findByPk(user.id);

    assert.match(result.temporaryPassword, /^[A-HJ-NP-Za-km-z2-9]{12}$/);
    assert.equal(verifyPassword(result.temporaryPassword, stored.senha_hash), true);
    assert.equal(stored.deve_trocar_senha, true);
  });
});

test('deactivateUser prevents deactivating the last active administrator', async () => {
  await withServices(async ({ Usuario }) => {
    const admin = await Usuario.findOne({ where: { nome_usuario: 'admin' } });

    await assert.rejects(
      () => deactivateUser({ actorUserId: admin.id, userId: admin.id }),
      /ultimo Admin ativo/
    );
  });
});

test('updateProfilePermissions keeps essential administrator permissions', async () => {
  await withServices(async ({ Perfil }) => {
    const adminProfile = await Perfil.findOne({ where: { nome: 'Administrador' } });

    await assert.rejects(
      () => updateProfilePermissions({
        actorUserId: 1,
        profileId: adminProfile.id,
        permissionKeys: ['dashboard.ver'],
      }),
      /permissoes essenciais/
    );
  });
});
```

- [ ] **Step 2: Run the failing service tests**

Run:

```powershell
node --test tests/userProfileServices.test.mjs
```

Expected result: fail because user/profile services do not exist.

- [ ] **Step 3: Implement user service**

Create `src/backend/services/userService.js`:

```js
const { getModels } = require('../database');
const { createTemporaryPassword, hashPassword } = require('../security/passwords');
const { sanitizeUser } = require('./authService');
const { recordUserAudit } = require('./auditService');
const { ADMINISTRATOR_PROFILE } = require('./permissionCatalog');

async function listUsers() {
  const { Usuario, Perfil } = getModels();
  const users = await Usuario.findAll({
    include: [Perfil],
    order: [['nome_completo', 'ASC']],
  });

  return users.map((user) => ({
    ...sanitizeUser(user),
    perfil: user.Perfil ? { id: user.Perfil.id, nome: user.Perfil.nome } : null,
  }));
}

async function createUser({ actorUserId, data }) {
  const { Usuario } = getModels();
  const temporaryPassword = createTemporaryPassword();
  const user = await Usuario.create({
    nome_usuario: data.nome_usuario,
    senha_hash: hashPassword(temporaryPassword),
    nome_completo: data.nome_completo,
    email: data.email || null,
    cargo: data.cargo || null,
    perfil_id: data.perfil_id,
    ativo: true,
    deve_trocar_senha: true,
  });

  await recordUserAudit({
    actorUserId,
    targetUserId: user.id,
    action: 'USUARIO_CRIADO',
    details: { nome_usuario: user.nome_usuario },
  });

  return {
    user: sanitizeUser(user),
    temporaryPassword,
  };
}

async function updateUser({ actorUserId, userId, data }) {
  const { Usuario } = getModels();
  const user = await Usuario.findByPk(userId);
  if (!user) {
    throw new Error('Usuario nao encontrado.');
  }

  await user.update({
    nome_completo: data.nome_completo,
    email: data.email || null,
    cargo: data.cargo || null,
    perfil_id: data.perfil_id,
  });

  await recordUserAudit({ actorUserId, targetUserId: user.id, action: 'USUARIO_EDITADO' });
  return sanitizeUser(user);
}

async function ensureNotLastActiveAdmin(user) {
  const { Usuario, Perfil } = getModels();
  const adminProfile = await Perfil.findOne({ where: { nome: ADMINISTRATOR_PROFILE } });
  if (!adminProfile || user.perfil_id !== adminProfile.id) {
    return;
  }

  const activeAdmins = await Usuario.count({
    where: {
      perfil_id: adminProfile.id,
      ativo: true,
    },
  });

  if (activeAdmins <= 1) {
    throw new Error('Nao e permitido inativar o ultimo Admin ativo.');
  }
}

async function deactivateUser({ actorUserId, userId }) {
  const { Usuario } = getModels();
  const user = await Usuario.findByPk(userId);
  if (!user) {
    throw new Error('Usuario nao encontrado.');
  }

  await ensureNotLastActiveAdmin(user);
  await user.update({ ativo: false });
  await recordUserAudit({ actorUserId, targetUserId: user.id, action: 'USUARIO_INATIVADO' });
  return sanitizeUser(user);
}

async function activateUser({ actorUserId, userId }) {
  const { Usuario } = getModels();
  const user = await Usuario.findByPk(userId);
  if (!user) {
    throw new Error('Usuario nao encontrado.');
  }

  await user.update({ ativo: true, bloqueado_ate: null, falhas_login: 0 });
  await recordUserAudit({ actorUserId, targetUserId: user.id, action: 'USUARIO_ATIVADO' });
  return sanitizeUser(user);
}

async function resetUserPassword({ actorUserId, userId }) {
  const { Usuario } = getModels();
  const user = await Usuario.findByPk(userId);
  if (!user) {
    throw new Error('Usuario nao encontrado.');
  }

  const temporaryPassword = createTemporaryPassword();
  await user.update({
    senha_hash: hashPassword(temporaryPassword),
    deve_trocar_senha: true,
    falhas_login: 0,
    bloqueado_ate: null,
  });
  await recordUserAudit({ actorUserId, targetUserId: user.id, action: 'SENHA_REDEFINIDA' });

  return {
    user: sanitizeUser(user),
    temporaryPassword,
  };
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
  activateUser,
  resetUserPassword,
};
```

- [ ] **Step 4: Implement profile service**

Create `src/backend/services/profileService.js`:

```js
const { getModels } = require('../database');
const { recordUserAudit } = require('./auditService');
const { ADMINISTRATOR_PROFILE, getEssentialAdminPermissions } = require('./permissionCatalog');

async function listProfiles() {
  const { Perfil, Permissao } = getModels();
  const profiles = await Perfil.findAll({
    include: [Permissao],
    order: [['nome', 'ASC']],
  });

  return profiles.map((profile) => ({
    id: profile.id,
    nome: profile.nome,
    descricao: profile.descricao,
    sistema: profile.sistema,
    ativo: profile.ativo,
    permissoes: profile.Permissaos.map((permission) => permission.chave).sort(),
  }));
}

async function listPermissions() {
  const { Permissao } = getModels();
  const permissions = await Permissao.findAll({ order: [['modulo', 'ASC'], ['acao', 'ASC']] });
  return permissions.map((permission) => ({
    id: permission.id,
    chave: permission.chave,
    modulo: permission.modulo,
    acao: permission.acao,
    descricao: permission.descricao,
  }));
}

async function updateProfilePermissions({ actorUserId, profileId, permissionKeys }) {
  const { Perfil, Permissao } = getModels();
  const profile = await Perfil.findByPk(profileId);
  if (!profile) {
    throw new Error('Perfil nao encontrado.');
  }

  if (profile.nome === ADMINISTRATOR_PROFILE) {
    const missingEssential = getEssentialAdminPermissions()
      .filter((permissionKey) => !permissionKeys.includes(permissionKey));
    if (missingEssential.length > 0) {
      throw new Error('O perfil Administrador deve manter permissoes essenciais.');
    }
  }

  const permissions = await Permissao.findAll({ where: { chave: permissionKeys } });
  if (permissions.length !== permissionKeys.length) {
    throw new Error('Uma ou mais permissoes sao invalidas.');
  }

  await profile.setPermissaos(permissions);
  await recordUserAudit({
    actorUserId,
    action: 'PERMISSOES_PERFIL_ALTERADAS',
    details: { profileId, permissionKeys },
  });

  return listProfiles();
}

module.exports = {
  listProfiles,
  listPermissions,
  updateProfilePermissions,
};
```

- [ ] **Step 5: Verify user/profile service tests pass**

Run:

```powershell
node --test tests/userProfileServices.test.mjs
```

Expected result: pass.

---

### Task 7: IPC Request Layer

**Files:**
- Modify: `preload.js`
- Modify: `src/backend/ipcHandlers.js`
- Test: `tests/ipcRouteMap.test.mjs`

- [ ] **Step 1: Write route map test**

Create `tests/ipcRouteMap.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildRouteMap } = require('../src/backend/ipcHandlers.js');

test('buildRouteMap exposes auth, users, and profiles routes', () => {
  const routes = buildRouteMap({ sessionUserId: () => 1 });

  assert.equal(typeof routes['auth.login'], 'function');
  assert.equal(typeof routes['auth.logout'], 'function');
  assert.equal(typeof routes['auth.currentSession'], 'function');
  assert.equal(typeof routes['users.list'], 'function');
  assert.equal(typeof routes['users.resetPassword'], 'function');
  assert.equal(typeof routes['profiles.updatePermissions'], 'function');
});
```

- [ ] **Step 2: Run the failing route test**

Run:

```powershell
node --test tests/ipcRouteMap.test.mjs
```

Expected result: fail because `buildRouteMap` is not exported.

- [ ] **Step 3: Expose invoke in preload**

Modify `preload.js`:

```js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  invoke: (action, data = {}) => ipcRenderer.invoke("app:request", { action, data }),
  send: (channel, data) => {
    const validChannels = ["toMain"];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    const validChannels = ["fromMain"];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
});
```

- [ ] **Step 4: Add IPC route map and handlers**

Replace `src/backend/ipcHandlers.js` with:

```js
const { ipcMain } = require("electron");
const authService = require("./services/authService");
const { assertPermission } = require("./services/authorizationService");
const userService = require("./services/userService");
const profileService = require("./services/profileService");

function requireSessionUserId() {
  const session = authService.getCurrentSession();
  if (!session) {
    const error = new Error("Sessao expirada.");
    error.code = "SESSION_REQUIRED";
    throw error;
  }
  return session.user.id;
}

async function withPermission(permissionKey, handler) {
  const userId = requireSessionUserId();
  await assertPermission(userId, permissionKey);
  return handler(userId);
}

function buildRouteMap() {
  return {
    "auth.login": ({ data }) => authService.login(data),
    "auth.logout": () => {
      authService.logout();
      return { ok: true };
    },
    "auth.currentSession": () => authService.getCurrentSession(),
    "auth.changeOwnPassword": ({ data }) => authService.changeOwnPassword(data),
    "users.list": () => withPermission("usuarios.ver", () => userService.listUsers()),
    "users.create": ({ data }) => withPermission("usuarios.criar", (actorUserId) => userService.createUser({ actorUserId, data })),
    "users.update": ({ data }) => withPermission("usuarios.editar", (actorUserId) => userService.updateUser({ actorUserId, userId: data.id, data })),
    "users.activate": ({ data }) => withPermission("usuarios.editar", (actorUserId) => userService.activateUser({ actorUserId, userId: data.id })),
    "users.deactivate": ({ data }) => withPermission("usuarios.inativar", (actorUserId) => userService.deactivateUser({ actorUserId, userId: data.id })),
    "users.resetPassword": ({ data }) => withPermission("usuarios.resetar_senha", (actorUserId) => userService.resetUserPassword({ actorUserId, userId: data.id })),
    "profiles.list": () => withPermission("usuarios.gerir_permissoes", () => profileService.listProfiles()),
    "profiles.permissions": () => withPermission("usuarios.gerir_permissoes", () => profileService.listPermissions()),
    "profiles.updatePermissions": ({ data }) => withPermission("usuarios.gerir_permissoes", (actorUserId) => profileService.updateProfilePermissions({
      actorUserId,
      profileId: data.profileId,
      permissionKeys: data.permissionKeys,
    })),
  };
}

function serializeError(error) {
  return {
    message: error.message || "Erro interno.",
    code: error.code || "APP_ERROR",
  };
}

module.exports = {
  buildRouteMap,
  init: ({ Categoria, Subcategoria, Produto }) => {
    const routes = buildRouteMap();

    ipcMain.handle("app:request", async (event, args) => {
      try {
        const route = routes[args.action];
        if (!route) {
          throw new Error("Acao IPC desconhecida.");
        }
        const data = await route({ data: args.data || {} });
        return { ok: true, data };
      } catch (error) {
        console.error("Erro IPC:", error);
        return { ok: false, error: serializeError(error) };
      }
    });

    ipcMain.on("toMain", async (event, args) => {
      switch (args.action) {
        case "getProducts":
          try {
            const products = await Produto.findAll();
            event.reply("fromMain", { action: "getProductsResponse", data: products });
          } catch (error) {
            event.reply("fromMain", { action: "getProductsResponse", error: error.message });
          }
          break;
        case "getCategories":
          try {
            const categories = await Categoria.findAll({ include: [Subcategoria] });
            event.reply("fromMain", { action: "getCategoriesResponse", data: categories });
          } catch (error) {
            event.reply("fromMain", { action: "getCategoriesResponse", error: error.message });
          }
          break;
        default:
          event.reply("fromMain", { action: "unknownAction", error: "Acao IPC desconhecida." });
      }
    });
  },
};
```

- [ ] **Step 5: Verify route map test passes**

Run:

```powershell
node --test tests/ipcRouteMap.test.mjs
```

Expected result: pass.

---

### Task 8: Frontend Auth Session Layer

**Files:**
- Create: `src/services/ipcClient.js`
- Create: `src/auth/AuthContext.jsx`
- Create: `src/components/Login.jsx`
- Create: `src/components/ChangePassword.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Create IPC client**

Create `src/services/ipcClient.js`:

```js
export async function request(action, data = {}) {
  if (!window.api?.invoke) {
    throw new Error('IPC indisponivel neste ambiente.');
  }

  const response = await window.api.invoke(action, data);
  if (!response.ok) {
    throw new Error(response.error?.message || 'Erro interno.');
  }
  return response.data;
}
```

- [ ] **Step 2: Create auth context**

Create `src/auth/AuthContext.jsx`:

```jsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { request } from '../services/ipcClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const current = await request('auth.currentSession');
      setSession(current);
    } catch {
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = useCallback(async ({ username, password }) => {
    setError('');
    const nextSession = await request('auth.login', { username, password });
    setSession(nextSession);
    return nextSession;
  }, []);

  const logout = useCallback(async () => {
    await request('auth.logout');
    setSession(null);
  }, []);

  const changeOwnPassword = useCallback(async ({ currentPassword, newPassword }) => {
    const nextSession = await request('auth.changeOwnPassword', { currentPassword, newPassword });
    setSession(nextSession);
    return nextSession;
  }, []);

  const hasPermission = useCallback((permissionKey) => {
    return session?.permissions?.includes(permissionKey) ?? false;
  }, [session]);

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    permissions: session?.permissions ?? [],
    mustChangePassword: session?.mustChangePassword ?? false,
    isLoading,
    error,
    setError,
    login,
    logout,
    changeOwnPassword,
    hasPermission,
    reloadSession: loadSession,
  }), [session, isLoading, error, login, logout, changeOwnPassword, hasPermission, loadSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }
  return context;
}
```

- [ ] **Step 3: Create login screen**

Create `src/components/Login.jsx`:

```jsx
import React, { useState } from 'react';
import { LockKeyhole, LogIn } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login({ username, password });
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <span className="login-icon"><LockKeyhole size={30} /></span>
        <h1>Farmacia ESAYOS</h1>
        <p>Acesse com o seu usuario para continuar.</p>
        <label>
          Usuario ou email
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoFocus />
        </label>
        <label>
          Senha
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button type="submit" className="primary-button" disabled={isSubmitting}>
          <LogIn size={17} /> Entrar
        </button>
      </form>
    </main>
  );
}

export default Login;
```

- [ ] **Step 4: Create forced password change screen**

Create `src/components/ChangePassword.jsx`:

```jsx
import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

function ChangePassword() {
  const { changeOwnPassword, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await changeOwnPassword({ currentPassword, newPassword });
    } catch (changeError) {
      setError(changeError.message);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <span className="login-icon"><KeyRound size={30} /></span>
        <h1>Trocar senha</h1>
        <p>{user?.nome_completo}, defina uma nova senha antes de acessar o sistema.</p>
        <label>
          Senha temporaria
          <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoFocus />
        </label>
        <label>
          Nova senha
          <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button type="submit" className="primary-button">
          <KeyRound size={17} /> Guardar nova senha
        </button>
      </form>
    </main>
  );
}

export default ChangePassword;
```

- [ ] **Step 5: Wrap App with auth provider and gates**

Modify `src/index.jsx`:

```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import './assets/output.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
```

Modify the top of `src/App.jsx` imports:

```jsx
import { Bell, ChevronDown, LogOut, Search } from 'lucide-react';
import { useAuth } from './auth/AuthContext';
import Login from './components/Login';
import ChangePassword from './components/ChangePassword';
```

Add inside `App()` before local view state:

```jsx
  const { user, isLoading, mustChangePassword, logout, hasPermission } = useAuth();

  if (isLoading) {
    return <main className="login-screen"><div className="login-card">A carregar...</div></main>;
  }

  if (!user) {
    return <Login />;
  }

  if (mustChangePassword) {
    return <ChangePassword />;
  }
```

Change profile button content:

```jsx
            <button className="profile-button" aria-label="Perfil do usuario" type="button">
              <span className="avatar">{user.nome_completo.slice(0, 2).toUpperCase()}</span>
              <strong>{user.nome_completo}</strong>
              <span className="chevron"><ChevronDown size={18} /></span>
            </button>
            <button className="notification-button" aria-label="Sair" type="button" onClick={logout}>
              <LogOut size={22} />
            </button>
```

Pass `hasPermission` to Navbar:

```jsx
        hasPermission={hasPermission}
```

- [ ] **Step 6: Add minimal CSS for auth screens**

Append to `src/assets/tailwind.css`:

```css
.login-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eef6f1;
  padding: 24px;
}

.login-card {
  width: min(420px, 100%);
  background: #fff;
  border: 1px solid #dbe8df;
  border-radius: 8px;
  padding: 28px;
  box-shadow: 0 18px 40px rgba(22, 47, 32, 0.12);
  display: grid;
  gap: 14px;
}

.login-card h1 {
  margin: 0;
  font-size: 26px;
}

.login-card p {
  margin: 0 0 6px;
  color: #66736b;
}

.login-card label {
  display: grid;
  gap: 6px;
  color: #36453b;
  font-weight: 700;
}

.login-card input {
  border: 1px solid #cad8cf;
  border-radius: 7px;
  min-height: 42px;
  padding: 0 12px;
}

.login-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #e3f5ea;
  color: #0f7a42;
}

.form-error {
  border: 1px solid #f0c5c1;
  background: #fff1f0;
  color: #a73933;
  border-radius: 7px;
  padding: 10px 12px;
}
```

- [ ] **Step 7: Rebuild Tailwind output**

Run:

```powershell
npm run build:tailwind
```

Expected result: `src/assets/output.css` is regenerated.

---

### Task 9: Permission-Aware Navigation

**Files:**
- Modify: `src/components/Navbar.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Add permission keys to nav items**

Modify `src/components/Navbar.jsx` nav item definitions:

```jsx
const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.ver' },
  { id: 'vendas', label: 'Vendas', icon: ShoppingCart, permission: 'vendas.ver' },
  { id: 'estoque', label: 'Estoque', icon: Boxes, permission: 'estoque.ver' },
  { id: 'financeiro', label: 'Financeiro', icon: WalletCards, permission: 'financeiro.ver' },
  { id: 'clientes', label: 'Clientes', icon: UsersRound, permission: 'clientes.ver' },
  { id: 'relatorios', label: 'Relatorios', icon: FileBarChart, permission: 'relatorios.ver' },
  { id: 'configuracoes', label: 'Configuracoes', icon: Settings, permission: 'configuracoes.ver' },
  { id: 'usuarios', label: 'Usuarios', icon: UserRound, permission: 'usuarios.ver' },
];
```

- [ ] **Step 2: Filter nav items**

Change the function signature and visible items:

```jsx
function Navbar({ currentView, setCurrentView, isCollapsed, toggleCollapsed, hasPermission }) {
  const visibleNavItems = navItems.filter((item) => hasPermission(item.permission));
```

Change the map source from `navItems.map` to:

```jsx
{visibleNavItems.map((item) => {
```

- [ ] **Step 3: Keep current view valid after permission changes**

In `src/App.jsx`, import `useEffect`:

```jsx
import React, { useEffect, useMemo, useState } from 'react';
```

Add after `currentView` state:

```jsx
  useEffect(() => {
    const viewPermission = `${currentView}.ver`;
    if (!hasPermission(viewPermission)) {
      const fallback = ['dashboard', 'vendas', 'estoque', 'financeiro', 'clientes', 'relatorios', 'configuracoes', 'usuarios']
        .find((view) => hasPermission(`${view}.ver`));
      setCurrentView(fallback || 'dashboard');
    }
  }, [currentView, hasPermission]);
```

- [ ] **Step 4: Run build to catch JSX errors**

Run:

```powershell
npm run build
```

Expected result: build succeeds.

---

### Task 10: Real Users And Permissions UI

**Files:**
- Replace: `src/components/Usuarios.jsx`

- [ ] **Step 1: Replace users component with IPC-backed UI**

Replace `src/components/Usuarios.jsx` with:

```jsx
import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, PlusCircle, ShieldCheck, Trash2, UserRound, UsersRound } from 'lucide-react';
import { request } from '../services/ipcClient';
import { useAuth } from '../auth/AuthContext';

const emptyForm = {
  id: null,
  nome_completo: '',
  nome_usuario: '',
  email: '',
  cargo: '',
  perfil_id: '',
};

function Usuarios() {
  const { hasPermission, reloadSession } = useAuth();
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [error, setError] = useState('');

  async function loadUsers() {
    const data = await request('users.list');
    setUsers(data);
  }

  async function loadProfiles() {
    const data = await request('profiles.list');
    setProfiles(data);
    setSelectedProfile((current) => current || data[0] || null);
  }

  async function loadPermissions() {
    const data = await request('profiles.permissions');
    setPermissions(data);
  }

  useEffect(() => {
    loadUsers().catch((loadError) => setError(loadError.message));
    if (hasPermission('usuarios.gerir_permissoes')) {
      loadProfiles().catch((loadError) => setError(loadError.message));
      loadPermissions().catch((loadError) => setError(loadError.message));
    }
  }, [hasPermission]);

  const metrics = useMemo(() => {
    const activeUsers = users.filter((user) => user.ativo).length;
    const admins = users.filter((user) => user.perfil?.nome === 'Administrador').length;
    return { activeUsers, admins, total: users.length };
  }, [users]);

  function openCreateModal() {
    setForm(emptyForm);
    setTemporaryPassword('');
    setShowUserModal(true);
  }

  function openEditModal(user) {
    setForm({
      id: user.id,
      nome_completo: user.nome_completo || '',
      nome_usuario: user.nome_usuario || '',
      email: user.email || '',
      cargo: user.cargo || '',
      perfil_id: user.perfil_id || '',
    });
    setTemporaryPassword('');
    setShowUserModal(true);
  }

  async function saveUser(event) {
    event.preventDefault();
    setError('');
    const payload = { ...form, perfil_id: Number(form.perfil_id) };
    const action = form.id ? 'users.update' : 'users.create';
    const result = await request(action, payload);
    if (result?.temporaryPassword) {
      setTemporaryPassword(result.temporaryPassword);
    } else {
      setShowUserModal(false);
    }
    await loadUsers();
  }

  async function resetPassword(user) {
    setError('');
    const result = await request('users.resetPassword', { id: user.id });
    setTemporaryPassword(result.temporaryPassword);
    await loadUsers();
  }

  async function toggleUser(user) {
    setError('');
    await request(user.ativo ? 'users.deactivate' : 'users.activate', { id: user.id });
    await loadUsers();
  }

  async function saveProfilePermissions(permissionKeys) {
    setError('');
    await request('profiles.updatePermissions', {
      profileId: selectedProfile.id,
      permissionKeys,
    });
    await loadProfiles();
    await reloadSession();
  }

  return (
    <section className="standard-screen">
      <div className="standard-metrics">
        <Metric title="Usuarios Activos" value={metrics.activeUsers} icon={UsersRound} />
        <Metric title="Administradores" value={metrics.admins} icon={ShieldCheck} />
        <Metric title="Total" value={metrics.total} icon={UserRound} />
        <Metric title="Perfis" value={profiles.length || '-'} icon={KeyRound} />
      </div>

      {error && <div className="form-error">{error}</div>}
      {temporaryPassword && (
        <div className="panel">
          <strong>Senha temporaria:</strong> <code>{temporaryPassword}</code>
          <p>Copie agora. Esta senha nao sera exibida novamente.</p>
        </div>
      )}

      <div className="panel table-panel">
        <div className="panel-title-row">
          <h2>Usuarios do Sistema</h2>
          <div className="stock-toolbar-actions">
            {hasPermission('usuarios.criar') && <button type="button" onClick={openCreateModal}><PlusCircle size={17} /> Novo Usuario</button>}
            {hasPermission('usuarios.gerir_permissoes') && <button type="button" onClick={() => setShowPermissionsModal(true)}><ShieldCheck size={17} /> Permissoes</button>}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Usuario</th>
              <th>Perfil</th>
              <th>Email</th>
              <th>Status</th>
              <th>Ultimo login</th>
              <th>Opcoes</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.nome_completo}</td>
                <td>{user.nome_usuario}</td>
                <td>{user.perfil?.nome || '-'}</td>
                <td>{user.email || '-'}</td>
                <td><span className={user.ativo ? 'status paid' : 'status waiting'}>{user.ativo ? 'Activo' : 'Inactivo'}</span></td>
                <td>{user.ultimo_login_em ? new Date(user.ultimo_login_em).toLocaleString('pt-PT') : '-'}</td>
                <td className="options-cell">
                  {hasPermission('usuarios.editar') && <button className="icon-button" type="button" aria-label="Editar usuario" onClick={() => openEditModal(user)}><Pencil size={16} /></button>}
                  {hasPermission('usuarios.resetar_senha') && <button className="icon-button" type="button" aria-label="Redefinir senha" onClick={() => resetPassword(user)}><KeyRound size={16} /></button>}
                  {hasPermission('usuarios.inativar') && <button className="icon-button danger" type="button" aria-label={user.ativo ? 'Inativar usuario' : 'Ativar usuario'} onClick={() => toggleUser(user)}><Trash2 size={16} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showUserModal && (
        <UserModal
          form={form}
          setForm={setForm}
          profiles={profiles}
          onClose={() => setShowUserModal(false)}
          onSubmit={saveUser}
        />
      )}

      {showPermissionsModal && (
        <PermissionsModal
          profiles={profiles}
          permissions={permissions}
          selectedProfile={selectedProfile}
          setSelectedProfile={setSelectedProfile}
          onClose={() => setShowPermissionsModal(false)}
          onSave={saveProfilePermissions}
        />
      )}
    </section>
  );
}

function UserModal({ form, setForm, profiles, onClose, onSubmit }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal-card" onSubmit={onSubmit}>
        <div className="modal-title-row">
          <h2>{form.id ? 'Editar Usuario' : 'Novo Usuario'}</h2>
          <button type="button" onClick={onClose}>x</button>
        </div>
        <div className="form-grid">
          <input placeholder="Nome completo" value={form.nome_completo} onChange={(event) => setForm({ ...form, nome_completo: event.target.value })} required />
          <input placeholder="Nome de usuario" value={form.nome_usuario} onChange={(event) => setForm({ ...form, nome_usuario: event.target.value })} required disabled={Boolean(form.id)} />
          <input placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <input placeholder="Cargo" value={form.cargo} onChange={(event) => setForm({ ...form, cargo: event.target.value })} />
          <select value={form.perfil_id} onChange={(event) => setForm({ ...form, perfil_id: event.target.value })} required>
            <option value="">Perfil</option>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.nome}</option>)}
          </select>
        </div>
        <div className="modal-actions">
          <button type="button" className="soft-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button">Guardar</button>
        </div>
      </form>
    </div>
  );
}

function PermissionsModal({ profiles, permissions, selectedProfile, setSelectedProfile, onClose, onSave }) {
  const [selectedKeys, setSelectedKeys] = useState(selectedProfile?.permissoes || []);

  useEffect(() => {
    setSelectedKeys(selectedProfile?.permissoes || []);
  }, [selectedProfile]);

  const grouped = permissions.reduce((groups, permission) => {
    groups[permission.modulo] = groups[permission.modulo] || [];
    groups[permission.modulo].push(permission);
    return groups;
  }, {});

  function toggle(permissionKey) {
    setSelectedKeys((current) => (
      current.includes(permissionKey)
        ? current.filter((key) => key !== permissionKey)
        : [...current, permissionKey]
    ));
  }

  async function handleSave() {
    await onSave(selectedKeys);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card wide-modal">
        <div className="modal-title-row">
          <h2>Permissoes por Perfil</h2>
          <button type="button" onClick={onClose}>x</button>
        </div>
        <select value={selectedProfile?.id || ''} onChange={(event) => setSelectedProfile(profiles.find((profile) => profile.id === Number(event.target.value)))}>
          {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.nome}</option>)}
        </select>
        <div className="permissions-grid">
          {Object.entries(grouped).map(([moduleName, modulePermissions]) => (
            <div key={moduleName} className="permission-group">
              <h3>{moduleName}</h3>
              {modulePermissions.map((permission) => (
                <label key={permission.chave} className="permission-check">
                  <input type="checkbox" checked={selectedKeys.includes(permission.chave)} onChange={() => toggle(permission.chave)} />
                  {permission.descricao}
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="soft-button" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary-button" onClick={handleSave}>Guardar Permissoes</button>
        </div>
      </div>
    </div>
  );
}

function Metric({ title, value, icon: Icon }) {
  return (
    <div className="standard-metric blue">
      <span><Icon size={32} /></span>
      <div>
        <h2>{title}</h2>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

export default Usuarios;
```

- [ ] **Step 2: Add permissions modal CSS**

Append to `src/assets/tailwind.css`:

```css
.wide-modal {
  width: min(920px, calc(100vw - 32px));
}

.permissions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  max-height: 56vh;
  overflow: auto;
  padding-right: 4px;
}

.permission-group {
  border: 1px solid #dbe8df;
  border-radius: 8px;
  padding: 14px;
  background: #fbfdfb;
}

.permission-group h3 {
  margin: 0 0 10px;
  font-size: 15px;
}

.permission-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 13px;
  color: #405249;
  margin: 8px 0;
}
```

- [ ] **Step 3: Rebuild Tailwind output**

Run:

```powershell
npm run build:tailwind
```

Expected result: `src/assets/output.css` is regenerated.

- [ ] **Step 4: Build frontend**

Run:

```powershell
npm run build
```

Expected result: build succeeds.

---

### Task 11: Documentation And Final Verification

**Files:**
- Modify: `docs/database_schema.md`
- Verify: whole project

- [ ] **Step 1: Update database schema documentation**

Update `docs/database_schema.md` in the `Usuarios` section to include:

```md
| `perfil_id`        | INTEGER           | FOREIGN KEY (`Perfis.id`) | Perfil de permissoes do usuario.             |
| `deve_trocar_senha`| BOOLEAN           | DEFAULT FALSE     | Obriga troca de senha no proximo login.      |
| `ultimo_login_em`  | DATETIME          |                   | Data/hora do ultimo login bem-sucedido.      |
| `falhas_login`     | INTEGER           | DEFAULT 0         | Contador de falhas consecutivas de login.    |
| `bloqueado_ate`    | DATETIME          |                   | Bloqueio temporario por falhas de login.     |
```

Add new sections for `Perfis`, `Permissoes`, `PerfilPermissoes`, and `AuditoriaUsuarios` with the fields defined in the spec.

- [ ] **Step 2: Run all tests**

Run:

```powershell
npm test
```

Expected result: all tests pass.

- [ ] **Step 3: Build CSS**

Run:

```powershell
npm run build:tailwind
```

Expected result: CSS builds without errors.

- [ ] **Step 4: Build app**

Run:

```powershell
npm run build
```

Expected result: Vite production build succeeds.

- [ ] **Step 5: Manual smoke test in Electron**

Run:

```powershell
npm start
```

Expected result:

- Login screen appears before Dashboard.
- `admin` / `Admin123!` logs in.
- Forced password change appears.
- After changing password, Dashboard appears.
- Usuarios screen lists the Admin user.
- Admin can create a Caixa user and see a one-time temporary password.
- Admin can open Permissoes and save a profile without losing essential Admin permissions.
- Logging out returns to login.

---

## Self-Review Notes

- Spec coverage: login, session, first Admin bootstrap, editable profiles, permissions matrix, Admin reset, forced password change, audit, backend authorization, frontend gating, tests, and docs all have tasks.
- Marker scan: no task uses deferred-work language. Code snippets define the referenced functions and files.
- Type consistency: permission keys use the same `modulo.acao` strings across catalog, services, IPC, frontend gates, and tests.
- Scope control: email recovery, per-user exceptions, external identity, 2FA, and full migrations remain out of scope.

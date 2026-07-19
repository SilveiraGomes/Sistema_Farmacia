# Licenciamento Temporário 1.0.1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar API PHP/MySQL, painel administrativo e integração Electron para licenças Demo de 30 dias e planos pagos de 1, 2 ou 3 anos vinculados a uma máquina.

**Architecture:** O trabalho é dividido em três marcos testáveis: servidor de licenças, aplicação Electron e painel/empacotamento. O servidor assina documentos de licença; o processo principal do Electron valida-os e bloqueia mutações por IPC; o painel administra o ciclo de vida.

**Tech Stack:** PHP 8.1+, MySQL 8/MariaDB 10.6+, Node.js, Electron 35, React 19, SQLite, Node Test Runner, NSIS.

---

## Marco A — Servidor PHP/MySQL

### Task 1: Estrutura e esquema de dados

**Files:**
- Create: `licensing-server/config.example.php`
- Create: `licensing-server/schema.sql`
- Create: `licensing-server/src/Database.php`
- Create: `licensing-server/tests/database_test.php`

- [ ] **Step 1: Escrever o teste de ligação**

```php
<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::connect(require __DIR__ . '/../config.test.php');
assert($pdo->getAttribute(PDO::ATTR_ERRMODE) === PDO::ERRMODE_EXCEPTION);
```

- [ ] **Step 2: Executar e confirmar a falha**

Run: `php -d zend.assertions=1 -d assert.exception=1 licensing-server/tests/database_test.php`

Expected: FAIL porque `Database.php` ainda não existe.

- [ ] **Step 3: Criar configuração e ligação PDO**

```php
<?php
final class Database {
    public static function connect(array $config): PDO {
        return new PDO(
            "mysql:host={$config['host']};dbname={$config['database']};charset=utf8mb4",
            $config['username'],
            $config['password'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
             PDO::ATTR_EMULATE_PREPARES => false]
        );
    }
}
```

- [ ] **Step 4: Criar tabelas e restrições**

`schema.sql` deve criar `customers`, `licenses`, `activations`, `license_events` e `admin_users`, incluindo:

```sql
CREATE TABLE activations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  license_id BIGINT UNSIGNED NOT NULL,
  machine_hash CHAR(64) NOT NULL,
  installation_id CHAR(36) NOT NULL,
  status ENUM('active','deactivated','blocked') NOT NULL DEFAULT 'active',
  activated_at DATETIME NOT NULL,
  last_validated_at DATETIME NOT NULL,
  UNIQUE KEY uq_license_active_machine (license_id, machine_hash),
  FOREIGN KEY (license_id) REFERENCES licenses(id)
);
```

- [ ] **Step 5: Importar o esquema e executar o teste**

Run: `Get-Content licensing-server/schema.sql | mysql -u $env:LICENSE_DB_USER -p$env:LICENSE_DB_PASSWORD $env:LICENSE_DB_NAME`

Expected: esquema importado; o teste PHP termina com exit code 0.

- [ ] **Step 6: Commit**

```powershell
git add licensing-server
git commit -m "feat: criar esquema do servidor de licenças"
```

### Task 2: Assinatura e documento de licença

**Files:**
- Create: `licensing-server/src/LicenseSigner.php`
- Create: `licensing-server/tests/license_signer_test.php`
- Create: `src/backend/licensing/licenseVerifier.js`
- Create: `tests/licenseVerifier.test.mjs`

- [ ] **Step 1: Escrever testes de assinatura e adulteração**

```php
$signed = LicenseSigner::sign(['licenseId' => 10, 'machineHash' => str_repeat('a', 64)], $privateKey);
assert(isset($signed['payload'], $signed['signature']));
```

```js
test('rejects an altered signed payload', () => {
  assert.equal(verifyLicenseDocument(altered, publicKey), false);
});
```

- [ ] **Step 2: Confirmar ambos em vermelho**

Run: `php licensing-server/tests/license_signer_test.php`

Run: `node --test tests/licenseVerifier.test.mjs`

Expected: FAIL por módulos inexistentes.

- [ ] **Step 3: Implementar assinatura RSA-SHA256**

O PHP usa `openssl_sign($payloadJson, $signature, $privateKey, OPENSSL_ALGO_SHA256)`. O Node usa `crypto.verify('RSA-SHA256', payload, publicKey, signature)`. O payload JSON deve ser canónico e codificado em Base64URL.

- [ ] **Step 4: Executar os testes**

Expected: documentos válidos passam e qualquer alteração falha.

- [ ] **Step 5: Commit**

```powershell
git add licensing-server/src licensing-server/tests src/backend/licensing tests/licenseVerifier.test.mjs
git commit -m "feat: assinar e verificar documentos de licença"
```

### Task 3: API de activação e validação

**Files:**
- Create: `licensing-server/public/index.php`
- Create: `licensing-server/src/LicenseService.php`
- Create: `licensing-server/src/JsonResponse.php`
- Create: `licensing-server/tests/license_service_test.php`

- [ ] **Step 1: Escrever testes de domínio**

Cobrir:

```php
assert($service->activate($demoKey, $machineA)['status'] === 'demo_active');
assertThrows(fn() => $service->activate($demoKey, $machineB), 'MACHINE_LIMIT');
assertThrows(fn() => $service->activate($expiredKey, $machineA), 'LICENSE_EXPIRED');
```

- [ ] **Step 2: Confirmar falhas**

Run: `php licensing-server/tests/license_service_test.php`

Expected: FAIL porque `LicenseService` não existe.

- [ ] **Step 3: Implementar regras**

- Demo: `expires_at = activated_at + 30 dias`.
- Pago: expiração definida na licença para 1, 2 ou 3 anos.
- Uma activação activa por licença.
- Chaves comparadas por `hash('sha256', $key)`.
- Cada activação/validação/regra recusada gera `license_events`.

- [ ] **Step 4: Implementar rotas**

```php
POST /api/licenses/activate
POST /api/licenses/validate
POST /api/licenses/deactivate
POST /api/licenses/renew-status
```

Respostas usam `{ "ok": true, "data": ... }` ou `{ "ok": false, "error": { "code": "...", "message": "..." } }`.

- [ ] **Step 5: Executar testes e análise sintáctica**

Run: `php licensing-server/tests/license_service_test.php`

Run: `Get-ChildItem licensing-server -Recurse -Filter *.php | ForEach-Object { php -l $_.FullName }`

Expected: todos passam.

- [ ] **Step 6: Commit**

```powershell
git add licensing-server
git commit -m "feat: implementar API de activação"
```

## Marco B — Aplicação Electron

### Task 4: Estado local, máquina e política de licença

**Files:**
- Create: `src/backend/licensing/machineFingerprint.js`
- Create: `src/backend/licensing/licensePolicy.js`
- Create: `src/backend/licensing/licenseStore.js`
- Create: `tests/licensePolicy.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Escrever testes da política**

```js
test('expired licenses allow reads and deny mutations', () => {
  const state = evaluateLicense({ expiresAt: '2026-01-01T00:00:00Z' }, {
    now: new Date('2026-01-02T00:00:00Z'),
  });
  assert.equal(state.mode, 'read_only');
  assert.equal(state.canWrite, false);
});
```

Cobrir Demo, planos pagos, sete dias offline, revogação, máquina diferente e recuo do relógio.

- [ ] **Step 2: Confirmar o teste vermelho**

Run: `node --test tests/licensePolicy.test.mjs`

Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implementar módulos**

- `machineFingerprint.js`: recolher identificadores do Windows no processo principal e produzir SHA-256.
- `licenseStore.js`: guardar o documento em `app.getPath('userData')/license.dat` com `safeStorage` quando disponível.
- `licensePolicy.js`: função pura `evaluateLicense(document, context)`.

- [ ] **Step 4: Actualizar versão**

Alterar `version` para `1.0.1` em `package.json` e `package-lock.json`.

- [ ] **Step 5: Executar testes**

Run: `node --test tests/licenseVerifier.test.mjs tests/licensePolicy.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/backend/licensing tests/licensePolicy.test.mjs package.json package-lock.json
git commit -m "feat: adicionar política local de licenciamento"
```

### Task 5: Cliente API e rotas IPC

**Files:**
- Create: `src/backend/licensing/licenseClient.js`
- Create: `src/backend/licensing/licenseService.js`
- Modify: `src/backend/ipcHandlers.js`
- Modify: `main.js`
- Create: `tests/licenseIpc.test.mjs`

- [ ] **Step 1: Escrever testes IPC**

```js
test('mutation routes reject read-only licenses', async () => {
  await assert.rejects(
    routes['vendas.create']({}),
    error => error.code === 'LICENSE_READ_ONLY',
  );
});
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/licenseIpc.test.mjs`

Expected: FAIL porque o guardião de licença não existe.

- [ ] **Step 3: Implementar serviço e rotas**

Rotas públicas:

```js
'license.status'
'license.activate'
'license.validate'
'license.machineId'
```

Adicionar `assertLicenseWriteAllowed()` a todas as rotas IPC de mutação. A URL vem de `KILSYSTEM_LICENSE_API_URL`, com produção apontando para `https://kilsystemamgola.com/api/licenses`.

- [ ] **Step 4: Inicializar antes da janela**

Em `main.js`, carregar e verificar a licença antes de criar a janela, sem impedir consultas quando o estado for somente leitura.

- [ ] **Step 5: Executar testes**

Run: `node --test tests/licenseIpc.test.mjs tests/ipcRouteMap.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/backend/licensing src/backend/ipcHandlers.js main.js tests/licenseIpc.test.mjs
git commit -m "feat: proteger mutações por estado da licença"
```

### Task 6: Interface de activação e modo somente leitura

**Files:**
- Create: `src/licensing/LicenseContext.jsx`
- Create: `src/components/LicenseActivation.jsx`
- Create: `src/components/LicenseBanner.jsx`
- Modify: `src/index.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/Configuracoes.jsx`
- Modify: `src/assets/tailwind.css`
- Create: `tests/licenseUiSource.test.mjs`

- [ ] **Step 1: Escrever o teste de fonte**

```js
assert.match(app, /<LicenseActivation/);
assert.match(app, /license\.mode === ['"]read_only['"]/);
assert.match(config, /Licença/);
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test tests/licenseUiSource.test.mjs`

Expected: FAIL porque os componentes ainda não existem.

- [ ] **Step 3: Implementar fluxo visual**

- Antes do login: activação quando `unactivated`.
- Banner persistente para `read_only`, `expiring` e `offline_grace`.
- Configurações: plano, estado, máquina, expiração e botão de revalidar.
- Componentes recebem estado somente do `LicenseContext`.

- [ ] **Step 4: Executar testes e build**

Run: `node --test tests/licenseUiSource.test.mjs`

Run: `npm run build`

Expected: PASS e build com exit code 0.

- [ ] **Step 5: Commit**

```powershell
git add src/licensing src/components src/App.jsx src/index.jsx src/assets/tailwind.css tests/licenseUiSource.test.mjs
git commit -m "feat: criar interface de activação"
```

## Marco C — Painel, implantação e Setup

### Task 7: Painel administrativo

**Files:**
- Create: `licensing-server/public/admin/login.php`
- Create: `licensing-server/public/admin/index.php`
- Create: `licensing-server/public/admin/licenses.php`
- Create: `licensing-server/public/admin/customers.php`
- Create: `licensing-server/src/AdminAuth.php`
- Create: `licensing-server/tests/admin_auth_test.php`

- [ ] **Step 1: Escrever testes de sessão**

Testar hash de senha, login, CSRF e expiração de sessão.

- [ ] **Step 2: Confirmar falhas**

Run: `php licensing-server/tests/admin_auth_test.php`

- [ ] **Step 3: Implementar painel**

Usar `password_hash`, `password_verify`, cookies `Secure`, `HttpOnly`, `SameSite=Strict`, rotação do ID de sessão e token CSRF em cada mutação.

As telas devem permitir clientes, emissão Demo/1/2/3 anos, renovação, revogação, transferência e auditoria.

- [ ] **Step 4: Executar testes PHP**

Run: `php licensing-server/tests/admin_auth_test.php`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add licensing-server
git commit -m "feat: adicionar painel de licenças"
```

### Task 8: Implantação e instalador 1.0.1

**Files:**
- Create: `licensing-server/.htaccess`
- Create: `licensing-server/DEPLOY.md`
- Create: `docs/licensing-operations.md`
- Modify: `package.json`

- [ ] **Step 1: Documentar segredos e implantação**

Documentar criação da base, utilizador MySQL, chave RSA privada fora de `public_html`, chave pública no aplicativo, variáveis, HTTPS, cron de backup e primeiro administrador.

- [ ] **Step 2: Executar verificações completas**

Run: `npm test`

Run: `Get-ChildItem licensing-server -Recurse -Filter *.php | ForEach-Object { php -l $_.FullName }`

Run: `npm run build`

Expected: zero falhas novas; falhas preexistentes devem ser corrigidas antes do Setup.

- [ ] **Step 3: Testar actualização**

Instalar 1.0.0 numa máquina de teste, criar dados, instalar 1.0.1 por cima e confirmar que `%APPDATA%/KILSYSTEM PHARMACY/database.sqlite` permanece intacta.

- [ ] **Step 4: Gerar o Setup**

Run: `npm run dist`

Expected: `release/KILSYSTEM-PHARMACY-Setup-1.0.1.exe`.

- [ ] **Step 5: Registar hash**

Run: `Get-FileHash release/KILSYSTEM-PHARMACY-Setup-1.0.1.exe -Algorithm SHA256`

- [ ] **Step 6: Commit**

```powershell
git add licensing-server/DEPLOY.md licensing-server/.htaccess docs/licensing-operations.md package.json package-lock.json
git commit -m "release: preparar licenciamento 1.0.1"
```

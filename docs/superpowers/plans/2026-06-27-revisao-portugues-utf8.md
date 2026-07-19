# Revisão da Interface em Português e UTF-8 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apresentar toda a interface em português de Angola, com acentuação UTF-8 correcta e sem alterar identificadores técnicos.

**Architecture:** A revisão será protegida por um teste de fonte que percorre os componentes e detecta mojibake e rótulos principais incorrectos. Os códigos internos dos catálogos permanecem iguais; apenas os respectivos nomes de apresentação passam a ser definidos explicitamente.

**Tech Stack:** React 19, JavaScript/JSX, Node.js Test Runner, Vite.

---

### Task 1: Criar a protecção contra regressões linguísticas

**Files:**
- Create: `tests/interfaceLanguage.test.mjs`

- [ ] **Step 1: Escrever o teste que inicialmente falha**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const visibleSources = [
  'src/App.jsx',
  'src/components/Navbar.jsx',
  'src/components/Operacao.jsx',
  'src/components/Configuracoes.jsx',
  'src/components/Dashboard.jsx',
  'src/components/Clientes.jsx',
  'src/components/Financeiro.jsx',
];

test('interface sources contain no mojibake', async () => {
  for (const path of visibleSources) {
    const source = await readFile(path, 'utf8');
    assert.doesNotMatch(source, /Ã|Â|�/, path);
  }
});

test('main navigation and operation labels use Portuguese accents', async () => {
  const navbar = await readFile('src/components/Navbar.jsx', 'utf8');
  const operation = await readFile('src/components/Operacao.jsx', 'utf8');
  assert.match(navbar, /label:\s*['"]Painel['"]/);
  assert.match(navbar, /label:\s*['"]Operação['"]/);
  assert.match(operation, />Dia e turno da farmácia</);
  assert.match(operation, /title="Operações"/);
  assert.match(operation, />Acções do caixa</);
  assert.match(operation, /label="Diferença"/);
});

test('technical catalog codes retain translated display names', async () => {
  const registry = await readFile('src/backend/services/configurationRegistry.js', 'utf8');
  assert.match(registry, /technicalNamed\(\{\s*expense:\s*'Despesa'/s);
  assert.match(registry, /revenue:\s*'Receita'/);
  assert.match(registry, /loss:\s*'Perda'/);
  assert.match(registry, /credito:\s*'Crédito'/);
  assert.match(registry, /'nota-credito':\s*'Nota de crédito'/);
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha esperada**

Run: `node --test tests/interfaceLanguage.test.mjs`

Expected: FAIL nos textos actuais “Dashboard”, “Operacao”, “farmacia” e nas sequências `Ã`.

- [ ] **Step 3: Registar apenas o teste vermelho**

```powershell
git add tests/interfaceLanguage.test.mjs
git commit -m "test: proteger textos portugueses da interface"
```

### Task 2: Corrigir navegação e tela operacional

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Navbar.jsx`
- Modify: `src/components/Operacao.jsx`
- Modify: `tests/operationUiSource.test.mjs`

- [ ] **Step 1: Actualizar as expectativas antigas do teste de integração**

Em `tests/operationUiSource.test.mjs`, manter os IDs `operacao` e a permissão `operacao.ver`, mas substituir as expectativas dos rótulos:

```js
assert.match(appSource, /operacao:\s*'Operação'/);
assert.match(navSource, /id:\s*'operacao',\s*label:\s*'Operação'/);
```

- [ ] **Step 2: Corrigir os títulos de navegação sem mudar IDs**

Em `src/App.jsx`, usar:

```js
const viewTitles = {
  dashboard: 'Painel',
  operacao: 'Operação',
  // manter os restantes IDs e títulos, corrigindo apenas os textos visíveis
};
```

Em `src/components/Navbar.jsx`, usar `Painel`, `Operação`, `Finanças`, `Relatórios`, `Configurações`, `Usuários` e `Actualizações`.

- [ ] **Step 3: Corrigir toda a cópia visível de Operação**

Em `src/components/Operacao.jsx`, corrigir pelo menos:

```jsx
<h2>Dia e turno da farmácia</h2>
<StatusCard title="Operações" />
<h2>Acções do caixa</h2>
<LedgerItem label="Diferença" value={formatKwanza(cashSummary.difference)} />
```

Corrigir também “período”, “Disponível”, “Último”, “Observação” e todas as frases com “farmácia” ou “operações”.

- [ ] **Step 4: Executar os testes focados**

Run: `node --test tests/interfaceLanguage.test.mjs tests/operationUiSource.test.mjs`

Expected: os testes de navegação e Operação passam; o teste de catálogos pode continuar a falhar até à Task 3.

- [ ] **Step 5: Registar a correcção**

```powershell
git add src/App.jsx src/components/Navbar.jsx src/components/Operacao.jsx tests/operationUiSource.test.mjs
git commit -m "fix: corrigir português da navegação e operação"
```

### Task 3: Traduzir nomes apresentados pelos catálogos

**Files:**
- Modify: `src/backend/services/configurationRegistry.js`
- Modify: `tests/configurationRegistry.test.mjs`

- [ ] **Step 1: Adicionar testes comportamentais dos nomes sem alterar códigos**

Em `tests/configurationRegistry.test.mjs`, acrescentar:

```js
test('technical catalogs expose Portuguese display names and stable codes', () => {
  const financial = CATALOG_DEFINITIONS.financial_entry_types.options;
  assert.deepEqual(
    financial.map(({ code, name }) => ({ code, name })),
    [
      { code: 'expense', name: 'Despesa' },
      { code: 'revenue', name: 'Receita' },
      { code: 'loss', name: 'Perda' },
    ],
  );

  const documents = CATALOG_DEFINITIONS.document_types.options;
  assert.equal(documents.find(({ code }) => code === 'credito').name, 'Crédito');
  assert.equal(documents.find(({ code }) => code === 'nota-credito').name, 'Nota de crédito');
});
```

- [ ] **Step 2: Executar e confirmar que o teste falha pelos nomes antigos**

Run: `node --test tests/configurationRegistry.test.mjs`

Expected: FAIL porque os nomes são gerados actualmente como `Expense`, `Revenue`, `Loss`, `Credito` e `Nota Credito`.

- [ ] **Step 3: Criar nomes técnicos explícitos**

Em `src/backend/services/configurationRegistry.js`, adicionar:

```js
const technicalNamed = (names) => ({
  editable: false,
  options: Object.entries(names).map(([code, name], order) => ({
    code,
    name,
    order,
    system: true,
  })),
});
```

Usar `technicalNamed` em `financial_entry_types` e `document_types`, conservando exactamente os códigos existentes:

```js
document_types: technicalNamed({
  factura: 'Factura',
  factura_recibo: 'Factura-recibo',
  recibo: 'Recibo',
  proforma: 'Proforma',
  credito: 'Crédito',
  'nota-credito': 'Nota de crédito',
}),
financial_entry_types: technicalNamed({
  expense: 'Despesa',
  revenue: 'Receita',
  loss: 'Perda',
}),
```

- [ ] **Step 4: Executar os testes dos catálogos e da interface**

Run: `node --test tests/configurationRegistry.test.mjs tests/interfaceLanguage.test.mjs`

Expected: PASS.

- [ ] **Step 5: Registar a tradução**

```powershell
git add src/backend/services/configurationRegistry.js tests/configurationRegistry.test.mjs
git commit -m "fix: traduzir nomes visíveis dos catálogos"
```

### Task 4: Revisar os restantes textos visíveis

**Files:**
- Modify: `src/components/*.jsx`
- Modify: `src/components/settings/*.jsx`
- Modify: `src/auth/AuthContext.jsx`
- Modify: `src/operation/OperationContext.jsx`
- Modify: `src/backend/services/*.js`
- Modify: `package.json`
- Modify: `tests/interfaceLanguage.test.mjs`

- [ ] **Step 1: Expandir o teste para todos os produtores de texto visível**

Substituir `visibleSources` por uma descoberta explícita dos ficheiros fonte:

```js
import { readdir } from 'node:fs/promises';

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:js|jsx|mjs)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

const visibleSources = await sourceFiles('src');
```

Manter a rejeição `/Ã|Â|�/` e acrescentar verificações específicas dos textos visíveis corrigidos.

- [ ] **Step 2: Executar e guardar a lista de falhas**

Run: `node --test tests/interfaceLanguage.test.mjs`

Expected: FAIL, listando os ficheiros que ainda contêm mojibake.

- [ ] **Step 3: Corrigir apenas literais destinados ao utilizador**

Corrigir acentos e termos ingleses em JSX, mensagens de contexto e erros de serviço. Não alterar chaves como `dashboard.ver`, `operacao.ver`, `expense`, `revenue`, `loss`, nomes de colunas ou rotas IPC.

Corrigir também o metadado:

```json
"copyright": "Copyright © 2026 KILSYSTEM"
```

- [ ] **Step 4: Executar o teste linguístico**

Run: `node --test tests/interfaceLanguage.test.mjs`

Expected: PASS.

- [ ] **Step 5: Registar a revisão global**

```powershell
git add src package.json tests/interfaceLanguage.test.mjs
git commit -m "fix: uniformizar interface em português UTF-8"
```

### Task 5: Verificação funcional e visual

**Files:**
- Modify only if verification reveals a defect.

- [ ] **Step 1: Executar toda a suíte**

Run: `npm test`

Expected: exit code 0, sem testes falhados.

- [ ] **Step 2: Gerar a compilação**

Run: `npm run build`

Expected: exit code 0 e pacote Vite gerado.

- [ ] **Step 3: Inspeccionar a aplicação**

Run: `npm run dev -- --host 127.0.0.1`

No navegador, verificar:

- Menu com “Painel”, “Operação”, “Finanças”, “Relatórios”, “Configurações” e “Usuários”.
- Operação com “farmácia”, “Operações”, “Acções” e “Diferença”.
- Configurações com “Despesa”, “Receita”, “Perda”, “Crédito” e “Nota de crédito”.
- Ausência visual de `Ã`, `Â`, `�` e termos ingleses não técnicos.

- [ ] **Step 4: Rever o diff final**

Run: `git diff --check`

Expected: nenhuma saída e exit code 0.

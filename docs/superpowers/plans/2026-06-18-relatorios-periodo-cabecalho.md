# Relatórios por Período e Cabeçalho Documental Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplificar a central de relatórios para duas datas inclusivas e unificar o cabeçalho configurável usado em facturas e relatórios A4.

**Architecture:** O motor de relatórios normaliza um único intervalo antes de chamar qualquer construtor. As configurações A4 passam a expor um texto multilinha compatível com dados antigos; os componentes de factura e relatório renderizam esse texto e o mesmo logótipo. A interface de relatórios remove filtros secundários e usa CSS sem overflow horizontal.

**Tech Stack:** React 19, JavaScript ES modules, Node test runner, PostCSS/Tailwind CSS, Vite.

---

## Mapa de ficheiros

- `src/data/reports.mjs`: catálogo, normalização do intervalo e construção dos relatórios.
- `src/data/invoiceSettings.mjs`: persistência e migração do texto multilinha do cabeçalho.
- `src/data/invoiceA4.mjs`: view model compartilhado pela factura.
- `src/components/Configuracoes.jsx`: edição do texto do cabeçalho e do logótipo.
- `src/components/InvoiceA4.jsx`: cabeçalho multilinha da factura.
- `src/components/Relatorios.jsx`: período compacto, títulos e ações.
- `src/components/ReportA4.jsx`: documento de relatório sem filtros nem cartões.
- `src/assets/tailwind.css`: densidade, alinhamento, scroll vertical e impressão.
- `src/assets/output.css`: saída gerada por `npm run build:tailwind`.
- `tests/reports.test.mjs`: intervalo inclusivo e remoção da comparação.
- `tests/invoiceSettings.test.mjs`: migração e preservação de linhas.
- `tests/invoiceA4.test.mjs`: view model do cabeçalho compartilhado.
- `tests/invoiceA4Component.test.mjs`: fonte da UI de configurações e factura.
- `tests/reportUiSource.test.mjs`: fonte da central, do A4 e estilos.

### Task 1: Normalizar o intervalo e remover o relatório de diferença

**Files:**
- Modify: `tests/reports.test.mjs`
- Modify: `src/data/reports.mjs`

- [ ] **Step 1: Escrever testes que descrevem o novo catálogo e o intervalo**

Substituir a expectativa antiga de `diferenca-entre-datas` e acrescentar:

```js
test('REPORT_CATALOG removes date difference comparison', () => {
  const reportIds = REPORT_CATALOG.flatMap((group) => group.reports.map((report) => report.id));
  assert.equal(reportIds.includes('diferenca-entre-datas'), false);
});

test('buildReportData includes both ends of an inverted inclusive interval', () => {
  const report = buildReportData('vendas-detalhadas', {
    sales: [
      { product: 'Inicio', date: '2026-06-01T08:00:00', quantity: 1, revenue: 100, cost: 20 },
      { product: 'Meio', date: '2026-06-08', quantity: 1, revenue: 200, cost: 30 },
      { product: 'Fim', date: '2026-06-15T19:00:00', quantity: 1, revenue: 300, cost: 40 },
      { product: 'Fora', date: '2026-06-16', quantity: 1, revenue: 400, cost: 50 },
    ],
  }, { startDate: '2026-06-15', endDate: '2026-06-01' });

  assert.deepEqual(report.rows.map((row) => row.product), ['Inicio', 'Meio', 'Fim']);
  assert.equal(report.filters.startDate, '2026-06-01');
  assert.equal(report.filters.endDate, '2026-06-15');
});

test('daily report uses the selected interval instead of only the first date', () => {
  const report = buildReportData('relatorio-diario', {
    sales: [
      { product: 'Primeiro', date: '2026-06-01', quantity: 1, revenue: 100, cost: 20 },
      { product: 'Segundo', date: '2026-06-02', quantity: 1, revenue: 200, cost: 30 },
    ],
  }, { startDate: '2026-06-01', endDate: '2026-06-02' });

  assert.deepEqual(report.rows.map((row) => row.product), ['Primeiro', 'Segundo']);
});
```

- [ ] **Step 2: Executar os testes e confirmar falha pela implementação antiga**

Run: `node --test tests/reports.test.mjs`

Expected: FAIL porque o catálogo ainda contém `diferenca-entre-datas`, o intervalo invertido fica vazio e o relatório diário usa apenas um dia.

- [ ] **Step 3: Implementar a normalização mínima e remover a comparação**

Em `src/data/reports.mjs`, remover a definição e o builder de `diferenca-entre-datas`. Normalizar antes de selecionar o construtor:

```js
export function normalizeReportFilters(filters = {}) {
  const startDate = normalizeDateKey(filters.startDate);
  const endDate = normalizeDateKey(filters.endDate);

  if (startDate && endDate && startDate > endDate) {
    return { ...filters, startDate: endDate, endDate: startDate };
  }

  return {
    ...filters,
    startDate: startDate || filters.startDate,
    endDate: endDate || filters.endDate,
  };
}

export function buildReportData(reportId, data = {}, filters = {}) {
  const definition = REPORT_LOOKUP.get(reportId) ?? REPORT_LOOKUP.get('resumo-executivo');
  const normalizedFilters = normalizeReportFilters(filters);
  const builders = {
    'resumo-executivo': buildExecutiveSummaryReport,
    'relatorio-diario': buildDailyReport,
    'vendas-detalhadas': buildSalesDetailReport,
    'demonstrativo-financeiro': buildFinancialStatementReport,
    'stock-baixo': buildLowStockReport,
    'clientes-credito-aberto': buildClientsOpenCreditReport,
    'documentos-emitidos': buildIssuedDocumentsReport,
    'estado-operacional': buildOperationStateReport,
  };

  return builders[definition.id](definition, normalizeData(data), normalizedFilters);
}

function buildDailyReport(definition, data, filters) {
  const rows = filterSales(data.sales, filters);
  return makeReport(definition, filters, {
    kpis: salesKpis(rows),
    columns: salesColumns(),
    rows,
    totals: salesTotals(rows),
  });
}
```

- [ ] **Step 4: Executar os testes do motor**

Run: `node --test tests/reports.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/reports.test.mjs src/data/reports.mjs
git commit -m "refactor: use one inclusive report period"
```

### Task 2: Adicionar o cabeçalho multilinha com migração

**Files:**
- Modify: `tests/invoiceSettings.test.mjs`
- Modify: `tests/invoiceA4.test.mjs`
- Modify: `src/data/invoiceSettings.mjs`
- Modify: `src/data/invoiceA4.mjs`

- [ ] **Step 1: Escrever testes de preservação, migração e view model**

Adicionar em `tests/invoiceSettings.test.mjs`:

```js
test('preserves document header line breaks', () => {
  const result = normalizeInvoiceA4Settings({
    documentHeaderText: 'Empresa Exemplo\nNIF: 500000000\nRua 1',
  });
  assert.equal(result.documentHeaderText, 'Empresa Exemplo\nNIF: 500000000\nRua 1');
});

test('migrates legacy company fields into document header text', () => {
  const result = normalizeInvoiceA4Settings({
    companyName: 'Empresa Antiga',
    companyActivity: 'Comercio',
    pharmacyTaxId: '500000000',
    pharmacyAddress: 'Rua 1',
    pharmacyCity: 'Huambo',
    pharmacyPhone: '923000000',
    pharmacyEmail: 'geral@example.test',
  });
  assert.equal(result.documentHeaderText, [
    'Empresa Antiga',
    'Comercio',
    'NIF: 500000000',
    'Rua 1',
    'Huambo',
    'TEL: 923000000',
    'EMAIL: geral@example.test',
  ].join('\n'));
});
```

Adicionar ao teste do view model em `tests/invoiceA4.test.mjs` a asserção:

```js
assert.equal(viewModel.header.documentHeaderText, settings.documentHeaderText);
assert.equal(viewModel.header.logoDataUrl, branding.logoDataUrl);
```

No objeto esperado pelo teste de normalização, acrescentar `documentHeaderText` com as linhas migradas. Remover expectativas de `viewModel.header.companyName`, `companyActivity`, `taxId`, `companyLines`, `phone` e `email`, pois o contrato passa a expor somente `documentHeaderText` e `logoDataUrl`.

- [ ] **Step 2: Executar os testes e confirmar RED**

Run: `node --test tests/invoiceSettings.test.mjs tests/invoiceA4.test.mjs`

Expected: FAIL porque `documentHeaderText` ainda não existe.

- [ ] **Step 3: Implementar normalização multilinha e fallback legado**

Em `src/data/invoiceSettings.mjs`, adicionar:

```js
function cleanMultilineText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function buildLegacyDocumentHeader(input) {
  return [
    cleanText(input.companyName),
    cleanText(input.companyActivity),
    input.pharmacyTaxId ? `NIF: ${cleanText(input.pharmacyTaxId)}` : '',
    cleanText(input.pharmacyAddress),
    cleanText(input.pharmacyCity),
    input.pharmacyPhone ? `TEL: ${cleanText(input.pharmacyPhone)}` : '',
    input.pharmacyEmail ? `EMAIL: ${cleanText(input.pharmacyEmail)}` : '',
  ].filter(Boolean).join('\n');
}

export const DEFAULT_DOCUMENT_HEADER_TEXT = buildLegacyDocumentHeader({
  companyName: 'KILSYSTEM ANGOLA, LDA',
  companyActivity: 'COMERCIO GERAL - PRESTACAO DE SERVICOS',
  pharmacyTaxId: '500079734',
  pharmacyAddress: 'Largo Kussy N. 07, Cidade Alta-Huambo',
  pharmacyCity: 'HUAMBO - ANGOLA',
  pharmacyPhone: '(244) 923 909 381; 946 353 386',
  pharmacyEmail: 'kilsystemangola@gmail.com',
});
```

Adicionar `documentHeaderText: DEFAULT_DOCUMENT_HEADER_TEXT` ao default e, no retorno de `normalizeInvoiceA4Settings`:

```js
documentHeaderText: cleanMultilineText(input.documentHeaderText)
  || buildLegacyDocumentHeader(input)
  || DEFAULT_DOCUMENT_HEADER_TEXT,
```

Em `src/data/invoiceA4.mjs`, simplificar o cabeçalho do view model:

```js
header: {
  documentHeaderText: settings.documentHeaderText,
  logoDataUrl: branding.logoDataUrl,
},
```

- [ ] **Step 4: Executar os testes de configuração e factura**

Run: `node --test tests/invoiceSettings.test.mjs tests/invoiceA4.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/invoiceSettings.test.mjs tests/invoiceA4.test.mjs src/data/invoiceSettings.mjs src/data/invoiceA4.mjs
git commit -m "feat: add shared multiline document header"
```

### Task 3: Reconfigurar Configurações e o cabeçalho da factura

**Files:**
- Modify: `tests/invoiceA4Component.test.mjs`
- Modify: `src/components/Configuracoes.jsx`
- Modify: `src/components/InvoiceA4.jsx`

- [ ] **Step 1: Escrever testes de fonte para a nova interface**

Atualizar o teste de Configurações:

```js
assert.match(source, /documentHeaderText/);
assert.match(source, /Dados da empresa/);
assert.match(source, /image-picker/);
assert.match(source, /onSaveDocumentHeader/);
assert.doesNotMatch(source, /updateInvoiceSettings\('companyName'/);
assert.doesNotMatch(source, /updateInvoiceSettings\('pharmacyAddress'/);
```

Adicionar ao teste de `InvoiceA4.jsx`:

```js
assert.match(source, /viewModel\.header\.documentHeaderText/);
assert.match(source, /invoice-a4-company-text/);
assert.doesNotMatch(source, /viewModel\.header\.companyLines/);
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/invoiceA4Component.test.mjs`

Expected: FAIL porque a UI ainda usa campos individuais.

- [ ] **Step 3: Salvar texto e logótipo juntos no modal A4**

Em `Configuracoes`, criar um handler que atualiza os dois stores antes de fechar:

```js
function handleSaveDocumentHeader(nextSettings, logoDataUrl) {
  setInvoiceA4Settings(saveStoredInvoiceA4Settings(nextSettings));
  setBranding(saveStoredBranding({ ...branding, logoDataUrl }));
  setActiveSetting(null);
}
```

Passar `onSaveDocumentHeader={handleSaveDocumentHeader}` ao modal. No `handleSave` do modal:

Atualizar também a assinatura para receber a nova propriedade:

```js
function SettingsModal({
  branding,
  invoiceA4Settings,
  setting,
  onClose,
  onSaveBranding,
  onSaveDocumentHeader,
}) {
```

No `handleSave` do modal:

```js
if (setting.id === 'invoiceA4') {
  onSaveDocumentHeader(invoiceSettingsForm, logoPreview);
  return;
}
```

Substituir os sete campos empresariais por:

```jsx
<label className="settings-document-header-field">
  <span>Dados da empresa</span>
  <textarea
    value={invoiceSettingsForm.documentHeaderText}
    onChange={(event) => updateInvoiceSettings('documentHeaderText', event.target.value)}
    placeholder="Nome da empresa\nActividade\nNIF\nEndereço\nContactos"
  />
</label>
<label className="image-picker settings-document-logo">
  <span className={logoPreview ? 'image-preview' : 'image-preview empty'}>
    {logoPreview ? <img src={logoPreview} alt="Pré-visualização do logótipo" /> : <ImagePlus size={34} />}
  </span>
  <input type="file" accept="image/*" onChange={previewLogo} />
  <strong>Inserir logótipo</strong>
</label>
```

- [ ] **Step 4: Renderizar o texto preservado na factura**

Em `InvoiceA4.jsx`, substituir o conteúdo empresarial por:

```jsx
<section className="invoice-a4-company">
  {viewModel.header.logoDataUrl ? (
    <img className="invoice-a4-company-logo" src={viewModel.header.logoDataUrl} alt="" />
  ) : null}
  <p className="invoice-a4-company-text">{viewModel.header.documentHeaderText}</p>
</section>
```

- [ ] **Step 5: Executar os testes da interface documental**

Run: `node --test tests/invoiceA4Component.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/invoiceA4Component.test.mjs src/components/Configuracoes.jsx src/components/InvoiceA4.jsx
git commit -m "feat: configure shared document header"
```

### Task 4: Simplificar a central e o A4 de relatórios

**Files:**
- Modify: `tests/reportUiSource.test.mjs`
- Modify: `src/components/Relatorios.jsx`
- Modify: `src/components/ReportA4.jsx`

- [ ] **Step 1: Escrever testes de fonte para dois campos e A4 limpo**

Em `tests/reportUiSource.test.mjs`, substituir as expectativas antigas por:

```js
assert.match(source, /className="report-period-control"/);
assert.match(source, /aria-label="Data inicial"/);
assert.match(source, /aria-label="Data final"/);
assert.doesNotMatch(source, /compareStartDate/);
assert.doesNotMatch(source, /compareEndDate/);
assert.doesNotMatch(source, /paymentMethod/);
assert.doesNotMatch(source, /report-comparison-strip/);
```

Para `ReportA4.jsx`:

```js
assert.match(source, /report-a4-data-title/);
assert.match(source, /documentHeaderText/);
assert.doesNotMatch(source, /report-a4-filters/);
assert.doesNotMatch(source, /report-a4-comparison/);
assert.doesNotMatch(source, /report-a4-kpis/);
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/reportUiSource.test.mjs`

Expected: FAIL porque os filtros e blocos antigos continuam presentes.

- [ ] **Step 3: Reduzir o estado e criar o controle compacto**

Em `Relatorios.jsx`, manter no default visível:

```js
const DEFAULT_FILTERS = {
  startDate: '2026-06-01',
  endDate: '2026-06-15',
};
```

Remover `Search`, `RefreshCcw`, `isDailyReport`, selects e a barra superior. Dentro de `report-result-header`, renderizar:

```jsx
<div className="report-period-control" aria-label="Período do relatório">
  <label>
    <span>Data inicial</span>
    <input
      aria-label="Data inicial"
      type="date"
      value={filters.startDate}
      onChange={(event) => updateFilter('startDate', event.target.value)}
    />
  </label>
  <label>
    <span>Data final</span>
    <input
      aria-label="Data final"
      type="date"
      value={filters.endDate}
      onChange={(event) => updateFilter('endDate', event.target.value)}
    />
  </label>
</div>
```

Usar a descrição `Operações de ${report.filters.startDate} até ${report.filters.endDate}.` e usar as datas normalizadas no nome do CSV.

- [ ] **Step 4: Simplificar o documento A4**

Em `ReportA4.jsx`, renderizar o cabeçalho e conteúdo sem filtros/KPIs:

```jsx
<header className="report-a4-header">
  <section className="report-a4-company">
    {branding.logoDataUrl ? <img className="report-a4-logo" src={branding.logoDataUrl} alt="" /> : null}
    <p className="report-a4-company-text">{settings.documentHeaderText}</p>
  </section>
  <section className="report-a4-document-box">
    <span>Relatório</span>
    <h2>{report.title}</h2>
    <small>{report.filters.startDate} — {report.filters.endDate}</small>
  </section>
</header>
<h2 className="report-a4-data-title">{report.title}</h2>
<table className="report-a4-table">
  <thead>
    <tr>{report.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
  </thead>
  <tbody>
    {report.rows.map((row, index) => (
      <tr key={`${report.id}-${index}`}>
        {report.columns.map((column) => (
          <td key={column.key}>{formatCell(row[column.key], column.type)}</td>
        ))}
      </tr>
    ))}
  </tbody>
</table>
```

- [ ] **Step 5: Executar testes da central**

Run: `node --test tests/reportUiSource.test.mjs tests/reports.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/reportUiSource.test.mjs src/components/Relatorios.jsx src/components/ReportA4.jsx
git commit -m "refactor: simplify report center and print document"
```

### Task 5: Aplicar densidade visual e eliminar scroll horizontal

**Files:**
- Modify: `tests/reportUiSource.test.mjs`
- Modify: `src/assets/tailwind.css`
- Generate: `src/assets/output.css`

- [ ] **Step 1: Escrever testes CSS específicos**

Adicionar em `tests/reportUiSource.test.mjs`:

```js
assert.match(css, /\.report-center\s*\{[^}]*overflow-x:\s*hidden/s);
assert.match(css, /\.report-center\s*\{[^}]*overflow-y:\s*auto/s);
assert.match(css, /\.report-period-control\s*\{[^}]*width:\s*max-content/s);
assert.match(css, /\.report-table-panel\s*\{[^}]*overflow-x:\s*hidden/s);
assert.match(css, /\.report-a4-company-text\s*\{[^}]*white-space:\s*pre-line/s);
assert.match(css, /\.invoice-a4-company-text\s*\{[^}]*white-space:\s*pre-line/s);
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/reportUiSource.test.mjs`

Expected: FAIL porque os estilos compactos ainda não existem.

- [ ] **Step 3: Implementar estilos compactos e responsivos**

Em `src/assets/tailwind.css`, substituir regras antigas de workbar/comparação e adicionar:

```css
.report-center {
  gap: 10px;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.report-period-control {
  width: max-content;
  max-width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(132px, 160px));
  gap: 8px;
  margin-top: 10px;
}

.report-period-control label {
  display: grid;
  gap: 3px;
  color: var(--muted);
  font-size: 11px;
}

.report-period-control input {
  min-height: 34px;
  padding: 6px 8px;
  font-size: 12px;
}

.report-catalog {
  overflow-x: hidden;
  overflow-y: auto;
}

.report-table-panel {
  overflow-x: hidden;
  overflow-y: visible;
}

.report-table-panel table {
  width: 100%;
  table-layout: fixed;
  font-size: 12px;
}

.report-table-panel th,
.report-table-panel td {
  padding: 6px 8px;
  overflow-wrap: anywhere;
}

.invoice-a4-company-text,
.report-a4-company-text {
  margin: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.report-a4-data-title {
  margin: 10px 0 5px;
  font-size: 11px;
  font-weight: 600;
}

.report-a4-page {
  font-size: 9px;
  line-height: 1.2;
}

.report-a4-table {
  margin-top: 0;
  font-size: 8px;
}

.report-a4-table th,
.report-a4-table td {
  padding: 3px 4px;
}
```

No breakpoint de 820px, usar:

```css
.report-period-control {
  width: 100%;
  grid-template-columns: 1fr;
}
```

- [ ] **Step 4: Gerar CSS e executar testes**

Run: `npm run build:tailwind`

Expected: `src/assets/output.css` atualizado sem erro.

Run: `node --test tests/reportUiSource.test.mjs tests/invoiceA4Component.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/reportUiSource.test.mjs src/assets/tailwind.css src/assets/output.css
git commit -m "style: compact report pages and vertical scrolling"
```

### Task 6: Verificação integrada e inspeção visual

**Files:**
- Modify only if a verification failure reveals a defect in the files already listed.

- [ ] **Step 1: Executar toda a suíte**

Run: `npm test`

Expected: todos os testes passam, sem falhas ou avisos inesperados.

- [ ] **Step 2: Compilar CSS e aplicação**

Run: `npm run build:tailwind`

Expected: exit code 0.

Run: `npm run build`

Expected: build Vite concluído com exit code 0.

- [ ] **Step 3: Verificar a central no navegador**

Abrir a aplicação local e confirmar:

```text
1. O catálogo não contém “Diferença entre datas”.
2. Apenas Data inicial e Data final aparecem como filtros.
3. O controle de período é compacto.
4. Cada relatório mostra o próprio título.
5. Não existe scroll horizontal em 1366 × 768 nem em 820 px de largura.
6. O scroll vertical alcança todas as linhas e itens do catálogo.
```

- [ ] **Step 4: Verificar Configurações e impressão**

Confirmar manualmente:

```text
1. O textarea preserva pelo menos três quebras de linha após guardar e reabrir.
2. O logótipo salvo aparece na factura e no relatório.
3. Factura e relatório mostram o mesmo texto empresarial.
4. O A4 do relatório não mostra filtros, comparação nem cartões KPI.
5. Cabeçalho, título, tabela e rodapé permanecem dentro da folha A4.
6. A tabela usa fonte e espaçamento menores que a tela anterior.
```

- [ ] **Step 5: Executar verificação final depois de qualquer ajuste visual**

Run: `npm test && npm run build:tailwind && npm run build`

Expected: todos os comandos terminam com exit code 0.

- [ ] **Step 6: Commit final, somente se a inspeção exigiu ajustes**

```bash
git add src tests
git commit -m "fix: finalize report layout verification"
```

import { createRequire } from 'node:module';
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
  const { CATALOG_DEFINITIONS } = createRequire(import.meta.url)(
    '../src/backend/services/configurationRegistry.js',
  );
  const nameOf = (catalog, code) =>
    CATALOG_DEFINITIONS[catalog].options.find((option) => option.code === code)?.name;
  assert.equal(nameOf('financial_entry_types', 'expense'), 'Despesa');
  assert.equal(nameOf('financial_entry_types', 'revenue'), 'Receita');
  assert.equal(nameOf('financial_entry_types', 'loss'), 'Perda');
  assert.equal(nameOf('document_types', 'credito'), 'Crédito');
  assert.equal(nameOf('document_types', 'nota-credito'), 'Nota de crédito');

  const editor = await readFile(
    'src/components/settings/CatalogEditor.jsx',
    'utf8',
  );
  // O editor mostra o nome traduzido que vem do registo (verificado acima).
  assert.match(editor, /<span>\{option\.name\}<\/span>/);
});

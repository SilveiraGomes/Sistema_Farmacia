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
  const registry = await readFile(
    'src/backend/services/configurationRegistry.js',
    'utf8',
  );
  assert.match(registry, /technicalNamed\(\{\s*expense:\s*'Despesa'/s);
  assert.match(registry, /revenue:\s*'Receita'/);
  assert.match(registry, /loss:\s*'Perda'/);
  assert.match(registry, /credito:\s*'Crédito'/);
  assert.match(registry, /'nota-credito':\s*'Nota de crédito'/);

  const editor = await readFile(
    'src/components/settings/CatalogEditor.jsx',
    'utf8',
  );
  assert.match(editor, /financial_entry_types:[\s\S]*expense:\s*'Despesa'/);
  assert.match(editor, /document_types:[\s\S]*credito:\s*'Crédito'/);
});

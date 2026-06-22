import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Configuracoes is inline and uses accessible settings components', async () => {
  const source = await readFile('src/components/Configuracoes.jsx', 'utf8');
  assert.match(source, /SettingsSectionNav/);
  assert.match(source, /CatalogEditor/);
  assert.match(source, /SettingField/);
  assert.match(source, /useSettings/);
  assert.match(source, /configuration\.updateSection/);
  assert.doesNotMatch(source, /modal-backdrop/);
  assert.doesNotMatch(source, /SettingsModal/);
});

test('CatalogEditor supports the complete inline lifecycle', async () => {
  const source = await readFile('src/components/settings/CatalogEditor.jsx', 'utf8');
  assert.match(source, /aria-label="Adicionar opcao"/);
  assert.match(source, /aria-label="Editar opcao"/);
  assert.match(source, /'Desativar opcao'/);
  assert.match(source, /'Ativar opcao'/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /ArrowDown/);
  assert.match(source, /title=/);
  assert.doesNotMatch(source, /<strong>/);
});

test('settings styles expose inline layout and keyboard tooltips', async () => {
  const css = await readFile('src/assets/tailwind.css', 'utf8');
  assert.match(css, /\.settings-layout/);
  assert.match(css, /\.catalog-row/);
  assert.match(css, /:focus-within/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('stock category cards keep long names inside their card', async () => {
  const source = await readFile(new URL('../src/assets/tailwind.css', import.meta.url), 'utf8');
  const cardRule = source.match(/\.stock-category-card\s*\{[^}]+\}/)?.[0] ?? '';
  const contentRule = source.match(/\.stock-category-card div\s*\{[^}]+\}/)?.[0] ?? '';
  const titleRule = source.match(/\.stock-category-card h3\s*\{[^}]+\}/)?.[0] ?? '';

  assert.match(cardRule, /overflow:\s*hidden;/);
  assert.match(contentRule, /min-width:\s*0;/);
  assert.match(titleRule, /overflow:\s*hidden;/);
  assert.match(titleRule, /text-overflow:\s*ellipsis;/);
  assert.match(titleRule, /white-space:\s*nowrap;/);
});

test('login refocuses and resets password when user selection changes', async () => {
  const source = await readFile(new URL('../src/components/Login.jsx', import.meta.url), 'utf8');

  assert.match(source, /useRef/);
  assert.match(source, /passwordInputRef\s*=\s*useRef\(null\)/);
  assert.match(source, /function focusPasswordField/);
  assert.match(source, /PASSWORD_FOCUS_DELAYS\s*=\s*\[0,\s*80,\s*250,\s*600\]/);
  assert.match(source, /window\.focus\?\.\(\)/);
  assert.match(source, /focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /window\.addEventListener\(["']focus["'],\s*focus\)/);
  assert.match(source, /document\.addEventListener\(["']visibilitychange["'],\s*onVisible\)/);
  assert.match(source, /window\.removeEventListener\(["']focus["'],\s*focus\)/);
  assert.match(source, /document\.removeEventListener\(["']visibilitychange["'],\s*onVisible\)/);
  // Ao trocar de utilizador: limpa a senha, oculta-a e volta a focar o campo.
  assert.match(source, /onChange=\{\(e\) => \{ setUsername\(e\.target\.value\); setPassword\(["']{2}\);[^}]*setIsPasswordVisible\(false\); focusPasswordField\(\); \}\}/);
  assert.match(source, /ref=\{passwordInputRef\}/);
});

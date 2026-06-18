import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('operation context exposes provider, hook, and IPC route actions', async () => {
  const source = await readFile(new URL('../src/operation/OperationContext.jsx', import.meta.url), 'utf8');

  assert.match(source, /import\s+\{\s*request\s*\}\s+from\s+['"]\.\.\/services\/ipcClient['"]/);
  assert.match(source, /export function OperationProvider\(\{ children \}\)/);
  assert.match(source, /export function useOperation\(\)/);

  for (const routeName of [
    'operation.state',
    'operation.openDay',
    'operation.closeDay',
    'operation.openShift',
    'operation.closeShift',
  ]) {
    assert.match(source, new RegExp(routeName.replace('.', '\\.')));
  }
});

test('app root is wrapped with the operation provider', async () => {
  const source = await readFile(new URL('../src/index.jsx', import.meta.url), 'utf8');

  assert.match(source, /import\s+\{\s*OperationProvider\s*\}\s+from\s+['"]\.\/operation\/OperationContext['"]/);
  assert.match(source, /<ConfirmationProvider>\s*<OperationProvider>\s*<App\s*\/>\s*<\/OperationProvider>\s*<\/ConfirmationProvider>/s);
});

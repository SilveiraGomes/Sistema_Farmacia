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

test('authenticated app is wrapped with the operation provider', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

  assert.match(source, /import\s+\{\s*OperationProvider\s*\}\s+from\s+['"]\.\/operation\/OperationContext['"]/);
  assert.match(source, /if\s*\(!user\)[\s\S]*return <Login \/>[\s\S]*<OperationProvider>/);
});

test('operation provider refreshes from authenticated session state', async () => {
  const source = await readFile(new URL('../src/operation/OperationContext.jsx', import.meta.url), 'utf8');

  assert.match(source, /import\s+\{\s*useAuth\s*\}\s+from\s+['"]\.\.\/auth\/AuthContext['"]/);
  assert.match(source, /const\s+\{\s*user,\s*mustChangePassword\s*\}\s*=\s*useAuth\(\)/);
  assert.match(source, /if\s+\(!user\s+\|\|\s+mustChangePassword\)/);
});

test('operation screen is routed and available in navigation', async () => {
  const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const navSource = await readFile(new URL('../src/components/Navbar.jsx', import.meta.url), 'utf8');
  const operationSource = await readFile(new URL('../src/components/Operacao.jsx', import.meta.url), 'utf8');

  assert.match(appSource, /import Operacao from '\.\/components\/Operacao'/);
  assert.match(appSource, /operacao:\s*'Operacao'/);
  assert.match(appSource, /operacao:\s*'operacao\.ver'/);
  assert.match(appSource, /case 'operacao':\s*return <Operacao \/>;/s);
  assert.match(navSource, /CalendarClock/);
  assert.match(navSource, /id:\s*'operacao',\s*label:\s*'Operacao',\s*icon:\s*CalendarClock,\s*permission:\s*'operacao\.ver'/);

  assert.match(operationSource, /function Operacao\(\)/);
  assert.match(operationSource, /const operation = useOperation\(\)/);
  assert.match(operationSource, /hasPermission\('operacao\.abrir_dia'\)/);
  assert.match(operationSource, /hasPermission\('operacao\.abrir_turno'\)/);
  assert.match(operationSource, /hasPermission\('operacao\.fechar_turno'\)/);
  assert.match(operationSource, /hasPermission\('operacao\.fechar_dia'\)/);
  assert.match(operationSource, /operation\.openDay/);
  assert.match(operationSource, /operation\.openShift/);
  assert.match(operationSource, /operation\.closeShift/);
  assert.match(operationSource, /operation\.closeDay/);
});

test('Vendas and Financeiro block critical actions without an open operation session', async () => {
  const vendasSource = await readFile(new URL('../src/components/Vendas.jsx', import.meta.url), 'utf8');
  const financeiroSource = await readFile(new URL('../src/components/Financeiro.jsx', import.meta.url), 'utf8');

  assert.match(vendasSource, /import \{ useOperation \} from '\.\.\/operation\/OperationContext'/);
  assert.match(vendasSource, /const operation = useOperation\(\)/);
  assert.match(vendasSource, /if \(!operation\.canOperate\) return;/);
  assert.match(vendasSource, /disabled=\{!canOperate \|\| !cart\.length\}/);
  assert.match(vendasSource, /operation-blocked-banner/);

  assert.match(financeiroSource, /import \{ useOperation \} from '\.\.\/operation\/OperationContext'/);
  assert.match(financeiroSource, /const operation = useOperation\(\)/);
  assert.match(financeiroSource, /if \(!operation\.canOperate\) return;/);
  assert.match(financeiroSource, /disabled=\{!operation\.canOperate\}/);
  assert.match(financeiroSource, /operation-blocked-banner/);
});

test('Dashboard surfaces current operation state', async () => {
  const source = await readFile(new URL('../src/components/Dashboard.jsx', import.meta.url), 'utf8');

  assert.match(source, /import \{ useOperation \} from ["']\.\.\/operation\/OperationContext["']/);
  assert.match(source, /const operation = useOperation\(\)/);
  assert.match(source, /Estado operacional/);
  assert.match(source, /operation\.canOperate/);
  assert.match(source, /operation\.shift\?\.nome/);
});

test('operation screen and blocked-action styles are defined', async () => {
  const source = await readFile(new URL('../src/assets/tailwind.css', import.meta.url), 'utf8');

  assert.match(source, /\.operation-screen/);
  assert.match(source, /\.operation-state-grid/);
  assert.match(source, /\.operation-command-grid/);
  assert.match(source, /\.operation-actions/);
  assert.match(source, /\.operation-blocked-banner/);
  assert.match(source, /\.operation-notice/);
});

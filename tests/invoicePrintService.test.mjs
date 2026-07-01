import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function waitFor(predicate, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function installElectronMock(electronMock) {
  const Module = require('module');
  const originalLoad = Module._load;

  Module._load = function mockedLoad(request, parent, isMain) {
    if (request === 'electron') return electronMock;
    return originalLoad.call(this, request, parent, isMain);
  };

  return () => { Module._load = originalLoad; };
}

test('printDirect waits for Electron print callback before closing the render window', async () => {
  let printCallback;
  let destroyed = false;
  let printCalled = false;

  class MockBrowserWindow {
    constructor() {
      this.webContents = {
        executeJavaScript: async (script) => {
          if (script.includes('bodyHeight')) {
            return { bodyHeight: 1200, bodyWidth: 800, bodyTextLength: 20 };
          }
          return true;
        },
        print: (_options, callback) => {
          printCalled = true;
          printCallback = callback;
        },
      };
    }

    async loadFile() {}
    showInactive() {}
    destroy() { destroyed = true; }
  }

  const restoreElectron = installElectronMock({
    BrowserWindow: MockBrowserWindow,
    screen: {
      getAllDisplays: () => [{ bounds: { x: 0, y: 0, width: 1024, height: 768 } }],
    },
  });

  const servicePath = require.resolve('../src/backend/services/invoicePrintService.js');
  delete require.cache[servicePath];
  const service = require(servicePath);

  try {
    const printPromise = service.printDirect(
      {
        document: { title: 'Factura', number: 'FR/1', issueDate: '2026-06-26' },
        header: {},
        client: {},
        items: [],
        totals: {},
        settings: {},
        footer: {},
      },
      { printerName: 'EPSON L3150 Series', copies: 1 },
    );

    await waitFor(() => printCalled);

    assert.equal(printCalled, true);
    assert.equal(typeof printCallback, 'function');
    assert.equal(destroyed, false);

    printCallback(true, '');
    const result = await printPromise;

    assert.deepEqual(result, { success: true });
    assert.equal(destroyed, true);
  } finally {
    restoreElectron();
  }
});

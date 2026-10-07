import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { setupAutoUpdateService } = require('../src/backend/services/updateService');

function fixture(responses = [0, 1]) {
  const updater = new EventEmitter();
  updater.checks = 0;
  updater.downloads = 0;
  updater.installs = 0;
  updater.checkForUpdates = async () => { updater.checks += 1; };
  updater.downloadUpdate = async () => { updater.downloads += 1; };
  updater.quitAndInstall = (...args) => { updater.installs += 1; updater.installArgs = args; };
  const messages = [];
  const dialog = {
    async showMessageBox(_window, options) {
      messages.push(options);
      return { response: responses.shift() ?? 1 };
    },
  };
  return { updater, dialog, messages };
}

test('packaged app checks GitHub and asks before downloading', async () => {
  const { updater, dialog, messages } = fixture([0]);
  const cleanup = setupAutoUpdateService({
    app: { isPackaged: true }, autoUpdater: updater, dialog,
    getMainWindow: () => ({ id: 1 }), checkIntervalMs: 60_000,
    logger: { warn() {} },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(updater.checks, 1);
  assert.equal(updater.autoDownload, false);
  updater.emit('update-available', { version: '1.0.2' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(updater.downloads, 1);
  assert.match(messages[0].message, /1\.0\.2/);
  cleanup();
  assert.equal(updater.listenerCount('update-available'), 0);
});

test('downloaded update offers restart and remains installable on quit', async () => {
  const { updater, dialog, messages } = fixture([0]);
  const cleanup = setupAutoUpdateService({
    app: { isPackaged: true }, autoUpdater: updater, dialog,
    getMainWindow: () => ({}), checkIntervalMs: 60_000,
    logger: { warn() {} },
  });
  updater.emit('update-downloaded', { version: '1.0.2' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(updater.autoInstallOnAppQuit, true);
  assert.equal(updater.installs, 1);
  assert.deepEqual(updater.installArgs, [false, true]);
  assert.equal(messages[0].title, 'Actualização pronta');
  cleanup();
});

test('development app does not contact the release server', () => {
  const { updater, dialog } = fixture();
  const cleanup = setupAutoUpdateService({
    app: { isPackaged: false }, autoUpdater: updater, dialog, getMainWindow: () => ({}),
  });
  assert.equal(updater.checks, 0);
  cleanup();
});

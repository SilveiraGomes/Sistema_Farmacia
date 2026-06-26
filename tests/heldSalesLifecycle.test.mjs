import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, syncDatabaseSchema } = require('../src/backend/database.js');
const heldSalesService = require('../src/backend/services/heldSalesService.js');

async function withDatabase(run) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-held-sales-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');
  try {
    await syncDatabaseSchema(db);
    await run();
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

test('held sales service clears the waiting clients queue', async () => {
  await withDatabase(async () => {
    await heldSalesService.save([{ number: 'ESP-1', client: 'Consumidor Final' }]);

    assert.equal(await heldSalesService.count(), 1);

    await heldSalesService.clear();

    assert.deepEqual(await heldSalesService.load(), []);
    assert.equal(await heldSalesService.count(), 0);
  });
});

test('Electron startup and shutdown clear held sales from previous sessions', async () => {
  const source = await readFile(new URL('../main.js', import.meta.url), 'utf8');

  assert.match(source, /heldSalesService/);
  assert.match(source, /await heldSalesService\.clear\(\)/);
  assert.match(source, /app\.on\(["']will-quit["']/);
  assert.match(source, /heldSalesService\.clear\(\)\.catch/);
});

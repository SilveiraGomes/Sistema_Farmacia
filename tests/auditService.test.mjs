import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, syncDatabaseSchema, getModels } = require('../src/backend/database.js');
const { recordUserAudit } = require('../src/backend/services/auditService.js');

async function withModels(run) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-audit-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');
  try {
    await syncDatabaseSchema(db);
    await run(getModels());
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

test('recordUserAudit stores generic details when serialization fails', async () => {
  await withModels(async () => {
    const details = {};
    details.self = details;

    const audit = await recordUserAudit({
      action: 'teste.circular',
      details,
    });

    assert.equal(audit.detalhes, '{"serializationError":true}');
  });
});

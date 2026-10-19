import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const database = require('../src/backend/database.js');
const { createConfigurationService } = require('../src/backend/services/configurationService.js');

test('notas de crédito são numeradas em sequência pela série "nota-credito"', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kil-fiscal-'));
  const log = console.log;
  console.log = () => {};
  let db;
  try {
    db = await database.connectDB({ getPath: () => dir }, 'development');
    await database.syncDatabaseSchema(db);
    console.log = log;
    const service = createConfigurationService({ db, models: database.getModels() });
    await service.seedDefaults();

    await assert.rejects(
      service.reserveNextDocumentNumber({ actorUserId: 1, documentType: 'nota_credito' }),
      /Tipo de documento fiscal não suportado/,
    );
    const year = String(new Date().getFullYear()).slice(-2);
    const numbers = [];
    for (let i = 0; i < 3; i++) {
      numbers.push(await service.reserveNextDocumentNumber({ actorUserId: 1, documentType: 'nota-credito' }));
    }
    assert.deepEqual(numbers, [`NC00001/${year}`, `NC00002/${year}`, `NC00003/${year}`]);
  } finally {
    console.log = log;
    await db?.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

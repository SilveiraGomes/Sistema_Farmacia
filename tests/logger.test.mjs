import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const logger = require('../src/backend/logger.js');

test('registo em ficheiro: guarda erros e avisos da consola e apaga ficheiros antigos', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kil-logs-'));
  try {
    const logsDir = join(dir, 'logs');
    // Ficheiro antigo (20 dias) criado antes do arranque: deve ser apagado.
    const { mkdirSync } = await import('node:fs');
    mkdirSync(logsDir, { recursive: true });
    const old = join(logsDir, 'kilsystem-2026-01-01.log');
    writeFileSync(old, 'antigo');
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    utimesSync(old, twentyDaysAgo, twentyDaysAgo);

    assert.equal(logger.initLogger(dir, { appVersion: '9.9.9' }), logsDir);
    assert.equal(existsSync(old), false);

    const originalError = process.stderr.write;
    process.stderr.write = () => true; // silenciar a saída do teste
    try {
      console.error('Falha de teste', new Error('detalhe do erro'));
      console.warn('Aviso de teste');
    } finally {
      process.stderr.write = originalError;
    }

    const [file] = readdirSync(logsDir);
    assert.match(file, /^kilsystem-\d{4}-\d{2}-\d{2}\.log$/);
    const content = readFileSync(join(logsDir, file), 'utf8');
    assert.match(content, /KILSYSTEM PHARMACY 9\.9\.9 a iniciar/);
    assert.match(content, /\[ERRO\] Falha de teste detalhe do erro/);
    assert.match(content, /\[AVISO\] Aviso de teste/);
    assert.equal(logger.getLogDirectory(), logsDir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

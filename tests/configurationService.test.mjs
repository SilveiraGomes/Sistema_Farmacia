import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { createRequire } from 'node:module';
import { Sequelize } from 'sequelize';

const require = createRequire(import.meta.url);
const { defineModels } = require('../src/backend/database');
const {
  SETTING_DEFINITIONS,
  CATALOG_DEFINITIONS,
} = require('../src/backend/services/configurationRegistry');
const {
  CONFIGURATION_ERROR_CODES,
  createConfigurationService,
} = require('../src/backend/services/configurationService');

describe('configurationService', () => {
  let db;
  let models;
  let service;
  let actor;

  beforeEach(async () => {
    db = new Sequelize('sqlite::memory:', { logging: false });
    models = defineModels(db);
    await db.sync({ force: true });
    actor = await models.Usuario.create({
      nome_usuario: 'config-admin',
      senha_hash: 'test-only',
      nome_completo: 'Configuration Admin',
    });
    service = createConfigurationService({
      db,
      models,
      now: () => new Date('2026-06-19T00:00:00.000Z'),
    });
  });

  afterEach(async () => {
    await db.close();
  });

  test('seedDefaults is idempotent and preserves customized settings and catalog options', async () => {
    await service.seedDefaults();
    const setting = await models.ConfiguracaoSistema.findOne({
      where: { chave: 'sales.defaultTaxRate' },
    });
    await setting.update({ valor_json: '14', versao: 9 });
    const option = await models.OpcaoCatalogo.findOne({
      where: { catalogo: 'payment_methods', codigo: 'dinheiro' },
    });
    await option.update({ nome: 'Numerario personalizado', ativo: false, versao: 4 });

    await service.seedDefaults();

    assert.equal(await models.ConfiguracaoSistema.count(), Object.keys(SETTING_DEFINITIONS).length);
    assert.equal(
      await models.OpcaoCatalogo.count(),
      Object.values(CATALOG_DEFINITIONS).reduce((total, catalog) => total + catalog.options.length, 0),
    );
    await setting.reload();
    await option.reload();
    assert.deepEqual([setting.valor_json, setting.versao], ['14', 9]);
    assert.deepEqual([option.nome, option.ativo, option.versao], ['Numerario personalizado', false, 4]);
  });

  test('getSnapshot groups settings, catalogs and editable/system definitions', async () => {
    await service.seedDefaults();
    const snapshot = await service.getSnapshot();

    assert.equal(snapshot.settings.sales.defaultTaxRate.value, 0);
    assert.equal(snapshot.settings.sales.defaultTaxRate.key, 'sales.defaultTaxRate');
    assert.equal(snapshot.settings.sales.defaultTaxRate.version, 1);
    assert.ok(snapshot.settings.sales.defaultTaxRate.updatedAt);
    assert.deepEqual(
      Object.keys(snapshot.catalogs.payment_methods[0]).sort(),
      ['active', 'code', 'id', 'metadata', 'metadataReadable', 'name', 'order', 'system', 'version'].sort(),
    );
    assert.equal(snapshot.definitions.catalogs.payment_methods.editable, true);
    assert.equal(snapshot.definitions.catalogs.document_types.editable, false);
    assert.equal(snapshot.definitions.catalogs.document_types.system, true);
    assert.equal(snapshot.definitions.settings['sales.defaultTaxRate'].group, 'sales');
    assert.equal(snapshot.migrations.legacyLocalStoragePending, true);
  });

  test('getSnapshot safely falls back to the registered default for corrupt JSON', async () => {
    await service.seedDefaults();
    await models.ConfiguracaoSistema.update(
      { valor_json: '{broken' },
      { where: { chave: 'sales.defaultTaxRate' } },
    );

    const snapshot = await service.getSnapshot();
    assert.equal(snapshot.settings.sales.defaultTaxRate.value, 0);
    assert.equal(snapshot.settings.sales.defaultTaxRate.readable, false);
  });

  test('getSnapshot falls back for valid JSON with the wrong semantic type and invalid metadata', async () => {
    await service.seedDefaults();
    await models.ConfiguracaoSistema.update(
      { valor_json: '"not-a-number"' },
      { where: { chave: 'sales.defaultTaxRate' } },
    );
    await models.OpcaoCatalogo.update(
      { metadados_json: '[]' },
      { where: { catalogo: 'payment_methods', codigo: 'dinheiro' } },
    );

    const snapshot = await service.getSnapshot();
    assert.equal(snapshot.settings.sales.defaultTaxRate.value, 0);
    assert.equal(snapshot.settings.sales.defaultTaxRate.readable, false);
    assert.deepEqual(snapshot.catalogs.payment_methods[0].metadata, {});
    assert.equal(snapshot.catalogs.payment_methods[0].metadataReadable, false);
  });

  test('updateSection updates atomically, increments versions and audits old/new values', async () => {
    await service.seedDefaults();
    const snapshot = await service.updateSection({
      actorUserId: actor.id,
      section: 'sales',
      values: { 'sales.defaultTaxRate': 14, 'sales.finalConsumerLabel': ' Cliente final ' },
      expectedVersions: { 'sales.defaultTaxRate': 1, 'sales.finalConsumerLabel': 1 },
    });

    assert.equal(snapshot.settings.sales.defaultTaxRate.value, 14);
    assert.equal(snapshot.settings.sales.defaultTaxRate.version, 2);
    assert.equal(snapshot.settings.sales.finalConsumerLabel.value, 'Cliente final');
    const audits = await models.AuditoriaConfiguracao.findAll({ order: [['id', 'ASC']] });
    assert.equal(audits.length, 2);
    assert.deepEqual(JSON.parse(audits[0].valor_anterior_json), 0);
    assert.deepEqual(JSON.parse(audits[0].valor_novo_json), 14);
    assert.equal(audits[0].ator_usuario_id, actor.id);
    assert.equal(audits[0].tipo_alvo, 'setting');
    assert.equal(audits[0].acao, 'update');
  });

  test('updateSection rejects stale versions with a safe conflict error', async () => {
    await service.seedDefaults();
    await assert.rejects(
      service.updateSection({
        actorUserId: actor.id,
        section: 'sales',
        values: { 'sales.defaultTaxRate': 14 },
        expectedVersions: { 'sales.defaultTaxRate': 0 },
      }),
      (error) => error.code === CONFIGURATION_ERROR_CODES.CONFLICT
        && error.message === 'Configuração alterada por outra sessão.',
    );
    assert.equal(await models.AuditoriaConfiguracao.count(), 0);
  });

  test('updateSection rolls back setting changes and audits after a mid-transaction failure', async () => {
    await service.seedDefaults();
    const originalCreate = models.AuditoriaConfiguracao.create;
    models.AuditoriaConfiguracao.create = async () => {
      throw new Error('injected audit failure');
    };
    try {
      await assert.rejects(service.updateSection({
        actorUserId: actor.id,
        section: 'sales',
        values: { 'sales.defaultTaxRate': 14, 'sales.maxDiscount': 10 },
        expectedVersions: { 'sales.defaultTaxRate': 1, 'sales.maxDiscount': 1 },
      }), /injected audit failure/);
    } finally {
      models.AuditoriaConfiguracao.create = originalCreate;
    }
    const rows = await models.ConfiguracaoSistema.findAll({
      where: { chave: ['sales.defaultTaxRate', 'sales.maxDiscount'] },
      order: [['chave', 'ASC']],
    });
    assert.deepEqual(rows.map((row) => [row.chave, row.valor_json, row.versao]), [
      ['sales.defaultTaxRate', '0', 1],
      ['sales.maxDiscount', '580.2', 1],
    ]);
    assert.equal(await models.AuditoriaConfiguracao.count(), 0);
  });

  test('updateSection rejects unknown and cross-section keys', async () => {
    await service.seedDefaults();
    for (const key of ['unknown.key', 'stock.lowStockThreshold']) {
      await assert.rejects(service.updateSection({
        actorUserId: actor.id,
        section: 'sales',
        values: { [key]: 10 },
        expectedVersions: { [key]: 1 },
      }), (error) => error.code === CONFIGURATION_ERROR_CODES.VALIDATION);
    }
  });

  test('reserveNextDocumentNumber serializes concurrent reservations and audits each one', async () => {
    await service.seedDefaults();
    const fiscal = await models.ConfiguracaoSistema.findOne({ where: { chave: 'documents.fiscal' } });
    const configured = JSON.parse(fiscal.valor_json);
    configured.series.factura = { prefix: 'FAC', year: '26', nextNumber: 7, padding: 3 };
    await fiscal.update({ valor_json: JSON.stringify(configured) });

    const numbers = await Promise.all([
      service.reserveNextDocumentNumber({ actorUserId: actor.id, documentType: 'factura' }),
      service.reserveNextDocumentNumber({ actorUserId: actor.id, documentType: 'factura' }),
    ]);

    assert.deepEqual(numbers, ['FAC007/26', 'FAC008/26']);
    await fiscal.reload();
    assert.equal(JSON.parse(fiscal.valor_json).series.factura.nextNumber, 9);
    assert.equal(fiscal.versao, 3);
    const audits = await models.AuditoriaConfiguracao.findAll({ where: { acao: 'reserve' } });
    assert.equal(audits.length, 2);
  });

  test('reserveNextDocumentNumber resets the sequence on an injected year rollover', async () => {
    service = createConfigurationService({
      db,
      models,
      now: () => new Date('2027-01-02T00:00:00.000Z'),
    });
    await service.seedDefaults();
    const fiscal = await models.ConfiguracaoSistema.findOne({ where: { chave: 'documents.fiscal' } });
    const configured = JSON.parse(fiscal.valor_json);
    configured.series.factura = { prefix: 'FAT', year: '26', nextNumber: 99, padding: 3 };
    await fiscal.update({ valor_json: JSON.stringify(configured) });

    assert.equal(
      await service.reserveNextDocumentNumber({ actorUserId: actor.id, documentType: 'factura' }),
      'FAT001/27',
    );
    await fiscal.reload();
    assert.deepEqual(JSON.parse(fiscal.valor_json).series.factura, {
      prefix: 'FAT', year: '27', nextNumber: 2, padding: 3,
    });
  });

  test('reserveNextDocumentNumber rejects unsafe series fields and overflow', async () => {
    await service.seedDefaults();
    const fiscal = await models.ConfiguracaoSistema.findOne({ where: { chave: 'documents.fiscal' } });
    const invalidSeries = [
      { prefix: 'fat', year: '26', nextNumber: 1, padding: 3 },
      { prefix: 'FAT/EVIL', year: '26', nextNumber: 1, padding: 3 },
      { prefix: 'FAT', year: '2026', nextNumber: 1, padding: 3 },
      { prefix: 'FAT', year: '26', nextNumber: Number.MAX_SAFE_INTEGER, padding: 3 },
      { prefix: 'FAT', year: '26', nextNumber: Number.POSITIVE_INFINITY, padding: 3 },
    ];

    for (const series of invalidSeries) {
      const configured = JSON.parse(fiscal.valor_json);
      configured.series.factura = series;
      await fiscal.update({ valor_json: JSON.stringify(configured) });
      await assert.rejects(
        service.reserveNextDocumentNumber({ actorUserId: actor.id, documentType: 'factura' }),
        (error) => error.code === CONFIGURATION_ERROR_CODES.VALIDATION,
      );
    }
  });

  test('two service instances reserve distinct numbers concurrently', async () => {
    const secondService = createConfigurationService({
      db,
      models,
      now: () => new Date('2026-06-19T00:00:00.000Z'),
    });
    await service.seedDefaults();

    const numbers = await Promise.all([
      service.reserveNextDocumentNumber({ actorUserId: actor.id, documentType: 'factura' }),
      secondService.reserveNextDocumentNumber({ actorUserId: actor.id, documentType: 'factura' }),
    ]);

    assert.deepEqual(numbers, ['FAT001/26', 'FAT002/26']);
  });

  test('the shared mutation queue recovers after failed update and reservation operations', async () => {
    await service.seedDefaults();
    await assert.rejects(
      service.updateSection({
        actorUserId: actor.id,
        section: 'sales',
        values: { 'sales.defaultTaxRate': 14 },
        expectedVersions: { 'sales.defaultTaxRate': 0 },
      }),
      (error) => error.code === CONFIGURATION_ERROR_CODES.CONFLICT,
    );
    await assert.rejects(
      service.reserveNextDocumentNumber({ actorUserId: actor.id, documentType: 'unsupported' }),
      (error) => error.code === CONFIGURATION_ERROR_CODES.VALIDATION,
    );

    assert.equal(
      await service.reserveNextDocumentNumber({ actorUserId: actor.id, documentType: 'factura' }),
      'FAT001/26',
    );
  });
});

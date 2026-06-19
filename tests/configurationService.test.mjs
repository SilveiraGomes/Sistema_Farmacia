import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  test('updateSection rejects a missing optimistic version as a conflict', async () => {
    await service.seedDefaults();
    await assert.rejects(
      service.updateSection({
        actorUserId: actor.id,
        section: 'sales',
        values: { 'sales.defaultTaxRate': 14 },
      }),
      (error) => error.code === CONFIGURATION_ERROR_CODES.CONFLICT,
    );
    assert.equal(await models.AuditoriaConfiguracao.count(), 0);
  });

  test('updateSection rolls back setting changes and audits after a mid-transaction failure', async () => {
    await service.seedDefaults();
    const originalCreate = models.AuditoriaConfiguracao.create;
    let auditCalls = 0;
    models.AuditoriaConfiguracao.create = async (...args) => {
      auditCalls += 1;
      if (auditCalls === 2) throw new Error('injected second audit failure');
      return originalCreate.call(models.AuditoriaConfiguracao, ...args);
    };
    try {
      await assert.rejects(service.updateSection({
        actorUserId: actor.id,
        section: 'sales',
        values: { 'sales.defaultTaxRate': 14, 'sales.maxDiscount': 10 },
        expectedVersions: { 'sales.defaultTaxRate': 1, 'sales.maxDiscount': 1 },
      }), /injected second audit failure/);
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
    assert.equal(auditCalls, 2);
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

  test('updateSection returns a coded validation error for an undefined request', async () => {
    await assert.rejects(
      service.updateSection(),
      (error) => error.code === CONFIGURATION_ERROR_CODES.VALIDATION,
    );
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

  test('reserveNextDocumentNumber rejects present falsy series without mutating config or audit', async () => {
    await service.seedDefaults();
    const fiscal = await models.ConfiguracaoSistema.findOne({ where: { chave: 'documents.fiscal' } });

    for (const corruptSeries of [null, false, 0, '']) {
      const configured = JSON.parse(fiscal.valor_json);
      configured.series.factura = corruptSeries;
      await fiscal.update({ valor_json: JSON.stringify(configured) });
      const beforeJson = fiscal.valor_json;
      const beforeVersion = fiscal.versao;
      const beforeAudits = await models.AuditoriaConfiguracao.count();

      await assert.rejects(
        service.reserveNextDocumentNumber({ actorUserId: actor.id, documentType: 'factura' }),
        (error) => error.code === CONFIGURATION_ERROR_CODES.VALIDATION,
      );

      await fiscal.reload();
      assert.equal(fiscal.valor_json, beforeJson);
      assert.equal(fiscal.versao, beforeVersion);
      assert.equal(await models.AuditoriaConfiguracao.count(), beforeAudits);
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

  test('two Sequelize connections contend safely for a file-backed fiscal sequence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'configuration-service-'));
    const storage = join(directory, 'configuration.sqlite');
    const firstDb = new Sequelize({ dialect: 'sqlite', storage, logging: false });
    const firstModels = defineModels(firstDb);
    const secondDb = new Sequelize({ dialect: 'sqlite', storage, logging: false });
    const secondModels = defineModels(secondDb);

    try {
      await firstDb.sync({ force: true });
      const fileActor = await firstModels.Usuario.create({
        nome_usuario: 'file-admin',
        senha_hash: 'test-only',
        nome_completo: 'File Admin',
      });
      const clock = () => new Date('2026-06-19T00:00:00.000Z');
      const firstService = createConfigurationService({ db: firstDb, models: firstModels, now: clock });
      const secondService = createConfigurationService({ db: secondDb, models: secondModels, now: clock });
      await firstService.seedDefaults();

      const numbers = await Promise.all([
        firstService.reserveNextDocumentNumber({
          actorUserId: fileActor.id,
          documentType: 'factura',
        }),
        secondService.reserveNextDocumentNumber({
          actorUserId: fileActor.id,
          documentType: 'factura',
        }),
      ]);

      assert.deepEqual(numbers.sort(), ['FAT001/26', 'FAT002/26']);
      assert.equal(await firstModels.AuditoriaConfiguracao.count({ where: { acao: 'reserve' } }), 2);
    } finally {
      await Promise.allSettled([firstDb.close(), secondDb.close()]);
      await rm(directory, { recursive: true, force: true });
    }
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

  test('catalog CRUD normalizes names, preserves stable codes and audits mutations', async () => {
    await service.seedDefaults();
    const created = await service.createCatalogOption({
      actorUserId: actor.id,
      catalogKey: 'payment_methods',
      data: { name: '  Multicáixa   Express ', metadata: { channel: 'app' } },
    });
    assert.deepEqual([created.code, created.name, created.active], [
      'multicaixa-express', 'Multicáixa Express', true,
    ]);

    const updated = await service.updateCatalogOption({
      actorUserId: actor.id,
      optionId: created.id,
      expectedVersion: created.version,
      data: { name: 'Multicaixa Xpress', code: 'must-be-ignored', metadata: { channel: 'web' } },
    });
    assert.equal(updated.code, 'multicaixa-express');
    assert.equal(updated.name, 'Multicaixa Xpress');
    const inactive = await service.deactivateCatalogOption({
      actorUserId: actor.id, optionId: created.id, expectedVersion: updated.version,
    });
    assert.equal(inactive.active, false);
    const active = await service.activateCatalogOption({
      actorUserId: actor.id, optionId: created.id, expectedVersion: inactive.version,
    });
    assert.equal(active.active, true);
    assert.deepEqual(
      (await models.AuditoriaConfiguracao.findAll({ order: [['id', 'ASC']] }))
        .map((entry) => entry.acao),
      ['create', 'update', 'deactivate', 'activate'],
    );
  });

  test('catalog creation rejects normalized name collisions and semantic code reuse', async () => {
    await service.seedDefaults();
    await service.createCatalogOption({
      actorUserId: actor.id, catalogKey: 'payment_methods', data: { name: 'Multicáixa Express' },
    });
    for (const name of ['multicaixa   express', 'MULTICÁIXA EXPRESS']) {
      await assert.rejects(
        service.createCatalogOption({ actorUserId: actor.id, catalogKey: 'payment_methods', data: { name } }),
        (error) => error.code === CONFIGURATION_ERROR_CODES.CONFLICT,
      );
    }
    const row = await models.OpcaoCatalogo.findOne({
      where: { catalogo: 'payment_methods', codigo: 'multicaixa-express' },
    });
    await row.update({ nome: 'Nome historicamente diferente', ativo: false });
    await assert.rejects(
      service.createCatalogOption({
        actorUserId: actor.id, catalogKey: 'payment_methods', data: { name: 'Multicaixa Express' },
      }),
      (error) => error.code === CONFIGURATION_ERROR_CODES.CONFLICT,
    );
  });

  test('technical and protected seed entries reject edits and deactivation', async () => {
    await service.seedDefaults();
    for (const [catalogo, codigo] of [['document_statuses', 'anulado'], ['payment_methods', 'dinheiro']]) {
      const row = await models.OpcaoCatalogo.findOne({ where: { catalogo, codigo } });
      if (catalogo === 'payment_methods') await row.update({ sistema: true });
      await assert.rejects(
        service.updateCatalogOption({
          actorUserId: actor.id, optionId: row.id, expectedVersion: row.versao, data: { name: 'Outro' },
        }),
        (error) => error.code === CONFIGURATION_ERROR_CODES.PROTECTED,
      );
      await assert.rejects(
        service.deactivateCatalogOption({
          actorUserId: actor.id, optionId: row.id, expectedVersion: row.versao,
        }),
        (error) => error.code === CONFIGURATION_ERROR_CODES.PROTECTED,
      );
    }
    assert.equal(await models.AuditoriaConfiguracao.count(), 0);
  });

  test('protected technical entries cannot be activated or included in reordering', async () => {
    await service.seedDefaults();
    const protectedOption = await models.OpcaoCatalogo.findOne({
      where: { catalogo: 'payment_methods', codigo: 'tpa' },
    });
    await protectedOption.update({ sistema: true, ativo: false });

    await assert.rejects(
      service.activateCatalogOption({
        actorUserId: actor.id, optionId: protectedOption.id, expectedVersion: protectedOption.versao,
      }),
      (error) => error.code === CONFIGURATION_ERROR_CODES.PROTECTED,
    );
    await protectedOption.reload();
    assert.equal(protectedOption.ativo, false);

    await protectedOption.update({ ativo: true });
    const active = await service.listCatalog({ catalogKey: 'payment_methods' });
    const expectedVersions = Object.fromEntries(active.map((option) => [option.id, option.version]));
    await assert.rejects(
      service.reorderCatalogOptions({
        actorUserId: actor.id,
        catalogKey: 'payment_methods',
        optionIds: active.map((option) => option.id).reverse(),
        expectedVersions,
      }),
      (error) => error.code === CONFIGURATION_ERROR_CODES.PROTECTED,
    );
    await protectedOption.reload();
    assert.equal(protectedOption.ordem, 1);
    assert.equal(protectedOption.versao, 1);
    assert.equal(await models.AuditoriaConfiguracao.count(), 0);
  });

  test('deactivation protects the last payment method and the current default', async () => {
    await service.seedDefaults();
    const dinheiro = await models.OpcaoCatalogo.findOne({
      where: { catalogo: 'payment_methods', codigo: 'dinheiro' },
    });
    await dinheiro.update({ sistema: false });
    await assert.rejects(
      service.deactivateCatalogOption({
        actorUserId: actor.id, optionId: dinheiro.id, expectedVersion: dinheiro.versao,
      }),
      (error) => error.code === CONFIGURATION_ERROR_CODES.IN_USE,
    );
    await models.ConfiguracaoSistema.update(
      { valor_json: JSON.stringify('credito') },
      { where: { chave: 'sales.defaultPaymentMethod' } },
    );
    await models.OpcaoCatalogo.update(
      { ativo: false },
      { where: { catalogo: 'payment_methods' } },
    );
    await models.OpcaoCatalogo.update({ ativo: true }, { where: { id: dinheiro.id } });
    await assert.rejects(
      service.deactivateCatalogOption({
        actorUserId: actor.id, optionId: dinheiro.id, expectedVersion: dinheiro.versao,
      }),
      (error) => error.code === CONFIGURATION_ERROR_CODES.INVARIANT,
    );
  });

  test('deactivation rejects an operational shift used by a currently open shift', async () => {
    await service.seedDefaults();
    const option = await models.OpcaoCatalogo.findOne({
      where: { catalogo: 'operation_shifts', codigo: 'manha' },
    });
    await option.update({ sistema: false });
    const day = await models.DiaOperacional.create({ data_operacional: '2026-06-19' });
    await models.TurnoOperacional.create({
      dia_operacional_id: day.id, nome: ' Manhã ', status: 'Aberto',
    });
    await assert.rejects(
      service.deactivateCatalogOption({
        actorUserId: actor.id, optionId: option.id, expectedVersion: option.versao,
      }),
      (error) => error.code === CONFIGURATION_ERROR_CODES.IN_USE,
    );
  });

  test('an open shift prevents renaming its option and cannot bypass later deactivation', async () => {
    await service.seedDefaults();
    const option = await service.createCatalogOption({
      actorUserId: actor.id,
      catalogKey: 'operation_shifts',
      data: { name: 'Madrugada' },
    });
    const day = await models.DiaOperacional.create({ data_operacional: '2026-06-19' });
    await models.TurnoOperacional.create({
      dia_operacional_id: day.id,
      nome: 'madrugada',
      status: 'ABERTO',
    });
    const auditsBefore = await models.AuditoriaConfiguracao.count();

    await assert.rejects(
      service.updateCatalogOption({
        actorUserId: actor.id,
        optionId: option.id,
        expectedVersion: option.version,
        data: { name: 'Turno Zero' },
      }),
      (error) => error.code === CONFIGURATION_ERROR_CODES.IN_USE,
    );
    await assert.rejects(
      service.deactivateCatalogOption({
        actorUserId: actor.id, optionId: option.id, expectedVersion: option.version,
      }),
      (error) => error.code === CONFIGURATION_ERROR_CODES.IN_USE,
    );

    const persisted = await models.OpcaoCatalogo.findByPk(option.id);
    assert.deepEqual([persisted.nome, persisted.ativo, persisted.versao], ['Madrugada', true, 1]);
    assert.equal(await models.AuditoriaConfiguracao.count(), auditsBefore);
  });

  test('reorder requires exactly the complete active set and persists deterministic order', async () => {
    await service.seedDefaults();
    const created = await service.createCatalogOption({
      actorUserId: actor.id, catalogKey: 'payment_methods', data: { name: 'Voucher' },
    });
    const active = await service.listCatalog({ catalogKey: 'payment_methods' });
    const reversedIds = active.map((option) => option.id).reverse();
    const expectedVersions = Object.fromEntries(active.map((option) => [option.id, option.version]));
    for (const invalid of [reversedIds.slice(1), [...reversedIds, reversedIds[0]]]) {
      await assert.rejects(
        service.reorderCatalogOptions({
          actorUserId: actor.id, catalogKey: 'payment_methods', optionIds: invalid,
          expectedVersions,
        }),
        (error) => error.code === CONFIGURATION_ERROR_CODES.VALIDATION,
      );
    }
    const ordered = await service.reorderCatalogOptions({
      actorUserId: actor.id,
      catalogKey: 'payment_methods',
      optionIds: reversedIds,
      expectedVersions,
    });
    assert.deepEqual(ordered.map((option) => option.id), reversedIds);
    assert.equal(ordered.find((option) => option.id === created.id).order, 0);
  });

  test('dynamic active catalog codes are valid settings and remain protected as defaults', async () => {
    await service.seedDefaults();
    const dynamic = await service.createCatalogOption({
      actorUserId: actor.id,
      catalogKey: 'payment_methods',
      data: { name: 'Voucher Empresa' },
    });
    const updated = await service.updateSection({
      actorUserId: actor.id,
      section: 'sales',
      values: { 'sales.defaultPaymentMethod': dynamic.code },
      expectedVersions: { 'sales.defaultPaymentMethod': 1 },
    });
    assert.equal(updated.settings.sales.defaultPaymentMethod.value, 'voucher-empresa');
    assert.equal((await service.getSnapshot()).settings.sales.defaultPaymentMethod.readable, true);
    await assert.rejects(
      service.deactivateCatalogOption({
        actorUserId: actor.id,
        optionId: dynamic.id,
        expectedVersion: dynamic.version,
      }),
      (error) => error.code === CONFIGURATION_ERROR_CODES.IN_USE,
    );

    const inactive = await service.createCatalogOption({
      actorUserId: actor.id,
      catalogKey: 'payment_methods',
      data: { name: 'Pagamento Inativo' },
    });
    await service.deactivateCatalogOption({
      actorUserId: actor.id,
      optionId: inactive.id,
      expectedVersion: inactive.version,
    });
    const auditCount = await models.AuditoriaConfiguracao.count();
    for (const code of [inactive.code, 'codigo-desconhecido']) {
      await assert.rejects(
        service.updateSection({
          actorUserId: actor.id,
          section: 'sales',
          values: { 'sales.defaultPaymentMethod': code },
          expectedVersions: { 'sales.defaultPaymentMethod': 2 },
        }),
        (error) => error.code === CONFIGURATION_ERROR_CODES.VALIDATION,
      );
    }
    assert.equal(await models.AuditoriaConfiguracao.count(), auditCount);
    assert.equal(
      (await service.getSnapshot()).settings.sales.defaultPaymentMethod.value,
      dynamic.code,
    );
  });

  test('catalog mutations require complete current optimistic versions', async () => {
    await service.seedDefaults();
    const created = await service.createCatalogOption({
      actorUserId: actor.id, catalogKey: 'payment_methods', data: { name: 'Cheque' },
    });
    const auditCount = await models.AuditoriaConfiguracao.count();

    for (const request of [
      { actorUserId: actor.id, optionId: created.id },
      { actorUserId: actor.id, optionId: created.id, expectedVersion: 99 },
    ]) {
      await assert.rejects(
        service.deactivateCatalogOption(request),
        (error) => error.code === CONFIGURATION_ERROR_CODES.CONFLICT,
      );
    }
    for (const request of [
      { actorUserId: actor.id, optionId: created.id, data: { name: 'Cheque Bancário' } },
      {
        actorUserId: actor.id,
        optionId: created.id,
        expectedVersion: 99,
        data: { name: 'Cheque Bancário' },
      },
    ]) {
      await assert.rejects(
        service.updateCatalogOption(request),
        (error) => error.code === CONFIGURATION_ERROR_CODES.CONFLICT,
      );
    }

    const inactive = await service.deactivateCatalogOption({
      actorUserId: actor.id, optionId: created.id, expectedVersion: created.version,
    });
    for (const request of [
      { actorUserId: actor.id, optionId: inactive.id },
      { actorUserId: actor.id, optionId: inactive.id, expectedVersion: created.version },
    ]) {
      await assert.rejects(
        service.activateCatalogOption(request),
        (error) => error.code === CONFIGURATION_ERROR_CODES.CONFLICT,
      );
    }
    const persisted = await models.OpcaoCatalogo.findByPk(created.id);
    assert.deepEqual([persisted.nome, persisted.ativo, persisted.versao], ['Cheque', false, 2]);
    assert.equal(await models.AuditoriaConfiguracao.count(), auditCount + 1);
  });

  test('reorder rejects missing or stale version maps without partial changes', async () => {
    await service.seedDefaults();
    const active = await service.listCatalog({ catalogKey: 'payment_methods' });
    const optionIds = active.map((option) => option.id).reverse();
    const expectedVersions = Object.fromEntries(active.map((option) => [option.id, option.version]));
    const before = active.map((option) => [option.id, option.order, option.version]);

    for (const versions of [undefined, { ...expectedVersions, [active[0].id]: 99 }]) {
      await assert.rejects(
        service.reorderCatalogOptions({
          actorUserId: actor.id,
          catalogKey: 'payment_methods',
          optionIds,
          expectedVersions: versions,
        }),
        (error) => error.code === CONFIGURATION_ERROR_CODES.CONFLICT,
      );
    }
    const after = await service.listCatalog({ catalogKey: 'payment_methods' });
    assert.deepEqual(after.map((option) => [option.id, option.order, option.version]), before);
    assert.equal(await models.AuditoriaConfiguracao.count(), 0);
  });

  test('catalog metadata rejects values that are not plain finite JSON data', async () => {
    await service.seedDefaults();
    const circular = {};
    circular.self = circular;
    const invalidMetadata = [
      { value: undefined },
      { value: () => true },
      { value: Number.NaN },
      { value: Number.POSITIVE_INFINITY },
      { value: new Date() },
      circular,
    ];
    for (let index = 0; index < invalidMetadata.length; index += 1) {
      await assert.rejects(
        service.createCatalogOption({
          actorUserId: actor.id,
          catalogKey: 'payment_methods',
          data: { name: `Metadado ${index}`, metadata: invalidMetadata[index] },
        }),
        (error) => error.code === CONFIGURATION_ERROR_CODES.VALIDATION,
      );
    }
    assert.equal(await models.OpcaoCatalogo.count({
      where: { catalogo: 'payment_methods' },
    }), CATALOG_DEFINITIONS.payment_methods.options.length);

    const valid = await service.createCatalogOption({
      actorUserId: actor.id,
      catalogKey: 'payment_methods',
      data: { name: 'JSON Válido', metadata: { tags: ['app', 2, null, true] } },
    });
    assert.deepEqual(valid.metadata, { tags: ['app', 2, null, true] });
  });

  test('catalog audit failure rolls back the mutation and audit', async () => {
    await service.seedDefaults();
    const originalCreate = models.AuditoriaConfiguracao.create;
    models.AuditoriaConfiguracao.create = async () => { throw new Error('catalog audit failed'); };
    try {
      await assert.rejects(service.createCatalogOption({
        actorUserId: actor.id, catalogKey: 'payment_methods', data: { name: 'Voucher' },
      }), /catalog audit failed/);
    } finally {
      models.AuditoriaConfiguracao.create = originalCreate;
    }
    assert.equal(await models.OpcaoCatalogo.count({ where: { codigo: 'voucher' } }), 0);
    assert.equal(await models.AuditoriaConfiguracao.count(), 0);
  });

  test('legacy migration maps values, honors SQLite priority, deduplicates and is idempotent', async () => {
    await service.seedDefaults();
    const identity = await models.ConfiguracaoSistema.findOne({ where: { chave: 'company.identity' } });
    const customIdentity = { ...JSON.parse(identity.valor_json), pharmacyName: 'SQLite Pharmacy' };
    await identity.update({ valor_json: JSON.stringify(customIdentity), versao: 2 });

    const first = await service.importLegacySettings({
      actorUserId: actor.id,
      migrationVersion: 1,
      data: {
        branding: { pharmacyName: 'Legacy Pharmacy', taxId: '5000', logoDataUrl: 'data:image/png;base64,AA==' },
        invoiceA4: {
          documentHeaderText: 'Legacy Pharmacy\nNIF: 5000',
          validationNumber: '123/AGT/2026',
          fiscalRegime: 'Regime Geral',
        },
        discoveredCatalogValues: {
          payment_methods: ['TPA', ' tpa ', 'Multicáixa', 'MULTICAIXA'],
        },
      },
    });
    assert.deepEqual(first, { applied: true, skipped: false, migrationVersion: 1 });
    const snapshot = await service.getSnapshot();
    assert.equal(snapshot.settings.company.identity.value.pharmacyName, 'SQLite Pharmacy');
    assert.equal(snapshot.settings.documents.headerText.value, 'Legacy Pharmacy\nNIF: 5000');
    assert.equal(snapshot.settings.documents.fiscal.value.validationNumber, '123/AGT/2026');
    assert.equal(snapshot.catalogs.payment_methods.filter((item) => item.code === 'tpa').length, 1);
    assert.equal(snapshot.catalogs.payment_methods.filter((item) => item.code === 'multicaixa').length, 1);
    assert.equal(snapshot.migrations.legacyLocalStoragePending, false);
    const countBefore = await models.OpcaoCatalogo.count();
    const second = await service.importLegacySettings({ migrationVersion: 1, data: {} });
    assert.deepEqual(second, { applied: false, skipped: true, migrationVersion: 1 });
    assert.equal(await models.OpcaoCatalogo.count(), countBefore);
  });

  test('legacy migration rolls back settings, catalogs, marker and audits on failure', async () => {
    await service.seedDefaults();
    const originalCreate = models.AuditoriaConfiguracao.create;
    let calls = 0;
    models.AuditoriaConfiguracao.create = async (...args) => {
      calls += 1;
      if (calls === 2) throw new Error('migration audit failed');
      return originalCreate.call(models.AuditoriaConfiguracao, ...args);
    };
    try {
      await assert.rejects(service.importLegacySettings({
        actorUserId: actor.id,
        migrationVersion: 1,
        data: {
          branding: { pharmacyName: 'Legacy Pharmacy' },
          discoveredCatalogValues: { payment_methods: ['Voucher'] },
        },
      }), /migration audit failed/);
    } finally {
      models.AuditoriaConfiguracao.create = originalCreate;
    }
    const marker = await models.ConfiguracaoSistema.findOne({
      where: { chave: 'migration.legacyLocalStorageVersion' },
    });
    assert.equal(marker.valor_json, '0');
    assert.equal(await models.OpcaoCatalogo.count({ where: { codigo: 'voucher' } }), 0);
    assert.equal(await models.AuditoriaConfiguracao.count(), 0);
  });

  test('completed legacy migration skips before invoking discovery adapters', async () => {
    let adapterCalls = 0;
    service = createConfigurationService({
      db,
      models,
      now: () => new Date('2026-06-19T00:00:00.000Z'),
      discoverCatalogValues: async () => {
        adapterCalls += 1;
        if (adapterCalls > 1) throw new Error('adapter must not run after migration');
        return {};
      },
    });
    await service.seedDefaults();
    await service.importLegacySettings({ migrationVersion: 1, data: {} });

    assert.deepEqual(
      await service.importLegacySettings({ migrationVersion: 1, data: {} }),
      { applied: false, skipped: true, migrationVersion: 1 },
    );
    assert.equal(adapterCalls, 1);
  });
});

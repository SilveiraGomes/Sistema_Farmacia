import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const database = require('../src/backend/database.js');
const { createConfigurationService } = require('../src/backend/services/configurationService.js');
const estoqueService = require('../src/backend/services/estoqueService.js');
const vendaService = require('../src/backend/services/vendaService.js');

const year = String(new Date().getFullYear()).slice(-2);

async function withSalesDatabase(run) {
  const dir = await mkdtemp(join(tmpdir(), 'kil-sales-'));
  const log = console.log;
  console.log = () => {};
  let db;
  try {
    db = await database.connectDB({ getPath: () => dir }, 'development');
    await database.syncDatabaseSchema(db);
    console.log = log;
    const configuration = createConfigurationService({ db, models: database.getModels() });
    await configuration.seedDefaults();
    const reserveNumber = (options) => configuration.reserveNextDocumentNumber({ ...options, actorUserId: 1 });
    const { Usuario } = database.getModels();
    const admin = await Usuario.findOne({ where: { nome_usuario: 'admin' } });
    await run({ models: database.getModels(), configuration, reserveNumber, actorId: admin.id });
  } finally {
    console.log = log;
    await db?.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}

async function createStockedProduct(nome, codigo, quantidade) {
  const product = await estoqueService.createProduct({ nome, codigo_barras: codigo, preco_venda: 100, preco_custo: 60 });
  if (quantidade > 0) {
    await estoqueService.addStockLot({ produto_id: product.id, lote: `L-${codigo}`, quantidade, data_validade: '2030-01-01' });
  }
  return product;
}

async function stockOf(models, produtoId) {
  return Number(await models.Estoque.sum('quantidade', { where: { produto_id: produtoId } }) || 0);
}

function saleOf(items, extra = {}) {
  const total = items.reduce((sum, item) => sum + item.quantidade * item.preco_unitario, 0);
  return {
    docType: 'factura_recibo', paymentMethod: 'dinheiro', subtotal: total, total, valorPago: total, troco: 0,
    items, ...extra,
  };
}

test('uma venda com um produto sem stock não abate stock nem consome número fiscal', async () => {
  await withSalesDatabase(async ({ models, reserveNumber, actorId }) => {
    const ok = await createStockedProduct('Paracetamol', '111', 10);
    const short = await createStockedProduct('Ibuprofeno', '222', 1);

    await assert.rejects(
      vendaService.createVenda(saleOf([
        { produto_id: ok.id, nome: 'Paracetamol', quantidade: 3, preco_unitario: 100 },
        { produto_id: short.id, nome: 'Ibuprofeno', quantidade: 5, preco_unitario: 100 },
      ]), actorId, { reserveNumber }),
      /"Ibuprofeno": Estoque insuficiente/,
    );

    assert.equal(await stockOf(models, ok.id), 10, 'o stock do primeiro produto foi reposto');
    assert.equal(await models.Venda.count(), 0);
    assert.equal(await models.TransacaoFinanceira.count(), 0);

    const sale = await vendaService.createVenda(saleOf([
      { produto_id: ok.id, nome: 'Paracetamol', quantidade: 2, preco_unitario: 100 },
    ]), actorId, { reserveNumber });
    assert.equal(sale.number, `FR00001/${year}`, 'a falha anterior não deixou buraco na série');
    assert.equal(await stockOf(models, ok.id), 8);
  });
});

test('a reserva salta números que já existem e mantém a série sequencial', async () => {
  await withSalesDatabase(async ({ models, reserveNumber, actorId }) => {
    const product = await createStockedProduct('Vitamina C', '333', 20);
    const first = await vendaService.createVenda(saleOf([
      { produto_id: product.id, quantidade: 1, preco_unitario: 100 },
    ]), actorId, { reserveNumber });
    assert.equal(first.number, `FR00001/${year}`);

    // Série desfasada (ex.: restauro): o número seguinte já existe na base.
    await models.Venda.create({
      numero_factura: `FR00002/${year}`, data_venda: new Date(), total: 1, status: 'PAGO',
      tipo_documento: 'FACTURA_RECIBO', forma_pagamento: 'dinheiro', usuario_id: actorId,
    });

    const next = await vendaService.createVenda(saleOf([
      { produto_id: product.id, quantidade: 1, preco_unitario: 100 },
    ]), actorId, { reserveNumber });
    assert.equal(next.number, `FR00003/${year}`);
  });
});

test('anulação e conversão reservam o número na própria transacção', async () => {
  await withSalesDatabase(async ({ models, reserveNumber, actorId }) => {
    const product = await createStockedProduct('Soro', '444', 2);
    const sale = await vendaService.createVenda(saleOf([
      { produto_id: product.id, quantidade: 1, preco_unitario: 100 },
    ]), actorId, { reserveNumber });

    const { creditNote } = await vendaService.cancelDocument(
      { venda_id: sale.vendaId, reason: 'Teste' }, actorId, { reserveNumber },
    );
    assert.equal(creditNote.number, `NC00001/${year}`);

    const proforma = await vendaService.createVenda(saleOf([
      { produto_id: product.id, quantidade: 5, preco_unitario: 100 },
    ], { docType: 'proforma' }), actorId, { reserveNumber });
    assert.equal(proforma.number, `PF00001/${year}`);

    // Sem stock suficiente: a conversão falha por inteiro e a proforma fica intacta.
    await assert.rejects(
      vendaService.convertProforma({ venda_id: proforma.vendaId }, actorId, { reserveNumber }),
      /"Soro": Estoque insuficiente/,
    );
    const untouched = await models.Venda.findByPk(proforma.vendaId);
    assert.equal(untouched.tipo_documento, 'PROFORMA');
    assert.equal(await stockOf(models, product.id), 1);

    await estoqueService.addStockLot({ produto_id: product.id, lote: 'L-2', quantidade: 10, data_validade: '2030-01-01' });
    const converted = await vendaService.convertProforma({ venda_id: proforma.vendaId }, actorId, { reserveNumber });
    assert.equal(converted.number, `FT00001/${year}`, 'a conversão falhada não consumiu número');
    assert.equal(await stockOf(models, product.id), 6);
  });
});

test('sem número nem serviço de reserva a venda é recusada antes de gravar', async () => {
  await withSalesDatabase(async ({ models, actorId }) => {
    const product = await createStockedProduct('Gaze', '555', 3);
    await assert.rejects(
      vendaService.createVenda(saleOf([{ produto_id: product.id, quantidade: 1, preco_unitario: 100 }]), actorId),
      /Numero de documento e obrigatorio/,
    );
    assert.equal(await stockOf(models, product.id), 3);
  });
});

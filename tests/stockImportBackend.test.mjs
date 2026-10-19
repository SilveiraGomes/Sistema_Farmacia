import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const database = require('../src/backend/database.js');
const estoqueService = require('../src/backend/services/estoqueService.js');

async function withDatabase(run) {
  const dir = await mkdtemp(join(tmpdir(), 'kil-stock-import-'));
  const log = console.log;
  console.log = () => {};
  const db = await database.connectDB({ getPath: () => dir }, 'development');
  try {
    await database.syncDatabaseSchema(db);
    console.log = log;
    await run(db, database.getModels());
  } finally {
    console.log = log;
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test('importação de produtos rejeita categoria/subcategoria inexistente e liga às existentes', async () => {
  await withDatabase(async () => {
    const categoria = await estoqueService.createCategory({ nome: 'Antibioticos' });
    await estoqueService.createSubcategory({ nome: 'Comprimidos', categoria_id: categoria.id });

    const result = await estoqueService.importProducts([
      { id: '9001', name: 'Produto Teste', category: 'Antibióticos', subcategory: 'comprimidos', price: 1200 },
      { id: '9002', name: 'Sem Categoria', category: 'Categoria Nova', subcategory: 'Comprimidos', price: 900 },
      { id: '9003', name: 'Sem Subcategoria', category: 'Antibioticos', subcategory: 'Subcategoria Nova', price: 900 },
    ]);

    assert.equal(result.created, 1);
    assert.equal(result.errors.length, 2);
    const [produto] = await estoqueService.listProducts({});
    assert.equal(produto.nome, 'Produto Teste');
    assert.equal(produto.subcategoria_nome, 'Comprimidos');
  });
});

test('subcategorias: sem duplicados ao criar, renomear e importar; categoria visível', async () => {
  await withDatabase(async () => {
    const categoria = await estoqueService.createCategory({ nome: 'Medicamento' });
    const analgesico = await estoqueService.createSubcategory({ nome: 'Analgésico', categoria_id: categoria.id });
    const vitaminas = await estoqueService.createSubcategory({ nome: 'Vitaminas', categoria_id: categoria.id });

    await assert.rejects(
      estoqueService.createSubcategory({ nome: '  ANALGESICO ', categoria_id: categoria.id }),
      /Subcategoria ja existe nesta categoria/,
    );
    await assert.rejects(
      estoqueService.updateSubcategory({ id: vitaminas.id, nome: 'analgesico' }),
      /Subcategoria ja existe nesta categoria/,
    );

    const imported = await estoqueService.importSubcategories([
      { category: 'Medicamento', name: 'Analgesico' },
      { category: 'Medicamento', name: 'Antibiótico' },
      { category: 'Inexistente', name: 'Teste' },
    ]);
    assert.deepEqual({ created: imported.created, skipped: imported.skipped, errors: imported.errors.length }, { created: 1, skipped: 1, errors: 1 });

    // Remover (inactivar) e voltar a criar reactiva a mesma subcategoria.
    await estoqueService.deleteSubcategory({ id: analgesico.id });
    const recreated = await estoqueService.createSubcategory({ nome: 'Analgésico', categoria_id: categoria.id });
    assert.equal(recreated.id, analgesico.id);

    const list = await estoqueService.listSubcategories({});
    assert.equal(list.length, 3);
    assert.ok(list.every((sub) => sub.categoria_nome === 'Medicamento'));
  });
});

test('arranque unifica subcategorias duplicadas existentes sem perder a ligação dos produtos', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kil-stock-dedupe-'));
  const log = console.log;
  console.log = () => {};
  let db;
  try {
    db = await database.connectDB({ getPath: () => dir }, 'development');
    await database.syncDatabaseSchema(db);
    const { Categoria, Produto } = database.getModels();
    const categoria = await Categoria.create({ nome: 'Medicamento' });
    // Duplicados como os deixados por importações repetidas (antes do índice único).
    await db.query('DROP INDEX IF EXISTS "subcategoria_categoria_nome_unique"');
    const ids = [];
    for (const nome of ['Antibiótico', 'Antibiotico', ' antibiótico ']) {
      const [, { lastID: id }] = await db.query(
        'INSERT INTO "Subcategoria" (categoria_id, nome, ativo, createdAt, updatedAt) VALUES (?, ?, 1, datetime(), datetime())',
        { replacements: [categoria.id, nome] },
      );
      ids.push(id);
    }
    for (const [index, subId] of ids.entries()) {
      await Produto.create({ nome: `Produto ${index}`, codigo_barras: `B${index}`, preco_venda: 10, categoria_id: categoria.id, subcategoria_id: subId });
    }
    await db.close();

    db = await database.connectDB({ getPath: () => dir }, 'development');
    await database.syncDatabaseSchema(db);
    console.log = log;
    const subs = await estoqueService.listSubcategories({});
    assert.equal(subs.length, 1);
    const produtos = await estoqueService.listProducts({});
    assert.equal(produtos.length, 3);
    assert.ok(produtos.every((p) => p.subcategoria_id === subs[0].id && p.subcategoria_nome === subs[0].nome));
  } finally {
    console.log = log;
    await db?.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

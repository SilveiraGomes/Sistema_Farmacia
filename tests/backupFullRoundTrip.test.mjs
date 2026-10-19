// Ida e volta completa: dados em TODAS as tabelas -> backup -> alterações/perdas
// -> restauro, comparando cada tabela linha a linha e coluna a coluna.
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const database = require('../src/backend/database.js');
const backupService = require('../src/backend/services/backupService.js');
const { hashPassword, hashPin, verifyPassword } = require('../src/backend/security/passwords.js');

const IGNORED_TABLES = new Set(['_kil_schema_meta', '_kil_migrations']);
const ACCOUNT_TABLES = new Set(['Usuarios', 'AuditoriaUsuarios']);

function quiet(fn) {
  return async (...args) => {
    const log = console.log;
    console.log = () => {};
    try { return await fn(...args); } finally { console.log = log; }
  };
}

const boot = quiet(async (dir) => {
  const db = await database.connectDB({ getPath: () => dir }, 'development');
  await database.syncDatabaseSchema(db);
  return db;
});

async function newInstallation(prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return { dir, app: { getPath: () => dir }, db: await boot(dir) };
}

// Fecha a base, aplica o restauro pendente e reabre — como no reinício real.
const restartAndFinish = quiet(async (inst) => {
  await inst.db.close();
  const state = backupService.applyPendingRestore(inst.app);
  inst.db = await boot(inst.dir);
  if (state) await backupService.finalizePendingRestore(inst.app, state);
  return state;
});

async function snapshot(db) {
  const tables = await db.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    { type: db.QueryTypes.SELECT },
  );
  const out = {};
  for (const { name } of tables) {
    if (IGNORED_TABLES.has(name)) continue;
    out[name] = await db.query(`SELECT * FROM "${name}" ORDER BY rowid`, { type: db.QueryTypes.SELECT });
  }
  return out;
}

const day = (n) => new Date(Date.UTC(2026, 6, n, 9, 30, 0));

async function seedAllTables() {
  const m = database.getModels();
  const admin = await m.Usuario.findOne({ where: { nome_usuario: 'admin' } });
  await admin.update({
    senha_hash: hashPassword('Admin#Real2026'), deve_trocar_senha: false,
    nome_completo: 'Silveira Gomes', ultimo_login_em: day(10), pin_hash: hashPin('1234'),
  });
  const caixa = await m.Perfil.findOne({ where: { nome: 'Caixa' } });
  const perfil = await m.Perfil.create({ nome: 'Supervisor de Loja', descricao: 'Perfil personalizado', sistema: false });
  const permissoes = await m.Permissao.findAll({ limit: 7 });
  await m.PerfilPermissao.bulkCreate(permissoes.map((p) => ({ perfil_id: perfil.id, permissao_id: p.id })));
  const operador = await m.Usuario.create({
    nome_usuario: 'operador', nome_completo: 'Operadora de Caixa', email: 'operador@esayos.ao',
    senha_hash: hashPassword('Operador#2026'), perfil_id: caixa.id, ultimo_login_em: day(11), pin_hash: hashPin('4321'),
  });
  await m.Usuario.create({
    nome_usuario: 'supervisor', nome_completo: 'Supervisor', senha_hash: hashPassword('Superv#2026'),
    perfil_id: perfil.id, ultimo_login_em: day(12), falhas_login: 2,
  });

  const categorias = await m.Categoria.bulkCreate([
    { nome: 'Medicamentos', codigo: 'MED', descricao: 'Fármacos — uso humano' },
    { nome: 'Higiene', codigo: 'HIG', ativo: true },
    { nome: 'Material Hospitalar', codigo: 'MAT', ativo: false },
  ]);
  const subcategorias = [];
  for (const [i, cat] of categorias.entries()) {
    subcategorias.push(await m.Subcategoria.create({ categoria_id: cat.id, nome: `Sub ${i}A`, codigo: `S${i}A` }));
    subcategorias.push(await m.Subcategoria.create({ categoria_id: cat.id, nome: `Sub ${i}B`, codigo: `S${i}B`, ativo: false }));
  }
  const bigImage = `data:image/png;base64,${'iVBORw0KGgo'.repeat(2500)}`; // ~27 KB: páginas de overflow
  const produtos = [];
  for (let i = 1; i <= 25; i++) {
    const sub = subcategorias[i % subcategorias.length];
    produtos.push(await m.Produto.create({
      nome: `Produto ${i} – Paracetamol ${i * 50}mg «teste»`, descricao: i % 3 ? null : 'Descrição longa '.repeat(30),
      codigo_barras: `5600000000${String(i).padStart(3, '0')}`, preco_venda: 150.75 + i, preco_custo: 99.5 + i,
      fabricante: 'Lab Angola', categoria: 'Medicamento', categoria_id: sub.categoria_id, subcategoria_id: sub.id,
      unidade_medida: 'Caixa', estoque_minimo: i % 7, receita_obrigatoria: i % 4 === 0,
      prateleira: `P${i}`, gaveta: 'G1', zona: 'A', imagem: i === 1 ? bigImage : null,
    }));
  }
  for (let i = 0; i < 40; i++) {
    await m.Estoque.create({
      produto_id: produtos[i % produtos.length].id, lote: `L-${1000 + i}`, quantidade: 10 + i,
      data_validade: day(28 + (i % 3)), data_entrada: day(1 + (i % 9)), localizacao: i % 2 ? 'Armazém' : null,
    });
  }
  const clientes = [];
  for (let i = 1; i <= 5; i++) {
    clientes.push(await m.Cliente.create({
      nome: `Cliente ${i} Ção`, cpf_cnpj: `NIF${i}00${i}`, telefone: `+244 92${i} 000 00${i}`,
      email: `cliente${i}@mail.ao`, endereco: 'Bailundo, Huambo', limite_credito: 5000 * i,
      status: i === 5 ? 'Inactivo' : 'Activo',
    }));
  }
  const fornecedores = await m.Fornecedor.bulkCreate([1, 2, 3].map((i) => ({
    nome_fantasia: `Fornecedor ${i}`, razao_social: `Fornecedor ${i} Lda`, nif: `500${i}`, ativo: i !== 3,
  })));

  const diaFechado = await m.DiaOperacional.create({
    data_operacional: '2026-07-14', status: 'Fechado', saldo_inicial: 1000, saldo_final_informado: 5320.5,
    total_vendas: 4320.5, diferenca_caixa: 0, aberto_por_usuario_id: admin.id, fechado_por_usuario_id: admin.id,
    aberto_em: day(14), fechado_em: day(14),
  });
  const diaAberto = await m.DiaOperacional.create({
    data_operacional: '2026-07-15', status: 'Aberto', saldo_inicial: 500, aberto_por_usuario_id: admin.id, aberto_em: day(15),
  });
  await m.TurnoOperacional.create({ dia_operacional_id: diaFechado.id, nome: 'Manhã', status: 'Fechado', aberto_por_usuario_id: operador.id, fechado_em: day(14) });
  await m.TurnoOperacional.create({ dia_operacional_id: diaFechado.id, nome: 'Tarde', status: 'Fechado', total_vendas: 900 });
  await m.TurnoOperacional.create({ dia_operacional_id: diaAberto.id, nome: 'Manhã', status: 'Aberto', aberto_por_usuario_id: operador.id });

  for (let i = 1; i <= 12; i++) {
    const venda = await m.Venda.create({
      numero_factura: `FR${String(i).padStart(5, '0')}/26`, data_venda: day(14 + (i % 2)), total: 0, subtotal: 0,
      forma_pagamento: i % 2 ? 'Dinheiro' : 'Multicaixa', valor_pago: 0, status: i === 12 ? 'Cancelada' : 'Concluida',
      cancelamento_motivo: i === 12 ? 'Erro de digitação' : null, cancelado_por: i === 12 ? 'admin' : null,
      cliente_id: i % 3 ? clientes[i % clientes.length].id : null, usuario_id: i % 2 ? admin.id : operador.id,
    });
    let total = 0;
    for (let k = 0; k < 1 + (i % 3); k++) {
      const produto = produtos[(i + k) % produtos.length];
      const subtotal = Number(produto.preco_venda) * (k + 1);
      total += subtotal;
      await m.ItemVenda.create({ venda_id: venda.id, produto_id: produto.id, lote: `L-${1000 + k}`, quantidade: k + 1, preco_unitario: produto.preco_venda, subtotal });
    }
    await venda.update({ total, subtotal: total, valor_pago: total });
    await m.TransacaoFinanceira.create({
      tipo: 'Receita', categoria: 'Venda', origem: 'PDV', descricao: `Factura/Recibo ${venda.numero_factura}`,
      valor: total, data_transacao: venda.data_venda, status: 'Pago', referencia_venda_id: venda.id,
    });
  }
  await m.TransacaoFinanceira.create({ tipo: 'Despesa', categoria: 'Fornecedor', valor: 1200, status: 'Pendente', data_vencimento: day(30), fornecedor_id: fornecedores[0].id });
  await m.TransacaoFinanceira.create({ tipo: 'Perda', categoria: 'Validade', valor: 300, motivo_perda: 'Expirado', quantidade: 2, produto_id: produtos[3].id });

  for (let i = 1; i <= 2; i++) {
    const ordem = await m.OrdemCompra.create({
      numero: `OC-2026-00${i}`, fornecedor_id: fornecedores[i - 1].id, status: i === 1 ? 'Recebida' : 'Pendente',
      total: 2500 * i, data_emissao: '2026-07-10', data_entrega_prevista: '2026-07-20', observacao: 'Urgente', usuario_id: admin.id,
    });
    await m.ItemOrdemCompra.bulkCreate([0, 1].map((k) => ({
      ordem_compra_id: ordem.id, produto_id: produtos[k + i].id, quantidade: 10, preco_unitario: 125,
      quantidade_recebida: i === 1 ? 10 : 0, subtotal: 1250,
    })));
  }

  await m.AuditoriaUsuario.bulkCreate([
    { ator_usuario_id: admin.id, usuario_afetado_id: operador.id, acao: 'CRIAR_USUARIO', detalhes: '{"perfil":"Caixa"}' },
    { ator_usuario_id: operador.id, usuario_afetado_id: operador.id, acao: 'LOGIN_SUCESSO', detalhes: '{}' },
  ]);
  await m.ConfiguracaoSistema.bulkCreate([
    { chave: 'company.identity', grupo: 'company', tipo: 'object', valor_json: JSON.stringify({ pharmacyName: 'Farmácia ESAYOS', address: 'Loja 3, Halavala' }), versao: 3, atualizado_por_usuario_id: admin.id },
    { chave: 'backup.auto', grupo: 'backup', tipo: 'object', valor_json: '{"enabled":true,"frequency":"24h","time":"23:00"}' },
    { chave: 'alerts.sessionTimeoutMinutes', grupo: 'alerts', tipo: 'number', valor_json: '45' },
  ]);
  await m.OpcaoCatalogo.bulkCreate([
    { catalogo: 'unidades', codigo: 'cx', nome: 'Caixa', ordem: 0, sistema: true },
    { catalogo: 'unidades', codigo: 'fr', nome: 'Frasco', ordem: 1 },
    { catalogo: 'formas_pagamento', codigo: 'mcx', nome: 'Multicaixa', ordem: 0, ativo: false, metadados_json: '{"taxa":0}' },
  ]);
  await m.AuditoriaConfiguracao.bulkCreate([
    { ator_usuario_id: admin.id, tipo_alvo: 'setting', alvo_chave: 'company.identity', acao: 'update', valor_anterior_json: '{}', valor_novo_json: '{"pharmacyName":"Farmácia ESAYOS"}' },
  ]);
  await m.ReportSyncQueue.bulkCreate([
    { reportId: 'venda_dia-2026-07-14', reportType: 'venda_dia', reportData: { total: 4320.5, vendas: 11 }, status: 'synced', attempts: 1, syncedAt: day(14) },
    { reportId: 'estoque-2026-07-15', reportType: 'estoque', reportData: { itens: [1, 2, 3] }, status: 'failed', attempts: 3, errorMessage: 'Sem rede' },
  ]);
}

function assertTablesEqual(actual, expected, { skip = new Set() } = {}) {
  for (const [table, rows] of Object.entries(expected)) {
    if (skip.has(table)) continue;
    assert.ok(actual[table], `tabela ${table} em falta após restauro`);
    assert.equal(actual[table].length, rows.length, `${table}: número de linhas`);
    assert.deepEqual(actual[table], rows, `${table}: conteúdo diferente`);
  }
}

test('todas as tabelas com dados novos têm conteúdo não vazio', async () => {
  const inst = await newInstallation('kil-full-seed-');
  try {
    await seedAllTables();
    const snap = await snapshot(inst.db);
    const empty = Object.entries(snap).filter(([, rows]) => rows.length === 0).map(([t]) => t);
    assert.deepEqual(empty, [], `tabelas sem dados: ${empty.join(', ')}`);
    assert.equal(Object.keys(snap).length, Object.keys(inst.db.models).length);
  } finally {
    await inst.db.close();
    await rm(inst.dir, { recursive: true, force: true });
  }
});

test('mesma máquina: restauro repõe todas as tabelas e mantém as contas actuais', async (t) => {
  const inst = await newInstallation('kil-full-same-');
  try {
    await seedAllTables();
    const before = await snapshot(inst.db);
    const backup = await backupService.createBackup({ app: inst.app, type: 'manual' });

    // Depois do backup: perda de dados e alterações de contas.
    const m = database.getModels();
    await inst.db.query('PRAGMA foreign_keys = OFF');
    for (const t of ['ItemVendas', 'Vendas', 'Estoques', 'Produtos', 'Subcategoria', 'Categoria', 'Clientes', 'TransacaoFinanceiras']) {
      await inst.db.query(`DELETE FROM "${t}"`);
    }
    await inst.db.query('PRAGMA foreign_keys = ON');
    await m.Usuario.update({ senha_hash: hashPassword('Admin#Nova2026') }, { where: { nome_usuario: 'admin' } });
    await m.Usuario.create({ nome_usuario: 'novo', nome_completo: 'Criado depois do backup', senha_hash: hashPassword('Novo#2026'), ultimo_login_em: day(20) });

    const lost = await snapshot(inst.db);
    await backupService.restoreBackup({ app: inst.app, name: backup.name });
    await restartAndFinish(inst);

    const after = await snapshot(inst.db);
    for (const table of Object.keys(before)) {
      t.diagnostic(`${table.padEnd(24)} backup=${String(before[table].length).padStart(3)}  após perda=${String(lost[table].length).padStart(3)}  após restauro=${String(after[table].length).padStart(3)}`);
    }
    assertTablesEqual(after, before, { skip: ACCOUNT_TABLES });
    const admin = await database.getModels().Usuario.findOne({ where: { nome_usuario: 'admin' } });
    assert.equal(verifyPassword('Admin#Nova2026', admin.senha_hash), true, 'senha actual do admin mantida');
    assert.ok(await database.getModels().Usuario.findOne({ where: { nome_usuario: 'novo' } }), 'utilizador recente mantido');
    for (const user of before.Usuarios) {
      assert.ok(after.Usuarios.some((u) => u.nome_usuario === user.nome_usuario), `utilizador ${user.nome_usuario}`);
    }
    for (const row of before.AuditoriaUsuarios) {
      assert.ok(after.AuditoriaUsuarios.some((r) => r.id === row.id && r.acao === row.acao), 'auditoria do backup');
    }
  } finally {
    await inst.db.close();
    await rm(inst.dir, { recursive: true, force: true });
  }
});

test('máquina nova e restauro em cadeia: o backup prevalece por inteiro, incluindo contas', async () => {
  // Os modelos são globais: cada instalação é aberta e fechada à vez.
  const dirs = [];
  try {
    const origin = await newInstallation('kil-full-origin-');
    dirs.push(origin.dir);
    await seedAllTables();
    const before = await snapshot(origin.db);
    let backup = await backupService.createBackup({ app: origin.app, type: 'manual' });
    await origin.db.close();

    // Instalação nova (só o admin de fábrica) e, a seguir, novo backup dela
    // restaurado numa terceira máquina: tudo tem de continuar igual.
    for (const prefix of ['kil-full-second-', 'kil-full-third-']) {
      const inst = await newInstallation(prefix);
      dirs.push(inst.dir);
      mkdirSync(join(inst.dir, 'backups'), { recursive: true });
      copyFileSync(backup.path, join(inst.dir, 'backups', backup.name));
      await backupService.restoreBackup({ app: inst.app, name: backup.name });
      await restartAndFinish(inst);
      assertTablesEqual(await snapshot(inst.db), before, { skip: new Set(['AuditoriaUsuarios']) });
      const admin = await database.getModels().Usuario.findOne({ where: { nome_usuario: 'admin' } });
      assert.equal(verifyPassword('Admin#Real2026', admin.senha_hash), true, 'senha real do admin vem do backup');
      backup = await backupService.createBackup({ app: inst.app, type: 'manual' });
      await inst.db.close();
    }
  } finally {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  }
});

test('restauro interrompido (energia cortada) é retomado no arranque seguinte sem perder nada', async () => {
  const inst = await newInstallation('kil-full-crash-');
  try {
    await seedAllTables();
    const before = await snapshot(inst.db);
    const backup = await backupService.createBackup({ app: inst.app, type: 'manual' });
    await database.getModels().Usuario.update({ senha_hash: hashPassword('Admin#Nova2026') }, { where: { nome_usuario: 'admin' } });

    // 1) Corte depois de trocar o ficheiro e antes de repor as contas.
    await backupService.restoreBackup({ app: inst.app, name: backup.name });
    await inst.db.close();
    backupService.applyPendingRestore(inst.app);
    // ... arranque seguinte (a base já foi fechada pelo "corte"):
    inst.db = { close: async () => {} };
    const resumed = await restartAndFinish(inst);
    assert.equal(resumed.resumed, true);
    let admin = await database.getModels().Usuario.findOne({ where: { nome_usuario: 'admin' } });
    assert.equal(verifyPassword('Admin#Nova2026', admin.senha_hash), true);
    assertTablesEqual(await snapshot(inst.db), before, { skip: ACCOUNT_TABLES });

    // 2) Corte a meio da cópia do ficheiro (base parcial).
    await backupService.restoreBackup({ app: inst.app, name: backup.name });
    await inst.db.close();
    const dbPath = join(inst.dir, 'database.sqlite');
    copyFileSync(dbPath, join(inst.dir, 'restore-rollback.sqlite'));
    writeFileSync(dbPath, 'base parcial');
    inst.db = { close: async () => {} };
    await restartAndFinish(inst);
    admin = await database.getModels().Usuario.findOne({ where: { nome_usuario: 'admin' } });
    assert.equal(verifyPassword('Admin#Nova2026', admin.senha_hash), true);
    assertTablesEqual(await snapshot(inst.db), before, { skip: ACCOUNT_TABLES });
    assert.equal(existsSync(join(inst.dir, 'restore-rollback.sqlite')), false);
    assert.equal(backupService.hasPendingRestore(inst.app), false);
  } finally {
    await inst.db.close().catch(() => {});
    await rm(inst.dir, { recursive: true, force: true });
  }
});

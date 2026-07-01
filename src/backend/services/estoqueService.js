const { Op } = require('sequelize');
const { getModels } = require('../database');

function roundCents(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function serializeLote(row) {
  const p = typeof row.get === 'function' ? row.get({ plain: true }) : row;
  return {
    id: p.id,
    produto_id: p.produto_id,
    lote: p.lote,
    quantidade: Number(p.quantidade) || 0,
    data_validade: p.data_validade ? new Date(p.data_validade).toISOString().slice(0, 10) : null,
    data_entrada: p.data_entrada ? new Date(p.data_entrada).toISOString() : null,
    localizacao: p.localizacao || null,
  };
}

function serializeProduto(row) {
  const p = typeof row.get === 'function' ? row.get({ plain: true }) : row;
  return {
    id: p.id,
    nome: p.nome,
    codigo_barras: p.codigo_barras,
    preco_venda: roundCents(p.preco_venda),
    preco_custo: roundCents(p.preco_custo),
    estoque_minimo: Number(p.estoque_minimo) || 0,
    categoria: p.categoria || null,
    fabricante: p.fabricante || null,
    unidade_medida: p.unidade_medida || 'Unidade',
  };
}

async function getLotes(produtoId) {
  const { Estoque } = getModels();
  const rows = await Estoque.findAll({
    where: { produto_id: produtoId },
    order: [['data_validade', 'ASC'], ['data_entrada', 'ASC']],
  });
  return rows.map(serializeLote);
}

async function addStockLot({ produto_id, lote, quantidade, data_validade, localizacao, preco_custo }) {
  const { Estoque, Produto } = getModels();
  if (!produto_id) throw Object.assign(new Error('Produto e obrigatorio.'), { code: 'VALIDATION' });
  if (!quantidade || Number(quantidade) <= 0) throw Object.assign(new Error('Quantidade deve ser maior que zero.'), { code: 'VALIDATION' });
  if (!data_validade) throw Object.assign(new Error('Data de validade e obrigatoria.'), { code: 'VALIDATION' });

  const produto = await Produto.findByPk(produto_id);
  if (!produto) throw Object.assign(new Error('Produto nao encontrado.'), { code: 'NOT_FOUND' });

  const loteId = lote ? String(lote).trim() : `L${Date.now()}`;
  const row = await Estoque.create({
    produto_id: Number(produto_id),
    lote: loteId,
    quantidade: Number(quantidade),
    data_validade: new Date(data_validade),
    data_entrada: new Date(),
    localizacao: localizacao ? String(localizacao).trim() : null,
  });

  if (preco_custo && Number(preco_custo) > 0) {
    await produto.update({ preco_custo: roundCents(preco_custo) });
  }

  return serializeLote(row);
}

// FIFO: deduct from oldest lots first (earliest expiry → earliest entry)
async function deductStockFIFO({ produto_id, quantidade, motivo }) {
  const { Estoque } = getModels();
  if (!produto_id) throw Object.assign(new Error('Produto e obrigatorio.'), { code: 'VALIDATION' });
  const qty = Number(quantidade);
  if (!qty || qty <= 0) throw Object.assign(new Error('Quantidade deve ser maior que zero.'), { code: 'VALIDATION' });

  const lots = await Estoque.findAll({
    where: { produto_id: Number(produto_id), quantidade: { [Op.gt]: 0 } },
    order: [['data_validade', 'ASC'], ['data_entrada', 'ASC']],
  });

  const totalAvailable = lots.reduce((sum, l) => sum + Number(l.quantidade), 0);
  if (totalAvailable < qty) {
    throw Object.assign(
      new Error(`Estoque insuficiente. Disponivel: ${totalAvailable}, solicitado: ${qty}.`),
      { code: 'INSUFFICIENT_STOCK' },
    );
  }

  let remaining = qty;
  const deducted = [];
  for (const lot of lots) {
    if (remaining <= 0) break;
    const deduct = Math.min(Number(lot.quantidade), remaining);
    await lot.update({ quantidade: Number(lot.quantidade) - deduct });
    deducted.push({ lote: lot.lote, quantidade: deduct });
    remaining -= deduct;
  }

  return { deducted, motivo: motivo || null };
}

async function updateProductPrice({ produto_id, preco_venda, preco_custo }) {
  const { Produto } = getModels();
  const produto = await Produto.findByPk(produto_id);
  if (!produto) throw Object.assign(new Error('Produto nao encontrado.'), { code: 'NOT_FOUND' });
  const updates = {};
  if (preco_venda !== undefined && Number(preco_venda) >= 0) updates.preco_venda = roundCents(preco_venda);
  if (preco_custo !== undefined && Number(preco_custo) >= 0) updates.preco_custo = roundCents(preco_custo);
  if (Object.keys(updates).length === 0) throw Object.assign(new Error('Nenhum preco informado.'), { code: 'VALIDATION' });
  await produto.update(updates);
  return serializeProduto(produto);
}

async function listPrices({ query = '' } = {}) {
  const { Produto, Estoque } = getModels();
  const where = {};
  if (query) where.nome = { [Op.like]: `%${query}%` };
  const rows = await Produto.findAll({
    where,
    order: [['nome', 'ASC']],
    include: [{ model: Estoque, attributes: ['quantidade'], required: false }],
  });
  return rows.map((r) => {
    const p = r.get({ plain: true });
    const totalStock = (p.Estoques || []).reduce((s, e) => s + Number(e.quantidade || 0), 0);
    return { ...serializeProduto(r), totalStock };
  });
}

function formatDateDDMMYYYY(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function computeProductStatus(totalStock, estoqueMinimo) {
  if (totalStock === 0) return 'Sem estoque';
  if (totalStock <= Number(estoqueMinimo || 0)) return 'Baixo estoque';
  return 'Activo';
}

async function listProducts({ query = '', categoria = '' } = {}) {
  const { Produto, Estoque, Subcategoria } = getModels();
  const where = {};
  if (query) where.nome = { [Op.like]: `%${query}%` };
  if (categoria) where.categoria = categoria;

  const rows = await Produto.findAll({
    where,
    order: [['nome', 'ASC']],
    include: [
      { model: Estoque, required: false },
      { model: Subcategoria, required: false, attributes: ['nome'] },
    ],
  });

  return rows.map((r) => {
    const p = r.get({ plain: true });
    const lotes = (p.Estoques || []).map(serializeLote);
    const totalStock = lotes.reduce((s, l) => s + Number(l.quantidade || 0), 0);
    const activeLots = lotes
      .filter((l) => Number(l.quantidade) > 0)
      .sort((a, b) => new Date(a.data_validade) - new Date(b.data_validade));
    const nearestLot = activeLots[0] || null;
    return {
      id: p.id,
      nome: p.nome,
      codigo_barras: p.codigo_barras || '',
      preco_venda: roundCents(p.preco_venda),
      preco_custo: roundCents(p.preco_custo),
      estoque_minimo: Number(p.estoque_minimo) || 0,
      categoria: p.categoria || '',
      categoria_id: p.categoria_id || null,
      subcategoria_id: p.subcategoria_id || null,
      subcategoria_nome: p.Subcategoria?.nome || '',
      fabricante: p.fabricante || '',
      unidade_medida: p.unidade_medida || 'Unidade',
      receita_obrigatoria: Boolean(p.receita_obrigatoria),
      prateleira: p.prateleira || '',
      gaveta: p.gaveta || '',
      zona: p.zona || '',
      observacao_localizacao: p.observacao_localizacao || '',
      totalStock,
      status: computeProductStatus(totalStock, p.estoque_minimo),
      dataValidade: nearestLot ? formatDateDDMMYYYY(nearestLot.data_validade) : null,
      localizacao: nearestLot?.localizacao || p.prateleira || null,
      imagem: p.imagem || null,
      lotes,
    };
  });
}

async function createProduct(data) {
  const { Produto, Subcategoria, Categoria } = getModels();
  if (!data.nome) throw Object.assign(new Error('Nome do produto e obrigatorio.'), { code: 'VALIDATION' });
  if (!data.codigo_barras) throw Object.assign(new Error('Codigo de barras e obrigatorio.'), { code: 'VALIDATION' });

  // Accept pre-resolved IDs from importProducts (avoids redundant lookups)
  let categoria_id = data.categoria_id != null ? data.categoria_id : null;
  if (!categoria_id && data.categoria) {
    const cat = await Categoria.findOne({ where: { nome: data.categoria } });
    if (cat) categoria_id = cat.id;
  }

  let subcategoria_id = data.subcategoria_id != null ? data.subcategoria_id : null;
  if (!subcategoria_id && data.subcategoria && categoria_id) {
    const sub = await Subcategoria.findOne({ where: { nome: data.subcategoria, categoria_id } });
    if (sub) subcategoria_id = sub.id;
  }

  const produto = await Produto.create({
    nome: String(data.nome).trim(),
    codigo_barras: String(data.codigo_barras).trim(),
    preco_venda: roundCents(data.preco_venda ?? 0),
    preco_custo: data.preco_custo ? roundCents(data.preco_custo) : null,
    categoria: data.categoria || null,
    categoria_id,
    subcategoria_id,
    fabricante: data.fabricante || null,
    unidade_medida: data.unidade_medida || 'Unidade',
    estoque_minimo: Number(data.estoque_minimo) || 0,
    receita_obrigatoria: Boolean(data.receita_obrigatoria),
    prateleira: data.localizacao || data.prateleira || null,
    gaveta: data.gaveta || null,
    zona: data.zona || null,
    observacao_localizacao: data.observacao_localizacao || null,
    imagem: data.imagem || null,
  });

  return serializeProduto(produto);
}

async function updateProduct({ produto_id, ...data }) {
  const { Produto, Subcategoria, Categoria } = getModels();
  const produto = await Produto.findByPk(produto_id);
  if (!produto) throw Object.assign(new Error('Produto nao encontrado.'), { code: 'NOT_FOUND' });

  const updates = {};
  if (data.nome !== undefined) updates.nome = String(data.nome).trim();
  if (data.codigo_barras !== undefined) updates.codigo_barras = String(data.codigo_barras).trim();
  if (data.preco_venda !== undefined) updates.preco_venda = roundCents(data.preco_venda);
  if (data.preco_custo !== undefined) updates.preco_custo = data.preco_custo ? roundCents(data.preco_custo) : null;
  if (data.fabricante !== undefined) updates.fabricante = data.fabricante || null;
  if (data.unidade_medida !== undefined) updates.unidade_medida = data.unidade_medida;
  if (data.estoque_minimo !== undefined) updates.estoque_minimo = Number(data.estoque_minimo) || 0;
  if (data.receita_obrigatoria !== undefined) updates.receita_obrigatoria = Boolean(data.receita_obrigatoria);
  if (data.observacao_localizacao !== undefined) updates.observacao_localizacao = data.observacao_localizacao || null;
  if (data.localizacao !== undefined) updates.prateleira = data.localizacao || null;
  if (data.prateleira !== undefined) updates.prateleira = data.prateleira || null;
  if (data.gaveta !== undefined) updates.gaveta = data.gaveta || null;
  if (data.zona !== undefined) updates.zona = data.zona || null;
  if (data.imagem !== undefined) updates.imagem = data.imagem || null;

  if (data.categoria !== undefined) {
    updates.categoria = data.categoria || null;
    if (data.categoria) {
      const cat = await Categoria.findOne({ where: { nome: data.categoria } });
      updates.categoria_id = cat ? cat.id : null;
    } else {
      updates.categoria_id = null;
    }
  }

  if (data.subcategoria !== undefined) {
    const categoriaId = updates.categoria_id ?? produto.categoria_id;
    if (data.subcategoria && categoriaId) {
      const sub = await Subcategoria.findOne({ where: { nome: data.subcategoria, categoria_id: categoriaId } });
      updates.subcategoria_id = sub ? sub.id : null;
    } else {
      updates.subcategoria_id = null;
    }
  }

  await produto.update(updates);
  return serializeProduto(produto);
}

async function deleteProduct(produto_id) {
  const { Produto, Estoque, ItemVenda } = getModels();
  const produto = await Produto.findByPk(produto_id);
  if (!produto) throw Object.assign(new Error('Produto nao encontrado.'), { code: 'NOT_FOUND' });

  const salesCount = await ItemVenda.count({ where: { produto_id: Number(produto_id) } });
  if (salesCount > 0) {
    throw Object.assign(new Error('Produto nao pode ser removido: possui vendas registadas.'), { code: 'CONSTRAINT' });
  }

  await Estoque.destroy({ where: { produto_id: Number(produto_id) } });
  await produto.destroy();
  return { ok: true };
}

async function getProduct(produto_id) {
  const { Produto, Estoque, Subcategoria } = getModels();
  const produto = await Produto.findByPk(produto_id, {
    include: [
      { model: Estoque, required: false },
      { model: Subcategoria, required: false, attributes: ['nome'] },
    ],
  });
  if (!produto) throw Object.assign(new Error('Produto nao encontrado.'), { code: 'NOT_FOUND' });

  const p = produto.get({ plain: true });
  const lotes = (p.Estoques || []).map(serializeLote);
  const totalStock = lotes.reduce((s, l) => s + Number(l.quantidade || 0), 0);
  const activeLots = lotes
    .filter((l) => Number(l.quantidade) > 0)
    .sort((a, b) => new Date(a.data_validade) - new Date(b.data_validade));
  const nearestLot = activeLots[0] || null;

  return {
    id: p.id,
    nome: p.nome,
    codigo_barras: p.codigo_barras || '',
    preco_venda: roundCents(p.preco_venda),
    preco_custo: roundCents(p.preco_custo),
    estoque_minimo: Number(p.estoque_minimo) || 0,
    categoria: p.categoria || '',
    categoria_id: p.categoria_id || null,
    subcategoria_id: p.subcategoria_id || null,
    subcategoria_nome: p.Subcategoria?.nome || '',
    fabricante: p.fabricante || '',
    unidade_medida: p.unidade_medida || 'Unidade',
    receita_obrigatoria: Boolean(p.receita_obrigatoria),
    prateleira: p.prateleira || '',
    gaveta: p.gaveta || '',
    zona: p.zona || '',
    observacao_localizacao: p.observacao_localizacao || '',
    totalStock,
    status: computeProductStatus(totalStock, p.estoque_minimo),
    dataValidade: nearestLot ? formatDateDDMMYYYY(nearestLot.data_validade) : null,
    localizacao: nearestLot?.localizacao || p.prateleira || null,
    lotes,
  };
}

async function listCategories() {
  const { Categoria, Produto } = getModels();
  const rows = await Categoria.findAll({
    where: { ativo: true },
    order: [['nome', 'ASC']],
    include: [{ model: Produto, attributes: ['id'], required: false }],
  });
  return rows.map((r) => {
    const c = r.get({ plain: true });
    return {
      id: c.id,
      nome: c.nome,
      codigo: c.codigo || '',
      descricao: c.descricao || '',
      imagem: c.imagem || null,
      count: (c.Produtos || []).length,
    };
  });
}

function generateCategoryCode(nome) {
  const initials = String(nome)
    .split(/\s+/)
    .map((w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '')[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 6);
  return initials || String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase();
}

async function createCategory({ nome, codigo, descricao, imagem } = {}) {
  const { Categoria } = getModels();
  if (!nome) throw Object.assign(new Error('Nome da categoria e obrigatorio.'), { code: 'VALIDATION' });

  let base = codigo ? String(codigo).trim().toUpperCase() : generateCategoryCode(nome);
  // ensure uniqueness by appending a counter if needed
  let codigoFinal = base;
  let attempt = 1;
  while (await Categoria.findOne({ where: { codigo: codigoFinal } })) {
    attempt++;
    codigoFinal = `${base}${attempt}`;
  }

  const cat = await Categoria.create({
    nome: String(nome).trim(),
    codigo: codigoFinal,
    descricao: descricao || null,
    imagem: imagem || null,
    ativo: true,
  });
  return { id: cat.id, nome: cat.nome, codigo: cat.codigo, descricao: cat.descricao || '', imagem: cat.imagem || null, count: 0 };
}

async function updateCategory({ id, nome, descricao, imagem } = {}) {
  const { Categoria } = getModels();
  if (!id) throw Object.assign(new Error('ID da categoria e obrigatorio.'), { code: 'VALIDATION' });
  const cat = await Categoria.findByPk(id);
  if (!cat) throw Object.assign(new Error('Categoria nao encontrada.'), { code: 'NOT_FOUND' });
  const updates = {};
  if (nome !== undefined) updates.nome = String(nome).trim();
  if (descricao !== undefined) updates.descricao = descricao || null;
  if (imagem !== undefined) updates.imagem = imagem || null;
  await cat.update(updates);
  return { id: cat.id, nome: cat.nome, codigo: cat.codigo, descricao: cat.descricao || '', imagem: cat.imagem || null };
}

async function deleteCategory({ id } = {}) {
  const { Categoria, Produto } = getModels();
  if (!id) throw Object.assign(new Error('ID da categoria e obrigatorio.'), { code: 'VALIDATION' });
  const cat = await Categoria.findByPk(id);
  if (!cat) throw Object.assign(new Error('Categoria nao encontrada.'), { code: 'NOT_FOUND' });
  const count = await Produto.count({ where: { categoria_id: Number(id) } });
  if (count > 0) throw Object.assign(new Error('Categoria possui produtos associados.'), { code: 'CONFLICT' });
  await cat.update({ ativo: false });
  return { ok: true };
}

async function listSubcategories({ categoria_id = null } = {}) {
  const { Subcategoria, Categoria } = getModels();
  const where = {};
  if (categoria_id) where.categoria_id = Number(categoria_id);
  const rows = await Subcategoria.findAll({
    where,
    order: [['nome', 'ASC']],
    include: [{ model: Categoria, required: false, attributes: ['nome'] }],
  });
  return rows.map((r) => {
    const s = r.get({ plain: true });
    return {
      id: s.id,
      nome: s.nome,
      categoria_id: s.categoria_id,
      categoria_nome: s.Categoria?.nome || '',
      descricao: s.descricao || '',
      imagem: s.imagem || null,
    };
  });
}

async function createSubcategory({ nome, categoria_nome, categoria_id: catId, descricao, imagem } = {}) {
  const { Subcategoria, Categoria } = getModels();
  if (!nome) throw Object.assign(new Error('Nome da subcategoria e obrigatorio.'), { code: 'VALIDATION' });
  let categoria;
  if (catId) {
    categoria = await Categoria.findByPk(catId);
  } else if (categoria_nome) {
    categoria = await Categoria.findOne({ where: { nome: categoria_nome } });
  }
  if (!categoria) throw Object.assign(new Error('Categoria nao encontrada.'), { code: 'NOT_FOUND' });
  const sub = await Subcategoria.create({
    nome: String(nome).trim(),
    categoria_id: categoria.id,
    descricao: descricao || null,
    imagem: imagem || null,
    ativo: true,
  });
  return { id: sub.id, nome: sub.nome, categoria_id: categoria.id, categoria_nome: categoria.nome, descricao: sub.descricao || '', imagem: sub.imagem || null };
}

async function updateSubcategory({ id, nome, descricao, imagem } = {}) {
  const { Subcategoria } = getModels();
  if (!id) throw Object.assign(new Error('ID da subcategoria e obrigatorio.'), { code: 'VALIDATION' });
  const sub = await Subcategoria.findByPk(id);
  if (!sub) throw Object.assign(new Error('Subcategoria nao encontrada.'), { code: 'NOT_FOUND' });
  const updates = {};
  if (nome !== undefined) updates.nome = String(nome).trim();
  if (descricao !== undefined) updates.descricao = descricao || null;
  if (imagem !== undefined) updates.imagem = imagem || null;
  await sub.update(updates);
  return { id: sub.id, nome: sub.nome, imagem: sub.imagem || null };
}

async function deleteSubcategory({ id } = {}) {
  const { Subcategoria, Produto } = getModels();
  if (!id) throw Object.assign(new Error('ID da subcategoria e obrigatorio.'), { code: 'VALIDATION' });
  const sub = await Subcategoria.findByPk(id);
  if (!sub) throw Object.assign(new Error('Subcategoria nao encontrada.'), { code: 'NOT_FOUND' });
  const count = await Produto.count({ where: { subcategoria_id: Number(id) } });
  if (count > 0) throw Object.assign(new Error('Subcategoria possui produtos associados.'), { code: 'CONFLICT' });
  await sub.update({ ativo: false });
  return { ok: true };
}

async function importCategories(rows = []) {
  const results = { created: 0, skipped: 0, errors: [] };
  for (const row of rows) {
    try {
      await createCategory({ nome: row.name, descricao: row.descricao || null });
      results.created++;
    } catch (e) {
      if (e.name === 'SequelizeUniqueConstraintError' || (e.message || '').includes('ja existe') || (e.message || '').includes('UNIQUE')) {
        results.skipped++;
      } else {
        results.errors.push({ name: row.name, reason: e.message });
      }
    }
  }
  return results;
}

function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function importSubcategories(rows = []) {
  const { Categoria } = getModels();
  // Build normalized category lookup once: "materialclinico" → Categoria instance
  const allCategories = await Categoria.findAll({ where: { ativo: true } });
  const categoryMap = new Map(allCategories.map((c) => [normalizeKey(c.nome), c]));

  const results = { created: 0, skipped: 0, errors: [] };
  for (const row of rows) {
    try {
      const categoria = categoryMap.get(normalizeKey(row.category || ''));
      if (!categoria) {
        results.errors.push({ name: row.name, reason: `Categoria "${row.category}" nao encontrada.` });
        continue;
      }
      await createSubcategory({ nome: row.name, categoria_id: categoria.id, descricao: row.descricao || null });
      results.created++;
    } catch (e) {
      if (e.name === 'SequelizeUniqueConstraintError' || (e.message || '').includes('UNIQUE')) {
        results.skipped++;
      } else {
        results.errors.push({ name: row.name, reason: e.message });
      }
    }
  }
  return results;
}

function parseImportDate(value) {
  if (!value) return null;
  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value).trim());
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`;
  return String(value).trim() || null;
}

// Same normalisation as normalizeImportKey in pharmacyData.mjs — keep in sync.
function normalizeImportKey(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*\/+\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

async function importProducts(rows = []) {
  const { Categoria, Subcategoria } = getModels();

  // Build normalised combined-key map: "medicamento/analgesico" → { categoria_id, subcategoria_id, categoria_nome, subcategoria_nome }
  const allCategories = await Categoria.findAll({ where: { ativo: true } });
  const allSubcategories = await Subcategoria.findAll({ where: { ativo: true } });

  const subcatMap = new Map();
  for (const sub of allSubcategories) {
    const cat = allCategories.find((c) => c.id === sub.categoria_id);
    if (!cat) continue;
    const key = normalizeImportKey(`${cat.nome}/${sub.nome}`);
    subcatMap.set(key, { categoria_id: cat.id, subcategoria_id: sub.id, categoria_nome: cat.nome, subcategoria_nome: sub.nome });
  }

  const catMap = new Map(allCategories.map((c) => [normalizeImportKey(c.nome), c]));

  const results = { created: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    try {
      const csvCat = String(row.category || '').trim();
      const csvSub = String(row.subcategory || '').trim();

      let categoria_id = null;
      let subcategoria_id = null;
      let categoria_nome = null;

      if (csvCat && csvSub) {
        const key = normalizeImportKey(`${csvCat}/${csvSub}`);
        const resolved = subcatMap.get(key);
        if (!resolved) {
          // Diagnostic: show what keys exist for the given category
          const catKey = normalizeImportKey(csvCat);
          const availableKeys = Array.from(subcatMap.keys()).filter((k) => k.startsWith(catKey + '/'));
          results.errors.push({
            name: row.name,
            reason: `Subcategoria nao encontrada. CSV: "${csvCat}/${csvSub}" → chave: "${key}". Chaves disponiveis para esta categoria: ${availableKeys.slice(0, 5).join(', ') || '(nenhuma)'}`,
          });
          continue;
        }
        categoria_id = resolved.categoria_id;
        subcategoria_id = resolved.subcategoria_id;
        categoria_nome = resolved.categoria_nome;
      } else if (csvCat) {
        const cat = catMap.get(normalizeImportKey(csvCat));
        if (cat) { categoria_id = cat.id; categoria_nome = cat.nome; }
      }

      const produto = await createProduct({
        nome: row.name,
        categoria: categoria_nome,
        categoria_id,
        subcategoria_id,
        preco_venda: row.price || 0,
        localizacao: row.location || null,
        codigo_barras: row.id || `IMP-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      });

      if (row.quantity > 0) {
        await addStockLot({
          produto_id: produto.id,
          quantidade: row.quantity,
          data_validade: parseImportDate(row.expiry),
          lote: null,
          preco_custo: null,
        });
      }
      results.created++;
    } catch (e) {
      if (e.name === 'SequelizeUniqueConstraintError' || (e.message || '').includes('UNIQUE')) {
        results.skipped++;
      } else {
        results.errors.push({ name: row.name, reason: e.message });
      }
    }
  }
  return results;
}

const SAFE_ERRORS = Object.freeze([
  'Produto e obrigatorio.',
  'Quantidade deve ser maior que zero.',
  'Data de validade e obrigatoria.',
  'Produto nao encontrado.',
  'Nenhum preco informado.',
  'Nome do produto e obrigatorio.',
  'Codigo de barras e obrigatorio.',
  'Produto nao pode ser removido: possui vendas registadas.',
  'Nome da categoria e obrigatorio.',
  'Nome da subcategoria e obrigatorio.',
  'Categoria e obrigatoria.',
  'Categoria nao encontrada.',
  'Categoria possui produtos associados.',
  'Subcategoria possui produtos associados.',
  'Subcategoria nao encontrada.',
]);

module.exports = {
  getLotes,
  addStockLot,
  deductStockFIFO,
  updateProductPrice,
  listPrices,
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProduct,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  importCategories,
  importSubcategories,
  importProducts,
  SAFE_ERRORS,
};

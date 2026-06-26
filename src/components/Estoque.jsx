import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { request } from '../services/ipcClient.js';
import * as XLSX from 'xlsx';
import InventarioA4 from './InventarioA4';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  Filter,
  ImagePlus,
  MoreVertical,
  MinusCircle,
  PackagePlus,
  Pencil,
  PlusCircle,
  Search,
  Tags,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  STOCK_OUT_REASONS,
  buildExpiryAlerts,
  buildStockFormOptions,
  buildStockImportReference,
  buildStockInventoryCount,
  buildStockListPage,
  buildStockMetrics,
  daysUntilExpiry,
  formatKwanza,
  getExpiryStatus,
  parseStockImportCsv,
  parseStockCategoryImportCsv,
  parseStockSubcategoryImportCsv,
  validateStockCategoryImportRows,
  validateStockProductImportRows,
  validateStockSubcategoryImportRows,
} from '../data/pharmacyData.mjs';
import { confirmDelete } from '../utils/confirmations.mjs';
import { CATALOG_KEYS } from '../configuration/catalogKeys.mjs';
import { useCatalog } from '../configuration/SettingsContext';

function mapProductToRow(p) {
  return {
    id: p.id,
    name: p.nome,
    category: p.categoria || '',
    subcategory: p.subcategoria_nome || '',
    price: p.preco_venda,
    quantity: p.totalStock,
    expiry: p.dataValidade || '-',
    location: p.localizacao || '-',
    status: p.status,
    requiresPrescription: p.receita_obrigatoria,
    codigo_barras: p.codigo_barras,
    fabricante: p.fabricante,
    prateleira: p.prateleira,
    gaveta: p.gaveta,
    zona: p.zona,
    observacao_localizacao: p.observacao_localizacao,
    categoria_id: p.categoria_id,
    subcategoria_id: p.subcategoria_id,
    imagem: p.imagem || null,
    lotes: p.lotes || [],
  };
}

const modalTitles = {
  product: 'Novo Produto',
  editProduct: 'Editar Produto',
  viewProduct: 'Detalhes do Produto',
  category: 'Nova Categoria',
  subcategory: 'Nova Subcategoria',
  filter: 'Filtrar Produtos',
  importProducts: 'Importar Produtos',
  inventory: 'Contagem de Inventario',
  stockIn: 'Adicionar Quantidade',
  stockOut: 'Dar Baixa de Produto',
  prices: 'Gestão de Preços',
};

const visibleCategoryCount = 8;

function Estoque() {
  const stockUnits = useCatalog(CATALOG_KEYS.STOCK_UNITS);
  const productLocations = useCatalog(CATALOG_KEYS.PRODUCT_LOCATIONS);
  const [activeModal, setActiveModal] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeFilters, setActiveFilters] = useState({ category: '', location: '', expiry: '' });
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [categoryOffset, setCategoryOffset] = useState(0);
  const [subcatPage, setSubcatPage] = useState(0);
  const [openActionsId, setOpenActionsId] = useState(null);
  const [menuOpenUp, setMenuOpenUp] = useState(false);
  const [categoryRows, setCategoryRows] = useState([]);
  const [subcategoryRows, setSubcategoryRows] = useState([]);
  const [activeSubcategory, setActiveSubcategory] = useState(null);
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [products, categories, subcategories] = await Promise.all([
        request('estoque.listProducts', {}),
        request('estoque.listCategories'),
        request('estoque.listSubcategories', {}),
      ]);
      setRows(products.map(mapProductToRow));
      setCategoryRows(categories);
      setSubcategoryRows(subcategories);
    } catch (err) {
      console.error('Erro ao carregar estoque:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const referenceRows = useMemo(
    () => [
      ...rows,
      ...categoryRows.map((c) => ({ category: c.nome, subcategory: '' })),
      ...subcategoryRows.map((s) => ({ category: s.categoria_nome, subcategory: s.nome })),
    ],
    [categoryRows, rows, subcategoryRows],
  );
  const metrics = buildStockMetrics(rows);
  const categoryCards = useMemo(() => {
    const counts = new Map(metrics.categories.map((c) => [c.name, c.count]));
    return categoryRows.map((cat) => ({
      id: cat.id,
      name: cat.nome,
      imagem: cat.imagem || null,
      count: counts.get(cat.nome) ?? 0,
      icon: cat.nome.split(/\s+/).map((w) => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '')[0] || '').join('').toUpperCase().slice(0, 3) || '?',
    }));
  }, [categoryRows, metrics.categories]);
  const visibleCategories = useMemo(
    () => Array.from(
      { length: Math.min(visibleCategoryCount, categoryCards.length) },
      (_, index) => categoryCards[(categoryOffset + index) % categoryCards.length],
    ),
    [categoryCards, categoryOffset],
  );
  const formOptions = useMemo(() => buildStockFormOptions(referenceRows), [referenceRows]);
  const importReference = useMemo(() => buildStockImportReference(referenceRows), [referenceRows]);
  const filteredItems = useMemo(
    () => rows.filter((item) => {
      const matchesQuery = [item.id, item.name, item.category, item.subcategory, item.location]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesStatus = !statusFilter || item.status === statusFilter;
      const matchesCategory = !activeFilters.category || item.category === activeFilters.category;
      const matchesSubcat = !activeSubcategory || item.subcategory === activeSubcategory;
      const matchesLocation = !activeFilters.location || item.location === activeFilters.location;
      let matchesExpiry = true;
      if (activeFilters.expiry) {
        const days = daysUntilExpiry(item.expiry);
        if (activeFilters.expiry === 'expired') matchesExpiry = days !== null && days < 0;
        else if (activeFilters.expiry === '30') matchesExpiry = days !== null && days >= 0 && days <= 30;
        else if (activeFilters.expiry === '60') matchesExpiry = days !== null && days >= 0 && days <= 60;
        else if (activeFilters.expiry === '90') matchesExpiry = days !== null && days >= 0 && days <= 90;
      }
      return matchesQuery && matchesStatus && matchesCategory && matchesSubcat && matchesLocation && matchesExpiry;
    }),
    [query, statusFilter, activeFilters, activeSubcategory, rows],
  );
  const listPage = useMemo(
    () => buildStockListPage(filteredItems, currentPage, itemsPerPage),
    [currentPage, filteredItems, itemsPerPage],
  );
  const paginationRange = buildPaginationRange(listPage.currentPage, listPage.totalPages);

  function openModal(type, item = null) {
    setOpenActionsId(null);
    setSelectedItem(item);
    setActiveModal(type);
  }

  function closeModal() {
    setActiveModal(null);
    setSelectedItem(null);
  }

  async function deleteRow(item) {
    setOpenActionsId(null);
    if (!(await confirmDelete(`o produto ${item.name}`))) return;
    try {
      await request('estoque.deleteProduct', { produto_id: item.id });
      loadData();
    } catch (err) {
      alert(err?.message || 'Erro ao remover produto.');
    }
  }

  function updateQuery(value) {
    setQuery(value);
    setCurrentPage(1);
  }

  function updateItemsPerPage(value) {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  }

  function rotateCategories(direction) {
    setCategoryOffset((current) => {
      if (!categoryCards.length) return 0;
      return (current + direction + categoryCards.length) % categoryCards.length;
    });
  }

  async function handleSaveProduct(data, existingId) {
    const payload = {
      nome: data.name,
      codigo_barras: data.barcode || `AUTO-${Date.now()}`,
      preco_venda: Number(data.price) || 0,
      categoria: data.category || null,
      subcategoria: data.subcategory || null,
      unidade_medida: data.unit || 'Unidade',
      receita_obrigatoria: Boolean(data.requiresPrescription),
      observacao_localizacao: data.notes || null,
      localizacao: data.localizacao || null,
      imagem: data.imagem || null,
    };
    if (existingId) {
      await request('estoque.updateProduct', { produto_id: existingId, ...payload });
    } else {
      await request('estoque.createProduct', payload);
    }
    loadData();
  }

  async function handleSaveCategory(data) {
    if (data.id) {
      await request('estoque.updateCategory', { id: data.id, nome: data.nome, descricao: data.descricao, imagem: data.imagem || null });
    } else {
      await request('estoque.createCategory', { nome: data.nome, codigo: data.codigo, descricao: data.descricao, imagem: data.imagem || null });
    }
    loadData();
  }

  async function handleDeleteCategory(cat) {
    const ok = await confirmDelete(`Eliminar categoria "${cat.nome}"?`);
    if (!ok) return;
    try {
      await request('estoque.deleteCategory', { id: cat.id });
      loadData();
    } catch (e) {
      alert(e.message || 'Erro ao eliminar categoria.');
    }
  }

  async function handleSaveSubcategory(data) {
    if (data.id) {
      await request('estoque.updateSubcategory', { id: data.id, nome: data.nome, descricao: data.descricao, imagem: data.imagem || null });
    } else {
      await request('estoque.createSubcategory', { nome: data.nome, categoria_nome: data.categoria_nome, descricao: data.descricao, imagem: data.imagem || null });
    }
    loadData();
  }

  async function handleDeleteSubcategory(sub) {
    const ok = await confirmDelete(`Eliminar subcategoria "${sub.nome}"?`);
    if (!ok) return;
    try {
      await request('estoque.deleteSubcategory', { id: sub.id });
      loadData();
    } catch (e) {
      alert(e.message || 'Erro ao eliminar subcategoria.');
    }
  }

  function handleApplyFilter(filterData) {
    setStatusFilter(filterData.status ?? '');
    setActiveFilters({ category: filterData.category ?? '', location: filterData.location ?? '', expiry: filterData.expiry ?? '' });
    setCurrentPage(1);
  }

  function handleStatusChange(val) {
    setStatusFilter(val);
    setCurrentPage(1);
  }

  async function handleStockMovement(type, movement) {
    try {
      if (type === 'stockIn') {
        await request('estoque.addLot', {
          produto_id: selectedItem?.id,
          lote: movement.lote,
          quantidade: movement.quantity,
          data_validade: movement.dataValidade,
          preco_custo: movement.precoCusto || null,
          localizacao: movement.localizacao || null,
        });
      } else {
        await request('estoque.deduct', {
          produto_id: selectedItem?.id,
          quantidade: movement.quantity,
          motivo: movement.reason,
        });
      }
      await loadData();
      closeModal();
    } catch (err) {
      alert(err?.message || 'Erro ao registar movimento de estoque.');
    }
  }

  function exportProductsExcel() {
    const headers = ['Código', 'Produto', 'Categoria', 'Subcategoria', 'Preço', 'Quantidade', 'Status', 'Validade', 'Localização'];
    const dataRows = filteredItems.map((r) => [
      r.id, r.name, r.category || '', r.subcategory || '',
      r.price, r.quantity, r.status || '', r.expiry || '', r.location || '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
    XLSX.writeFile(wb, `estoque-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function handleImport(mode, acceptedRows) {
    if (!acceptedRows?.length) { closeModal(); return; }
    try {
      const action = mode === 'categories'
        ? 'estoque.importCategories'
        : mode === 'subcategories'
          ? 'estoque.importSubcategories'
          : 'estoque.importProducts';
      const result = await request(action, { rows: acceptedRows });
      const created = result?.created ?? 0;
      const skipped = result?.skipped ?? 0;
      const errors = result?.errors ?? [];
      const lines = [`Importação concluída: ${created} criados, ${skipped} ignorados (já existiam).`];
      if (errors.length) {
        lines.push(`\n${errors.length} erro(s):`);
        errors.slice(0, 20).forEach((e) => lines.push(`  • ${e.name}: ${e.reason}`));
        if (errors.length > 20) lines.push(`  ... e mais ${errors.length - 20} erros.`);
      }
      alert(lines.join('\n'));
    } catch (err) {
      alert(err?.message || 'Erro ao importar.');
    } finally {
      loadData();
      closeModal();
    }
  }

  const expiryAlerts = useMemo(() => buildExpiryAlerts(rows), [rows]);

  function applyExpiryQuickFilter(value) {
    setActiveFilters((prev) => ({ ...prev, expiry: prev.expiry === value ? '' : value }));
    setCurrentPage(1);
  }

  if (loading && !rows.length) {
    return (
      <section className="stock-screen">
        <div className="empty-state"><PackagePlus size={32} /><strong>A carregar estoque...</strong></div>
      </section>
    );
  }

  return (
    <section className="stock-screen">
      <div className="stock-summary">
        <SummaryCard title="Total de Produtos" value={metrics.totalProducts} icon={PackagePlus} />
        <SummaryCard title="Itens Baixo Estoque" value={metrics.lowStock} icon={AlertTriangle} tone="warning" />
        <SummaryCard title="Itens fora de Estoque" value={metrics.outOfStock} icon={XCircle} tone="danger" />
        {expiryAlerts.expired > 0 && (
          <SummaryCard
            title="Produtos Vencidos"
            value={expiryAlerts.expired}
            icon={AlertTriangle}
            tone="danger"
            onClick={() => applyExpiryQuickFilter('expired')}
            active={activeFilters.expiry === 'expired'}
          />
        )}
        {expiryAlerts.critical > 0 && (
          <SummaryCard
            title="Vencem em 30 dias"
            value={expiryAlerts.critical}
            icon={AlertTriangle}
            tone="warning"
            onClick={() => applyExpiryQuickFilter('30')}
            active={activeFilters.expiry === '30'}
          />
        )}
      </div>

      <div className="stock-category-carousel">
        <button className="circle-action" type="button" aria-label="Categorias anteriores" onClick={() => rotateCategories(-visibleCategoryCount)}>
          <ChevronLeft size={20} />
        </button>
        <div className="stock-category-grid">
          {visibleCategories.map((category) => (
            <div className="stock-category-card-wrap" key={category.name}>
              <button type="button" className="stock-category-card">
                {category.imagem
                  ? <img src={category.imagem} alt={category.name} className="category-card-img" />
                  : <span className="category-symbol">{category.icon}</span>}
                <div>
                  <h3>{category.name}</h3>
                  <strong>{category.count}</strong>
                </div>
              </button>
              <div className="cat-card-actions">
                <button type="button" title="Editar" onClick={() => openModal('category', category)}><Pencil size={12} /></button>
                <button type="button" title="Eliminar" onClick={() => handleDeleteCategory(category)}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
        <button className="circle-action" type="button" aria-label="Proximas categorias" onClick={() => rotateCategories(visibleCategoryCount)}>
          <ChevronRight size={20} />
        </button>
      </div>

      {subcategoryRows.length > 0 && (() => {
        const SUBCAT_PER_PAGE = 24;
        const totalPages = Math.ceil((subcategoryRows.length + 1) / SUBCAT_PER_PAGE);
        const safePage = Math.min(subcatPage, totalPages - 1);
        const allChips = [null, ...subcategoryRows];
        const pageChips = allChips.slice(safePage * SUBCAT_PER_PAGE, safePage * SUBCAT_PER_PAGE + SUBCAT_PER_PAGE);
        return (
          <div className="stock-subcategory-carousel">
            <button
              className="circle-action"
              type="button"
              aria-label="Subcategorias anteriores"
              disabled={safePage === 0}
              onClick={() => setSubcatPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="stock-subcategory-grid">
              {pageChips.map((sub) =>
                sub === null ? (
                  <button
                    key="__todas"
                    type="button"
                    className={`subcat-chip${activeSubcategory === null ? ' active' : ''}`}
                    onClick={() => setActiveSubcategory(null)}
                  >
                    Todas
                  </button>
                ) : (
                  <div key={sub.id} className="subcat-chip-wrap">
                    <button
                      type="button"
                      className={`subcat-chip${activeSubcategory === sub.nome ? ' active' : ''}`}
                      onClick={() => setActiveSubcategory(activeSubcategory === sub.nome ? null : sub.nome)}
                    >
                      {sub.imagem ? <img src={sub.imagem} alt={sub.nome} className="subcat-chip-img" /> : null}
                      {sub.nome}
                    </button>
                    <div className="subcat-chip-actions">
                      <button type="button" title="Editar" onClick={() => openModal('subcategory', sub)}><Pencil size={11} /></button>
                      <button type="button" title="Eliminar" onClick={() => handleDeleteSubcategory(sub)}><Trash2 size={11} /></button>
                    </div>
                  </div>
                )
              )}
            </div>
            <button
              className="circle-action"
              type="button"
              aria-label="Próximas subcategorias"
              disabled={safePage >= totalPages - 1}
              onClick={() => setSubcatPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        );
      })()}

      <div className="stock-table-panel panel">
        <div className="stock-toolbar">
          <div className="stock-search">
            <Search size={20} />
            <input
              aria-label="Pesquisar no estoque"
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              placeholder="Pesquisar produto, status ou localização"
            />
          </div>
          <div className="stock-toolbar-actions">
            <button type="button" onClick={() => openModal('product')}><PlusCircle size={17} /> Novo Produto</button>
            <button type="button" onClick={() => openModal('importProducts')}><Upload size={17} /> Importar</button>
            <button type="button" onClick={() => openModal('inventory')}><ClipboardList size={17} /> Inventario</button>
            <button type="button" onClick={() => openModal('prices')}><Tags size={17} /> Preços</button>
            <button type="button" onClick={() => openModal('category')}><Tags size={17} /> Categoria</button>
            <button type="button" onClick={() => openModal('subcategory')}><Tags size={17} /> Subcategoria</button>
            <button type="button" onClick={() => openModal('filter')}><Filter size={17} /> Filtrar</button>
            <button type="button" onClick={exportProductsExcel}><Download size={17} /> Exportar</button>
          </div>
        </div>

        <table className="stock-main-table">
          <colgroup>
            <col className="col-id" />
            <col className="col-name" />
            <col className="col-cat" />
            <col className="col-qty" />
            <col className="col-price" />
            <col className="col-expiry" />
            <col className="col-status" />
            <col className="col-location" />
            <col className="col-opts" />
          </colgroup>
          <thead>
            <tr>
              <th>Id</th>
              <th>Designação</th>
              <th>Categoria</th>
              <th>Quant.</th>
              <th>Preço</th>
              <th>Validade</th>
              <th>Status</th>
              <th>Localização</th>
              <th>Opções</th>
            </tr>
          </thead>
          <tbody>
            {listPage.rows.map((item) => {
              const expiryStatus = getExpiryStatus(item.expiry);
              return (
              <tr key={item.id} className={expiryStatus !== 'ok' && expiryStatus !== 'unknown' ? `row-expiry-${expiryStatus}` : undefined}>
                <td>{item.id}</td>
                <td>{item.name}</td>
                <td>{item.category}</td>
                <td>{item.quantity}</td>
                <td>{formatKwanza(item.price).replace('KZ ', '')}</td>
                <td>
                  <span className={`expiry-cell expiry-${expiryStatus}`}>{item.expiry}</span>
                </td>
                <td><span className={getStockStatusClass(item.status)}>{item.status}</span></td>
                <td>{item.location}</td>
                <td className="stock-options-menu-cell">
                  <button
                    type="button"
                    className="icon-button stock-more-button"
                    aria-label={`Opcoes para ${item.name}`}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const spaceBelow = window.innerHeight - rect.bottom;
                      setMenuOpenUp(spaceBelow < 200);
                      setOpenActionsId((current) => (current === item.id ? null : item.id));
                    }}
                  >
                    <MoreVertical size={18} />
                  </button>
                  {openActionsId === item.id && (
                    <div className={`stock-row-menu${menuOpenUp ? ' open-up' : ''}`}>
                      <button type="button" onClick={() => openModal('viewProduct', item)}><Eye size={15} /> Ver</button>
                      <button type="button" onClick={() => openModal('stockIn', item)}><PlusCircle size={15} /> Quantidade</button>
                      <button type="button" onClick={() => openModal('stockOut', item)}><MinusCircle size={15} /> Baixa</button>
                      <button type="button" onClick={() => openModal('editProduct', item)}><Pencil size={15} /> Editar</button>
                      <button type="button" className="danger" onClick={() => deleteRow(item)}><Trash2 size={15} /> Remover</button>
                    </div>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>

        <div className="stock-table-footer">
          <div className="stock-list-controls">
            <label>
              <span>Mostrar</span>
              <select value={itemsPerPage} onChange={(event) => updateItemsPerPage(event.target.value)} aria-label="Quantidade de itens por pagina">
                {[10, 15, 20, 25].map((amount) => (
                  <option key={amount} value={amount}>{amount}</option>
                ))}
              </select>
              <span>itens</span>
            </label>
            <span>
              {listPage.totalRows ? `${listPage.startRow}-${listPage.endRow} de ${listPage.totalRows}` : '0 itens'}
            </span>
          </div>

          <div className="pagination">
            <button type="button" disabled={listPage.currentPage === 1} onClick={() => setCurrentPage(listPage.currentPage - 1)}>‹</button>
            {paginationRange.map((item, i) =>
              item === '…' ? (
                <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
              ) : (
                <button
                  key={item}
                  className={item === listPage.currentPage ? 'active' : undefined}
                  type="button"
                  onClick={() => setCurrentPage(item)}
                >
                  {item}
                </button>
              )
            )}
            <button type="button" disabled={listPage.currentPage === listPage.totalPages} onClick={() => setCurrentPage(listPage.currentPage + 1)}>›</button>
          </div>
        </div>
      </div>

      {activeModal && (
        <StockModal
          type={activeModal}
          item={selectedItem}
          options={{ ...formOptions, units: stockUnits.map((option) => option.name), locations: productLocations.map((o) => o.name) }}
          stockRows={referenceRows}
          inventoryRows={rows}
          importReference={importReference}
          categoryRows={categoryRows}
          subcategoryRows={subcategoryRows}
          onClose={closeModal}
          onImport={handleImport}
          onStockMovement={handleStockMovement}
          onSaveProduct={handleSaveProduct}
          onSaveCategory={handleSaveCategory}
          onSaveSubcategory={handleSaveSubcategory}
          onApplyFilter={handleApplyFilter}
          statusFilter={statusFilter}
          onStatusChange={handleStatusChange}
        />
      )}
    </section>
  );
}

function SummaryCard({ title, value, icon: Icon, tone = '', onClick, active = false }) {
  const classes = ['stock-total-card', onClick ? 'clickable' : '', active ? 'active-filter' : ''].filter(Boolean).join(' ');
  return (
    <div className={classes} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      <span className={`metric-icon ${tone}`}><Icon size={42} /></span>
      <div>
        <h2>{title}</h2>
        <strong>{Number(value).toLocaleString('pt-AO')}</strong>
      </div>
    </div>
  );
}

function StockModal({ type, item, options, stockRows, inventoryRows, importReference, categoryRows, subcategoryRows, onClose, onImport, onStockMovement, onSaveProduct, onSaveCategory, onSaveSubcategory, onApplyFilter, statusFilter, onStatusChange }) {
  const [imagePreview, setImagePreview] = useState(item?.imagem || '');
  const [movementQuantity, setMovementQuantity] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [movementNote, setMovementNote] = useState('');
  const [movementLote, setMovementLote] = useState('');
  const [movementValidade, setMovementValidade] = useState('');
  const [movementCusto, setMovementCusto] = useState('');
  const [movementPrefilled, setMovementPrefilled] = useState(false);
  const [inventoryCounts, setInventoryCounts] = useState({});
  const [inventoryResult, setInventoryResult] = useState(null);
  const [showInventoryPrint, setShowInventoryPrint] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const printRef = useRef(null);
  const [importFileName, setImportFileName] = useState('');
  const [importMode, setImportMode] = useState('products');
  const [importSummary, setImportSummary] = useState(null);
  const [importRows, setImportRows] = useState([]);
  const [importNotice, setImportNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const isProductForm = type === 'product' || type === 'editProduct';
  const isFilter = type === 'filter';

  const [productForm, setProductForm] = useState(() => ({
    name: item?.name ?? '',
    barcode: item?.codigo_barras ?? '',
    category: item?.category ?? '',
    subcategory: item?.subcategory ?? '',
    price: item?.price ?? '',
    unit: item?.unidade_medida ?? '',
    localizacao: item?.location ?? '',
    requiresPrescription: item?.requiresPrescription ?? false,
    notes: item?.observacao_localizacao ?? '',
    imagem: item?.imagem ?? '',
  }));

  const [categoryImgPreview, setCategoryImgPreview] = useState(item?.imagem || '');
  const [subcategoryImgPreview, setSubcategoryImgPreview] = useState(item?.imagem || '');
  const [categoryForm, setCategoryForm] = useState({
    id: item?.id ?? null,
    nome: item?.name ?? item?.nome ?? '',
    codigo: item?.codigo ?? '',
    descricao: item?.descricao ?? '',
    imagem: item?.imagem ?? '',
  });
  const [subcategoryForm, setSubcategoryForm] = useState({
    id: item?.id ?? null,
    nome: item?.nome ?? '',
    categoria_nome: item?.categoria_nome ?? '',
    descricao: item?.descricao ?? '',
    imagem: item?.imagem ?? '',
  });

  const [filterForm, setFilterForm] = useState({ category: '', location: '', expiry: '' });
  const [priceRows, setPriceRows] = useState([]);
  const [priceQuery, setPriceQuery] = useState('');
  const [priceEdits, setPriceEdits] = useState({});
  const [priceSaving, setPriceSaving] = useState(null);

  const isPrices = type === 'prices';

  useEffect(() => {
    if (!isPrices) return;
    request('estoque.listPrices', {}).then((data) => setPriceRows(data || [])).catch(() => {});
  }, [isPrices]);

  function setPF(key, val) { setProductForm(p => ({ ...p, [key]: val })); }
  function setFF(key, val) { setFilterForm(p => ({ ...p, [key]: val })); }

  async function savePrice(produtoId) {
    const edit = priceEdits[produtoId];
    if (!edit) return;
    setPriceSaving(produtoId);
    try {
      const updated = await request('estoque.updatePrice', {
        produto_id: produtoId,
        preco_venda: edit.preco_venda !== undefined ? Number(edit.preco_venda) : undefined,
        preco_custo: edit.preco_custo !== undefined ? Number(edit.preco_custo) : undefined,
      });
      setPriceRows((rows) => rows.map((r) => r.id === updated.id ? { ...r, ...updated } : r));
      setPriceEdits((e) => { const next = { ...e }; delete next[produtoId]; return next; });
    } catch (err) {
      setModalError(err?.message || 'Erro ao guardar preço.');
    } finally {
      setPriceSaving(null);
    }
  }

  async function saveProduct() {
    setSaving(true);
    try {
      await onSaveProduct?.(productForm, item?.id ?? null);
      onClose();
    } catch (err) {
      setModalError(err?.message || 'Erro ao guardar produto.');
    } finally {
      setSaving(false);
    }
  }

  async function saveCategory() {
    setSaving(true);
    try {
      await onSaveCategory?.(categoryForm);
      onClose();
    } catch (err) {
      setModalError(err?.message || 'Erro ao guardar categoria.');
    } finally {
      setSaving(false);
    }
  }

  async function saveSubcategory() {
    setSaving(true);
    try {
      await onSaveSubcategory?.(subcategoryForm);
      onClose();
    } catch (err) {
      setModalError(err?.message || 'Erro ao guardar subcategoria.');
    } finally {
      setSaving(false);
    }
  }

  function applyFilter() {
    onApplyFilter?.({ ...filterForm, status: statusFilter ?? '' });
    onClose();
  }
  const isSubcategory = type === 'subcategory';
  const isCategory = type === 'category';
  const isImportProducts = type === 'importProducts';
  const isInventory = type === 'inventory';
  const isView = type === 'viewProduct';
  const isStockIn = type === 'stockIn';
  const isStockOut = type === 'stockOut';
  const isStockMovement = isStockIn || isStockOut;

  useEffect(() => {
    if (!isStockIn || !item?.id) return;
    request('estoque.getLotes', { produto_id: item.id }).then((lots) => {
      if (!lots?.length) return;
      const last = lots[lots.length - 1];
      if (last.lote || last.data_validade || last.preco_custo) {
        setMovementLote(last.lote || '');
        setMovementValidade(last.data_validade ? last.data_validade.slice(0, 10) : '');
        setMovementCusto(last.preco_custo ? String(last.preco_custo) : '');
        setMovementPrefilled(true);
      }
    }).catch(() => {});
  }, [isStockIn, item?.id]);
  const sortedInventoryRows = useMemo(() => {
    const q = inventorySearch.toLowerCase();
    return [...(inventoryRows ?? [])]
      .filter(r => !q || [r.id, r.name, r.category, r.location, r.status].join(' ').toLowerCase().includes(q))
      .sort((a, b) =>
        (a.location || '').localeCompare(b.location || '', 'pt-AO') || a.name.localeCompare(b.name, 'pt-AO'),
      );
  }, [inventoryRows, inventorySearch]);

  function previewImage(event) {
    const file = event.target.files?.[0];
    if (!file) {
      setImagePreview('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      setImagePreview(result);
      setPF('imagem', result);
    };
    reader.readAsDataURL(file);
  }

  function submitStockMovement() {
    const reason = isStockOut ? movementReason : movementNote;
    onStockMovement(type, {
      quantity: movementQuantity,
      reason,
      lote: movementLote,
      dataValidade: movementValidade,
      precoCusto: movementCusto,
    });
  }

  function updateImportMode(mode) {
    setImportMode(mode);
    setImportSummary(importRows.length ? validateImportRows(mode, importRows, importReference, categoryRows) : null);
    setImportNotice('');
  }

  function readImportFile(event) {
    const file = event.target.files?.[0];
    setImportFileName(file?.name ?? '');
    setImportRows([]);
    setImportSummary(null);
    setImportNotice('');

    if (!file) return;

    const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv');
    if (!isCsv) {
      setImportNotice('A validacao automatica desta tela usa CSV exportado do Excel.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? '');
      const rows = importMode === 'categories'
        ? parseStockCategoryImportCsv(raw)
        : importMode === 'subcategories'
          ? parseStockSubcategoryImportCsv(raw)
          : parseStockImportCsv(raw);
      setImportRows(rows);
      setImportSummary(validateImportRows(importMode, rows, importReference, categoryRows));
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function submitImport() {
    if (!importSummary?.acceptedRows?.length) return;
    setSaving(true);
    try {
      await onImport(importMode, importSummary.acceptedRows);
      onClose();
    } catch {
      // handleImport shows its own alert
    } finally {
      setSaving(false);
    }
  }

  function updateInventoryCount(id, value) {
    setInventoryCounts((current) => ({ ...current, [id]: value }));
  }

  function submitInventoryCount() {
    setInventoryResult(buildStockInventoryCount(sortedInventoryRows, inventoryCounts));
  }

  function exportInventoryExcel() {
    const headers = ['Código', 'Produto', 'Categoria', 'Qtd. Sistema', 'Qtd. Contada', 'Diferença', 'Prateleira', 'Gaveta', 'Zona'];
    const dataRows = sortedInventoryRows.map((row) => {
      const counted = inventoryCounts[row.id] !== undefined ? Number(inventoryCounts[row.id]) : '';
      const diff = counted !== '' ? counted - row.quantity : '';
      return [row.id, row.name, row.category || '', row.quantity, counted, diff, row.prateleira || '', row.gaveta || '', row.zona || ''];
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventário');
    XLSX.writeFile(wb, `inventario-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function printInventoryPdf() {
    setShowInventoryPrint(true);
    setTimeout(() => { window.print(); setShowInventoryPrint(false); }, 200);
  }

  return (
    <>
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className={isInventory ? 'modal-card inventory' : isPrices ? 'modal-card prices-modal stock-modal' : 'modal-card wide stock-modal'}>
        <div className="modal-title-row">
          <h2>{(isCategory && item?.id) ? 'Editar Categoria' : (isSubcategory && item?.id) ? 'Editar Subcategoria' : modalTitles[type]}</h2>
          <button type="button" onClick={onClose}>×</button>
        </div>

        <div className="form-grid">
          {modalError && (
            <div className="modal-error-banner form-span-2" role="alert">
              <span>⚠ {modalError}</span>
              <button type="button" onClick={() => setModalError('')}>×</button>
            </div>
          )}
          {isView && item && (
            <div className="product-view-card">
              <div className="image-preview empty"><ImagePlus size={34} /></div>
              <div>
                <strong>{item.name}</strong>
                <span>{item.id} · {item.category} · {item.subcategory}</span>
                <span>{item.quantity} unidades · {formatKwanza(item.price)}</span>
                <span>{item.status} · {item.location}</span>
              </div>
            </div>
          )}

          {isStockMovement && item && (
            <>
              <div className="product-view-card">
                <div className="image-preview empty"><PackagePlus size={34} /></div>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.id} · Stock actual: {item.quantity} unidades</span>
                  <span>{item.category} · {item.subcategory}</span>
                  {item.lastStockMovement && (
                    <span>Último movimento: {item.lastStockMovement.type} · {item.lastStockMovement.quantity} · {item.lastStockMovement.reason}</span>
                  )}
                </div>
              </div>
              <label>
                Quantidade
                <input
                  min="1"
                  type="number"
                  value={movementQuantity}
                  onChange={(event) => setMovementQuantity(event.target.value)}
                />
              </label>
              {isStockOut ? (
                <OptionSelect label="Motivo da baixa" value={movementReason} options={STOCK_OUT_REASONS} onChange={setMovementReason} />
              ) : (
                <>
                  {movementPrefilled && (
                    <div className="stockin-prefill-notice">
                      <span>📋 Dados do lote anterior pré-preenchidos. Confirme ou edite antes de adicionar.</span>
                      <button type="button" onClick={() => { setMovementLote(''); setMovementValidade(''); setMovementCusto(''); setMovementPrefilled(false); }}>
                        Limpar
                      </button>
                    </div>
                  )}
                  <label>
                    Lote (opcional — gerado auto se vazio)
                    <input
                      value={movementLote}
                      onChange={(event) => { setMovementLote(event.target.value); setMovementPrefilled(false); }}
                      placeholder="Ex: LOTE-2026-01"
                    />
                  </label>
                  <label>
                    Data de validade *
                    <input
                      type="date"
                      value={movementValidade}
                      onChange={(event) => { setMovementValidade(event.target.value); setMovementPrefilled(false); }}
                    />
                  </label>
                  <label>
                    Preço de custo (KZ)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={movementCusto}
                      onChange={(event) => { setMovementCusto(event.target.value); setMovementPrefilled(false); }}
                      placeholder="Actualiza preço de custo"
                    />
                  </label>
                  <label>
                    Origem ou observação
                    <input
                      value={movementNote}
                      onChange={(event) => setMovementNote(event.target.value)}
                    />
                  </label>
                </>
              )}
            </>
          )}

          {isPrices && (
            <div className="prices-panel form-span-2">
              <div className="prices-search-row">
                <label className="compact-search">
                  <Search size={15} />
                  <input
                    placeholder="Pesquisar produto"
                    value={priceQuery}
                    onChange={(e) => setPriceQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="prices-table-wrap">
              <table className="prices-table">
                <colgroup>
                  <col /><col /><col /><col /><col />
                </colgroup>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Stock</th>
                    <th>Preço venda (KZ)</th>
                    <th>Preço custo (KZ)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {priceRows
                    .filter((r) => !priceQuery || r.nome.toLowerCase().includes(priceQuery.toLowerCase()))
                    .map((r) => {
                      const edit = priceEdits[r.id] || {};
                      const isEditing = Boolean(priceEdits[r.id]);
                      return (
                        <tr key={r.id}>
                          <td>{r.nome}</td>
                          <td>{r.totalStock}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={r.preco_venda}
                              onChange={(e) => setPriceEdits((prev) => ({ ...prev, [r.id]: { ...prev[r.id], preco_venda: e.target.value } }))}
                              className="price-input"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={r.preco_custo}
                              onChange={(e) => setPriceEdits((prev) => ({ ...prev, [r.id]: { ...prev[r.id], preco_custo: e.target.value } }))}
                              className="price-input"
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="soft-button"
                              style={{ fontSize: 12, padding: '4px 10px' }}
                              disabled={priceSaving === r.id}
                              onClick={() => savePrice(r.id)}
                            >
                              {priceSaving === r.id ? '...' : 'Guardar'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              </div>
              {!priceRows.length ? <div className="empty-state"><Tags size={22} /><strong>Nenhum produto encontrado</strong></div> : null}
            </div>
          )}

          {isProductForm && (
            <>
              <label className="image-picker">
                <span className={imagePreview ? 'image-preview' : 'image-preview empty'}>
                  {imagePreview ? <img src={imagePreview} alt="Pré-visualização do produto" /> : <ImagePlus size={34} />}
                </span>
                <input type="file" accept="image/*" onChange={previewImage} />
                <strong>Inserir imagem do produto</strong>
              </label>
              <label><span>Designação</span><input value={productForm.name} onChange={e => setPF('name', e.target.value)} /></label>
              <label><span>Código de barras</span><input value={productForm.barcode} onChange={e => setPF('barcode', e.target.value)} /></label>
              <OptionSelect label="Categoria" value={productForm.category} options={options.categories} onChange={v => setPF('category', v)} />
              <OptionSelect label="Subcategoria" value={productForm.subcategory} options={options.subcategories} onChange={v => setPF('subcategory', v)} />
              <label><span>Preço de venda</span><input type="number" value={productForm.price} onChange={e => setPF('price', e.target.value)} /></label>
              <OptionSelect label="Unidade" value={productForm.unit} options={options.units} onChange={v => setPF('unit', v)} />
              <OptionSelect label="Localização" value={productForm.localizacao} options={options.locations} onChange={v => setPF('localizacao', v)} />
              <div className="form-info-note form-span-2">ℹ Lote, Data de Validade e Preço de Custo são definidos ao adicionar quantidade ao produto.</div>
              <label className="form-span-2"><span>Observação de localização</span><textarea value={productForm.notes} onChange={e => setPF('notes', e.target.value)} /></label>
              <label className="check-row"><input type="checkbox" checked={productForm.requiresPrescription} onChange={e => setPF('requiresPrescription', e.target.checked)} /> Receita obrigatória</label>
            </>
          )}

          {isImportProducts && (
            <>
              <div className="import-mode-tabs">
                <button type="button" className={importMode === 'products' ? 'active' : undefined} onClick={() => updateImportMode('products')}>Produtos</button>
                <button type="button" className={importMode === 'categories' ? 'active' : undefined} onClick={() => updateImportMode('categories')}>Categorias</button>
                <button type="button" className={importMode === 'subcategories' ? 'active' : undefined} onClick={() => updateImportMode('subcategories')}>Subcategorias</button>
              </div>
              <ImportDbCounts mode={importMode} categoryRows={categoryRows} subcategoryRows={subcategoryRows} />
              <label className="import-file-picker">
                <span><Upload size={30} /></span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={readImportFile}
                />
                <strong>{importFileName || getImportFileLabel(importMode)}</strong>
                <small>{getImportFieldHint(importMode)}</small>
              </label>
              <ImportReferencePanel mode={importMode} categoryRows={categoryRows} subcategoryRows={subcategoryRows} />
              {importNotice && <div className="import-alert">{importNotice}</div>}
              {importSummary && <ImportSummary summary={importSummary} mode={importMode} />}
            </>
          )}

          {isInventory && (
            <>
              <div className="inventory-search-bar">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Pesquisar por código, nome, categoria, localização..."
                  value={inventorySearch}
                  onChange={e => setInventorySearch(e.target.value)}
                />
                {inventorySearch && (
                  <button type="button" onClick={() => setInventorySearch('')}>×</button>
                )}
              </div>
              <InventoryCountSheet
                counts={inventoryCounts}
                rows={sortedInventoryRows}
                result={inventoryResult}
                onCountChange={updateInventoryCount}
              />
            </>
          )}

          {isCategory && (
            <>
              <label className="image-picker form-span-2">
                <span className={categoryImgPreview ? 'image-preview' : 'image-preview empty'}>
                  {categoryImgPreview ? <img src={categoryImgPreview} alt="Imagem da categoria" /> : <ImagePlus size={28} />}
                </span>
                <input type="file" accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => { const r = String(reader.result); setCategoryImgPreview(r); setCategoryForm((f) => ({ ...f, imagem: r })); };
                  reader.readAsDataURL(file);
                }} />
                <strong>Imagem da categoria</strong>
                {categoryImgPreview && <button type="button" className="soft-button" style={{marginTop:4}} onClick={() => { setCategoryImgPreview(''); setCategoryForm((f) => ({ ...f, imagem: '' })); }}>Remover imagem</button>}
              </label>
              <label>
                <span>Nome da categoria *</span>
                <input value={categoryForm.nome} onChange={(e) => setCategoryForm((f) => ({ ...f, nome: e.target.value }))} />
              </label>
              {!categoryForm.id && (
                <label>
                  <span>Código (gerado automaticamente se vazio)</span>
                  <input value={categoryForm.codigo} onChange={(e) => setCategoryForm((f) => ({ ...f, codigo: e.target.value }))} />
                </label>
              )}
              <label className="form-span-2">
                <span>Descrição</span>
                <textarea value={categoryForm.descricao} onChange={(e) => setCategoryForm((f) => ({ ...f, descricao: e.target.value }))} />
              </label>
            </>
          )}

          {isSubcategory && (
            <>
              <label className="image-picker form-span-2">
                <span className={subcategoryImgPreview ? 'image-preview' : 'image-preview empty'}>
                  {subcategoryImgPreview ? <img src={subcategoryImgPreview} alt="Imagem da subcategoria" /> : <ImagePlus size={28} />}
                </span>
                <input type="file" accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => { const r = String(reader.result); setSubcategoryImgPreview(r); setSubcategoryForm((f) => ({ ...f, imagem: r })); };
                  reader.readAsDataURL(file);
                }} />
                <strong>Imagem da subcategoria</strong>
                {subcategoryImgPreview && <button type="button" className="soft-button" style={{marginTop:4}} onClick={() => { setSubcategoryImgPreview(''); setSubcategoryForm((f) => ({ ...f, imagem: '' })); }}>Remover imagem</button>}
              </label>
              {!subcategoryForm.id && (
                <OptionSelect
                  label="Categoria principal *"
                  value={subcategoryForm.categoria_nome}
                  options={options.categories}
                  onChange={(v) => setSubcategoryForm((f) => ({ ...f, categoria_nome: v }))}
                />
              )}
              {subcategoryForm.id && (
                <label>
                  <span>Categoria</span>
                  <input value={subcategoryForm.categoria_nome} disabled style={{opacity:0.6}} />
                </label>
              )}
              <label>
                <span>Nome da subcategoria *</span>
                <input value={subcategoryForm.nome} onChange={(e) => setSubcategoryForm((f) => ({ ...f, nome: e.target.value }))} />
              </label>
              <label className="form-span-2">
                <span>Descrição</span>
                <textarea value={subcategoryForm.descricao} onChange={(e) => setSubcategoryForm((f) => ({ ...f, descricao: e.target.value }))} />
              </label>
            </>
          )}

          {isFilter && (
            <>
              <OptionSelect label="Categoria" value={filterForm.category} options={options.categories} onChange={v => setFF('category', v)} />
              <label>
                <span>Status</span>
                <select value={statusFilter ?? ''} onChange={(e) => onStatusChange?.(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                  <option value="Baixo estoque">Baixo estoque</option>
                  <option value="Sem estoque">Esgotado</option>
                </select>
              </label>
              <OptionSelect label="Localização" value={filterForm.location} options={options.locations} onChange={v => setFF('location', v)} />
              <label>
                <span>Validade</span>
                <select value={filterForm.expiry} onChange={e => setFF('expiry', e.target.value)}>
                  <option value="">Todos</option>
                  <option value="expired">Vencidos</option>
                  <option value="30">Vencem em 30 dias</option>
                  <option value="60">Vencem em 60 dias</option>
                  <option value="90">Vencem em 90 dias</option>
                </select>
              </label>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="soft-button" onClick={onClose}>Cancelar</button>
          {isStockMovement ? (
            <button
              type="button"
              className="primary-button"
              onClick={submitStockMovement}
              disabled={!movementQuantity || (isStockOut && !movementReason) || (isStockIn && !movementValidade)}
            >
              {isStockIn ? 'Adicionar' : 'Confirmar Baixa'}
            </button>
          ) : isInventory ? (
            <>
              <button type="button" className="soft-button" onClick={exportInventoryExcel}>Exportar Excel</button>
              <button type="button" className="soft-button" onClick={printInventoryPdf}>Imprimir PDF</button>
              <button type="button" className="primary-button" onClick={submitInventoryCount}>Enviar contagem</button>
            </>
          ) : isImportProducts ? (
            <button
              type="button"
              className="primary-button"
              onClick={submitImport}
              disabled={!importSummary?.acceptedRows?.length || saving}
            >
              {saving ? 'A importar...' : 'Importar'}
            </button>
          ) : isCategory ? (
            <button type="button" className="primary-button" onClick={saveCategory} disabled={saving || !categoryForm.nome}>
              {saving ? '...' : 'Guardar'}
            </button>
          ) : isSubcategory ? (
            <button type="button" className="primary-button" onClick={saveSubcategory} disabled={saving || !subcategoryForm.nome || !subcategoryForm.categoria_nome}>
              {saving ? '...' : 'Guardar'}
            </button>
          ) : isPrices ? null
          : !isView && (
            <button type="button" className="primary-button" disabled={saving} onClick={isFilter ? applyFilter : saveProduct}>
              {saving ? '...' : isFilter ? 'Aplicar Filtro' : 'Guardar'}
            </button>
          )}
        </div>
      </div>
    </div>

    {showInventoryPrint && (
      <div className="print-only" ref={printRef}>
        <InventarioA4 rows={sortedInventoryRows} counts={inventoryCounts} result={inventoryResult} />
      </div>
    )}
    </>
  );
}

function buildPaginationRange(current, total) {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1);
  const delta = 2;
  const range = new Set([1, total]);
  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) range.add(i);
  const sorted = Array.from(range).sort((a, b) => a - b);
  const result = [];
  let prev = 0;
  for (const page of sorted) {
    if (page - prev > 1) result.push('…');
    result.push(page);
    prev = page;
  }
  return result;
}

function validateImportRows(mode, rows, importReference, categoryRows = []) {
  if (mode === 'categories') {
    return validateStockCategoryImportRows(rows, categoryRows.map((c) => c.nome));
  }
  if (mode === 'subcategories') {
    return validateStockSubcategoryImportRows(rows);
  }
  return validateStockProductImportRows(rows);
}

function InventoryCountSheet({ rows, counts, result, onCountChange }) {
  const groupedRows = rows.reduce((groups, item) => {
    const location = item.location || 'Sem localizacao';
    groups.set(location, [...(groups.get(location) ?? []), item]);
    return groups;
  }, new Map());
  const differences = result?.differences ?? [];

  return (
    <div className="inventory-sheet">
      <div className="inventory-sheet-header">
        <div>
          <strong>Folha de contagem fisica</strong>
          <span>Informe os numeros encontrados nas prateleiras e gavetas.</span>
        </div>
        {result && (
          <div className={result.hasDifferences ? 'inventory-result-badge warning' : 'inventory-result-badge ok'}>
            {result.hasDifferences ? `${result.differenceItems} com diferenca` : 'Tudo correto'}
          </div>
        )}
      </div>

      <div className="inventory-count-list">
        {Array.from(groupedRows.entries()).map(([location, locationRows]) => (
          <section key={location}>
            <h3>{location}</h3>
            <div className="inventory-count-table">
              <span>Produto</span>
              <span>Esperado</span>
              <span>Contado</span>
              {locationRows.map((item) => (
                <React.Fragment key={item.id}>
                  <strong>{item.name}</strong>
                  <span>{item.quantity}</span>
                  <input
                    min="0"
                    type="number"
                    inputMode="numeric"
                    value={counts[item.id] ?? ''}
                    onChange={(event) => onCountChange(item.id, event.target.value)}
                    aria-label={`Quantidade contada de ${item.name}`}
                  />
                </React.Fragment>
              ))}
            </div>
          </section>
        ))}
      </div>

      {result && (
        <div className="inventory-result-panel">
          <div>
            <span>Contados: {result.countedItems}/{result.totalItems}</span>
            <span>Corretos: {result.correctItems}</span>
            <span>Pendentes: {result.pendingItems}</span>
          </div>
          {differences.length ? (
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Localizacao</th>
                  <th>Esperado</th>
                  <th>Contado</th>
                  <th>Diferenca</th>
                </tr>
              </thead>
              <tbody>
                {differences.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.location}</td>
                    <td>{item.expected}</td>
                    <td>{item.counted}</td>
                    <td>{item.difference > 0 ? `+${item.difference}` : item.difference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>Nenhuma diferenca encontrada nos produtos contados.</p>
          )}
        </div>
      )}
    </div>
  );
}

function getImportFileLabel(mode) {
  if (mode === 'categories') return 'Planilha de categorias';
  if (mode === 'subcategories') return 'Planilha de subcategorias';
  return 'Planilha de produtos';
}

function getImportFieldHint(mode) {
  if (mode === 'categories') return 'Campo esperado: Categoria';
  if (mode === 'subcategories') return 'Campos esperados: Categoria, Subcategoria';
  return 'Campos esperados: Codigo, Designacao, Categoria, Subcategoria, Preco, Data Expiracao, Localizacao';
}

function ImportReferencePanel({ mode, categoryRows = [], subcategoryRows = [] }) {
  const categoryNames = categoryRows.map((c) => c.nome).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-AO'));

  // Group subcategories by category name
  const subcatByCategory = subcategoryRows.reduce((acc, s) => {
    const cat = s.categoria_nome || '';
    if (!cat) return acc;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s.nome);
    return acc;
  }, {});

  if (mode === 'categories') {
    return (
      <div className="import-reference-panel">
        <h3>Categorias cadastradas</h3>
        {categoryNames.length === 0
          ? <p className="import-reference-empty">Nenhuma categoria cadastrada.</p>
          : (
            <div className="import-chip-list">
              {categoryNames.map((name) => <span key={name}>{name}</span>)}
            </div>
          )}
      </div>
    );
  }

  return (
    <div className="import-reference-panel">
      <div>
        <h3>Categorias</h3>
        {categoryNames.length === 0
          ? <p className="import-reference-empty">Nenhuma categoria cadastrada.</p>
          : (
            <div className="import-chip-list">
              {categoryNames.map((name) => <span key={name}>{name}</span>)}
            </div>
          )}
      </div>
      <div>
        <h3>Subcategorias</h3>
        {Object.keys(subcatByCategory).length === 0
          ? <p className="import-reference-empty">Nenhuma subcategoria cadastrada.</p>
          : (
            <ul className="import-subcat-list">
              {Object.entries(subcatByCategory).sort(([a], [b]) => a.localeCompare(b, 'pt-AO')).map(([cat, names]) => (
                <li key={cat}><strong>{cat}:</strong> {names.sort((a, b) => a.localeCompare(b, 'pt-AO')).join(', ')}</li>
              ))}
            </ul>
          )}
      </div>
    </div>
  );
}

function ImportDbCounts({ mode, categoryRows = [], subcategoryRows = [] }) {
  const catCount = categoryRows.length;
  const subCount = subcategoryRows.length;
  const noSubcats = mode === 'products' && catCount > 0 && subCount === 0;
  return (
    <div className="import-db-counts">
      <span>Categorias no banco: <strong>{catCount}</strong></span>
      <span>Subcategorias no banco: <strong>{subCount}</strong></span>
      {noSubcats && (
        <p className="import-db-warn">Importe subcategorias antes de importar produtos.</p>
      )}
    </div>
  );
}

function ImportSummary({ summary, mode }) {
  const rejectedCount = summary.rejectedRows?.length ?? 0;
  const acceptedCount = summary.acceptedRows?.length ?? 0;

  return (
    <div className="import-summary">
      <span>{acceptedCount} {mode === 'products' ? 'produtos validos' : 'registos validos'}</span>
      <span>{rejectedCount} rejeitados</span>
      {!!summary.missingCategories?.length && (
        <p>Categorias nao encontradas: {summary.missingCategories.join(', ')}</p>
      )}
      {!!summary.missingSubcategories?.length && (
        <p>Subcategorias nao encontradas: {summary.missingSubcategories.join(', ')}</p>
      )}
      {!!rejectedCount && (
        <p>Linhas rejeitadas: {summary.rejectedRows.map((row) => `${row.rowNumber} (${row.reason})`).join(', ')}</p>
      )}
    </div>
  );
}

function OptionSelect({ label, value = '', options, onChange }) {
  const selectProps = onChange
    ? {
        value,
        onChange: (event) => onChange(event.target.value),
      }
    : { defaultValue: value };

  return (
    <label>
      <span>{label}</span>
      <select {...selectProps}>
        <option value="" disabled>{label}</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function getStockStatusClass(status) {
  if (status === 'Sem estoque') return 'stock-status out';
  if (status === 'Baixo estoque') return 'stock-status low';
  return 'stock-status ok';
}

export default Estoque;

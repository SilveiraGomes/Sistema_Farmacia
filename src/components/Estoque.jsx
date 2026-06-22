import React, { useMemo, useRef, useState } from 'react';
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
  addStockQuantity,
  buildStockFormOptions,
  buildStockImportReference,
  buildStockInventoryCount,
  buildStockListPage,
  buildStockMetrics,
  formatKwanza,
  parseStockImportCsv,
  removeStockQuantity,
  stockItems,
  validateStockCategoryImportRows,
  validateStockProductImportRows,
  validateStockSubcategoryImportRows,
} from '../data/pharmacyData.mjs';
import { confirmDelete } from '../utils/confirmations.mjs';
import { CATALOG_KEYS } from '../configuration/catalogKeys.mjs';
import { useCatalog } from '../configuration/SettingsContext';

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
};

const visibleCategoryCount = 8;

function Estoque() {
  const stockUnits = useCatalog(CATALOG_KEYS.STOCK_UNITS);
  const productLocations = useCatalog(CATALOG_KEYS.PRODUCT_LOCATIONS);
  const [activeModal, setActiveModal] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [rows, setRows] = useState(stockItems);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeFilters, setActiveFilters] = useState({ category: '', location: '', expiry: '' });
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [categoryOffset, setCategoryOffset] = useState(0);
  const [openActionsId, setOpenActionsId] = useState(null);
  const [categoryNames, setCategoryNames] = useState(() => buildStockFormOptions(stockItems).categories);
  const [subcategoryRows, setSubcategoryRows] = useState(() => buildStockImportReference(stockItems).subcategories);
  const referenceRows = useMemo(
    () => [
      ...rows,
      ...categoryNames.map((category) => ({ category, subcategory: '' })),
      ...subcategoryRows.map((subcategory) => ({ category: subcategory.category, subcategory: subcategory.name })),
    ],
    [categoryNames, rows, subcategoryRows],
  );
  const metrics = buildStockMetrics(rows);
  const categoryCards = useMemo(() => {
    const counts = new Map(metrics.categories.map((category) => [category.name, category.count]));
    return categoryNames.map((name) => ({
      name,
      count: counts.get(name) ?? 0,
      icon: name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3).toLowerCase(),
    }));
  }, [categoryNames, metrics.categories]);
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
      const matchesLocation = !activeFilters.location || item.location === activeFilters.location;
      return matchesQuery && matchesStatus && matchesCategory && matchesLocation;
    }),
    [query, statusFilter, activeFilters, rows],
  );
  const listPage = useMemo(
    () => buildStockListPage(filteredItems, currentPage, itemsPerPage),
    [currentPage, filteredItems, itemsPerPage],
  );
  const paginationPages = Array.from({ length: listPage.totalPages }, (_, index) => index + 1);

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
    if (!(await confirmDelete(`o produto ${item.name}`))) {
      return;
    }

    setRows((current) => current.filter((row) => row.id !== item.id));
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

  function handleSaveProduct(data, existingId) {
    if (existingId) {
      setRows(current => current.map(r =>
        r.id === existingId
          ? { ...r, name: data.name, category: data.category, subcategory: data.subcategory, price: Number(data.price) || r.price, expiry: data.expiry, location: data.localizacao, requiresPrescription: data.requiresPrescription }
          : r
      ));
    } else {
      const newId = `P${Date.now()}`;
      setRows(current => [...current, {
        id: newId, name: data.name, category: data.category, subcategory: data.subcategory,
        price: Number(data.price) || 0, quantity: 0, expiry: data.expiry || '-',
        location: data.localizacao, status: 'Activo', requiresPrescription: data.requiresPrescription,
        lastStockMovement: null,
      }]);
      if (data.category) mergeCategoryNames([data.category]);
      if (data.subcategory && data.category) mergeSubcategoryRows([{ category: data.category, name: data.subcategory }]);
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

  function handleStockMovement(type, movement) {
    setRows((current) => {
      if (type === 'stockIn') {
        return addStockQuantity(current, selectedItem.id, movement.quantity, movement.reason);
      }

      return removeStockQuantity(current, selectedItem.id, movement.quantity, movement.reason);
    });
    closeModal();
  }

  function mergeCategoryNames(nextCategories) {
    setCategoryNames((current) => Array.from(
      new Set([...current, ...nextCategories.map((category) => category.name ?? category)]),
    ).sort((first, second) => first.localeCompare(second, 'pt-AO')));
  }

  function mergeSubcategoryRows(nextSubcategories) {
    setSubcategoryRows((current) => {
      const merged = new Map(current.map((subcategory) => [
        `${subcategory.category.toLowerCase()}::${subcategory.name.toLowerCase()}`,
        subcategory,
      ]));

      nextSubcategories.forEach((subcategory) => {
        merged.set(`${subcategory.category.toLowerCase()}::${subcategory.name.toLowerCase()}`, subcategory);
      });

      return Array.from(merged.values()).sort((first, second) =>
        first.category.localeCompare(second.category, 'pt-AO') || first.name.localeCompare(second.name, 'pt-AO'),
      );
    });
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

  function handleImport(mode, acceptedRows) {
    if (mode === 'products') {
      setRows((current) => [...current, ...acceptedRows]);
      mergeCategoryNames(acceptedRows.map((row) => row.category));
      mergeSubcategoryRows(acceptedRows.map((row) => ({ category: row.category, name: row.subcategory })));
    }

    if (mode === 'categories') {
      mergeCategoryNames(acceptedRows);
    }

    if (mode === 'subcategories') {
      mergeSubcategoryRows(acceptedRows);
    }

    closeModal();
  }

  return (
    <section className="stock-screen">
      <div className="stock-summary">
        <SummaryCard title="Total de Produtos" value={metrics.totalProducts} icon={PackagePlus} />
        <SummaryCard title="Itens Baixo Estoque" value={metrics.lowStock} icon={AlertTriangle} tone="warning" />
        <SummaryCard title="Itens fora de Estoque" value={metrics.outOfStock} icon={XCircle} tone="danger" />
      </div>

      <div className="stock-category-carousel">
        <button className="circle-action" type="button" aria-label="Categorias anteriores" onClick={() => rotateCategories(-visibleCategoryCount)}>
          <ChevronLeft size={20} />
        </button>
        <div className="stock-category-grid">
          {visibleCategories.map((category) => (
            <button type="button" className="stock-category-card" key={category.name}>
              <span className="category-symbol">{category.icon.toUpperCase()}</span>
              <div>
                <h3>{category.name}</h3>
                <strong>{category.count}</strong>
              </div>
            </button>
          ))}
        </div>
        <button className="circle-action" type="button" aria-label="Proximas categorias" onClick={() => rotateCategories(visibleCategoryCount)}>
          <ChevronRight size={20} />
        </button>
      </div>

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
            <button type="button" onClick={() => openModal('category')}><Tags size={17} /> Categoria</button>
            <button type="button" onClick={() => openModal('subcategory')}><Tags size={17} /> Subcategoria</button>
            <button type="button" onClick={() => openModal('filter')}><Filter size={17} /> Filtrar</button>
            <button type="button" onClick={exportProductsExcel}><Download size={17} /> Exportar</button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Id</th>
              <th>Designação</th>
              <th>Categoria</th>
              <th>Quant.</th>
              <th>Preço</th>
              <th>Data Expiração</th>
              <th>Status</th>
              <th>Localização</th>
              <th>Opções</th>
            </tr>
          </thead>
          <tbody>
            {listPage.rows.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.name}</td>
                <td>{item.category}</td>
                <td>{item.quantity}</td>
                <td>{formatKwanza(item.price).replace('KZ ', '')}</td>
                <td>{item.expiry}</td>
                <td><span className={getStockStatusClass(item.status)}>{item.status}</span></td>
                <td>{item.location}</td>
                <td className="stock-options-menu-cell">
                  <button
                    type="button"
                    className="icon-button stock-more-button"
                    aria-label={`Opcoes para ${item.name}`}
                    onClick={() => setOpenActionsId((current) => (current === item.id ? null : item.id))}
                  >
                    <MoreVertical size={18} />
                  </button>
                  {openActionsId === item.id && (
                    <div className="stock-row-menu">
                      <button type="button" onClick={() => openModal('viewProduct', item)}><Eye size={15} /> Ver</button>
                      <button type="button" onClick={() => openModal('stockIn', item)}><PlusCircle size={15} /> Quantidade</button>
                      <button type="button" onClick={() => openModal('stockOut', item)}><MinusCircle size={15} /> Baixa</button>
                      <button type="button" onClick={() => openModal('editProduct', item)}><Pencil size={15} /> Editar</button>
                      <button type="button" className="danger" onClick={() => deleteRow(item)}><Trash2 size={15} /> Remover</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
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
            {paginationPages.map((page) => (
              <button
                key={page}
                className={page === listPage.currentPage ? 'active' : undefined}
                type="button"
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}
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
          onClose={closeModal}
          onImport={handleImport}
          onStockMovement={handleStockMovement}
          onSaveProduct={handleSaveProduct}
          onApplyFilter={handleApplyFilter}
          statusFilter={statusFilter}
          onStatusChange={handleStatusChange}
        />
      )}
    </section>
  );
}

function SummaryCard({ title, value, icon: Icon, tone = '' }) {
  return (
    <div className="stock-total-card">
      <span className={`metric-icon ${tone}`}><Icon size={42} /></span>
      <div>
        <h2>{title}</h2>
        <strong>{Number(value).toLocaleString('pt-AO')}</strong>
      </div>
    </div>
  );
}

function StockModal({ type, item, options, stockRows, inventoryRows, importReference, onClose, onImport, onStockMovement, onSaveProduct, onApplyFilter, statusFilter, onStatusChange }) {
  const [imagePreview, setImagePreview] = useState('');
  const [categoryImagePreview, setCategoryImagePreview] = useState('');
  const [movementQuantity, setMovementQuantity] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [movementNote, setMovementNote] = useState('');
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

  const isProductForm = type === 'product' || type === 'editProduct';
  const isFilter = type === 'filter';

  const [productForm, setProductForm] = useState(() => ({
    name: item?.name ?? '',
    barcode: String(item?.id ?? ''),
    category: item?.category ?? '',
    subcategory: item?.subcategory ?? '',
    price: item?.price ?? '',
    costPrice: '',
    batch: '',
    unit: '',
    expiry: item?.expiry ?? '',
    localizacao: item?.location ?? '',
    requiresPrescription: item?.requiresPrescription ?? false,
    notes: item?.observacao_localizacao ?? '',
  }));

  const [filterForm, setFilterForm] = useState({ category: '', location: '', expiry: '' });

  function setPF(key, val) { setProductForm(p => ({ ...p, [key]: val })); }
  function setFF(key, val) { setFilterForm(p => ({ ...p, [key]: val })); }

  function saveProduct() {
    onSaveProduct?.(productForm, item?.id ?? null);
    onClose();
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
    reader.onload = () => setImagePreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  function previewCategoryImage(event) {
    const file = event.target.files?.[0];
    if (!file) {
      setCategoryImagePreview('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setCategoryImagePreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  function submitStockMovement() {
    const reason = isStockOut ? movementReason : movementNote;
    onStockMovement(type, { quantity: movementQuantity, reason });
  }

  function updateImportMode(mode) {
    setImportMode(mode);
    setImportSummary(importRows.length ? validateImportRows(mode, importRows, stockRows, importReference) : null);
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
      const rows = parseStockImportCsv(String(reader.result ?? ''));
      setImportRows(rows);
      setImportSummary(validateImportRows(importMode, rows, stockRows, importReference));
    };
    reader.readAsText(file);
  }

  function submitImport() {
    if (!importSummary?.acceptedRows?.length) return;
    onImport(importMode, importSummary.acceptedRows);
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
      <div className={isInventory ? 'modal-card inventory' : 'modal-card wide stock-modal'}>
        <div className="modal-title-row">
          <h2>{modalTitles[type]}</h2>
          <button type="button" onClick={onClose}>×</button>
        </div>

        <div className="form-grid">
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
                <label>
                  Origem ou observação
                  <input
                    value={movementNote}
                    onChange={(event) => setMovementNote(event.target.value)}
                  />
                </label>
              )}
            </>
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
              <label><span>Preço de custo</span><input type="number" value={productForm.costPrice} onChange={e => setPF('costPrice', e.target.value)} /></label>
              <label><span>Lote</span><input value={productForm.batch} onChange={e => setPF('batch', e.target.value)} /></label>
              <OptionSelect label="Unidade" value={productForm.unit} options={options.units} onChange={v => setPF('unit', v)} />
              <label><span>Data de validade</span><input type="date" value={productForm.expiry} onChange={e => setPF('expiry', e.target.value)} /></label>
              <OptionSelect label="Localização" value={productForm.localizacao} options={options.locations} onChange={v => setPF('localizacao', v)} />
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
              <ImportReferencePanel mode={importMode} reference={importReference} />
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
              <label className="image-picker">
                <span className={categoryImagePreview ? 'image-preview' : 'image-preview empty'}>
                  {categoryImagePreview ? <img src={categoryImagePreview} alt="Pré-visualização da categoria" /> : <ImagePlus size={34} />}
                </span>
                <input type="file" accept="image/*" onChange={previewCategoryImage} />
                <strong>Inserir imagem da categoria</strong>
              </label>
              <label>Nome da categoria<input /></label>
              <label>Código<input /></label>
              <label>Descrição<textarea /></label>
            </>
          )}

          {isSubcategory && (
            <>
              <label className="image-picker">
                <span className={categoryImagePreview ? 'image-preview' : 'image-preview empty'}>
                  {categoryImagePreview ? <img src={categoryImagePreview} alt="Pré-visualização da subcategoria" /> : <ImagePlus size={34} />}
                </span>
                <input type="file" accept="image/*" onChange={previewCategoryImage} />
                <strong>Inserir imagem da subcategoria</strong>
              </label>
              <OptionSelect label="Categoria principal" options={options.categories} />
              <label>Nome da subcategoria<input /></label>
              <label>Descrição<textarea /></label>
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
                <span>Validade até</span>
                <input type="date" value={filterForm.expiry} onChange={e => setFF('expiry', e.target.value)} />
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
              disabled={!movementQuantity || (isStockOut && !movementReason)}
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
              disabled={!importSummary?.acceptedRows?.length}
            >
              Importar
            </button>
          ) : !isView && (
            <button type="button" className="primary-button" onClick={isFilter ? applyFilter : saveProduct}>
              {isFilter ? 'Aplicar Filtro' : 'Guardar'}
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

function validateImportRows(mode, rows, stockRows, importReference) {
  if (mode === 'categories') {
    return validateStockCategoryImportRows(rows, importReference.categories);
  }

  if (mode === 'subcategories') {
    return validateStockSubcategoryImportRows(rows, stockRows);
  }

  return validateStockProductImportRows(rows, stockRows);
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

function ImportReferencePanel({ mode, reference }) {
  if (mode === 'categories') {
    return (
      <div className="import-reference-panel">
        <h3>Categorias cadastradas</h3>
        <div className="import-chip-list">
          {reference.categories.map((category) => <span key={category}>{category}</span>)}
        </div>
      </div>
    );
  }

  return (
    <div className="import-reference-panel">
      <div>
        <h3>Categorias</h3>
        <div className="import-chip-list">
          {reference.categories.map((category) => <span key={category}>{category}</span>)}
        </div>
      </div>
      <div>
        <h3>Subcategorias</h3>
        <div className="import-reference-list">
          {reference.subcategories.map((subcategory) => (
            <span key={`${subcategory.category}-${subcategory.name}`}>
              <strong>{subcategory.category}</strong>
              {subcategory.name}
            </span>
          ))}
        </div>
      </div>
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
        <p>
          Subcategorias nao encontradas: {summary.missingSubcategories
            .map((item) => `${item.category} / ${item.name}`)
            .join(', ')}
        </p>
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

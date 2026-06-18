import React, { useMemo, useState } from 'react';
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
  const [activeModal, setActiveModal] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [rows, setRows] = useState(stockItems);
  const [query, setQuery] = useState('');
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
    () => rows.filter((item) =>
      [item.id, item.name, item.category, item.subcategory, item.location, item.status]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
    [query, rows],
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
            <button type="button"><Download size={17} /> Exportar</button>
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
          options={formOptions}
          stockRows={referenceRows}
          inventoryRows={rows}
          importReference={importReference}
          onClose={closeModal}
          onImport={handleImport}
          onStockMovement={handleStockMovement}
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

function StockModal({ type, item, options, stockRows, inventoryRows, importReference, onClose, onImport, onStockMovement }) {
  const [imagePreview, setImagePreview] = useState('');
  const [categoryImagePreview, setCategoryImagePreview] = useState('');
  const [movementQuantity, setMovementQuantity] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [movementNote, setMovementNote] = useState('');
  const [inventoryCounts, setInventoryCounts] = useState({});
  const [inventoryResult, setInventoryResult] = useState(null);
  const [importFileName, setImportFileName] = useState('');
  const [importMode, setImportMode] = useState('products');
  const [importSummary, setImportSummary] = useState(null);
  const [importRows, setImportRows] = useState([]);
  const [importNotice, setImportNotice] = useState('');
  const isFilter = type === 'filter';
  const isSubcategory = type === 'subcategory';
  const isCategory = type === 'category';
  const isImportProducts = type === 'importProducts';
  const isInventory = type === 'inventory';
  const isProductForm = type === 'product' || type === 'editProduct';
  const isView = type === 'viewProduct';
  const isStockIn = type === 'stockIn';
  const isStockOut = type === 'stockOut';
  const isStockMovement = isStockIn || isStockOut;
  const sortedInventoryRows = useMemo(
    () => [...(inventoryRows ?? [])].sort((first, second) =>
      first.location.localeCompare(second.location, 'pt-AO') || first.name.localeCompare(second.name, 'pt-AO'),
    ),
    [inventoryRows],
  );

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

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className={isInventory ? 'modal-card inventory' : 'modal-card wide'}>
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
              <input
                min="1"
                placeholder="Quantidade"
                type="number"
                value={movementQuantity}
                onChange={(event) => setMovementQuantity(event.target.value)}
              />
              {isStockOut ? (
                <OptionSelect label="Motivo da baixa" value={movementReason} options={STOCK_OUT_REASONS} onChange={setMovementReason} />
              ) : (
                <input
                  placeholder="Origem ou observação"
                  value={movementNote}
                  onChange={(event) => setMovementNote(event.target.value)}
                />
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
              <input placeholder="Designação" defaultValue={item?.name ?? ''} />
              <input placeholder="Código de barras" defaultValue={item?.id ?? ''} />
              <OptionSelect label="Categoria" value={item?.category} options={options.categories} />
              <OptionSelect label="Subcategoria" value={item?.subcategory} options={options.subcategories} />
              <input placeholder="Preço de venda" type="number" defaultValue={item?.price ?? ''} />
              <input placeholder="Preço de custo" type="number" />
              <input placeholder="Lote" />
              <input placeholder="Data de expiração" type="date" />
              <OptionSelect label="Localização" value={item?.location} options={options.locations} />
              <label className="check-row"><input type="checkbox" /> Receita obrigatória</label>
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
            <InventoryCountSheet
              counts={inventoryCounts}
              rows={sortedInventoryRows}
              result={inventoryResult}
              onCountChange={updateInventoryCount}
            />
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
              <input placeholder="Nome da categoria" />
              <input placeholder="Código" />
              <textarea placeholder="Descrição" />
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
              <input placeholder="Nome da subcategoria" />
              <textarea placeholder="Descrição" />
            </>
          )}

          {isFilter && (
            <>
              <OptionSelect label="Categoria" options={options.categories} />
              <input placeholder="Status" />
              <OptionSelect label="Localização" options={options.locations} />
              <input placeholder="Validade até" type="date" />
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
            <button
              type="button"
              className="primary-button"
              onClick={submitInventoryCount}
            >
              Enviar contagem
            </button>
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
            <button type="button" className="primary-button" onClick={onClose}>
              {isFilter ? 'Aplicar Filtro' : 'Guardar'}
            </button>
          )}
        </div>
      </div>
    </div>
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
    <select aria-label={label} {...selectProps}>
      <option value="" disabled>{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

function getStockStatusClass(status) {
  if (status === 'Sem estoque') return 'stock-status out';
  if (status === 'Baixo estoque') return 'stock-status low';
  return 'stock-status ok';
}

export default Estoque;

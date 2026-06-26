import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  ArrowLeft,
  Banknote,
  Barcode,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CreditCard,
  FileDown,
  Package,
  Printer,
  RotateCcw,
  Search,
  Smartphone,
  Trash2,
  UserRound,
  Wallet,
  XCircle,
} from 'lucide-react';
import { calculateCartSummary, formatKwanza } from '../data/pharmacyData.mjs';
import {
  addCartItem,
  appendReceivedDigit,
  calculateCheckout,
  cancelHeldSale as cancelHeldSaleByNumber,
  changeCartQuantity,
  createHeldSale,
  DEFAULT_SALE_CLIENT,
  filterClientsForPicker,
  filterProductsForSale,
  findProductByExactBarcode,
  removeCartItem,
  resumeHeldSale,
} from '../data/salesWorkflow.mjs';
import {
  canCancelDocument,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  documentStatusLabels,
  documentTypeLabels,
} from '../data/documents.mjs';
import { buildDocumentSettingsFromSnapshot, buildInvoiceA4ViewModel } from '../data/invoiceA4.mjs';
import { confirmDelete } from '../utils/confirmations.mjs';
import { useOperation } from '../operation/OperationContext';
import { request } from '../services/ipcClient';
import { CATALOG_KEYS } from '../configuration/catalogKeys.mjs';
import { useCatalog, useSetting, useSettings } from '../configuration/SettingsContext';
import InvoiceA4 from './InvoiceA4';
import CancellationModal from './CancellationModal';

const paymentMethodIcons = { dinheiro: Banknote, tpa: CreditCard, transferencia: Building2, credito: Smartphone };

const cashKeypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'backspace'];

function isPaymentMethodAllowedForDocument(docType, paymentMethod) {
  const isCreditDocument = docType === DOCUMENT_TYPES.CREDIT;
  const isCreditPayment = String(paymentMethod || '').toLowerCase() === 'credito';
  return isCreditDocument ? isCreditPayment : !isCreditPayment;
}

function mapProductForSale(p) {
  return {
    id: p.id,
    name: p.nome,
    price: p.preco_venda,
    category: p.categoria || '',
    barcode: p.codigo_barras || '',
    codigo_barras: p.codigo_barras || '',
    stock: p.totalStock || 0,
    imagem: p.imagem || null,
    imageTone: (p.id % 2 === 0) ? 'blue' : 'orange',
  };
}

function mapClientForSale(c) {
  return {
    id: c.id,
    name: c.nome,
    nif: c.nif || '',
    phone: c.telefone || '',
  };
}

function Vendas() {
  const operation = useOperation();
  const { snapshot } = useSettings();
  const { user } = useAuth();
  const catalogPaymentMethods = useCatalog(CATALOG_KEYS.PAYMENT_METHODS);
  const paymentMethods = catalogPaymentMethods.map((option) => ({
    id: option.code,
    label: option.name,
    icon: paymentMethodIcons[option.metadata?.icon] || paymentMethodIcons[option.code] || CreditCard,
  }));
  const defaultPaymentMethod = useSetting('sales.defaultPaymentMethod', 'dinheiro');
  const defaultTaxRate = useSetting('sales.defaultTaxRate', 0);
  const maximumDiscount = useSetting('sales.maxDiscount', 0);

  const [allProducts, setAllProducts] = useState([]);
  const [allClients, setAllClients] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [categoryOffset, setCategoryOffset] = useState(0);
  const [cart, setCart] = useState([]);
  const [heldSales, setHeldSales] = useState([]);
  const heldSalesReady = useRef(false);
  const [selectedClient, setSelectedClient] = useState(DEFAULT_SALE_CLIENT);
  const [showClientPopup, setShowClientPopup] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [discount, setDiscount] = useState(0);
  const [received, setReceived] = useState('');
  const [finalizedDocument, setFinalizedDocument] = useState(null);
  const [saleError, setSaleError] = useState('');
  const [recentSaleDocuments, setRecentSaleDocuments] = useState([]);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [docType, setDocType] = useState(DOCUMENT_TYPES.INVOICE_RECEIPT);

  const loadPdvData = useCallback(async () => {
    try {
      const [products, clients, categories] = await Promise.all([
        request('estoque.listProducts', {}),
        request('clientes.list', {}),
        request('estoque.listCategories'),
      ]);
      setAllProducts(products.map(mapProductForSale));
      setAllClients(clients.map(mapClientForSale));
      const categoriesWithCount = categories.map((cat) => ({
        id: cat.id,
        name: cat.nome,
        imagem: cat.imagem || null,
        count: products.filter((p) => p.categoria === cat.nome).length,
      }));
      setAllCategories(categoriesWithCount);
    } catch (err) {
      console.error('Erro ao carregar dados PDV:', err);
    }
  }, []);

  const loadRecentDocuments = useCallback(async () => {
    try {
      const docs = await request('vendas.recentDocuments', { limit: 10 });
      setRecentSaleDocuments(docs);
    } catch (err) {
      console.error('Erro ao carregar documentos recentes:', err);
    }
  }, []);

  useEffect(() => {
    loadPdvData();
    loadRecentDocuments();
    // Load held sales from SQLite (persists across restarts and hibernation)
    request('heldSales.load').then(sales => {
      setHeldSales(Array.isArray(sales) ? sales : []);
      heldSalesReady.current = true;
    }).catch(() => { heldSalesReady.current = true; });
  }, [loadPdvData, loadRecentDocuments]);

  useEffect(() => {
    if (!heldSalesReady.current) return;
    request('heldSales.save', { sales: heldSales }).catch(() => {});
    window.dispatchEvent(new CustomEvent('held-sales-changed'));
  }, [heldSales]);

  const previewDocNumber = useMemo(() => {
    const prefixMap = {
      [DOCUMENT_TYPES.INVOICE]: 'FT',
      [DOCUMENT_TYPES.INVOICE_RECEIPT]: 'FR',
      [DOCUMENT_TYPES.RECEIPT]: 'RC',
      [DOCUMENT_TYPES.PROFORMA]: 'PF',
      [DOCUMENT_TYPES.CREDIT]: 'CR',
    };
    const prefix = prefixMap[docType] ?? 'FT';
    const year = String(new Date().getFullYear()).slice(-2);
    const typeCount = recentSaleDocuments.filter((d) => d.type === docType).length + 1;
    return `${prefix}${String(typeCount).padStart(5, '0')}/${year}`;
  }, [docType, recentSaleDocuments]);

  const visibleProducts = useMemo(
    () => filterProductsForSale(allProducts, activeCategory, productQuery),
    [allProducts, activeCategory, productQuery],
  );
  const visibleCategories = useMemo(
    () => allCategories.length
      ? Array.from({ length: Math.min(4, allCategories.length) }, (_, i) =>
          allCategories[(categoryOffset + i) % allCategories.length])
      : [],
    [allCategories, categoryOffset],
  );
  const visibleClients = useMemo(
    () => filterClientsForPicker(allClients, clientQuery),
    [allClients, clientQuery],
  );
  const summary = calculateCartSummary(cart, discount, defaultTaxRate);
  const checkout = calculateCheckout({
    cart,
    discount,
    received,
    taxRate: defaultTaxRate,
  });

  function holdSale() {
    if (!operation.canOperate) return;
    if (!cart.length) return;

    const invoiceNumber = `ESP-${Date.now()}`;
    setHeldSales((current) =>
      createHeldSale({
        cart,
        currentHeldSales: current,
        clientName: selectedClient?.name ?? 'Cliente Balcão',
        invoiceNumber,
      }),
    );
    setCart([]);
    setSelectedClient(DEFAULT_SALE_CLIENT);
    setDiscount(0);
    setShowCheckout(false);
  }

  function resumeSale(invoice) {
    if (invoice.status !== 'EM ESPERA') return;

    const resumed = resumeHeldSale(heldSales, invoice.number);
    if (!resumed.invoice) return;

    setHeldSales(resumed.heldSales);
    setCart(resumed.cart);
    const matchedClient = allClients.find((c) => c.name === invoice.client);
    setSelectedClient(matchedClient ?? DEFAULT_SALE_CLIENT);
    setShowCheckout(false);
  }

  async function cancelHeldSale(invoiceNumber) {
    if (!(await confirmDelete(`a compra em espera ${invoiceNumber}`))) return;
    setHeldSales((current) => cancelHeldSaleByNumber(current, invoiceNumber));
  }

  function openClientPicker() {
    setClientQuery('');
    setShowClientPopup(true);
  }

  function closeClientPicker() {
    setClientQuery('');
    setShowClientPopup(false);
  }

  function closeSale() {
    if (!cart.length) return;
    setCart([]);
    setReceived('');
    setDiscount(0);
    setSelectedClient(DEFAULT_SALE_CLIENT);
    setShowCheckout(false);
  }

  function handleProductQueryChange(value) {
    const scannedProduct = findProductByExactBarcode(allProducts, value);

    if (scannedProduct && operation.canOperate) {
      setCart((current) => addCartItem(current, scannedProduct));
      setProductQuery('');
      return;
    }

    setProductQuery(value);
  }

  function handleDocTypeChange(nextDocType) {
    setDocType(nextDocType);
    setPendingPayment(null);
    setShowCheckout(false);
    setReceived('');
  }

  async function handleCancelDocument(reason) {
    const document = cancelTarget;
    if (!document) return;
    if (!document.vendaId) {
      setSaleError('Documento nao pode ser anulado (sem referencia no banco de dados).');
      setCancelTarget(null);
      return;
    }

    setSaleError('');
    try {
      const ncCount = recentSaleDocuments.filter((d) => d.type === 'NOTA_CREDITO').length + 1;
      const year = String(new Date().getFullYear()).slice(-2);
      const creditNoteNumber = `NC${String(ncCount).padStart(3, '0')}/${year}`;
      const reservedNc = await request('configuration.document.reserveNumber', { documentType: 'nota_credito' }).catch(() => creditNoteNumber);

      const { cancelledDoc, creditNote } = await request('vendas.cancelDocument', {
        venda_id: document.vendaId,
        reason,
        creditNoteNumber: reservedNc,
      });

      setRecentSaleDocuments((current) =>
        [creditNote, ...current.map((d) => (d.vendaId === cancelledDoc.vendaId ? { ...d, status: 'ANULADO', cancelledAt: cancelledDoc.cancelledAt, cancelledBy: cancelledDoc.cancelledBy, cancellationReason: cancelledDoc.cancellationReason } : d))],
      );
      setCancelTarget(null);
      setFinalizedDocument(creditNote);
    } catch (err) {
      setSaleError(err?.message || 'Erro ao anular documento.');
      setCancelTarget(null);
    }
  }

  function choosePaymentMethod(mode) {
    if (!operation.canOperate) return;
    if (!cart.length) return;
    if (!isPaymentMethodAllowedForDocument(docType, mode)) return;

    if (mode === 'dinheiro') {
      setShowCheckout(true);
      setReceived('');
      return;
    }

    setPendingPayment({
      mode,
      checkoutData: { ...summary, received: summary.total, change: 0, canFinalize: true },
    });
  }

  async function finalizeSale(paymentMethod = defaultPaymentMethod, checkoutData = checkout) {
    if (!operation.canOperate) return;
    if (!cart.length || !checkoutData.canFinalize) return;
    if (!isPaymentMethodAllowedForDocument(docType, paymentMethod)) {
      setSaleError(docType === DOCUMENT_TYPES.CREDIT
        ? 'Documento do tipo Crédito deve usar pagamento Crédito.'
        : 'Crédito só é permitido quando o tipo de documento for Crédito.');
      return;
    }
    setSaleError('');

    const ipcDocTypeMap = {
      [DOCUMENT_TYPES.INVOICE]: 'factura',
      [DOCUMENT_TYPES.INVOICE_RECEIPT]: 'factura_recibo',
      [DOCUMENT_TYPES.RECEIPT]: 'recibo',
      [DOCUMENT_TYPES.PROFORMA]: 'proforma',
      [DOCUMENT_TYPES.CREDIT]: 'credito',
    };

    const isProforma = docType === DOCUMENT_TYPES.PROFORMA;
    const ipcDocType = ipcDocTypeMap[docType] ?? 'factura_recibo';

    try {
      const numero_factura = await request('configuration.document.reserveNumber', { documentType: ipcDocType });

      const saleItems = cart.map((item) => ({
        produto_id: item.id,
        nome: item.name,
        quantidade: Number(item.quantity) || 1,
        preco_unitario: Number(item.price) || 0,
      }));

      const document = await request('vendas.create', {
        numero_factura,
        docType: ipcDocType,
        items: saleItems,
        cliente_id: selectedClient?.id !== 'FINAL_CONSUMER' ? selectedClient?.id : null,
        paymentMethod,
        subtotal: checkoutData.subtotal,
        desconto: checkoutData.discount,
        imposto: checkoutData.tax,
        total: checkoutData.total,
        valorPago: checkoutData.received,
        troco: checkoutData.change,
      });

      setFinalizedDocument(document);
      if (!isProforma) {
        setRecentSaleDocuments((current) => [document, ...current].slice(0, 10));
        setCart([]);
        setReceived('');
        setDiscount(0);
        setSelectedClient(DEFAULT_SALE_CLIENT);
        setShowCheckout(false);
        setPendingPayment(null);
      }
    } catch (cause) {
      setSaleError(cause?.message || 'Nao foi possivel registar a venda.');
    }
  }

  function rotateCategories(direction) {
    const len = allCategories.length || 1;
    setCategoryOffset((current) => (current + direction + len) % len);
  }

  return (
    <section className="sales-screen">
      {saleError ? (
        <div className="sale-error-backdrop" role="dialog" aria-modal="true">
          <div className="sale-error-popup">
            <div className="sale-error-icon">⚠️</div>
            <h3>Não foi possível processar a venda</h3>
            <p>{saleError}</p>
            <button type="button" className="primary-button" onClick={() => setSaleError('')}>Fechar</button>
          </div>
        </div>
      ) : null}
      <div className="sales-main">
        {!operation.canOperate ? (
          <div className="operation-blocked-banner sales-operation-block">
            {operation.message || 'Abra o dia e o turno antes de vender.'}
          </div>
        ) : null}

        <div className="category-carousel">
          <button className="circle-action" type="button" aria-label="Categoria anterior" onClick={() => rotateCategories(-1)}>
            <ChevronLeft size={20} />
          </button>
          {visibleCategories.map((category) => (
            <button
              key={category.id}
              className={activeCategory === category.name ? 'category-card active' : 'category-card'}
              onClick={() => setActiveCategory(category.name)}
              type="button"
            >
              {category.imagem
                ? <img src={category.imagem} alt={category.name} className="category-card-img" />
                : <ProductIllustration tone={category.id % 2 ? 'orange' : 'blue'} />}
              <strong>{category.name}</strong>
              <small>{category.count} itens</small>
            </button>
          ))}
          <button className="circle-action" type="button" aria-label="Próxima categoria" onClick={() => rotateCategories(1)}>
            <ChevronRight size={20} />
          </button>
          {activeCategory && (
            <button
              className="clear-category-action"
              type="button"
              aria-label="Limpar seleção de categoria"
              title="Limpar seleção"
              onClick={() => setActiveCategory(null)}
            >
              <XCircle size={20} />
            </button>
          )}
        </div>

        <div className="product-panel">
          <div className="product-toolbar">
            <Barcode size={28} />
            <input
              aria-label="Buscar produto"
              placeholder="Buscar produto"
              value={productQuery}
              onChange={(event) => handleProductQueryChange(event.target.value)}
            />
            <Search size={18} />
          </div>

          <div className="product-grid">
            {visibleProducts.map((product) => (
              <button
                key={product.id}
                className="product-card"
                type="button"
                disabled={!operation.canOperate}
                onClick={() => setCart((current) => addCartItem(current, product))}
              >
                {product.imagem
                  ? <img src={product.imagem} alt={product.name} className="product-card-img" />
                  : <ProductIllustration tone={product.imageTone} />}
                <strong>{product.name}</strong>
                <span>{formatKwanza(product.price).replace('KZ ', '')}</span>
              </button>
            ))}
            {!visibleProducts.length && (
              <div className="empty-state product-empty">
                <Package size={28} />
                <strong>Nenhum produto encontrado</strong>
              </div>
            )}
          </div>
        </div>

        <div className="sales-actions">
          <button type="button" onClick={holdSale} className="soft-button" disabled={!operation.canOperate}>
            <Wallet size={18} />
            Colocar em Espera
          </button>
          <button type="button" onClick={openClientPicker} className="soft-button">
            <UserRound size={18} />
            Cliente
          </button>
        </div>

      </div>

      <aside className="invoice-panel">
        {showCheckout ? (
          <CheckoutPanel
            checkout={checkout}
            received={received}
            setReceived={setReceived}
            onBack={() => setShowCheckout(false)}
            onFinalize={() => finalizeSale('dinheiro', checkout)}
            canOperate={operation.canOperate}
          />
        ) : (
          <InvoiceDetails
            cart={cart}
            selectedClient={selectedClient}
            summary={summary}
            docType={docType}
            previewDocNumber={previewDocNumber}
            onDocTypeChange={handleDocTypeChange}
            onRemoveItem={async (item) => {
              if (await confirmDelete(`o produto ${item.name} da factura`)) {
                setCart((current) => removeCartItem(current, item.id));
              }
            }}
            onChangeQuantity={(itemId, direction) => {
              setCart((current) => changeCartQuantity(current, itemId, direction));
            }}
            onClient={openClientPicker}
            onPaymentMethod={choosePaymentMethod}
            paymentMethods={paymentMethods}
            canOperate={operation.canOperate}
            operationMessage={operation.message}
          />
        )}
      </aside>

      <HeldSalesTable rows={heldSales} onContinue={resumeSale} onCancel={cancelHeldSale} />

      <RecentSaleDocumentsTable
        rows={recentSaleDocuments}
        onOpenDocument={(document) => setFinalizedDocument(document)}
        onCancelDocument={(document) => setCancelTarget(document)}
      />

      {finalizedDocument ? (
        <FinalizedSalePreview document={finalizedDocument} snapshot={snapshot} onClose={() => setFinalizedDocument(null)} />
      ) : null}

      {pendingPayment && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-title-row">
              <h2>Confirmar venda</h2>
              <button type="button" onClick={() => setPendingPayment(null)}>×</button>
            </div>
            <p style={{ margin: '12px 0' }}>
              Finalizar a venda de <strong>{formatKwanza(summary.total)}</strong> via <strong>{pendingPayment.mode.toUpperCase()}</strong>?
            </p>
            <div className="modal-actions">
              <button type="button" className="soft-button" onClick={() => setPendingPayment(null)}>Cancelar</button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const { mode, checkoutData } = pendingPayment;
                  setPendingPayment(null);
                  finalizeSale(mode, checkoutData);
                }}
              >
                Finalizar
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelTarget && (
        <CancellationModal
          document={cancelTarget}
          onConfirm={handleCancelDocument}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {showClientPopup && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-title-row">
              <h2>Selecionar Cliente</h2>
              <button type="button" onClick={() => setShowClientPopup(false)}>×</button>
            </div>
            <div className="client-picker-search">
              <Search size={18} />
              <input
                aria-label="Pesquisar cliente"
                placeholder="Pesquisar cliente por nome, NIF ou telefone"
                value={clientQuery}
                onChange={(event) => setClientQuery(event.target.value)}
                autoFocus
              />
            </div>
            <div className="client-picker">
              {visibleClients.map((client) => (
                <button
                  type="button"
                  key={client.id}
                  className={selectedClient?.id === client.id ? 'client-option active' : 'client-option'}
                  onClick={() => {
                    setSelectedClient(client);
                    closeClientPicker();
                  }}
                >
                  <UserRound size={20} />
                  <span>
                    <strong>{client.name}</strong>
                    <small>{client.nif} · {client.phone}</small>
                  </span>
                </button>
              ))}
              {!visibleClients.length && (
                <div className="empty-state client-empty">
                  <UserRound size={28} />
                  <strong>Nenhum cliente encontrado</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function FinalizedSalePreview({ document, snapshot, onClose }) {
  const [printBusy, setPrintBusy] = React.useState(false);
  const documentSettings = buildDocumentSettingsFromSnapshot(snapshot);
  const viewModel = buildInvoiceA4ViewModel({
    document,
    ...documentSettings,
    printedBy: document.userName || 'Vendedor',
  });

  async function handlePrintA4() {
    if (printBusy) return;
    setPrintBusy(true);
    try { await request('invoice.print', { viewModel }); } finally { setPrintBusy(false); }
  }

  async function handleSavePdf() {
    if (printBusy) return;
    setPrintBusy(true);
    try { await request('invoice.savePDF', { viewModel }); } finally { setPrintBusy(false); }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card wide document-detail-modal">
        <div className="modal-title-row">
          <h2>{document.number}</h2>
          <div className="invoice-a4-actions">
            <button type="button" className="icon-button" aria-label="Salvar PDF" title="Salvar PDF" onClick={handleSavePdf} disabled={printBusy}>
              <FileDown size={20} />
            </button>
            <button type="button" className="icon-button" aria-label="Imprimir factura" title="Imprimir" onClick={handlePrintA4} disabled={printBusy}>
              <Printer size={20} />
            </button>
            <button type="button" className="icon-button" aria-label="Fechar visualizacao" onClick={onClose}>x</button>
          </div>
        </div>
        <InvoiceA4 viewModel={viewModel} />
      </div>
    </div>
  );
}

const DOC_TYPE_OPTIONS = [
  { id: DOCUMENT_TYPES.INVOICE, label: 'Factura' },
  { id: DOCUMENT_TYPES.INVOICE_RECEIPT, label: 'Factura/Recibo' },
  { id: DOCUMENT_TYPES.RECEIPT, label: 'Recibo' },
  { id: DOCUMENT_TYPES.PROFORMA, label: 'Proforma' },
  { id: DOCUMENT_TYPES.CREDIT, label: 'Crédito' },
];

function InvoiceDetails({
  cart,
  selectedClient,
  summary,
  docType,
  previewDocNumber,
  onDocTypeChange,
  onRemoveItem,
  onChangeQuantity,
  onClient,
  onPaymentMethod,
  canOperate,
  operationMessage,
  paymentMethods,
}) {
  const currentDocLabel = DOC_TYPE_OPTIONS.find(d => d.id === docType)?.label ?? 'Factura';
  return (
    <>
      <div className="invoice-doc-type-row">
        <span className="invoice-doc-type-label">Tipo de Documento</span>
        <select
          className="invoice-doc-type-select"
          value={docType}
          onChange={e => onDocTypeChange(e.target.value)}
        >
          {DOC_TYPE_OPTIONS.map(dt => (
            <option key={dt.id} value={dt.id}>{dt.label}</option>
          ))}
        </select>
      </div>
      {docType === DOCUMENT_TYPES.PROFORMA && (
        <div className="invoice-doc-type-notice">
          Proforma — sem abate de stock. Converta para Factura ao confirmar encomenda.
        </div>
      )}
      <h2>Detalhes da {currentDocLabel}</h2>
      <button className="client-search" type="button" onClick={onClient}>
        <span>
          <strong>{selectedClient?.name ?? DEFAULT_SALE_CLIENT.name}</strong>
          <small>NIF: {selectedClient?.nif ?? DEFAULT_SALE_CLIENT.nif}</small>
        </span>
        <Search size={22} />
      </button>
      <h3>{currentDocLabel} n.º {previewDocNumber}</h3>

      <div className="cart-list">
        {cart.map((item) => (
          <div className="cart-item" key={item.id}>
            <ProductIllustration tone={item.imageTone} compact />
            <strong>{item.name}</strong>
            <div className="quantity-stepper">
              <button type="button" onClick={() => onChangeQuantity(item.id, 1)} aria-label="Aumentar quantidade">
                <ChevronUp size={18} />
              </button>
              <span>{String(item.quantity).padStart(2, '0')}</span>
              <button type="button" onClick={() => onChangeQuantity(item.id, -1)} aria-label="Diminuir quantidade">
                <ChevronDown size={18} />
              </button>
            </div>
            <span>{formatKwanza(item.price * item.quantity).replace('KZ ', '')}</span>
            <button
              type="button"
              className="icon-button danger"
              aria-label={`Remover ${item.name}`}
              onClick={() => onRemoveItem(item)}
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        {!cart.length && (
          <div className="empty-state invoice-empty">
            <Package size={30} />
            <strong>Adicione produtos para iniciar a factura</strong>
          </div>
        )}
      </div>

      <div className="payment-summary">
        <h3>Resumo Pagamento</h3>
        <div><span>Subtotal</span><strong>{formatKwanza(summary.subtotal).replace('KZ ', '')}</strong></div>
        <div><span>Desconto</span><strong>{formatKwanza(summary.discount).replace('KZ ', '')}</strong></div>
        <div><span>Imposto</span><strong>{formatKwanza(summary.tax).replace('KZ ', '')}</strong></div>
        <div className="total-line"><span>Total a Pagar</span><strong>{formatKwanza(summary.total).replace('KZ ', '')}</strong></div>
        <div className="payment-method-grid">
          {paymentMethods.map((method) => (
            <button
              key={method.id}
              type="button"
              onClick={() => onPaymentMethod(method.id)}
              disabled={!canOperate || !cart.length || !isPaymentMethodAllowedForDocument(docType, method.id)}
              aria-label={`Pagar com ${method.label}`}
              data-tooltip={method.label}
              title={!canOperate ? operationMessage : method.label}
            >
              <method.icon size={30} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function HeldSalesTable({ rows, onContinue, onCancel }) {
  return (
    <div className="table-panel held-sales-table">
      <div className="held-sales-title">
        <h2>Clientes em Espera</h2>
      </div>
      <table>
        <thead>
          <tr>
            <th>N. Factura</th>
            <th>Itens da Factura</th>
            <th>Cliente</th>
            <th>Valor</th>
            <th>Status</th>
            <th>Opções</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((invoice) => (
            <tr key={invoice.number}>
              <td>{invoice.number}</td>
              <td>
                <HeldInvoiceItems items={invoice.items} />
              </td>
              <td>{invoice.client}</td>
              <td>{formatKwanza(invoice.value).replace('KZ ', '')}</td>
              <td><span className="status waiting">{invoice.status}</span></td>
              <td className="held-actions">
                <button
                  type="button"
                  className="held-icon-action continue"
                  aria-label="Continuar compra"
                  title="Continuar compra"
                  onClick={() => onContinue(invoice)}
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  type="button"
                  className="held-icon-action danger"
                  aria-label="Cancelar compra"
                  title="Cancelar compra"
                  onClick={() => onCancel(invoice.number)}
                >
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty-state">
          <Package size={28} />
          <strong>Sem compras em espera</strong>
        </div>
      )}
    </div>
  );
}

function HeldInvoiceItems({ items }) {
  return <span className="held-items-list">{items}</span>;
}

const DOC_STATUS_CLASS = {
  [DOCUMENT_STATUSES.PAID]: 'paid',
  [DOCUMENT_STATUSES.ISSUED]: 'issued',
  [DOCUMENT_STATUSES.CANCELLED]: 'cancelled',
  [DOCUMENT_STATUSES.PENDING]: 'waiting',
  [DOCUMENT_STATUSES.DRAFT]: 'waiting',
  [DOCUMENT_STATUSES.CONVERTED]: 'issued',
};

function RecentSaleDocumentsTable({ rows, onOpenDocument, onCancelDocument }) {
  return (
    <div className="table-panel recent-sale-documents-table">
      <div className="held-sales-title">
        <h2>Ultimos 5 Documentos de Vendas</h2>
      </div>
      <table>
        <thead>
          <tr>
            <th>Documento</th>
            <th>Tipo</th>
            <th>Cliente</th>
            <th>Data</th>
            <th>Total</th>
            <th>Status</th>
            <th>Opcoes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((document) => {
            const statusClass = DOC_STATUS_CLASS[document.status] || 'issued';
            const cancellable = canCancelDocument(document);
            return (
            <tr key={document.id || document.number}>
              <td>{document.number}</td>
              <td>{documentTypeLabels[document.type] || document.type}</td>
              <td>{document.clientName || 'Consumidor final'}</td>
              <td>{document.issueDate}</td>
              <td>{formatKwanza(document.total).replace('KZ ', '')}</td>
              <td><span className={`status ${statusClass}`}>{documentStatusLabels[document.status] || document.status}</span></td>
              <td className="options-cell">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Verificar ou reimprimir ${document.number}`}
                  title="Verificar ou reimprimir"
                  onClick={() => onOpenDocument(document)}
                >
                  <Printer size={16} />
                </button>
                {cancellable && (
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Anular ${document.number}`}
                    title="Anular documento"
                    onClick={() => onCancelDocument(document)}
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty-state">
          <Package size={28} />
          <strong>Sem documentos de vendas</strong>
        </div>
      )}
    </div>
  );
}

function CheckoutPanel({
  checkout,
  received,
  setReceived,
  onBack,
  onFinalize,
  canOperate,
}) {
  function pressKey(key) {
    setReceived((current) => appendReceivedDigit(current, key));
  }

  return (
    <div className="checkout-panel">
      <button type="button" className="text-button" onClick={onBack}>
        <ArrowLeft size={18} />
        Voltar aos detalhes
      </button>
      <h2>Pagamento em Dinheiro</h2>

      <div className="checkout-total">
        <span>Total a Pagar</span>
        <strong>{formatKwanza(checkout.total)}</strong>
      </div>

      <div className="cash-received-display">
        <span>Valor recebido</span>
        <strong>{received ? formatKwanza(Number(received)) : formatKwanza(0)}</strong>
      </div>

      <div className="checkout-lines">
        <div><span>Subtotal</span><strong>{formatKwanza(checkout.subtotal)}</strong></div>
        <div><span>Desconto</span><strong>{formatKwanza(checkout.discount)}</strong></div>
        <div><span>Troco</span><strong>{formatKwanza(checkout.change)}</strong></div>
      </div>

      <div className="cash-keypad" aria-label="Teclado numerico para valor recebido">
        {cashKeypad.map((key) => (
          <button type="button" key={key} onClick={() => pressKey(key)}>
            {key === 'clear' ? 'Limpar' : key === 'backspace' ? 'Apagar' : key}
          </button>
        ))}
      </div>

      <button type="button" className="checkout-finalize" disabled={!canOperate || !checkout.canFinalize} onClick={onFinalize}>
        <Banknote size={22} />
        <span>Finalizar</span>
        <CheckCircle2 size={22} />
      </button>
    </div>
  );
}

export function ProductIllustration({ tone = 'green', compact = false }) {
  return (
    <span className={`product-illustration ${tone} ${compact ? 'compact' : ''}`}>
      <span />
      <i />
    </span>
  );
}

export default Vendas;

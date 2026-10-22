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
  ListX,
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
  suggestCashAmounts,
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

// Tipo de documento da venda -> série fiscal (catálogo document_types).
const SALE_DOCUMENT_SERIES = Object.freeze({
  [DOCUMENT_TYPES.INVOICE]: { key: 'factura', prefix: 'FT' },
  [DOCUMENT_TYPES.INVOICE_RECEIPT]: { key: 'factura_recibo', prefix: 'FR' },
  [DOCUMENT_TYPES.RECEIPT]: { key: 'recibo', prefix: 'RC' },
  [DOCUMENT_TYPES.PROFORMA]: { key: 'proforma', prefix: 'PF' },
  [DOCUMENT_TYPES.CREDIT]: { key: 'credito', prefix: 'CR' },
});
const RECENT_DOCUMENTS_LIMIT = 5;

// "FR00012/26" (prefixo "FR") -> série seguinte { prefix: 'FR', nextNumber: 13, padding: 5, year: '26' }
function seriesAfterReservedNumber(reserved, prefix) {
  const value = String(reserved || '');
  if (!prefix || !value.startsWith(prefix)) return null;
  const match = /^(\d+)\/(\d{2})$/.exec(value.slice(prefix.length));
  if (!match) return null;
  return { prefix, nextNumber: Number(match[1]) + 1, padding: match[1].length, year: match[2] };
}

function buildSaleViewModel(document, snapshot) {
  return buildInvoiceA4ViewModel({
    document,
    ...buildDocumentSettingsFromSnapshot(snapshot),
    printedBy: document.userName || 'Vendedor',
  });
}

function isTypingTarget(target) {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function Vendas() {
  const operation = useOperation();
  const { snapshot } = useSettings();
  const { user, hasPermission } = useAuth();
  // Mesmas permissões que o backend aceita em vendas.cancelDocument.
  const canCancelDocuments = hasPermission('vendas.cancelar') || hasPermission('documentos.anular');
  const catalogPaymentMethods = useCatalog(CATALOG_KEYS.PAYMENT_METHODS);
  const paymentMethods = catalogPaymentMethods.map((option) => ({
    id: option.code,
    label: option.name,
    icon: paymentMethodIcons[option.metadata?.icon] || paymentMethodIcons[option.code] || CreditCard,
  }));
  const defaultPaymentMethod = useSetting('sales.defaultPaymentMethod', 'dinheiro');
  const defaultTaxRate = useSetting('sales.defaultTaxRate', 0);
  const maximumDiscount = useSetting('sales.maxDiscount', 0);
  const afterSaleAction = useSetting('sales.afterSaleAction', 'mostrar');
  const searchInputRef = useRef(null);
  const finalizingRef = useRef(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [pdvNotice, setPdvNotice] = useState(null);

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
  const [pdvLoadError, setPdvLoadError] = useState('');
  const [recentSaleDocuments, setRecentSaleDocuments] = useState([]);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [docType, setDocType] = useState(DOCUMENT_TYPES.INVOICE_RECEIPT);

  const loadPdvData = useCallback(async () => {
    // Cada lista carrega de forma independente: uma falha (ex.: falta de
    // permissão para clientes) não deve deixar o PDV sem produtos.
    const [productsResult, clientsResult, categoriesResult] = await Promise.allSettled([
      request('estoque.listProducts', {}),
      request('clientes.list', {}),
      request('estoque.listCategories'),
    ]);
    const products = productsResult.status === 'fulfilled' ? productsResult.value : [];
    const failures = [productsResult, clientsResult, categoriesResult].filter((result) => result.status === 'rejected');
    failures.forEach((result) => console.error('Erro ao carregar dados PDV:', result.reason));

    setAllProducts(products.map(mapProductForSale));
    if (clientsResult.status === 'fulfilled') setAllClients(clientsResult.value.map(mapClientForSale));
    if (categoriesResult.status === 'fulfilled') {
      setAllCategories(categoriesResult.value.map((cat) => ({
        id: cat.id,
        name: cat.nome,
        imagem: cat.imagem || null,
        count: products.filter((p) => p.categoria === cat.nome).length,
      })));
    }
    setPdvLoadError(productsResult.status === 'rejected'
      ? `Não foi possível carregar os produtos: ${productsResult.reason?.message || 'erro desconhecido'}`
      : '');
  }, []);

  const loadRecentDocuments = useCallback(async () => {
    try {
      const docs = await request('vendas.recentDocuments', { limit: RECENT_DOCUMENTS_LIMIT });
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

  // Avisos curtos (stock, documento emitido) que não interrompem o atendimento.
  useEffect(() => {
    if (!pdvNotice) return undefined;
    const timer = setTimeout(() => setPdvNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [pdvNotice]);

  // A pesquisa fica pronta para o leitor de código de barras.
  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
  }, []);
  useEffect(() => { focusSearch(); }, [focusSearch]);

  useEffect(() => {
    if (!heldSalesReady.current) return;
    request('heldSales.save', { sales: heldSales }).catch(() => {});
    window.dispatchEvent(new CustomEvent('held-sales-changed'));
  }, [heldSales]);

  // Número previsto = próximo número da série fiscal (o número definitivo é
  // reservado no backend ao finalizar). Após cada reserva, a série local avança.
  const [reservedSeries, setReservedSeries] = useState({});
  const previewDocNumber = useMemo(() => {
    const { key, prefix: defaultPrefix } = SALE_DOCUMENT_SERIES[docType] ?? SALE_DOCUMENT_SERIES[DOCUMENT_TYPES.INVOICE_RECEIPT];
    const year = String(new Date().getFullYear()).slice(-2);
    const stored = snapshot?.settings?.documents?.fiscal?.value?.series?.[key];
    const local = reservedSeries[key];
    const candidates = [stored, local].filter((series) => series && series.year === year);
    const nextNumber = Math.max(1, ...candidates.map((series) => Number(series.nextNumber) || 1));
    const prefix = local?.prefix || stored?.prefix || defaultPrefix;
    const padding = local?.padding || stored?.padding || 5;
    return `${prefix}${String(nextNumber).padStart(padding, '0')}/${year}`;
  }, [docType, snapshot, reservedSeries]);

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

  // Proformas não abatem stock; os restantes documentos não podem exceder o disponível.
  const enforceStock = docType !== DOCUMENT_TYPES.PROFORMA;

  function exceedsStock(product, nextQuantity) {
    const available = Number(product.stock) || 0;
    if (!enforceStock || nextQuantity <= available) return false;
    setPdvNotice({
      tone: 'warning',
      text: available > 0
        ? `Stock disponível de ${product.name}: ${available}.`
        : `${product.name} está sem stock.`,
    });
    return true;
  }

  function addProductToCart(product) {
    if (!operation.canOperate) return;
    const inCart = cart.find((item) => item.id === product.id)?.quantity || 0;
    if (exceedsStock(product, inCart + 1)) return;
    setCart((current) => addCartItem(current, product));
  }

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
      addProductToCart(scannedProduct);
      setProductQuery('');
      return;
    }

    setProductQuery(value);
  }

  // Enter na pesquisa adiciona o produto quando só há um resultado.
  function handleProductSearchKeyDown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (visibleProducts.length === 1) {
      addProductToCart(visibleProducts[0]);
      setProductQuery('');
    }
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
      // O número da nota de crédito é reservado no backend, na mesma transacção.
      const { cancelledDoc, creditNote } = await request('vendas.cancelDocument', {
        venda_id: document.vendaId,
        reason,
      });

      setRecentSaleDocuments((current) =>
        [creditNote, ...current.map((d) => (d.vendaId === cancelledDoc.vendaId ? { ...d, status: 'ANULADO', cancelledAt: cancelledDoc.cancelledAt, cancelledBy: cancelledDoc.cancelledBy, cancellationReason: cancelledDoc.cancellationReason } : d))].slice(0, RECENT_DOCUMENTS_LIMIT),
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
      searchInputRef.current?.blur();
      setShowCheckout(true);
      setReceived('');
      return;
    }

    setPendingPayment({
      mode,
      checkoutData: { ...summary, received: summary.total, change: 0, canFinalize: true },
    });
  }

  // Depois de emitir: mostrar, imprimir logo ou seguir (Configurações › Vendas).
  async function handleIssuedDocument(document) {
    const label = `${documentTypeLabels[document.type] || 'Documento'} ${document.number}`;
    if (afterSaleAction === 'continuar') {
      setPdvNotice({ tone: 'success', text: `${label} emitida.` });
      return;
    }
    if (afterSaleAction === 'imprimir') {
      try {
        await request('invoice.print', { viewModel: buildSaleViewModel(document, snapshot) });
        setPdvNotice({ tone: 'success', text: `${label} emitida e enviada para impressão.` });
      } catch (cause) {
        setPdvNotice({ tone: 'warning', text: `${label} emitida, mas a impressão falhou: ${cause?.message || 'erro desconhecido'}.` });
        setFinalizedDocument(document);
      }
      return;
    }
    setFinalizedDocument(document);
  }

  async function finalizeSale(paymentMethod = defaultPaymentMethod, checkoutData = checkout) {
    if (!operation.canOperate) return;
    if (!cart.length || !checkoutData.canFinalize) return;
    // Evita duplicar a venda com duplo clique ou Enter repetido.
    if (finalizingRef.current) return;
    if (!isPaymentMethodAllowedForDocument(docType, paymentMethod)) {
      setSaleError(docType === DOCUMENT_TYPES.CREDIT
        ? 'Documento do tipo Crédito deve usar pagamento Crédito.'
        : 'Crédito só é permitido quando o tipo de documento for Crédito.');
      return;
    }
    setSaleError('');

    const isProforma = docType === DOCUMENT_TYPES.PROFORMA;
    const ipcDocType = SALE_DOCUMENT_SERIES[docType]?.key ?? 'factura_recibo';

    finalizingRef.current = true;
    setIsFinalizing(true);
    try {
      const saleItems = cart.map((item) => ({
        produto_id: item.id,
        nome: item.name,
        quantidade: Number(item.quantity) || 1,
        preco_unitario: Number(item.price) || 0,
      }));

      // O número é reservado no backend na mesma transacção da venda: se a
      // venda falhar (ex.: stock), nenhum número da série é consumido.
      const document = await request('vendas.create', {
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

      const seriesPrefix = snapshot?.settings?.documents?.fiscal?.value?.series?.[ipcDocType]?.prefix
        || SALE_DOCUMENT_SERIES[docType]?.prefix;
      const nextSeries = seriesAfterReservedNumber(document.number, seriesPrefix);
      if (nextSeries) setReservedSeries((current) => ({ ...current, [ipcDocType]: nextSeries }));

      if (!isProforma) {
        setRecentSaleDocuments((current) => [document, ...current].slice(0, RECENT_DOCUMENTS_LIMIT));
        setCart([]);
        setReceived('');
        setDiscount(0);
        setSelectedClient(DEFAULT_SALE_CLIENT);
        setShowCheckout(false);
        setPendingPayment(null);
        loadPdvData(); // stock actualizado para a venda seguinte
      }
      await handleIssuedDocument(document);
    } catch (cause) {
      setSaleError(cause?.message || 'Nao foi possivel registar a venda.');
    } finally {
      finalizingRef.current = false;
      setIsFinalizing(false);
      focusSearch();
    }
  }

  function payWithDefaultMethod() {
    const method = isPaymentMethodAllowedForDocument(docType, defaultPaymentMethod)
      ? defaultPaymentMethod
      : paymentMethods.find((option) => isPaymentMethodAllowedForDocument(docType, option.id))?.id;
    if (method) choosePaymentMethod(method);
  }

  // Atalhos do PDV: F2 pesquisa, F4 cliente, F8 em espera, F9 pagar; Esc fecha diálogos.
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        if (pendingPayment) setPendingPayment(null);
        else if (showClientPopup) closeClientPicker();
        return;
      }
      const busy = showClientPopup || pendingPayment || finalizedDocument || cancelTarget || saleError
        || showCheckout || window.document.querySelector('.numpad-overlay');
      if (busy) return;
      const actions = { F2: focusSearch, F4: openClientPicker, F8: holdSale, F9: payWithDefaultMethod };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

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
        {pdvLoadError ? (
          <div className="operation-blocked-banner sales-operation-block" role="alert">
            {pdvLoadError}
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
              ref={searchInputRef}
              aria-label="Buscar produto"
              placeholder="Produto ou código de barras (F2)"
              value={productQuery}
              onChange={(event) => handleProductQueryChange(event.target.value)}
              onKeyDown={handleProductSearchKeyDown}
            />
            <Search size={18} />
          </div>
          {pdvNotice ? (
            <div className={`pdv-notice ${pdvNotice.tone}`} role="status">{pdvNotice.text}</div>
          ) : null}

          <div className="product-grid">
            {visibleProducts.map((product) => {
              const outOfStock = enforceStock && Number(product.stock) <= 0;
              return (
                <button
                  key={product.id}
                  className={outOfStock ? 'product-card out-of-stock' : 'product-card'}
                  type="button"
                  disabled={!operation.canOperate}
                  onClick={() => addProductToCart(product)}
                >
                  <span className={`product-stock${Number(product.stock) <= 0 ? ' empty' : ''}`}>
                    {Number(product.stock) > 0 ? `Stock ${product.stock}` : 'Sem stock'}
                  </span>
                  {product.imagem
                    ? <img src={product.imagem} alt={product.name} className="product-card-img" />
                    : <ProductIllustration tone={product.imageTone} />}
                  <strong>{product.name}</strong>
                  <span>{formatKwanza(product.price).replace('KZ ', '')}</span>
                </button>
              );
            })}
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
            <kbd>F8</kbd>
          </button>
          <button type="button" onClick={openClientPicker} className="soft-button">
            <UserRound size={18} />
            Cliente
            <kbd>F4</kbd>
          </button>
        </div>

      </div>

      <aside className="invoice-panel">
        {showCheckout ? (
          <CheckoutPanel
            checkout={checkout}
            received={received}
            setReceived={setReceived}
            onBack={() => { setShowCheckout(false); focusSearch(); }}
            onFinalize={() => finalizeSale('dinheiro', checkout)}
            canOperate={operation.canOperate}
            isFinalizing={isFinalizing}
          />
        ) : (
          <InvoiceDetails
            cart={cart}
            selectedClient={selectedClient}
            summary={summary}
            docType={docType}
            previewDocNumber={previewDocNumber}
            onDocTypeChange={handleDocTypeChange}
            onClearCart={() => setCart([])}
            onSetQuantity={(itemId, qty) => {
              const item = cart.find((i) => i.id === itemId);
              if (item && exceedsStock(item, Math.max(1, qty))) return;
              setCart((current) => current.map((i) => i.id === itemId ? { ...i, quantity: Math.max(1, qty) } : i));
            }}
            onRemoveItem={async (item) => {
              if (await confirmDelete(`o produto ${item.name} da factura`)) {
                setCart((current) => removeCartItem(current, item.id));
              }
            }}
            onChangeQuantity={(itemId, direction) => {
              const item = cart.find((i) => i.id === itemId);
              if (item && direction > 0 && exceedsStock(item, item.quantity + direction)) return;
              setCart((current) => changeCartQuantity(current, itemId, direction));
            }}
            onClient={openClientPicker}
            onPaymentMethod={choosePaymentMethod}
            paymentMethods={paymentMethods}
            defaultPaymentLabel={paymentMethods.find((method) => method.id === defaultPaymentMethod)?.label}
            canOperate={operation.canOperate}
            operationMessage={operation.message}
          />
        )}
      </aside>

      <HeldSalesTable rows={heldSales} onContinue={resumeSale} onCancel={cancelHeldSale} />

      <RecentSaleDocumentsTable
        rows={recentSaleDocuments}
        onOpenDocument={(document) => setFinalizedDocument(document)}
        onCancelDocument={canCancelDocuments ? (document) => setCancelTarget(document) : null}
      />

      {finalizedDocument ? (
        <FinalizedSalePreview
          document={finalizedDocument}
          snapshot={snapshot}
          onClose={() => { setFinalizedDocument(null); focusSearch(); }}
        />
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
                autoFocus
                disabled={isFinalizing}
                onClick={() => {
                  const { mode, checkoutData } = pendingPayment;
                  setPendingPayment(null);
                  finalizeSale(mode, checkoutData);
                }}
              >
                Finalizar <kbd>Enter</kbd>
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
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || !visibleClients.length) return;
                  event.preventDefault();
                  setSelectedClient(visibleClients[0]);
                  closeClientPicker();
                  focusSearch();
                }}
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
  const viewModel = buildSaleViewModel(document, snapshot);

  async function handlePrintA4() {
    if (printBusy) return;
    setPrintBusy(true);
    try { await request('invoice.print', { viewModel }); } finally { setPrintBusy(false); }
  }

  // Enter imprime, Esc fecha: o operador não precisa do rato entre clientes.
  React.useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'Enter' && !isTypingTarget(event.target)) {
        event.preventDefault();
        handlePrintA4();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
            <button type="button" className="icon-button" aria-label="Imprimir factura" title="Imprimir (Enter)" onClick={handlePrintA4} disabled={printBusy}>
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
  onClearCart,
  onSetQuantity,
  onRemoveItem,
  onChangeQuantity,
  onClient,
  onPaymentMethod,
  canOperate,
  operationMessage,
  paymentMethods,
  defaultPaymentLabel,
}) {
  const [numpadTarget, setNumpadTarget] = React.useState(null);
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
      <div className="invoice-details-header">
        <h2>Detalhes da {currentDocLabel}</h2>
        {cart.length > 0 && (
          <button
            type="button"
            className="icon-button danger"
            aria-label="Limpar carrinho"
            title="Limpar todos os itens"
            onClick={onClearCart}
          >
            <ListX size={18} />
          </button>
        )}
      </div>
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
              <button
                type="button"
                className="qty-badge"
                aria-label={`Editar quantidade: ${item.quantity}`}
                onClick={() => setNumpadTarget(item)}
              >
                {String(item.quantity).padStart(2, '0')}
              </button>
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
        {defaultPaymentLabel ? (
          <p className="payment-shortcut-hint"><kbd>F9</kbd> pagar com {defaultPaymentLabel}</p>
        ) : null}
      </div>
      {numpadTarget && (
        <NumpadDialog
          item={numpadTarget}
          onConfirm={(itemId, qty) => { onSetQuantity(itemId, qty); setNumpadTarget(null); }}
          onClose={() => setNumpadTarget(null)}
        />
      )}
    </>
  );
}

function NumpadDialog({ item, onConfirm, onClose }) {
  const [value, setValue] = React.useState('0');

  React.useEffect(() => {
    function onKey(e) {
      if (e.key >= '0' && e.key <= '9') press(e.key);
      else if (e.key === 'Backspace') backspace();
      else if (e.key === 'Enter') confirm();
      else if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function press(digit) {
    setValue((prev) => {
      const next = prev === '0' ? digit : prev + digit;
      return next.length > 5 ? prev : next;
    });
  }

  function backspace() {
    setValue((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  }

  function confirm() {
    const qty = Math.max(1, parseInt(value, 10) || 1);
    onConfirm(item.id, qty);
  }

  const display = String(parseInt(value, 10) || 0).padStart(3, '0');

  return (
    <div className="numpad-overlay" role="dialog" aria-modal="true" aria-label="Editar quantidade" onClick={onClose}>
      <div className="numpad-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="numpad-header">
          <strong title={item.name}>{item.name}</strong>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><XCircle size={20} /></button>
        </div>
        <div className="numpad-display-row">
          <div className="numpad-display">{display}</div>
          <button type="button" className="numpad-back" onClick={backspace} aria-label="Apagar">⌫</button>
        </div>
        <div className="numpad-grid">
          {[7, 8, 9, 4, 5, 6, 1, 2, 3].map((n) => (
            <button key={n} type="button" className="numpad-key" onClick={() => press(String(n))}>{n}</button>
          ))}
          <button type="button" className="numpad-key" onClick={() => press('00')}>00</button>
          <button type="button" className="numpad-key" onClick={() => press('0')}>0</button>
          <button type="button" className="numpad-key numpad-confirm" onClick={confirm}>OK</button>
        </div>
      </div>
    </div>
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
            const cancellable = Boolean(onCancelDocument) && canCancelDocument(document);
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
  isFinalizing = false,
}) {
  const quickAmounts = suggestCashAmounts(checkout.total);
  const canFinalize = canOperate && checkout.canFinalize && !isFinalizing;

  function pressKey(key) {
    setReceived((current) => appendReceivedDigit(current, key));
  }

  // Teclado físico: dígitos, Backspace, Delete (limpar), Enter (finalizar), Esc (voltar).
  React.useEffect(() => {
    function onKey(event) {
      if (isTypingTarget(event.target)) return;
      if (/^[0-9]$/.test(event.key)) pressKey(event.key);
      else if (event.key === 'Backspace') pressKey('backspace');
      else if (event.key === 'Delete') pressKey('clear');
      else if (event.key === 'Escape') onBack();
      else if (event.key === 'Enter') {
        event.preventDefault();
        if (canFinalize) onFinalize();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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

      <div className="cash-quick-amounts" aria-label="Valores rápidos">
        <button type="button" onClick={() => setReceived(String(checkout.total))}>Exacto</button>
        {quickAmounts.map((amount) => (
          <button type="button" key={amount} onClick={() => setReceived(String(amount))}>
            {formatKwanza(amount).replace('KZ ', '')}
          </button>
        ))}
      </div>

      <div className="cash-keypad" aria-label="Teclado numerico para valor recebido">
        {cashKeypad.map((key) => (
          <button type="button" key={key} onClick={() => pressKey(key)}>
            {key === 'clear' ? 'Limpar' : key === 'backspace' ? 'Apagar' : key}
          </button>
        ))}
      </div>

      <button type="button" className="checkout-finalize" disabled={!canFinalize} onClick={onFinalize}>
        <Banknote size={22} />
        <span>{isFinalizing ? 'A registar...' : 'Finalizar'}</span>
        <CheckCircle2 size={22} />
      </button>
      <p className="checkout-shortcut-hint"><kbd>Enter</kbd> finalizar · <kbd>Esc</kbd> voltar</p>
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

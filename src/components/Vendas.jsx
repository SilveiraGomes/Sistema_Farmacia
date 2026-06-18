import React, { useMemo, useState } from 'react';
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
  Search,
  Smartphone,
  Trash2,
  UserRound,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  calculateCartSummary,
  categories,
  clients,
  formatKwanza,
  invoices,
  products,
} from '../data/pharmacyData.mjs';
import {
  addCartItem,
  appendReceivedDigit,
  buildFinalizedSaleDocument,
  buildRecentSaleDocuments,
  calculateCheckout,
  cancelHeldSale as cancelHeldSaleByNumber,
  changeCartQuantity,
  createHeldSale,
  DEFAULT_SALE_CLIENT,
  filterClientsForPicker,
  filterProductsForSale,
  removeCartItem,
  resumeHeldSale,
} from '../data/salesWorkflow.mjs';
import { getStoredBranding } from '../data/branding.mjs';
import {
  documentStatusLabels,
  documentTypeLabels,
  documents as storedDocuments,
} from '../data/documents.mjs';
import { buildInvoiceA4ViewModel } from '../data/invoiceA4.mjs';
import { getStoredInvoiceA4Settings } from '../data/invoiceSettings.mjs';
import { confirmDelete } from '../utils/confirmations.mjs';
import InvoiceA4 from './InvoiceA4';

const paymentMethods = [
  { id: 'Dinheiro', label: 'Dinheiro', icon: Banknote },
  { id: 'TPA', label: 'TPA', icon: CreditCard },
  { id: 'Transferencia', label: 'Transferencia', icon: Building2 },
  { id: 'Credito', label: 'Credito', icon: Smartphone },
];

const cashKeypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'backspace'];

const initialCart = [
  { ...products[0], quantity: 2 },
  { ...products[1], quantity: 1 },
  { ...products[10], quantity: 1 },
];

const initialHeldSales = invoices
  .filter((invoice) => invoice.status === 'EM ESPERA')
  .map((invoice, index) => ({
    ...invoice,
    cartItems: index === 0
      ? [
          { ...products[3], quantity: 1 },
          { ...products[6], quantity: 2 },
          { ...products[8], quantity: 2 },
        ]
      : [],
  }));

function Vendas() {
  const [activeCategory, setActiveCategory] = useState(null);
  const [categoryOffset, setCategoryOffset] = useState(0);
  const [cart, setCart] = useState(initialCart);
  const [heldSales, setHeldSales] = useState(initialHeldSales);
  const [selectedClient, setSelectedClient] = useState(DEFAULT_SALE_CLIENT);
  const [showClientPopup, setShowClientPopup] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [discount, setDiscount] = useState(580.2);
  const [received, setReceived] = useState('');
  const [finalizedDocument, setFinalizedDocument] = useState(null);
  const [recentSaleDocuments, setRecentSaleDocuments] = useState(() => buildRecentSaleDocuments(storedDocuments));

  const visibleProducts = useMemo(
    () => filterProductsForSale(products, activeCategory, productQuery),
    [activeCategory, productQuery],
  );
  const visibleCategories = useMemo(
    () => Array.from({ length: Math.min(4, categories.length) }, (_, index) =>
      categories[(categoryOffset + index) % categories.length]),
    [categoryOffset],
  );
  const visibleClients = useMemo(
    () => filterClientsForPicker(clients, clientQuery),
    [clientQuery],
  );
  const summary = calculateCartSummary(cart, discount, 0);
  const checkout = calculateCheckout({
    cart,
    discount,
    received,
    taxRate: 0,
  });

  function holdSale() {
    if (!cart.length) return;

    const invoiceNumber = `FAT${String(heldSales.length + 27).padStart(3, '0')}/26`;
    setHeldSales((current) =>
      createHeldSale({
        cart,
        currentHeldSales: current,
        clientName: selectedClient?.name ?? 'Cliente Balcão',
        invoiceNumber,
      }),
    );
    setCart([]);
    setShowCheckout(false);
  }

  function resumeSale(invoice) {
    if (invoice.status !== 'EM ESPERA') return;

    const resumed = resumeHeldSale(heldSales, invoice.number);
    if (!resumed.invoice) return;

    setHeldSales(resumed.heldSales);
    setCart(resumed.cart);
    setSelectedClient(clients.find((client) => client.name === invoice.client) ?? DEFAULT_SALE_CLIENT);
    setShowCheckout(false);
  }

  async function cancelHeldSale(invoiceNumber) {
    if (!(await confirmDelete(`a compra em espera ${invoiceNumber}`))) {
      return;
    }

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

  function getNextInvoiceNumber() {
    return `FAT${String(heldSales.length + 27).padStart(3, '0')}/26`;
  }

  function closeSale() {
    if (!cart.length) return;

    setCart([]);
    setReceived('');
    setDiscount(0);
    setShowCheckout(false);
  }

  function choosePaymentMethod(mode) {
    if (!cart.length) return;

    if (mode === 'Dinheiro') {
      setShowCheckout(true);
      setReceived('');
      return;
    }

    finalizeSale(mode, {
      ...summary,
      received: summary.total,
      change: 0,
      canFinalize: true,
    });
  }

  function finalizeSale(paymentMethod = 'Dinheiro', checkoutData = checkout) {
    if (!cart.length || !checkoutData.canFinalize) return;

    const document = buildFinalizedSaleDocument({
      cart,
      client: selectedClient,
      checkout: checkoutData,
      invoiceNumber: getNextInvoiceNumber(),
      paymentMethod,
      issueDate: new Date().toISOString().slice(0, 10),
      userName: 'Vendedor',
    });

    setFinalizedDocument(document);
    setRecentSaleDocuments((current) => buildRecentSaleDocuments([document, ...current]));
    setCart([]);
    setReceived('');
    setDiscount(0);
    setShowCheckout(false);
  }

  function rotateCategories(direction) {
    setCategoryOffset((current) => (current + direction + categories.length) % categories.length);
  }

  return (
    <section className="sales-screen">
      <div className="sales-main">
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
              <ProductIllustration tone={category.id % 2 ? 'orange' : 'blue'} />
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
              onChange={(event) => setProductQuery(event.target.value)}
            />
            <Search size={18} />
          </div>

          <div className="product-grid">
            {visibleProducts.map((product) => (
              <button
                key={product.id}
                className="product-card"
                type="button"
                onClick={() => setCart((current) => addCartItem(current, product))}
              >
                <ProductIllustration tone={product.imageTone} />
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
          <button type="button" onClick={holdSale} className="soft-button">
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
            onFinalize={() => finalizeSale('Dinheiro', checkout)}
          />
        ) : (
          <InvoiceDetails
            cart={cart}
            selectedClient={selectedClient}
            summary={summary}
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
          />
        )}
      </aside>

      <HeldSalesTable rows={heldSales} onContinue={resumeSale} onCancel={cancelHeldSale} />

      <RecentSaleDocumentsTable rows={recentSaleDocuments} onOpenDocument={(document) => setFinalizedDocument(document)} />

      {finalizedDocument ? (
        <FinalizedSalePreview document={finalizedDocument} onClose={() => setFinalizedDocument(null)} />
      ) : null}

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

function FinalizedSalePreview({ document, onClose }) {
  const viewModel = buildInvoiceA4ViewModel({
    document,
    branding: getStoredBranding(),
    settings: getStoredInvoiceA4Settings(),
    printedBy: document.userName || 'Vendedor',
  });

  function handlePrintA4() {
    window.setTimeout(() => window.print(), 0);
  }

  function handleSavePdf() {
    window.setTimeout(() => window.print(), 0);
  }

  return (
    <div className="modal-backdrop documents-print-scope invoice-a4-print-scope" role="dialog" aria-modal="true">
      <div className="modal-card wide document-detail-modal">
        <div className="modal-title-row">
          <h2>{document.number}</h2>
          <div className="invoice-a4-actions">
            <button type="button" className="icon-button" aria-label="Salvar PDF" title="Salvar PDF" onClick={handleSavePdf}>
              <FileDown size={20} />
            </button>
            <button type="button" className="icon-button" aria-label="Imprimir factura" title="Imprimir" onClick={handlePrintA4}>
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

function InvoiceDetails({
  cart,
  selectedClient,
  summary,
  onRemoveItem,
  onChangeQuantity,
  onClient,
  onPaymentMethod,
}) {
  return (
    <>
      <h2>Detalhes da Factura</h2>
      <button className="client-search" type="button" onClick={onClient}>
        <span>
          <strong>{selectedClient?.name ?? DEFAULT_SALE_CLIENT.name}</strong>
          <small>NIF: {selectedClient?.nif ?? DEFAULT_SALE_CLIENT.nif}</small>
        </span>
        <Search size={22} />
      </button>
      <h3>Factura n.º FAT027/26</h3>

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
              disabled={!cart.length}
              aria-label={`Pagar com ${method.label}`}
              data-tooltip={method.label}
              title={method.label}
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

function RecentSaleDocumentsTable({ rows, onOpenDocument }) {
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
          {rows.map((document) => (
            <tr key={document.id || document.number}>
              <td>{document.number}</td>
              <td>{documentTypeLabels[document.type] || document.type}</td>
              <td>{document.clientName || 'Consumidor final'}</td>
              <td>{document.issueDate}</td>
              <td>{formatKwanza(document.total).replace('KZ ', '')}</td>
              <td><span className="status paid">{documentStatusLabels[document.status] || document.status}</span></td>
              <td className="held-actions">
                <button
                  type="button"
                  className="held-icon-action continue"
                  aria-label={`Verificar ou reimprimir ${document.number}`}
                  title="Verificar ou reimprimir"
                  onClick={() => onOpenDocument(document)}
                >
                  <Printer size={18} />
                </button>
              </td>
            </tr>
          ))}
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

      <button type="button" className="checkout-finalize" disabled={!checkout.canFinalize} onClick={onFinalize}>
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

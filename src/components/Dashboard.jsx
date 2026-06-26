import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarClock,
  MoreHorizontal,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import {
  buildDashboardPeriodChart,
  buildDashboardTopSellers,
  formatKwanza,
} from "../data/pharmacyData.mjs";
import { useOperation } from "../operation/OperationContext";
import { useSetting } from "../configuration/SettingsContext";
import { useDashboardData } from "../hooks/useDashboardData";

function buildRealNotifications(stockAlerts) {
  const notes = [];
  function plural(n, singular, multi) { return n === 1 ? singular : multi; }

  if (stockAlerts.expired?.length) {
    const n = stockAlerts.expired.length;
    notes.push({
      id: 'expired', severity: 'danger',
      title: 'Produtos vencidos em estoque',
      message: `${n} ${plural(n, 'produto vencido', 'produtos vencidos')} ainda em stock.`,
      detail: stockAlerts.expired.slice(0, 3).join(', '),
    });
  }
  if (stockAlerts.expiring?.length) {
    const n = stockAlerts.expiring.length;
    notes.push({
      id: 'expiring', severity: 'warning',
      title: 'Produtos a vencer em breve',
      message: `${n} ${plural(n, 'produto vence', 'produtos vencem')} dentro de 30 dias.`,
      detail: stockAlerts.expiring.slice(0, 3).join(', '),
    });
  }
  if (stockAlerts.outOfStock?.length) {
    const n = stockAlerts.outOfStock.length;
    notes.push({
      id: 'out-of-stock', severity: 'warning',
      title: 'Produtos sem estoque',
      message: `${n} ${plural(n, 'produto precisa', 'produtos precisam')} de reposicao imediata.`,
      detail: stockAlerts.outOfStock.slice(0, 3).join(', '),
    });
  }
  if (stockAlerts.lowStock?.length) {
    const n = stockAlerts.lowStock.length;
    notes.push({
      id: 'low-stock', severity: 'info',
      title: 'Estoque baixo',
      message: `${n} ${plural(n, 'produto está', 'produtos estao')} abaixo do nivel recomendado.`,
      detail: stockAlerts.lowStock.slice(0, 3).join(', '),
    });
  }
  return notes;
}

const periodOptions = [
  { id: "week", label: "Semanal" },
  { id: "month", label: "Mensal" },
  { id: "semester", label: "Semestral" },
  { id: "year", label: "Anual" },
];

const RECENT_SALES_LIMIT = 6;

function Dashboard() {
  const operation = useOperation();
  const lowStockThreshold = useSetting("stock.lowStockThreshold", 25);
  const dashboardAlertsEnabled = useSetting("alerts.dashboardEnabled", true);
  const [selectedPeriod, setSelectedPeriod] = useState("month");
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const { data: liveData, lastUpdated, refresh: refreshDashboard } = useDashboardData({
    shiftOpenAt: operation.shift?.aberto_em || null,
    lowStockThreshold,
  });

  const metrics = useMemo(() => ({
    totalSold: liveData?.day?.totalVendas ?? 0,
    totalTransactions: liveData?.day?.totalTransacoes ?? 0,
    shiftSales: liveData?.shift?.totalVendas ?? 0,
    shiftTransactions: liveData?.shift?.totalTransacoes ?? 0,
    lowStockCount: liveData?.stock?.lowStock ?? 0,
    outOfStockRows: liveData?.stock?.outOfStock ?? 0,
    lowStockLabel: 'Produtos',
    pendingInvoices: liveData?.pendingInvoicesCount ?? 0,
    heldSalesCount: liveData?.heldSalesCount ?? 0,
  }), [liveData]);

  const tableRows = useMemo(() => {
    if (liveData?.recentSales?.length) {
      return liveData.recentSales.slice(0, RECENT_SALES_LIMIT).map((sale) => ({
        number: sale.number,
        items: sale.items,
        value: sale.total,
        status: sale.status === 'Concluida' ? 'PAGO' : sale.status.toUpperCase(),
        client: sale.cliente,
      }));
    }
    return [];
  }, [liveData]);

  const chart = useMemo(
    () => buildDashboardPeriodChart(
      {
        sales: liveData?.chartData?.sales || [],
        expenses: liveData?.chartData?.expenses || [],
      },
      { period: selectedPeriod, referenceDate: new Date().toISOString().slice(0, 10) },
    ),
    [selectedPeriod, liveData],
  );

  const topSellers = useMemo(
    () => liveData?.topSellers?.length
      ? liveData.topSellers
      : buildDashboardTopSellers([], 6),
    [liveData],
  );

  const notifications = useMemo(
    () => liveData?.stockAlerts ? buildRealNotifications(liveData.stockAlerts) : [],
    [liveData],
  );

  const financial = useMemo(() => ({
    totals: {
      pendingExpenses: liveData?.financialSummary?.pendingExpenses ?? 0,
      netProfit: liveData?.financialSummary?.netProfit ?? 0,
      netMargin: liveData?.financialSummary?.netMargin ?? '0.0',
    },
  }), [liveData]);
  const expensePath = buildSmoothExpensePath(chart.points);
  const activePoint = hoveredPoint;
  const activePointIndex = activePoint
    ? Math.max(0, chart.points.indexOf(activePoint))
    : 0;

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <section className="dashboard-analytics">
      <div className="dashboard-main-column">
        <div className="dashboard-metrics-header">
          {lastUpdatedLabel ? (
            <span className="dashboard-live-badge">
              <span className="live-dot" />
              Actualizado {lastUpdatedLabel}
            </span>
          ) : null}
          <button
            type="button"
            className="icon-button dashboard-refresh-btn"
            aria-label="Actualizar dados"
            title="Actualizar dados"
            onClick={refreshDashboard}
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="dashboard-metrics-strip">
          <MetricCard
            tone="primary"
            icon={<WalletCards size={34} />}
            title="Total vendido"
            value={formatKwanza(metrics.totalSold)}
            detail={`${metrics.totalTransactions} transacoes`}
          />
          <MetricCard
            icon={<BarChart3 size={34} />}
            title="Vendas do turno"
            value={formatKwanza(metrics.shiftSales)}
            detail={`${metrics.shiftTransactions.toString().padStart(2, "0")} transacoes`}
          />
          <MetricCard
            icon={<AlertTriangle size={34} />}
            title="Estoque baixo"
            value={metrics.lowStockCount}
            detail={metrics.lowStockLabel}
          />
          <MetricCard
            icon={<AlertTriangle size={34} />}
            title="Sem estoque"
            value={metrics.outOfStockRows}
            detail="produtos"
          />
          <MetricCard
            icon={<WalletCards size={34} />}
            title="Despesas pendentes"
            value={formatKwanza(financial.totals.pendingExpenses)}
            detail="a regularizar"
          />
          <MetricCard
            icon={<WalletCards size={34} />}
            title="Lucro liquido"
            value={formatKwanza(financial.totals.netProfit)}
            detail={`${financial.totals.netMargin}% de margem`}
          />
          <MetricCard
            icon={<BarChart3 size={34} />}
            title="Clientes em Espera"
            value={metrics.heldSalesCount}
            detail={metrics.pendingInvoices ? `${metrics.pendingInvoices} proforma(s) pendente(s)` : "vendas suspensas"}
          />
          <MetricCard
            icon={<CalendarClock size={34} />}
            title="Estado operacional"
            value={operation.canOperate ? "Aberto" : "Bloqueado"}
            detail={
              operation.shift?.nome || operation.message || "Sem turno aberto"
            }
          />
        </div>

        {!operation.canOperate ? (
          <div className="operation-blocked-banner dashboard-operation-alert">
            {operation.message ||
              "Abra o dia e o turno antes de executar operacoes."}
          </div>
        ) : null}

        <div className="dashboard-chart-panel panel">
          <div className="dashboard-panel-header">
            <div>
              <span className="dashboard-eyebrow">Analise de vendas</span>
              <h2>Receita com linha de despesas</h2>
            </div>
            <div
              className="dashboard-period-tabs"
              aria-label="Periodo do grafico"
            >
              {periodOptions.map((period) => (
                <button
                  key={period.id}
                  type="button"
                  className={selectedPeriod === period.id ? "active" : ""}
                  onClick={() => setSelectedPeriod(period.id)}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>

          <div
            className="dashboard-chart-summary"
            aria-label="Resumo do periodo"
          >
            <span>
              <small>Vendas</small>
              <em>{formatKwanza(chart.totals.sales)}</em>
            </span>
            <span>
              <small>Despesas</small>
              <em>{formatKwanza(chart.totals.expenses)}</em>
            </span>
            <span>
              <small>Periodo</small>
              <em>{chart.label}</em>
            </span>
          </div>

          <div
            className="dashboard-combo-chart"
            aria-label="Grafico comparativo de vendas e despesas"
          >
            <svg
              className="expense-overlay"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d={expensePath} />
            </svg>
            {activePoint ? (
              <div
                className="chart-tooltip"
                style={{
                  left: `${resolvePointX(activePointIndex, chart.points.length)}%`,
                  transform: activePointIndex === 0
                    ? 'translateX(0%)'
                    : activePointIndex === chart.points.length - 1
                      ? 'translateX(-100%)'
                      : 'translateX(-50%)',
                }}
              >
                <span>{activePoint.label}</span>
                <small>Vendas: {formatKwanza(activePoint.sales)}</small>
                <small>Despesas: {formatKwanza(activePoint.expenses)}</small>
              </div>
            ) : null}
            <div
              className="combo-bars"
              style={{
                gridTemplateColumns: `repeat(${chart.points.length}, minmax(34px, 1fr))`,
              }}
            >
              {chart.points.map((point, index) => (
                <div
                  className="combo-column"
                  key={point.label}
                  onBlur={() => setHoveredPoint(null)}
                  onFocus={() => setHoveredPoint(point)}
                  onMouseEnter={() => setHoveredPoint(point)}
                  onMouseLeave={() => setHoveredPoint(null)}
                  tabIndex={0}
                >
                  <span
                    className="combo-bar"
                    title={`${point.label}: vendas ${formatKwanza(point.sales)}, despesas ${formatKwanza(point.expenses)}`}
                    style={{
                      height: point.sales
                        ? `${Math.max(point.salesPercent, 4)}%`
                        : "0%",
                    }}
                  />
                  <small>{point.label}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="dashboard-chart-legend">
            <span>
              <i className="legend-sales" />
              Vendas
            </span>
            <span>
              <i className="legend-expenses" />
              Despesas
            </span>
          </div>
        </div>

        <InvoiceTable
          rows={tableRows}
          className="dashboard-table dashboard-recent-sales-panel"
          showClient
          title="Últimos movimentos de vendas"
        />
      </div>

      <aside className="dashboard-side-column">
        <section className="dashboard-side-panel panel">
          <div className="dashboard-panel-header compact">
            <div>
              <span className="dashboard-eyebrow">Ranking</span>
              <h2>Produtos mais vendidos</h2>
            </div>
          </div>
          <div className="horizontal-seller-chart">
            {topSellers.map((item, index) => (
              <div className="seller-row" key={item.product}>
                <span className="seller-rank">{index + 1}</span>
                <div className="seller-content">
                  <span className="seller-title">{item.product}</span>
                  <div className="seller-bar-track">
                    <span style={{ width: `${item.percent}%` }} />
                  </div>
                </div>
                <span className="seller-quantity">{item.quantity}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-side-panel panel">
          <div className="dashboard-panel-header compact">
            <div>
              <span className="dashboard-eyebrow">Alertas</span>
              <h2>Operacao do dia</h2>
            </div>
          </div>
          <div className="dashboard-alert-list">
            {(dashboardAlertsEnabled ? notifications : []).map(
              (notification) => (
                <article
                  className={`dashboard-alert ${notification.severity}`}
                  key={notification.id}
                >
                  <span>{notification.title}</span>
                  <p>{notification.message}</p>
                  {notification.detail ? (
                    <small>{notification.detail}</small>
                  ) : null}
                </article>
              ),
            )}
          </div>
        </section>
      </aside>
    </section>
  );
}

function MetricCard({ icon, title, value, detail, tone = "" }) {
  const metricValue = formatMetricValue(value);

  return (
    <article className={`dashboard-metric-card ${tone}`}>
      <span className="dashboard-metric-icon">{icon}</span>
      <div>
        <h2>{title}</h2>
        <span
          className={
            metricValue.prefix
              ? "dashboard-metric-value stacked"
              : "dashboard-metric-value"
          }
        >
          {metricValue.prefix ? (
            <small className="metric-prefix">{metricValue.prefix}</small>
          ) : null}
          <span className="metric-amount">{metricValue.amount}</span>
        </span>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function formatMetricValue(value) {
  const text = String(value);
  const match = text.match(/^(KZ)\s+(.+)$/);

  if (!match) {
    return {
      prefix: "",
      amount: text,
    };
  }

  return {
    prefix: match[1],
    amount: match[2],
  };
}

function buildSmoothExpensePath(points) {
  if (points.length === 1) {
    return `M 50 ${resolveExpensePointY(points[0])}`;
  }

  const coordinates = points.map((point, index) => ({
    x: resolvePointX(index, points.length),
    y: resolveExpensePointY(point),
  }));

  return coordinates.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }

    const previous = coordinates[index - 1];
    const controlX = (previous.x + point.x) / 2;

    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

function resolveExpensePointY(point) {
  return Math.min(96, Math.max(4, 100 - point.expensesPercent));
}

function resolvePointX(index, total) {
  if (total <= 1) return 50;
  return Math.round((index / (total - 1)) * 100);
}

export function InvoiceTable({
  rows,
  className = "",
  showClient = false,
  title = "",
  onRowClick,
}) {
  const [tableRows, setTableRows] = useState(rows);
  const [openMenuFor, setOpenMenuFor] = useState("");

  useEffect(() => {
    setTableRows(rows);
  }, [rows]);
  const [detailInvoice, setDetailInvoice] = useState(null);

  function handleMarkPaid(invoiceNumber) {
    setTableRows((currentRows) =>
      currentRows.map((invoice) =>
        invoice.number === invoiceNumber
          ? { ...invoice, status: "PAGO" }
          : invoice,
      ),
    );
    setOpenMenuFor("");
  }

  async function handleCopyNumber(invoiceNumber) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(invoiceNumber);
    }

    setOpenMenuFor("");
  }

  return (
    <div className={`table-panel ${className}`}>
      {title ? (
        <div className="table-panel-header">
          <h2>{title}</h2>
        </div>
      ) : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>N. Factura</th>
              <th>Itens da Factura</th>
              <th>Valor</th>
              <th>Status</th>
              {showClient && <th>Cliente</th>}
              <th>Opcoes</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((invoice) => (
              <tr
                key={invoice.number}
                className={onRowClick ? "clickable-row" : undefined}
                onClick={onRowClick ? () => onRowClick(invoice) : undefined}
              >
                <td>{invoice.number}</td>
                <td>{invoice.items}</td>
                <td>{formatKwanza(invoice.value).replace("KZ ", "")}</td>
                <td>
                  <span
                    className={
                      invoice.status === "PAGO" ? "status paid" : "status waiting"
                    }
                  >
                    {invoice.status}
                  </span>
                </td>
                {showClient && <td>{invoice.client}</td>}
                <td className="options-cell">
                  <div className="table-options-wrapper">
                    <button
                      type="button"
                      className="icon-button"
                      aria-expanded={openMenuFor === invoice.number}
                      aria-haspopup="menu"
                      aria-label={`Opcoes da factura ${invoice.number}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenMenuFor((current) =>
                          current === invoice.number ? "" : invoice.number,
                        );
                      }}
                    >
                      <MoreHorizontal size={20} />
                    </button>
                    {openMenuFor === invoice.number ? (
                      <div className="table-options-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDetailInvoice(invoice);
                            setOpenMenuFor("");
                          }}
                        >
                          Ver detalhes
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={invoice.status === "PAGO"}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleMarkPaid(invoice.number);
                          }}
                        >
                          Marcar como pago
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCopyNumber(invoice.number);
                          }}
                        >
                          Copiar numero
                        </button>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!tableRows.length && (
        <div className="empty-state">
          <Boxes size={30} />
          <span>Sem registos para mostrar</span>
        </div>
      )}
      {detailInvoice ? (
        <div
          className="dashboard-invoice-popover"
          role="dialog"
          aria-modal="true"
          aria-label="Detalhes da factura"
        >
          <section>
            <div className="dashboard-invoice-popover-header">
              <span>{detailInvoice.number}</span>
              <button type="button" onClick={() => setDetailInvoice(null)}>
                Fechar
              </button>
            </div>
            <dl>
              <div>
                <dt>Cliente</dt>
                <dd>{detailInvoice.client}</dd>
              </div>
              <div>
                <dt>Itens</dt>
                <dd>{detailInvoice.items}</dd>
              </div>
              <div>
                <dt>Valor</dt>
                <dd>{formatKwanza(detailInvoice.value)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{detailInvoice.status}</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default Dashboard;

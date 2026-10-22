import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarClock,
  Copy,
  Eye,
  Info,
  PackageX,
  PiggyBank,
  ReceiptText,
  RefreshCw,
  UsersRound,
  WalletCards,
} from "lucide-react";
import {
  buildDashboardPeriodChart,
  buildDashboardTopSellers,
  formatKwanza,
} from "../data/pharmacyData.mjs";
import { useAuth } from "../auth/AuthContext";
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
const CHART_TICKS = [1, 0.75, 0.5, 0.25, 0];
const ALERT_ICONS = { danger: AlertTriangle, warning: PackageX, info: Info };
const compactNumber = new Intl.NumberFormat("pt-AO", { notation: "compact", maximumFractionDigits: 1 });

function Dashboard({ onNavigate }) {
  const operation = useOperation();
  const { user, hasPermission } = useAuth();
  const lowStockThreshold = useSetting("stock.lowStockThreshold", 25);
  const dashboardAlertsEnabled = useSetting("alerts.dashboardEnabled", true);
  const [selectedPeriod, setSelectedPeriod] = useState("month");
  const [hoveredPoint, setHoveredPoint] = useState(null);
  // O backend só envia lucro e despesas a quem tem acesso ao Financeiro.
  const showFinancial = hasPermission("financeiro.ver");
  const canOpenDocuments = typeof onNavigate === "function" && hasPermission("documentos.ver");

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
  // Mesma escala usada pelo gráfico (maior valor de vendas ou despesas).
  const chartMax = Math.max(1, ...chart.points.flatMap((point) => [point.sales, point.expenses]));
  const chartHasData = chart.points.some((point) => point.sales || point.expenses);

  const salesTrend = useMemo(
    () => resolveDailyTrend(liveData?.chartData?.sales || []),
    [liveData],
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
  const firstName = String(user?.nome_completo || user?.nome_usuario || "").trim().split(/\s+/)[0];
  const todayLabel = new Date().toLocaleDateString("pt-AO", { weekday: "long", day: "numeric", month: "long" });
  const visibleNotifications = dashboardAlertsEnabled ? notifications : [];

  return (
    <section className="dashboard-analytics">
      <header className="dashboard-hero">
        <div className="dashboard-hero-text">
          <span className="dashboard-eyebrow">{todayLabel}</span>
          <h1>{firstName ? `Olá, ${firstName}` : "Painel"}</h1>
        </div>
        <div className="dashboard-hero-actions">
          <span
            className={`dashboard-status-chip ${operation.canOperate ? "open" : "blocked"}`}
            title="Estado operacional"
          >
            <CalendarClock size={15} />
            <strong>{operation.canOperate ? "Aberto" : "Bloqueado"}</strong>
            <span>{operation.shift?.nome || operation.message || "Sem turno aberto"}</span>
          </span>
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
      </header>

      {!operation.canOperate ? (
        <div className="operation-blocked-banner dashboard-operation-alert">
          {operation.message ||
            "Abra o dia e o turno antes de executar operacoes."}
        </div>
      ) : null}

      <div className={`dashboard-stat-grid ${showFinancial ? "with-financial" : ""}`}>
        <StatCard
          tone="primary"
          icon={<WalletCards size={22} />}
          title="Total vendido hoje"
          value={formatKwanza(metrics.totalSold)}
          detail={`${metrics.totalTransactions} transacoes`}
          trend={salesTrend}
        />
        <StatCard
          icon={<BarChart3 size={22} />}
          title="Vendas do turno"
          value={formatKwanza(metrics.shiftSales)}
          detail={`${metrics.shiftTransactions.toString().padStart(2, "0")} transacoes`}
          badge={operation.shift?.nome || null}
        />
        <StatCard
          icon={<UsersRound size={22} />}
          title="Clientes em Espera"
          value={metrics.heldSalesCount}
          detail={metrics.pendingInvoices ? `${metrics.pendingInvoices} proforma(s) pendente(s)` : "vendas suspensas"}
        />
        <StatCard
          icon={<AlertTriangle size={22} />}
          title="Estoque baixo"
          value={metrics.lowStockCount}
          detail="produtos abaixo do mínimo"
          badge={metrics.outOfStockRows ? { label: `${metrics.outOfStockRows} sem estoque`, tone: "down" } : null}
        />
        {showFinancial ? (
          <>
            <StatCard
              icon={<PiggyBank size={22} />}
              title="Lucro liquido do mês"
              value={formatKwanza(financial.totals.netProfit)}
              detail={`${financial.totals.netMargin}% de margem`}
            />
            <StatCard
              icon={<ReceiptText size={22} />}
              title="Despesas pendentes"
              value={formatKwanza(financial.totals.pendingExpenses)}
              detail="a regularizar"
            />
          </>
        ) : null}
      </div>

      <div className="dashboard-body">
        <div className="dashboard-main-column">
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
              aria-label="Resumo do período"
            >
              <span>
                <small><i className="legend-sales" />Vendas</small>
                <em>{formatKwanza(chart.totals.sales)}</em>
              </span>
              <span>
                <small><i className="legend-expenses" />Despesas</small>
                <em>{formatKwanza(chart.totals.expenses)}</em>
              </span>
              <span>
                <small>Periodo</small>
                <em>{chart.label}</em>
              </span>
            </div>

            <div className="dashboard-chart-frame">
              <div className="dashboard-chart-axis" aria-hidden="true">
                {CHART_TICKS.map((tick) => (
                  <span key={tick}>{compactNumber.format(Math.round(chartMax * tick))}</span>
                ))}
              </div>
              <div
                className="dashboard-combo-chart"
                aria-label="Grafico comparativo de vendas e despesas"
                style={{ "--chart-columns": chart.points.length }}
              >
                <svg
                  className="expense-overlay"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d={expensePath} />
                </svg>
                {!chartHasData ? (
                  <div className="dashboard-chart-empty">
                    <BarChart3 size={22} />
                    <span>Sem vendas registadas neste período</span>
                  </div>
                ) : null}
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
                  {chart.points.map((point) => (
                    <div
                      className={`combo-column${activePoint === point ? " active" : ""}`}
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
            </div>
          </div>

          <InvoiceTable
            rows={tableRows}
            className="dashboard-table dashboard-recent-sales-panel"
            showClient
            title="Últimos movimentos de vendas"
            onViewAll={canOpenDocuments ? () => onNavigate("documentos") : undefined}
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
            {topSellers.length ? (
              <div className="vertical-seller-chart" role="list">
                {topSellers.map((item, index) => (
                  <div
                    className="seller-column"
                    key={item.product}
                    role="listitem"
                    title={`${item.product}: ${item.quantity} vendido(s)`}
                  >
                    <span className="seller-quantity">{item.quantity}</span>
                    <div className="seller-pill-track">
                      <span
                        className={`seller-pill rank-${index + 1}`}
                        style={{ height: `${Math.max(item.percent, 12)}%` }}
                      />
                      <span className="seller-rank">{index + 1}</span>
                    </div>
                    <span className="seller-title">{item.product}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state compact">
                <Boxes size={26} />
                <span>Ainda sem vendas para classificar</span>
              </div>
            )}
          </section>

          <section className="dashboard-side-panel panel">
            <div className="dashboard-panel-header compact">
              <div>
                <span className="dashboard-eyebrow">Alertas</span>
                <h2>Operação do dia</h2>
              </div>
            </div>
            <div className="dashboard-alert-list">
              {visibleNotifications.map((notification) => {
                const AlertIcon = ALERT_ICONS[notification.severity] || Info;
                return (
                  <article
                    className={`dashboard-alert ${notification.severity}`}
                    key={notification.id}
                  >
                    <span className="dashboard-alert-icon"><AlertIcon size={17} /></span>
                    <div>
                      <span>{notification.title}</span>
                      <p>{notification.message}</p>
                      {notification.detail ? (
                        <small>{notification.detail}</small>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {!visibleNotifications.length ? (
                <p className="dashboard-alert-empty">Sem alertas de stock neste momento.</p>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function StatCard({ icon, title, value, detail, tone = "", trend = null, badge = null }) {
  const metricValue = formatMetricValue(value);
  const chip = trend
    ? { label: `${trend.percent > 0 ? "+" : ""}${trend.percent}%`, tone: trend.percent >= 0 ? "up" : "down", title: "Comparado com ontem" }
    : typeof badge === "string"
      ? { label: badge, tone: "neutral" }
      : badge;
  const TrendIcon = chip?.tone === "up" ? ArrowUpRight : chip?.tone === "down" ? ArrowDownRight : null;

  return (
    <article className={`dashboard-stat-card ${tone}`}>
      <div className="dashboard-stat-top">
        <span className="dashboard-stat-icon">{icon}</span>
        {chip ? (
          <span className={`dashboard-stat-chip ${chip.tone}`} title={chip.title}>
            {TrendIcon ? <TrendIcon size={13} /> : null}
            {chip.label}
          </span>
        ) : null}
      </div>
      <h2>{title}</h2>
      <span className="dashboard-stat-value">
        {metricValue.prefix ? (
          <small className="metric-prefix">{metricValue.prefix}</small>
        ) : null}
        <span className="metric-amount">{metricValue.amount}</span>
      </span>
      <small className="dashboard-stat-detail">{detail}</small>
    </article>
  );
}

// Variação das vendas de hoje face a ontem, a partir das vendas do gráfico.
function resolveDailyTrend(sales) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const todayKey = today.toISOString().slice(0, 10);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  const sum = (key) => sales.reduce((total, sale) => (sale.date === key ? total + Number(sale.revenue || 0) : total), 0);
  const previous = sum(yesterdayKey);
  if (!previous) return null;
  return { percent: Math.round(((sum(todayKey) - previous) / previous) * 100) };
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

function resolveStatusClass(status) {
  if (status === "PAGO") return "status paid";
  if (status === "ANULADO") return "status cancelled";
  return "status waiting";
}

export function InvoiceTable({
  rows,
  className = "",
  showClient = false,
  title = "",
  onRowClick,
  onViewAll,
}) {
  const [detailInvoice, setDetailInvoice] = useState(null);
  const [copiedNumber, setCopiedNumber] = useState("");

  useEffect(() => {
    if (!copiedNumber) return undefined;
    const timer = setTimeout(() => setCopiedNumber(""), 1600);
    return () => clearTimeout(timer);
  }, [copiedNumber]);

  async function handleCopyNumber(invoiceNumber) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(invoiceNumber);
    }
    setCopiedNumber(invoiceNumber);
  }

  return (
    <div className={`table-panel ${className}`}>
      {title ? (
        <div className="table-panel-header">
          <h2>{title}</h2>
          {onViewAll ? (
            <button type="button" className="dashboard-link-button" onClick={onViewAll}>
              Ver todos
            </button>
          ) : null}
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
            {rows.map((invoice) => (
              <tr
                key={invoice.number}
                className={onRowClick ? "clickable-row" : undefined}
                onClick={onRowClick ? () => onRowClick(invoice) : undefined}
              >
                <td className="invoice-number">{invoice.number}</td>
                <td>{invoice.items}</td>
                <td>{formatKwanza(invoice.value).replace("KZ ", "")}</td>
                <td>
                  <span className={resolveStatusClass(invoice.status)}>
                    {invoice.status}
                  </span>
                </td>
                {showClient && <td>{invoice.client}</td>}
                <td className="options-cell">
                  <div className="table-row-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Ver detalhes da factura ${invoice.number}`}
                      title="Ver detalhes"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDetailInvoice(invoice);
                      }}
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Copiar numero ${invoice.number}`}
                      title={copiedNumber === invoice.number ? "Copiado" : "Copiar numero"}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCopyNumber(invoice.number);
                      }}
                    >
                      <Copy size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
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

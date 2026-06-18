import React, { useMemo, useState } from 'react';
import { AlertTriangle, Boxes, FileBarChart, TrendingUp, UsersRound, WalletCards } from 'lucide-react';
import {
  buildReportsOverview,
  clients,
  financeExpenses,
  financeLosses,
  financeProductSales,
  formatKwanza,
  stockItems,
} from '../data/pharmacyData.mjs';

function Relatorios() {
  const [reportType, setReportType] = useState('geral');
  const [startDate, setStartDate] = useState('2026-06-01');
  const [endDate, setEndDate] = useState('2026-06-15');
  const overview = useMemo(() => buildReportsOverview({
    clients,
    stockRows: stockItems,
    sales: financeProductSales,
    losses: financeLosses,
    expenses: financeExpenses,
  }, { referenceDate: endDate }), [endDate]);

  return (
    <section className="standard-screen reports-screen">
      <div className="report-filters panel">
        <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
          <option value="geral">Geral</option>
          <option value="vendas">Vendas</option>
          <option value="estoque">Estoque</option>
          <option value="financeiro">Financeiro</option>
          <option value="clientes">Clientes</option>
        </select>
        <button type="button" className="primary-button"><FileBarChart size={18} /> Gerar Relatorio</button>
      </div>

      <div className="standard-metrics report-summary-metrics">
        <Metric title="Vendas" value={formatKwanza(overview.sales.totalRevenue)} icon={TrendingUp} tone="green" />
        <Metric title="Lucro Liquido" value={formatKwanza(overview.finance.netProfit)} icon={WalletCards} tone={overview.finance.netProfit >= 0 ? 'green' : 'red'} />
        <Metric title="Estoque Critico" value={overview.stock.lowStock + overview.stock.outOfStock} icon={AlertTriangle} tone="yellow" />
        <Metric title="Clientes Activos" value={overview.clients.activeClients} icon={UsersRound} tone="blue" />
      </div>

      <div className="report-grid report-grid-wide">
        <div className="panel report-card">
          <h2>Entradas por Pagamento</h2>
          <div className="report-payment-bars">
            {overview.sales.paymentBreakdown.map((item) => (
              <div key={item.method}>
                <span>{item.method}</span>
                <strong>{formatKwanza(item.value)}</strong>
                <i style={{ width: `${resolveBarWidth(item.value, overview.sales.totalRevenue)}%` }} />
              </div>
            ))}
          </div>
        </div>

        <div className="panel report-card">
          <h2>Produtos Mais Lucrativos</h2>
          <ol>
            {overview.topProducts.slice(0, 6).map((item) => (
              <li key={item.product}>
                <span>{item.product}</span>
                <strong>{formatKwanza(item.profit)}</strong>
              </li>
            ))}
          </ol>
        </div>

        <div className="panel report-card">
          <h2>Resumo Financeiro</h2>
          <ReportLines rows={[
            ['Lucro bruto', formatKwanza(overview.finance.grossProfit)],
            ['Perdas', formatKwanza(overview.finance.losses)],
            ['Gastos', formatKwanza(overview.finance.expenses)],
            ['Lucro liquido', formatKwanza(overview.finance.netProfit)],
          ]}
          />
        </div>

        <div className="panel report-card">
          <h2>Clientes</h2>
          <ReportLines rows={[
            ['Compras hoje', overview.clients.purchasesToday],
            ['Credito aberto', formatKwanza(overview.clients.openCredit)],
            ['Novos no mes', overview.clients.newThisMonth],
          ]}
          />
        </div>

        <div className="panel report-card report-card-wide">
          <h2>Alertas de Estoque</h2>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Qtd.</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {overview.stockAlerts.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.category}</td>
                  <td>{item.quantity}</td>
                  <td><span className={item.status === 'Sem estoque' ? 'stock-status out' : 'stock-status low'}>{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel report-card">
          <h2>Inventario</h2>
          <div className="report-inventory-total">
            <Boxes size={34} />
            <span>
              <strong>{overview.stock.totalProducts}</strong>
              produtos cadastrados
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ title, value, icon: Icon, tone }) {
  return (
    <div className={`standard-metric ${tone}`}>
      <span><Icon size={32} /></span>
      <div>
        <h2>{title}</h2>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function ReportLines({ rows }) {
  return (
    <div className="report-lines">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function resolveBarWidth(value, total) {
  if (!total) return 0;
  return Math.max(6, Math.round((value / total) * 100));
}

export default Relatorios;

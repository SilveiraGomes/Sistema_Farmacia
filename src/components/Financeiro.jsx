import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  Clock,
  CreditCard,
  Download,
  Landmark,
  Package,
  Pencil,
  PlusCircle,
  Receipt,
  Smartphone,
  Trash2,
  WalletCards,
} from 'lucide-react';
import {
  buildFinancialOverview,
  financeExpenses,
  financeLosses,
  financeOtherRevenues,
  financeProductSales,
  formatKwanza,
  transactions,
} from '../data/pharmacyData.mjs';
import { confirmDelete } from '../utils/confirmations.mjs';
import { useOperation } from '../operation/OperationContext';

const periodOptions = [
  { value: 'month', label: 'Mes' },
  { value: 'week', label: 'Semana' },
  { value: 'shift', label: 'Turno' },
];

const shiftOptions = ['Todos', 'Manha', 'Tarde', 'Noite'];

const manualEntryDefaults = {
  type: 'expense',
  category: 'Infraestrutura',
  description: '',
  value: '',
  date: '2026-06-15',
  status: 'Paga',
  shift: 'Manha',
  product: '',
  quantity: '1',
  reason: 'Danificado',
};

const expenseCategories = ['Infraestrutura', 'Recursos Humanos', 'Servicos', 'Fornecedores', 'Marketing', 'Outro'];
const revenueCategories = ['Servico', 'Rendimento extra', 'Ajuste de caixa', 'Outro'];
const lossReasons = ['Expiracao', 'Danificado', 'Furto', 'Consumo interno', 'Obsolescencia', 'Outro'];

const paymentIcons = {
  Dinheiro: WalletCards,
  TPA: CreditCard,
  Transferencia: Landmark,
  Credito: Smartphone,
};

function Financeiro() {
  const operation = useOperation();
  const [showModal, setShowModal] = useState(false);
  const [rows, setRows] = useState(transactions);
  const [manualExpenses, setManualExpenses] = useState([]);
  const [manualLosses, setManualLosses] = useState([]);
  const [manualRevenues, setManualRevenues] = useState([]);
  const [manualEntry, setManualEntry] = useState(manualEntryDefaults);
  const [period, setPeriod] = useState('month');
  const [referenceDate, setReferenceDate] = useState('2026-06-15');
  const [shift, setShift] = useState('Todos');
  const overview = useMemo(
    () => buildFinancialOverview({
      sales: financeProductSales,
      losses: [...financeLosses, ...manualLosses],
      expenses: [...financeExpenses, ...manualExpenses],
      otherRevenues: [...financeOtherRevenues, ...manualRevenues],
    }, { period, referenceDate, shift }),
    [manualExpenses, manualLosses, manualRevenues, period, referenceDate, shift],
  );

  function openManualEntryModal() {
    if (!operation.canOperate) return;
    setManualEntry((current) => ({ ...manualEntryDefaults, date: referenceDate, type: current.type }));
    setShowModal(true);
  }

  function updateManualEntry(field, value) {
    setManualEntry((current) => ({ ...current, [field]: value }));
  }

  function saveManualEntry() {
    if (!operation.canOperate) return;
    const value = Number(manualEntry.value);
    if (!Number.isFinite(value) || value <= 0 || !manualEntry.description.trim()) return;

    const id = `FM${Date.now()}`;
    if (manualEntry.type === 'expense') {
      const row = {
        id,
        category: manualEntry.category,
        description: manualEntry.description.trim(),
        value,
        date: manualEntry.date,
        status: manualEntry.status,
        source: 'Manual',
      };
      setManualExpenses((current) => [row, ...current]);
      setRows((current) => [toMovementRow(row, 'Despesa'), ...current]);
    }

    if (manualEntry.type === 'revenue') {
      const row = {
        id,
        category: manualEntry.category,
        description: manualEntry.description.trim(),
        value,
        date: manualEntry.date,
        status: manualEntry.status,
        source: 'Manual',
      };
      setManualRevenues((current) => [row, ...current]);
      setRows((current) => [toMovementRow(row, 'Receita'), ...current]);
    }

    if (manualEntry.type === 'loss') {
      const row = {
        id,
        product: manualEntry.product.trim() || manualEntry.description.trim(),
        reason: manualEntry.reason,
        quantity: Number(manualEntry.quantity) || 1,
        value,
        date: manualEntry.date,
        shift: manualEntry.shift,
        source: 'Manual',
      };
      setManualLosses((current) => [row, ...current]);
      setRows((current) => [toMovementRow({
        ...row,
        category: 'Perdas',
        description: `${row.reason} - ${row.product}`,
        status: 'Paga',
      }, 'Despesa'), ...current]);
    }

    setShowModal(false);
  }

  async function removeMovement(item) {
    if (!(await confirmDelete(`o movimento ${item.description}`))) {
      return;
    }

    setRows((current) => current.filter((row) => row.id !== item.id));
  }

  return (
    <section className="standard-screen finance-screen">
      <div className="finance-toolbar panel">
        <div>
          <h2>Resumo Financeiro</h2>
          <span>{overview.range.label}</span>
        </div>
        <label>
          <Calendar size={17} />
          <input type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} />
        </label>
        <select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Periodo financeiro">
          {periodOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          value={shift}
          onChange={(event) => setShift(event.target.value)}
          aria-label="Turno financeiro"
          disabled={period !== 'shift'}
        >
          {shiftOptions.map((option) => (
            <option key={option} value={option}>{option === 'Todos' ? 'Todos os turnos' : option}</option>
          ))}
        </select>
      </div>

      {!operation.canOperate ? (
        <div className="operation-blocked-banner finance-operation-block">
          {operation.message || 'Abra o dia e o turno antes de lancar movimentos financeiros.'}
        </div>
      ) : null}

      <div className="standard-metrics finance-metrics">
        <Metric title="Receita Total" value={formatKwanza(overview.totals.revenue)} tone="green" icon={ArrowUpCircle} />
        <Metric title="Custo Produtos" value={formatKwanza(overview.totals.productCost)} tone="yellow" icon={Package} />
        <Metric title="Lucro Bruto" value={formatKwanza(overview.totals.grossProfit)} tone="blue" icon={WalletCards} />
        <Metric title="Perdas" value={formatKwanza(overview.totals.losses)} tone="red" icon={AlertTriangle} />
        <Metric title="Gastos Pagos" value={formatKwanza(overview.totals.expenses)} tone="red" icon={ArrowDownCircle} />
        <Metric title="Lucro Liquido" value={formatKwanza(overview.totals.netProfit)} tone={overview.totals.netProfit >= 0 ? 'green' : 'red'} icon={Receipt} />
      </div>

      <section className="finance-source-grid">
        <DataSourceCard
          title="Automático"
          items={[
            'Vendas finalizadas geram receita e custo do produto.',
            'Baixas de estoque geram perdas por motivo.',
            'Turno vem do movimento operacional.',
          ]}
        />
        <DataSourceCard
          title="Manual"
          items={[
            'Gastos fixos e variáveis do negócio.',
            'Receitas extras que não vêm de produto.',
            'Ajustes de perda quando não passam pelo estoque.',
          ]}
        />
      </section>

      <section className="finance-payment-panel panel">
        <div className="panel-title-row">
          <h2>Entradas das Vendas</h2>
          <span className="finance-pill">Automático por forma de pagamento</span>
        </div>
        <div className="finance-payment-grid">
          {overview.paymentBreakdown.map((item) => (
            <PaymentEntryCard key={item.method} entry={item} />
          ))}
        </div>
      </section>

      <div className="finance-grid">
        <section className="panel finance-table-panel">
          <div className="panel-title-row">
            <h2>Ganhos por Produto</h2>
            <span className="finance-pill">Margem bruta {overview.totals.grossMargin.toFixed(2)}%</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd.</th>
                <th>Receita</th>
                <th>Custo</th>
                <th>Ganho</th>
                <th>Margem</th>
              </tr>
            </thead>
            <tbody>
              {overview.productGains.map((item) => (
                <tr key={item.product}>
                  <td>{item.product}</td>
                  <td>{item.quantity}</td>
                  <td>{formatKwanza(item.revenue)}</td>
                  <td>{formatKwanza(item.cost)}</td>
                  <td><strong>{formatKwanza(item.profit)}</strong></td>
                  <td>{item.margin.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel finance-side-panel">
          <h2>Ganhos por Turno</h2>
          <div className="finance-list">
            {overview.shiftBreakdown.map((item) => (
              <div key={item.shift} className="finance-list-row">
                <Clock size={18} />
                <span>
                  <strong>{item.shift}</strong>
                  <small>{item.quantity} itens vendidos</small>
                </span>
                <b>{formatKwanza(item.grossProfit)}</b>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="finance-grid compact">
        <section className="panel finance-side-panel">
          <div className="panel-title-row">
            <h2>Perdas</h2>
            <span className="finance-pill danger">{formatKwanza(overview.totals.losses)}</span>
          </div>
          <div className="finance-list">
            {overview.lossBreakdown.map((item) => (
              <div key={item.reason} className="finance-list-row">
                <AlertTriangle size={18} />
                <span>
                  <strong>{item.reason}</strong>
                  <small>{item.quantity} unidades</small>
                </span>
                <b>{formatKwanza(item.value)}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="panel finance-side-panel">
          <div className="panel-title-row">
            <h2>Gastos para Manter</h2>
            <span className="finance-pill">{formatKwanza(overview.totals.expenses)}</span>
          </div>
          <div className="finance-list">
            {overview.expenseBreakdown.map((item) => (
              <div key={item.category} className="finance-list-row">
                <Receipt size={18} />
                <span>
                  <strong>{item.category}</strong>
                  <small>Despesa operacional paga</small>
                </span>
                <b>{formatKwanza(item.value)}</b>
              </div>
            ))}
            {!!overview.pendingExpenses.length && (
              <div className="finance-pending">
                Pendentes: {formatKwanza(overview.totals.pendingExpenses)}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="panel table-panel">
        <div className="panel-title-row">
          <h2>Movimentos Financeiros</h2>
          <div className="stock-toolbar-actions">
            <button type="button" onClick={openManualEntryModal} disabled={!operation.canOperate}><PlusCircle size={17} /> Novo Lancamento</button>
            <button type="button"><Download size={17} /> Exportar</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Descricao</th>
              <th>Valor</th>
              <th>Data</th>
              <th>Status</th>
              <th>Origem</th>
              <th>Opcoes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{item.type}</td>
                <td>{item.description}</td>
                <td>{formatKwanza(item.value)}</td>
                <td>{item.date}</td>
                <td><span className={item.status === 'Paga' ? 'status paid' : 'status waiting'}>{item.status}</span></td>
                <td><span className="finance-origin">{item.source ?? (item.type === 'Receita' ? 'Automatico' : 'Manual')}</span></td>
                <td className="options-cell">
                  <button className="icon-button" type="button" aria-label="Editar movimento" onClick={() => setShowModal(true)}><Pencil size={16} /></button>
                  <button className="icon-button danger" type="button" aria-label="Remover movimento" onClick={() => removeMovement(item)}><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-title-row">
              <h2>Novo Lancamento Manual</h2>
              <button type="button" onClick={() => setShowModal(false)}>x</button>
            </div>
            <div className="form-grid">
              <select value={manualEntry.type} onChange={(event) => updateManualEntry('type', event.target.value)} aria-label="Tipo de lancamento">
                <option value="expense">Gasto do negocio</option>
                <option value="revenue">Receita extra</option>
                <option value="loss">Perda manual</option>
              </select>
              {manualEntry.type === 'loss' ? (
                <select value={manualEntry.reason} onChange={(event) => updateManualEntry('reason', event.target.value)} aria-label="Motivo da perda">
                  {lossReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                </select>
              ) : (
                <select value={manualEntry.category} onChange={(event) => updateManualEntry('category', event.target.value)} aria-label="Categoria do lancamento">
                  {(manualEntry.type === 'expense' ? expenseCategories : revenueCategories).map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              )}
              <input
                placeholder={manualEntry.type === 'loss' ? 'Produto ou item perdido' : 'Descricao'}
                value={manualEntry.description}
                onChange={(event) => updateManualEntry('description', event.target.value)}
              />
              <input
                placeholder="Valor"
                type="number"
                value={manualEntry.value}
                onChange={(event) => updateManualEntry('value', event.target.value)}
              />
              <input type="date" value={manualEntry.date} onChange={(event) => updateManualEntry('date', event.target.value)} />
              {manualEntry.type === 'loss' ? (
                <>
                  <input
                    placeholder="Quantidade"
                    type="number"
                    value={manualEntry.quantity}
                    onChange={(event) => updateManualEntry('quantity', event.target.value)}
                  />
                  <select value={manualEntry.shift} onChange={(event) => updateManualEntry('shift', event.target.value)} aria-label="Turno da perda">
                    {shiftOptions.filter((option) => option !== 'Todos').map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </>
              ) : (
                <select value={manualEntry.status} onChange={(event) => updateManualEntry('status', event.target.value)} aria-label="Status do lancamento">
                  <option>Pendente</option>
                  <option>Paga</option>
                  <option>Cancelada</option>
                </select>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="soft-button" onClick={() => setShowModal(false)}>Cancelar</button>
              <button
                type="button"
                className="primary-button"
                onClick={saveManualEntry}
                disabled={!operation.canOperate || !manualEntry.description.trim() || !Number(manualEntry.value)}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ title, value, tone, icon: Icon }) {
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

function DataSourceCard({ title, items }) {
  return (
    <div className="finance-source-card">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function PaymentEntryCard({ entry }) {
  const Icon = paymentIcons[entry.method] ?? WalletCards;

  return (
    <div className="finance-payment-card">
      <span><Icon size={28} /></span>
      <div>
        <h3>{entry.method}</h3>
        <strong>{formatKwanza(entry.value)}</strong>
        <small>{entry.count} transacoes</small>
      </div>
    </div>
  );
}

function toMovementRow(row, type) {
  return {
    id: row.id,
    type,
    description: row.description,
    value: row.value,
    date: row.date,
    status: row.status ?? 'Paga',
    source: row.source ?? 'Manual',
  };
}

export default Financeiro;

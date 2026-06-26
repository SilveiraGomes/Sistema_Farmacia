import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  CheckCircle,
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
import { request } from '../services/ipcClient.js';
import { buildFinancialOverview, formatKwanza } from '../data/pharmacyData.mjs';
import { confirmDelete } from '../utils/confirmations.mjs';
import { useOperation } from '../operation/OperationContext';
import { CATALOG_KEYS } from '../configuration/catalogKeys.mjs';
import { useCatalog } from '../configuration/SettingsContext';

const periodOptions = [
  { value: 'month', label: 'Mes' },
  { value: 'week', label: 'Semana' },
  { value: 'shift', label: 'Turno' },
];

const manualEntryDefaults = {
  type: 'expense',
  category: 'Infraestrutura',
  description: '',
  value: '',
  date: new Date().toISOString().slice(0, 10),
  status: 'Paga',
  shift: 'Manha',
  product: '',
  quantity: '1',
  reason: 'Danificado',
};

const paymentIcons = {
  Dinheiro: WalletCards,
  TPA: CreditCard,
  Transferencia: Landmark,
  Credito: Smartphone,
};

function Financeiro() {
  const operation = useOperation();
  const shiftCatalog = useCatalog(CATALOG_KEYS.OPERATION_SHIFTS);
  const expenseCatalog = useCatalog(CATALOG_KEYS.EXPENSE_CATEGORIES);
  const revenueCatalog = useCatalog(CATALOG_KEYS.REVENUE_CATEGORIES);
  const lossCatalog = useCatalog(CATALOG_KEYS.LOSS_REASONS);
  const statusCatalog = useCatalog(CATALOG_KEYS.FINANCIAL_STATUSES);
  const shiftOptions = [{ code: 'Todos', name: 'Todos os turnos' }, ...shiftCatalog];
  const [showModal, setShowModal] = useState(false);
  const [rows, setRows] = useState([]);
  const [overviewData, setOverviewData] = useState({ sales: [], losses: [], expenses: [], otherRevenues: [] });
  const [manualEntry, setManualEntry] = useState(manualEntryDefaults);
  const [period, setPeriod] = useState('month');
  const today = new Date().toISOString().slice(0, 10);
  const [referenceDate, setReferenceDate] = useState(today);
  const [shift, setShift] = useState('Todos');

  const overview = useMemo(
    () => buildFinancialOverview(overviewData, { period, referenceDate, shift }),
    [overviewData, period, referenceDate, shift],
  );

  const [contasPagar, setContasPagar] = useState([]);
  const [contasLoading, setContasLoading] = useState(true);

  const loadFinanceData = useCallback(async (date) => {
    const refDate = date || referenceDate;
    try {
      const [txRows, ovData] = await Promise.all([
        request('financeiro.list', { referenceDate: refDate }),
        request('financeiro.overview', { referenceDate: refDate }),
      ]);
      setRows(txRows || []);
      setOverviewData(ovData || { sales: [], losses: [], expenses: [], otherRevenues: [] });
    } catch (err) {
      console.error('Erro ao carregar financeiro:', err);
    }
  }, [referenceDate]);

  useEffect(() => {
    request('financeiro.contasPagar', {})
      .then((data) => setContasPagar(data || []))
      .catch(() => {})
      .finally(() => setContasLoading(false));
  }, []);

  useEffect(() => {
    loadFinanceData();
  }, [loadFinanceData]);

  async function marcarPago(id) {
    try {
      await request('financeiro.marcarPago', { id });
      setContasPagar((prev) => prev.filter((c) => c.id !== id));
    } catch { /* silent */ }
  }

  function openManualEntryModal() {
    if (!operation.canOperate) return;
    setManualEntry((current) => ({
      ...manualEntryDefaults,
      date: referenceDate,
      type: current.type,
      category: (current.type === 'revenue' ? revenueCatalog : expenseCatalog)[0]?.name || '',
      reason: lossCatalog[0]?.name || '',
      shift: shiftCatalog[0]?.name || '',
      status: statusCatalog[0]?.name || '',
    }));
    setShowModal(true);
  }

  function updateManualEntry(field, value) {
    setManualEntry((current) => ({ ...current, [field]: value }));
  }

  async function saveManualEntry() {
    if (!operation.canOperate) return;
    const value = Number(manualEntry.value);
    if (!Number.isFinite(value) || value <= 0 || !manualEntry.description.trim()) return;

    const isLoss = manualEntry.type === 'loss';
    const tipoNorm = manualEntry.type === 'revenue' ? 'Receita' : 'Despesa';

    const payload = {
      tipo: tipoNorm,
      categoria: isLoss ? 'Perdas' : manualEntry.category,
      descricao: isLoss
        ? `${manualEntry.reason} - ${manualEntry.description.trim()}`
        : manualEntry.description.trim(),
      valor: value,
      data: manualEntry.date,
      status: isLoss ? 'Paga' : manualEntry.status,
      turno: isLoss ? manualEntry.shift : null,
      motivo_perda: isLoss ? manualEntry.reason : null,
      quantidade: isLoss ? Number(manualEntry.quantity) || 1 : null,
    };

    try {
      await request('financeiro.create', payload);
      await loadFinanceData();
      setShowModal(false);
    } catch (err) {
      alert(err?.message || 'Erro ao guardar lançamento.');
    }
  }

  function exportMovementsExcel() {
    const headers = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor (AKZ)', 'Status', 'Turno'];
    const dataRows = rows.map((r) => [
      r.date || '', r.type || '', r.description || '',
      r.category || '', r.value ?? '', r.status || '', r.shift || '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Financeiro');
    XLSX.writeFile(wb, `financeiro-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function removeMovement(item) {
    if (!(await confirmDelete(`o movimento ${item.description}`))) return;
    try {
      await request('financeiro.delete', { id: item.id });
      setRows((current) => current.filter((row) => row.id !== item.id));
    } catch (err) {
      alert(err?.message || 'Erro ao remover movimento.');
    }
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
          <input type="date" value={referenceDate} onChange={(event) => { setReferenceDate(event.target.value); loadFinanceData(event.target.value); }} />
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
            <option key={option.code} value={option.name}>{option.name}</option>
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
            <button type="button" onClick={exportMovementsExcel}><Download size={17} /> Exportar</button>
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
              <label>
                <span>Tipo de lançamento</span>
                <select value={manualEntry.type} onChange={(event) => updateManualEntry('type', event.target.value)}>
                  <option value="expense">Gasto do negócio</option>
                  <option value="revenue">Receita extra</option>
                  <option value="loss">Perda manual</option>
                </select>
              </label>
              {manualEntry.type === 'loss' ? (
                <label>
                  <span>Motivo da perda</span>
                  <select value={manualEntry.reason} onChange={(event) => updateManualEntry('reason', event.target.value)}>
                    {lossCatalog.map((reason) => <option key={reason.code} value={reason.name}>{reason.name}</option>)}
                  </select>
                </label>
              ) : (
                <label>
                  <span>Categoria</span>
                  <select value={manualEntry.category} onChange={(event) => updateManualEntry('category', event.target.value)}>
                    {(manualEntry.type === 'expense' ? expenseCatalog : revenueCatalog).map((category) => (
                      <option key={category.code} value={category.name}>{category.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="form-span-2">
                <span>{manualEntry.type === 'loss' ? 'Produto ou item perdido' : 'Descrição'}</span>
                <input
                  value={manualEntry.description}
                  onChange={(event) => updateManualEntry('description', event.target.value)}
                />
              </label>
              <label>
                <span>Valor (AKZ)</span>
                <input
                  type="number"
                  value={manualEntry.value}
                  onChange={(event) => updateManualEntry('value', event.target.value)}
                />
              </label>
              <label>
                <span>Data</span>
                <input type="date" value={manualEntry.date} onChange={(event) => updateManualEntry('date', event.target.value)} />
              </label>
              {manualEntry.type === 'loss' ? (
                <>
                  <label>
                    <span>Quantidade</span>
                    <input
                      type="number"
                      value={manualEntry.quantity}
                      onChange={(event) => updateManualEntry('quantity', event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Turno</span>
                    <select value={manualEntry.shift} onChange={(event) => updateManualEntry('shift', event.target.value)}>
                      {shiftCatalog.map((option) => <option key={option.code} value={option.name}>{option.name}</option>)}
                    </select>
                  </label>
                </>
              ) : (
                <label>
                  <span>Status</span>
                  <select value={manualEntry.status} onChange={(event) => updateManualEntry('status', event.target.value)}>
                    {statusCatalog.map((option) => <option key={option.code} value={option.name}>{option.name}</option>)}
                  </select>
                </label>
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

      {contasPagar.length > 0 || contasLoading ? (
        <section className="panel payables-panel">
          <div className="payables-header">
            <h3>Contas a Pagar</h3>
            <span className="finance-pill">{contasPagar.length} pendente{contasPagar.length !== 1 ? 's' : ''}</span>
          </div>
          {contasLoading ? (
            <div className="empty-state"><span>A carregar...</span></div>
          ) : (
            contasPagar.map((c) => {
              const isOverdue = c.data_vencimento && new Date(c.data_vencimento) < new Date();
              return (
                <div key={c.id} className="payable-row">
                  <div>
                    <div className="payable-desc">{c.descricao || c.categoria}</div>
                    {c.fornecedor ? <div className="payable-meta">{c.fornecedor}</div> : null}
                  </div>
                  <div className={`payable-due${isOverdue ? ' overdue' : ''}`}>
                    {c.data_vencimento ? new Date(c.data_vencimento).toLocaleDateString('pt-AO') : '—'}
                  </div>
                  <div className="payable-amount">{formatKwanza(c.valor)}</div>
                  <button
                    type="button"
                    className="soft-button"
                    style={{ fontSize: 12, padding: '4px 10px', display: 'flex', gap: 4, alignItems: 'center' }}
                    onClick={() => marcarPago(c.id)}
                  >
                    <CheckCircle size={13} /> Pago
                  </button>
                </div>
              );
            })
          )}
        </section>
      ) : null}
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

export default Financeiro;

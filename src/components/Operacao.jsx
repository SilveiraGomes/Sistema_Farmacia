import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  PlayCircle,
  RefreshCw,
  SquareCheckBig,
  WalletCards,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useOperation } from '../operation/OperationContext';
import { formatKwanza } from '../data/pharmacyData.mjs';
import { CATALOG_KEYS } from '../configuration/catalogKeys.mjs';
import { useCatalog } from '../configuration/SettingsContext';

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDefaultForm(modal, defaultShift = '') {
  if (modal === 'open-day') {
    return {
      data_operacional: todayKey(),
      saldo_inicial: '',
      observacao_abertura: '',
    };
  }

  if (modal === 'open-shift') {
    return {
      nome: defaultShift,
      saldo_inicial: '',
      observacao_abertura: '',
    };
  }

  return {
    saldo_final_informado: '',
    observacao_fechamento: '',
  };
}

function Operacao() {
  const operation = useOperation();
  const { hasPermission } = useAuth();
  const [modal, setModal] = useState('');
  const [form, setForm] = useState(() => createDefaultForm('open-day'));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const day = operation.day;
  const shift = operation.shift;
  const shiftOptions = useCatalog(CATALOG_KEYS.OPERATION_SHIFTS, { selectedCode: shift?.nome || '' });

  const cashSummary = useMemo(() => {
    const source = shift || day;
    return {
      initial: Number(source?.saldo_inicial ?? 0),
      sales: Number(source?.total_vendas ?? 0),
      expenses: Number(source?.total_despesas ?? 0),
      losses: Number(source?.total_perdas ?? 0),
      difference: Number(source?.diferenca_caixa ?? 0),
    };
  }, [day, shift]);

  function openModal(nextModal) {
    setForm(createDefaultForm(nextModal, shiftOptions[0]?.code || ''));
    setModal(nextModal);
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitModal(event) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      if (modal === 'open-day') {
        await operation.openDay({
          data_operacional: form.data_operacional,
          saldo_inicial: Number(form.saldo_inicial || 0),
          observacao_abertura: form.observacao_abertura,
        });
      }

      if (modal === 'open-shift') {
        await operation.openShift({
          nome: form.nome,
          saldo_inicial: Number(form.saldo_inicial || 0),
          observacao_abertura: form.observacao_abertura,
        });
      }

      if (modal === 'close-shift') {
        await operation.closeShift({
          saldo_final_informado: Number(form.saldo_final_informado || 0),
          observacao_fechamento: form.observacao_fechamento,
        });
      }

      if (modal === 'close-day') {
        await operation.closeDay({
          saldo_final_informado: Number(form.saldo_final_informado || 0),
          observacao_fechamento: form.observacao_fechamento,
        });
      }

      setModal('');
    } catch {
      // OperationContext keeps the safe error message visible on the screen.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="standard-screen operation-screen">
      <div className="operation-hero panel">
        <div>
          <span className="operation-kicker">Controle operacional</span>
          <h2>Dia e turno da farmacia</h2>
          <p>{operation.canOperate ? 'Operacoes liberadas para vendas e movimentos financeiros.' : operation.message}</p>
        </div>
        <button type="button" className="soft-button compact" onClick={operation.refresh} disabled={operation.isLoading}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      <div className="operation-state-grid">
        <StatusCard
          icon={CalendarClock}
          tone={day ? 'green' : 'yellow'}
          title="Dia operacional"
          value={day?.status || 'Fechado'}
          detail={day ? day.data_operacional : 'Nenhum dia aberto'}
        />
        <StatusCard
          icon={Clock3}
          tone={shift ? 'green' : 'yellow'}
          title="Turno operacional"
          value={shift?.nome || 'Fechado'}
          detail={shift ? `Aberto em ${formatDateTime(shift.aberto_em)}` : 'Nenhum turno aberto'}
        />
        <StatusCard
          icon={WalletCards}
          tone="blue"
          title="Saldo base"
          value={formatKwanza(cashSummary.initial)}
          detail="Caixa inicial do estado atual"
        />
        <StatusCard
          icon={LockKeyhole}
          tone={operation.canOperate ? 'green' : 'red'}
          title="Operacoes"
          value={operation.canOperate ? 'Liberadas' : 'Bloqueadas'}
          detail={operation.canOperate ? 'Dia e turno abertos' : operation.message}
        />
      </div>

      {operation.error ? <div className="operation-notice danger" role="alert">{operation.error}</div> : null}
      {!operation.canOperate && !operation.error ? (
        <div className="operation-notice" role="status">
          <AlertTriangle size={18} />
          <span>{operation.message}</span>
        </div>
      ) : null}

      <div className="operation-command-grid">
        <section className="operation-actions panel">
          <div className="panel-title-row">
            <h2>Acoes do caixa</h2>
          </div>
          <div className="operation-action-list">
            <ActionButton
              icon={PlayCircle}
              title="Abrir dia"
              detail="Inicia a data operacional da farmacia"
              disabled={!!day || !hasPermission('operacao.abrir_dia') || operation.isLoading}
              onClick={() => openModal('open-day')}
            />
            <ActionButton
              icon={PlayCircle}
              title="Abrir turno"
              detail="Libera vendas e despesas do periodo"
              disabled={!day || !!shift || !hasPermission('operacao.abrir_turno') || operation.isLoading}
              onClick={() => openModal('open-shift')}
            />
            <ActionButton
              icon={SquareCheckBig}
              title="Fechar turno"
              detail="Encerra o caixa do turno aberto"
              disabled={!shift || !hasPermission('operacao.fechar_turno') || operation.isLoading}
              onClick={() => openModal('close-shift')}
            />
            <ActionButton
              icon={CheckCircle2}
              title="Fechar dia"
              detail="Disponivel somente sem turno aberto"
              disabled={!day || !!shift || !hasPermission('operacao.fechar_dia') || operation.isLoading}
              onClick={() => openModal('close-day')}
            />
          </div>
        </section>

        <section className="operation-ledger panel">
          <div className="panel-title-row">
            <h2>Resumo do caixa atual</h2>
            <span className={operation.canOperate ? 'operation-chip open' : 'operation-chip blocked'}>
              {operation.canOperate ? 'Aberto' : 'Bloqueado'}
            </span>
          </div>
          <div className="operation-ledger-grid">
            <LedgerItem label="Saldo inicial" value={formatKwanza(cashSummary.initial)} />
            <LedgerItem label="Vendas" value={formatKwanza(cashSummary.sales)} />
            <LedgerItem label="Despesas" value={formatKwanza(cashSummary.expenses)} />
            <LedgerItem label="Perdas" value={formatKwanza(cashSummary.losses)} />
            <LedgerItem label="Diferenca" value={formatKwanza(cashSummary.difference)} />
          </div>
        </section>
      </div>

      <section className="operation-detail panel">
        <div className="panel-title-row">
          <h2>Auditoria do estado atual</h2>
        </div>
        <dl>
          <div><dt>Dia</dt><dd>{day?.data_operacional || 'Sem dia aberto'}</dd></div>
          <div><dt>Turno</dt><dd>{shift?.nome || 'Sem turno aberto'}</dd></div>
          <div><dt>Aberto por</dt><dd>{shift?.aberto_por_nome ?? day?.aberto_por_nome ?? '-'}</dd></div>
          <div><dt>Aberto em</dt><dd>{formatDateTime(shift?.aberto_em || day?.aberto_em)}</dd></div>
          <div><dt>Nota de abertura</dt><dd>{shift?.observacao_abertura || day?.observacao_abertura || '-'}</dd></div>
          <div><dt>Ultimo fechamento</dt><dd>{formatDateTime(shift?.fechado_em || day?.fechado_em)}</dd></div>
        </dl>
      </section>

      {modal ? (
        <OperationModal
          modal={modal}
          form={form}
          isSubmitting={isSubmitting}
          onChange={updateForm}
          onClose={() => setModal('')}
          onSubmit={submitModal}
          shiftOptions={shiftOptions}
        />
      ) : null}
    </section>
  );
}

function StatusCard({ icon: Icon, tone, title, value, detail }) {
  return (
    <article className={`standard-metric operation-status-card ${tone}`}>
      <span><Icon size={32} /></span>
      <div>
        <h2>{title}</h2>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function ActionButton({ icon: Icon, title, detail, disabled, onClick }) {
  return (
    <button type="button" className="operation-action" disabled={disabled} onClick={onClick}>
      <span><Icon size={22} /></span>
      <i>
        <b>{title}</b>
        <small>{detail}</small>
      </i>
    </button>
  );
}

function LedgerItem({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OperationModal({ modal, form, isSubmitting, onChange, onClose, onSubmit, shiftOptions }) {
  const isOpening = modal === 'open-day' || modal === 'open-shift';
  const title = {
    'open-day': 'Abrir dia operacional',
    'open-shift': 'Abrir turno',
    'close-shift': 'Fechar turno',
    'close-day': 'Fechar dia operacional',
  }[modal];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal-card operation-modal" onSubmit={onSubmit}>
        <div className="modal-title-row">
          <h2>{title}</h2>
          <button type="button" className="modal-close-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="form-grid">
          {modal === 'open-day' ? (
            <label>
              <span>Data operacional</span>
              <input
                type="date"
                value={form.data_operacional}
                onChange={(event) => onChange('data_operacional', event.target.value)}
                required
              />
            </label>
          ) : null}
          {modal === 'open-shift' ? (
            <label>
              <span>Turno</span>
              <select value={form.nome} onChange={(event) => onChange('nome', event.target.value)}>
                {shiftOptions.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
              </select>
            </label>
          ) : null}
          <label>
            <span>{isOpening ? 'Saldo inicial' : 'Saldo contado'}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={isOpening ? form.saldo_inicial : form.saldo_final_informado}
              onChange={(event) => onChange(isOpening ? 'saldo_inicial' : 'saldo_final_informado', event.target.value)}
              required
            />
          </label>
          <label className="operation-note-field">
            <span>Observacao</span>
            <textarea
              value={isOpening ? form.observacao_abertura : form.observacao_fechamento}
              onChange={(event) => onChange(isOpening ? 'observacao_abertura' : 'observacao_fechamento', event.target.value)}
              placeholder="Nota para auditoria do caixa"
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="soft-button" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? 'A processar...' : title}
          </button>
        </div>
      </form>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-AO', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export default Operacao;

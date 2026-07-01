import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Package,
  PackageCheck,
  PlusCircle,
  RefreshCw,
  Search,
  Truck,
  X,
} from 'lucide-react';
import { request } from '../services/ipcClient.js';
import { useAuth } from '../auth/AuthContext.jsx';

const STATUS_LABELS = {
  RASCUNHO: 'Rascunho',
  ENVIADA: 'Enviada',
  PARCIALMENTE_RECEBIDA: 'Parcial',
  RECEBIDA: 'Recebida',
  CANCELADA: 'Cancelada',
};

const STATUS_CLASS = {
  RASCUNHO: 'waiting',
  ENVIADA: 'issued',
  PARCIALMENTE_RECEBIDA: 'waiting',
  RECEBIDA: 'paid',
  CANCELADA: 'cancelled',
};

const NEXT_STATUS = {
  RASCUNHO: 'ENVIADA',
  ENVIADA: null,
};

function Encomendas() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('compras.criar');
  const canEdit = hasPermission('compras.editar');
  const canReceive = hasPermission('compras.receber');

  const [rows, setRows] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [error, setError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ fornecedor_id: '', data_entrega_prevista: '', observacao: '', itens: [] });
  const [createError, setCreateError] = useState('');
  const [saving, setSaving] = useState(false);

  const [recebeTarget, setRecebeTarget] = useState(null);
  const [recepcoes, setRecepcoes] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [encs, fors] = await Promise.all([
        request('compras.list'),
        request('fornecedores.list'),
      ]);
      setRows(encs || []);
      setFornecedores(fors || []);
    } catch (err) {
      setError(err.message || 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = rows.filter((r) => {
    const matchQ = !query || r.numero.includes(query) || (r.fornecedor_nome || '').toLowerCase().includes(query.toLowerCase());
    const matchS = !filterStatus || r.status === filterStatus;
    return matchQ && matchS;
  });

  const metrics = {
    total: rows.length,
    abertas: rows.filter((r) => r.status === 'RASCUNHO' || r.status === 'ENVIADA').length,
    pendentes: rows.filter((r) => r.status === 'PARCIALMENTE_RECEBIDA').length,
    totalValor: rows.filter((r) => r.status !== 'CANCELADA').reduce((s, r) => s + Number(r.total || 0), 0),
  };

  function addItem() {
    setCreateForm((f) => ({ ...f, itens: [...f.itens, { produto_id: '', quantidade: 1, preco_unitario: '' }] }));
  }

  function removeItem(idx) {
    setCreateForm((f) => ({ ...f, itens: f.itens.filter((_, i) => i !== idx) }));
  }

  function updateItem(idx, field, value) {
    setCreateForm((f) => ({
      ...f,
      itens: f.itens.map((item, i) => i === idx ? { ...item, [field]: value } : item),
    }));
  }

  async function submitCreate() {
    if (!createForm.fornecedor_id) { setCreateError('Seleccione um fornecedor.'); return; }
    if (!createForm.itens.length) { setCreateError('Adicione pelo menos um produto.'); return; }
    for (const item of createForm.itens) {
      if (!item.produto_id || !item.quantidade || !item.preco_unitario) {
        setCreateError('Preencha todos os campos dos itens.'); return;
      }
    }
    setSaving(true);
    setCreateError('');
    try {
      await request('compras.create', createForm);
      setShowCreate(false);
      setCreateForm({ fornecedor_id: '', data_entrega_prevista: '', observacao: '', itens: [] });
      await load();
    } catch (err) {
      setCreateError(err.message || 'Erro ao criar encomenda.');
    } finally {
      setSaving(false);
    }
  }

  async function advanceStatus(row) {
    const next = NEXT_STATUS[row.status];
    if (!next) return;
    try {
      await request('compras.updateStatus', { id: row.id, status: next });
      await load();
    } catch (err) {
      setError(err.message || 'Erro ao actualizar estado.');
    }
  }

  async function cancelOrder(row) {
    try {
      await request('compras.updateStatus', { id: row.id, status: 'CANCELADA' });
      await load();
    } catch (err) {
      setError(err.message || 'Erro ao cancelar encomenda.');
    }
  }

  function openReceber(row) {
    setRecebeTarget(row);
    setRecepcoes((row.itens || []).map((item) => ({
      item_id: item.id,
      produto_nome: item.produto_nome || `Produto #${item.produto_id}`,
      quantidade_pedida: item.quantidade,
      quantidade_recebida_anterior: item.quantidade_recebida,
      quantidade_recebida: '',
      data_validade: '',
      lote: '',
      preco_custo: item.preco_unitario,
      localizacao: '',
    })));
  }

  async function submitReceber() {
    setSaving(true);
    try {
      await request('compras.receive', {
        id: recebeTarget.id,
        recepcoes: recepcoes.map((r) => ({
          item_id: r.item_id,
          quantidade_recebida: Number(r.quantidade_recebida) || 0,
          data_validade: r.data_validade || null,
          lote: r.lote || null,
          preco_custo: Number(r.preco_custo) || null,
          localizacao: r.localizacao || null,
        })),
      });
      setRecebeTarget(null);
      await load();
    } catch (err) {
      setError(err.message || 'Erro ao registar recepcao.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="standard-screen">
      <div className="standard-metrics">
        <Metric title="Total encomendas" value={metrics.total} icon={ClipboardList} />
        <Metric title="Em aberto" value={metrics.abertas} icon={Truck} />
        <Metric title="Recep. parcial" value={metrics.pendentes} icon={Package} />
        <Metric title="Valor total" value={`${Number(metrics.totalValor).toLocaleString('pt-AO')} KZ`} icon={PackageCheck} />
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="panel table-panel">
        <div className="panel-title-row">
          <h2>Encomendas de Compra</h2>
          <div className="stock-toolbar-actions">
            <label className="compact-search">
              <Search size={16} />
              <input placeholder="Numero ou fornecedor" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filtrar estado">
              <option value="">Todos os estados</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="button" className="icon-button" title="Actualizar" onClick={load}><RefreshCw size={15} /></button>
            {canCreate ? (
              <button type="button" className="primary-button" onClick={() => setShowCreate(true)}>
                <PlusCircle size={16} /> Nova Encomenda
              </button>
            ) : null}
          </div>
        </div>

        {loading ? <div className="empty-state"><span>A carregar...</span></div> : (
          <table>
            <thead>
              <tr>
                <th>Numero</th>
                <th>Fornecedor</th>
                <th>Data</th>
                <th>Entrega prevista</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Opcoes</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.numero}</strong></td>
                  <td>{row.fornecedor_nome || '—'}</td>
                  <td>{row.data_emissao || '—'}</td>
                  <td>{row.data_entrega_prevista || '—'}</td>
                  <td>{Number(row.total).toLocaleString('pt-AO')} KZ</td>
                  <td><span className={`status ${STATUS_CLASS[row.status] || 'waiting'}`}>{STATUS_LABELS[row.status] || row.status}</span></td>
                  <td className="options-cell">
                    {canReceive && (row.status === 'ENVIADA' || row.status === 'PARCIALMENTE_RECEBIDA') ? (
                      <button className="icon-button" type="button" title="Receber mercadoria" onClick={() => openReceber(row)}>
                        <PackageCheck size={16} />
                      </button>
                    ) : null}
                    {canEdit && NEXT_STATUS[row.status] ? (
                      <button className="icon-button" type="button" title={`Avançar para ${STATUS_LABELS[NEXT_STATUS[row.status]]}`} onClick={() => advanceStatus(row)}>
                        <ChevronDown size={16} />
                      </button>
                    ) : null}
                    {canEdit && row.status !== 'CANCELADA' && row.status !== 'RECEBIDA' ? (
                      <button className="icon-button danger" type="button" title="Cancelar" onClick={() => cancelOrder(row)}>
                        <X size={16} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && !visible.length ? <div className="empty-state"><ClipboardList size={26} /><strong>Nenhuma encomenda encontrada</strong></div> : null}
      </div>

      {showCreate ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card wide">
            <div className="modal-title-row">
              <h2>Nova Encomenda de Compra</h2>
              <button type="button" className="icon-button" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <div className="form-grid" style={{ marginTop: 16 }}>
              <label>
                <span>Fornecedor *</span>
                <select value={createForm.fornecedor_id} onChange={(e) => setCreateForm((f) => ({ ...f, fornecedor_id: e.target.value }))}>
                  <option value="">Seleccionar fornecedor</option>
                  {fornecedores.filter((f) => f.ativo).map((f) => <option key={f.id} value={f.id}>{f.nome_fantasia}</option>)}
                </select>
              </label>
              <label>
                <span>Entrega prevista</span>
                <input type="date" value={createForm.data_entrega_prevista} onChange={(e) => setCreateForm((f) => ({ ...f, data_entrega_prevista: e.target.value }))} />
              </label>
              <label className="form-span-2">
                <span>Observações</span>
                <input value={createForm.observacao} onChange={(e) => setCreateForm((f) => ({ ...f, observacao: e.target.value }))} placeholder="Notas sobre a encomenda" />
              </label>
            </div>

            <div className="encomenda-itens-header">
              <h3>Produtos</h3>
              <button type="button" className="soft-button" onClick={addItem}><PlusCircle size={15} /> Adicionar produto</button>
            </div>
            <table className="encomenda-itens-table">
              <thead><tr><th>Produto (nome/código)</th><th>Qtd</th><th>Preço unitário (KZ)</th><th></th></tr></thead>
              <tbody>
                {createForm.itens.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      <input
                        placeholder="Nome ou código do produto"
                        value={item.produto_id}
                        onChange={(e) => updateItem(idx, 'produto_id', e.target.value)}
                        list={`prod-list-${idx}`}
                      />
                    </td>
                    <td><input type="number" min="1" value={item.quantidade} onChange={(e) => updateItem(idx, 'quantidade', e.target.value)} /></td>
                    <td><input type="number" min="0" step="0.01" value={item.preco_unitario} onChange={(e) => updateItem(idx, 'preco_unitario', e.target.value)} /></td>
                    <td><button type="button" className="icon-button danger" onClick={() => removeItem(idx)}><X size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!createForm.itens.length ? <p className="encomenda-empty-itens">Adicione produtos à encomenda.</p> : null}

            {createError ? <p className="form-error">{createError}</p> : null}
            <div className="modal-actions">
              <button type="button" className="soft-button" onClick={() => setShowCreate(false)}>Cancelar</button>
              <button type="button" className="primary-button" onClick={submitCreate} disabled={saving}>
                {saving ? 'A criar...' : 'Criar Encomenda'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {recebeTarget ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card wide">
            <div className="modal-title-row">
              <h2>Receber Encomenda {recebeTarget.numero}</h2>
              <button type="button" className="icon-button" onClick={() => setRecebeTarget(null)}>×</button>
            </div>
            <p className="encomenda-receber-info">Registe as quantidades recebidas e os lotes/validades de cada produto.</p>
            <table className="encomenda-itens-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Pedido</th>
                  <th>Já recebido</th>
                  <th>Receber agora</th>
                  <th>Lote</th>
                  <th>Validade</th>
                  <th>Preço custo</th>
                </tr>
              </thead>
              <tbody>
                {recepcoes.map((rec, idx) => (
                  <tr key={rec.item_id}>
                    <td>{rec.produto_nome}</td>
                    <td>{rec.quantidade_pedida}</td>
                    <td>{rec.quantidade_recebida_anterior}</td>
                    <td>
                      <input
                        type="number" min="0" max={rec.quantidade_pedida - rec.quantidade_recebida_anterior}
                        value={rec.quantidade_recebida}
                        onChange={(e) => setRecepcoes((rs) => rs.map((r, i) => i === idx ? { ...r, quantidade_recebida: e.target.value } : r))}
                      />
                    </td>
                    <td>
                      <input
                        placeholder="Lote (auto)"
                        value={rec.lote}
                        onChange={(e) => setRecepcoes((rs) => rs.map((r, i) => i === idx ? { ...r, lote: e.target.value } : r))}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={rec.data_validade}
                        onChange={(e) => setRecepcoes((rs) => rs.map((r, i) => i === idx ? { ...r, data_validade: e.target.value } : r))}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min="0" step="0.01"
                        value={rec.preco_custo}
                        onChange={(e) => setRecepcoes((rs) => rs.map((r, i) => i === idx ? { ...r, preco_custo: e.target.value } : r))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="modal-actions">
              <button type="button" className="soft-button" onClick={() => setRecebeTarget(null)}>Cancelar</button>
              <button type="button" className="primary-button" onClick={submitReceber} disabled={saving}>
                <CheckCircle2 size={16} /> {saving ? 'A registar...' : 'Confirmar Recepcao'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ title, value, icon: Icon }) {
  return (
    <div className="standard-metric blue">
      <span><Icon size={30} /></span>
      <div><h2>{title}</h2><strong>{value}</strong></div>
    </div>
  );
}

export default Encomendas;

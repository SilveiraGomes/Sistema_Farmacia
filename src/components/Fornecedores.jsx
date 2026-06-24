import React, { useEffect, useState } from 'react';
import {
  Building2,
  Mail,
  Pencil,
  Phone,
  PlusCircle,
  Search,
  ToggleLeft,
  ToggleRight,
  Truck,
} from 'lucide-react';
import { request } from '../services/ipcClient.js';
import { useAuth } from '../auth/AuthContext.jsx';

const EMPTY_FORM = {
  nome_fantasia: '',
  razao_social: '',
  nif: '',
  telefone: '',
  email: '',
  contacto: '',
  endereco: '',
};

function Fornecedores() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('fornecedores.criar');
  const canEdit = hasPermission('fornecedores.editar');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await request('fornecedores.list');
      setRows(data || []);
    } catch (err) {
      setError(err.message || 'Erro ao carregar fornecedores.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = rows.filter((r) =>
    !query ||
    r.nome_fantasia.toLowerCase().includes(query.toLowerCase()) ||
    (r.nif || '').includes(query) ||
    (r.email || '').toLowerCase().includes(query.toLowerCase()),
  );

  const metrics = {
    total: rows.length,
    ativos: rows.filter((r) => r.ativo).length,
    inativos: rows.filter((r) => !r.ativo).length,
  };

  function setPF(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      nome_fantasia: row.nome_fantasia || '',
      razao_social: row.razao_social || '',
      nif: row.nif || '',
      telefone: row.telefone || '',
      email: row.email || '',
      contacto: row.contacto || '',
      endereco: row.endereco || '',
    });
    setError('');
    setShowModal(true);
  }

  async function save() {
    if (!form.nome_fantasia.trim()) { setError('Nome do fornecedor e obrigatorio.'); return; }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        const updated = await request('fornecedores.update', { id: editing.id, ...form });
        setRows((r) => r.map((x) => x.id === updated.id ? updated : x));
      } else {
        const created = await request('fornecedores.create', form);
        setRows((r) => [created, ...r]);
      }
      setShowModal(false);
    } catch (err) {
      setError(err.message || 'Erro ao guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(row) {
    try {
      const updated = await request('fornecedores.toggle', { id: row.id, ativo: !row.ativo });
      setRows((r) => r.map((x) => x.id === updated.id ? updated : x));
    } catch (err) {
      setError(err.message || 'Erro ao alterar estado.');
    }
  }

  return (
    <section className="standard-screen">
      <div className="standard-metrics">
        <Metric title="Total de fornecedores" value={metrics.total} icon={Truck} />
        <Metric title="Fornecedores activos" value={metrics.ativos} icon={Building2} />
        <Metric title="Inactivos" value={metrics.inativos} icon={ToggleLeft} />
      </div>

      {error && !showModal ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="panel table-panel">
        <div className="panel-title-row">
          <h2>Fornecedores</h2>
          <div className="stock-toolbar-actions">
            <label className="compact-search">
              <Search size={16} />
              <input
                placeholder="Pesquisar nome, NIF ou email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {canCreate ? (
              <button type="button" className="primary-button" onClick={openNew}>
                <PlusCircle size={16} /> Novo Fornecedor
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><span>A carregar...</span></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>NIF</th>
                <th>Contacto</th>
                <th>Email</th>
                <th>Estado</th>
                {canEdit ? <th>Opcoes</th> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className={!row.ativo ? 'row-inactive' : undefined}>
                  <td>
                    <strong>{row.nome_fantasia}</strong>
                    {row.razao_social ? <small className="table-sub">{row.razao_social}</small> : null}
                  </td>
                  <td>{row.nif || '—'}</td>
                  <td>
                    {row.telefone ? <span><Phone size={12} /> {row.telefone}</span> : '—'}
                    {row.contacto ? <small className="table-sub">{row.contacto}</small> : null}
                  </td>
                  <td>{row.email ? <span><Mail size={12} /> {row.email}</span> : '—'}</td>
                  <td>
                    <span className={row.ativo ? 'status paid' : 'status cancelled'}>
                      {row.ativo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {canEdit ? (
                    <td className="options-cell">
                      <button className="icon-button" type="button" aria-label="Editar" onClick={() => openEdit(row)}>
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={row.ativo ? 'Desactivar' : 'Activar'}
                        onClick={() => toggleAtivo(row)}
                      >
                        {row.ativo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && !visible.length ? (
          <div className="empty-state"><Truck size={26} /><strong>Nenhum fornecedor encontrado</strong></div>
        ) : null}
      </div>

      {showModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-title-row">
              <h2>{editing ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
              <button type="button" className="icon-button" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="form-grid" style={{ marginTop: 16 }}>
              <label className="form-span-2">
                <span>Nome comercial *</span>
                <input value={form.nome_fantasia} onChange={(e) => setPF('nome_fantasia', e.target.value)} placeholder="Nome do fornecedor" />
              </label>
              <label>
                <span>Razão social</span>
                <input value={form.razao_social} onChange={(e) => setPF('razao_social', e.target.value)} placeholder="Razão social" />
              </label>
              <label>
                <span>NIF</span>
                <input value={form.nif} onChange={(e) => setPF('nif', e.target.value)} placeholder="Número de identificação fiscal" />
              </label>
              <label>
                <span>Telefone</span>
                <input value={form.telefone} onChange={(e) => setPF('telefone', e.target.value)} placeholder="+244 9xx xxx xxx" />
              </label>
              <label>
                <span>Pessoa de contacto</span>
                <input value={form.contacto} onChange={(e) => setPF('contacto', e.target.value)} placeholder="Nome do responsável" />
              </label>
              <label>
                <span>Email</span>
                <input type="email" value={form.email} onChange={(e) => setPF('email', e.target.value)} placeholder="email@fornecedor.com" />
              </label>
              <label className="form-span-2">
                <span>Endereço</span>
                <input value={form.endereco} onChange={(e) => setPF('endereco', e.target.value)} placeholder="Morada completa" />
              </label>
            </div>
            {error ? <p className="form-error" style={{ marginTop: 8 }}>{error}</p> : null}
            <div className="modal-actions">
              <button type="button" className="soft-button" onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="button" className="primary-button" onClick={save} disabled={saving}>
                {saving ? 'A guardar...' : 'Guardar'}
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

export default Fornecedores;

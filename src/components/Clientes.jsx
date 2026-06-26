import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Pencil, PlusCircle, Search, ShoppingBag, Trash2, UserRound, UsersRound, WalletCards } from 'lucide-react';
import { formatKwanza } from '../data/pharmacyData.mjs';
import { request } from '../services/ipcClient.js';
import { confirmDelete } from '../utils/confirmations.mjs';
import { CATALOG_KEYS } from '../configuration/catalogKeys.mjs';
import { useCatalog } from '../configuration/SettingsContext';

const EMPTY_FORM = { name: '', nif: '', phone: '', email: '', creditLimit: '', status: 'Activo', address: '' };

function formatLastPurchase(isoDate) {
  if (!isoDate) return '-';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

function mapCliente(c) {
  return {
    id: c.id,
    name: c.nome,
    nif: c.nif || '',
    phone: c.telefone || '',
    email: c.email || '',
    address: c.endereco || '',
    status: c.status || 'Activo',
    openCredit: c.creditoAberto || 0,
    totalPurchases: c.totalCompras || 0,
    lastPurchase: formatLastPurchase(c.ultimaCompra),
    createdAt: c.data_cadastro || '',
  };
}

function buildMetrics(rows, today) {
  const todayStr = today.slice(0, 10);
  const monthStr = todayStr.slice(0, 7);
  return {
    activeClients: rows.filter((r) => r.status === 'Activo').length,
    purchasesToday: rows.filter((r) => r.lastPurchase && r.lastPurchase.split('/').reverse().join('-') === todayStr).length,
    openCredit: rows.reduce((s, r) => s + Number(r.openCredit || 0), 0),
    newThisMonth: rows.filter((r) => String(r.createdAt || '').startsWith(monthStr)).length,
  };
}

function filterClients(rows, query) {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    [r.name, r.nif, r.phone, r.status].filter(Boolean).join(' ').toLowerCase().includes(q),
  );
}

function Clientes() {
  const clientStatuses = useCatalog(CATALOG_KEYS.CLIENT_STATUSES);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const metrics = useMemo(() => buildMetrics(rows, today), [rows, today]);
  const visibleRows = useMemo(() => filterClients(rows, query), [query, rows]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request('clientes.list', {});
      setRows(data.map(mapCliente));
    } catch (err) {
      console.error('Erro ao carregar clientes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  function openNewClient() {
    setEditingClient(null);
    setFormData(EMPTY_FORM);
    setShowModal(true);
  }

  function openEditClient(client) {
    setEditingClient(client);
    setFormData({
      name: client.name || '',
      nif: client.nif || '',
      phone: client.phone || '',
      email: client.email || '',
      creditLimit: client.openCredit ?? '',
      status: client.status || 'Activo',
      address: client.address || '',
    });
    setSaving(false);
    setShowModal(true);
  }

  async function saveClient() {
    setSaving(true);
    try {
      const payload = {
        nome: formData.name,
        nif: formData.nif,
        telefone: formData.phone,
        email: formData.email,
        endereco: formData.address,
        status: formData.status,
        limite_credito: Number(formData.creditLimit) || 0,
      };
      if (editingClient) {
        await request('clientes.update', { id: editingClient.id, ...payload });
      } else {
        await request('clientes.create', payload);
      }
      await loadClients();
      setShowModal(false);
    } catch (err) {
      alert(err?.message || 'Erro ao guardar cliente.');
    } finally {
      setSaving(false);
    }
  }

  async function removeClient(client) {
    if (!(await confirmDelete(`o cliente ${client.name}`))) return;
    try {
      await request('clientes.delete', { id: client.id });
      loadClients();
    } catch (err) {
      alert(err?.message || 'Erro ao remover cliente.');
    }
  }

  function exportClientsExcel() {
    const headers = ['ID', 'Nome', 'Telefone', 'NIF', 'Email', 'Endereço', 'Status', 'Limite de Crédito'];
    const dataRows = visibleRows.map((r) => [
      r.id, r.name, r.phone || '', r.nif || '', r.email || '',
      r.address || '', r.status || '', r.openCredit ?? '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, `clientes-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <section className="standard-screen">
      <div className="standard-metrics">
        <Metric title="Clientes Activos" value={metrics.activeClients} icon={UsersRound} />
        <Metric title="Compras Hoje" value={metrics.purchasesToday} icon={ShoppingBag} />
        <Metric title="Credito em Aberto" value={formatKwanza(metrics.openCredit)} icon={WalletCards} />
        <Metric title="Novos no Mes" value={metrics.newThisMonth} icon={UserRound} />
      </div>

      <div className="panel table-panel">
        <div className="panel-title-row">
          <h2>Clientes</h2>
          <div className="stock-toolbar-actions">
            <label className="compact-search">
              <Search size={17} />
              <input
                aria-label="Pesquisar clientes"
                placeholder="Pesquisar cliente"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button type="button" onClick={openNewClient}><PlusCircle size={17} /> Novo Cliente</button>
            <button type="button" onClick={exportClientsExcel}><Download size={17} /> Exportar</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nome</th>
              <th>Telefone</th>
              <th>NIF</th>
              <th>Ultima Compra</th>
              <th>Compras</th>
              <th>Credito</th>
              <th>Status</th>
              <th>Opcoes</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((client) => (
              <tr key={client.id}>
                <td>{client.id}</td>
                <td>{client.name}</td>
                <td>{client.phone}</td>
                <td>{client.nif}</td>
                <td>{client.lastPurchase}</td>
                <td>{client.totalPurchases}</td>
                <td>{formatKwanza(client.openCredit)}</td>
                <td><span className={client.status === 'Activo' ? 'status paid' : 'status waiting'}>{client.status}</span></td>
                <td className="options-cell">
                  <button className="icon-button" type="button" aria-label="Editar cliente" onClick={() => openEditClient(client)}><Pencil size={16} /></button>
                  <button className="icon-button danger" type="button" aria-label="Remover cliente" onClick={() => removeClient(client)}><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visibleRows.length && (
          <div className="empty-state">
            <UserRound size={28} />
            <strong>Nenhum cliente encontrado</strong>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card wide">
            <div className="modal-title-row">
              <h2>{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <button type="button" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="form-grid">
              <label><span>Nome completo</span><input value={formData.name} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} /></label>
              <label><span>NIF</span><input value={formData.nif} onChange={(e) => setFormData((f) => ({ ...f, nif: e.target.value }))} /></label>
              <label><span>Telefone</span><input value={formData.phone} onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))} /></label>
              <label><span>Email</span><input type="email" value={formData.email} onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))} /></label>
              <label><span>Limite de crédito (AKZ)</span><input type="number" min="0" value={formData.creditLimit} onChange={(e) => setFormData((f) => ({ ...f, creditLimit: e.target.value }))} /></label>
              <label>
                <span>Estado</span>
                <select value={formData.status} onChange={(e) => setFormData((f) => ({ ...f, status: e.target.value }))}>
                  {clientStatuses.map((s) => <option key={s.code} value={s.name}>{s.name}</option>)}
                </select>
              </label>
              <label className="form-span-2"><span>Endereço</span><textarea value={formData.address} onChange={(e) => setFormData((f) => ({ ...f, address: e.target.value }))} /></label>
            </div>
            <div className="modal-actions">
              <button type="button" className="soft-button" onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="button" className="primary-button" disabled={saving} onClick={saveClient}>{saving ? '...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ title, value, icon: Icon }) {
  return (
    <div className="standard-metric green">
      <span><Icon size={32} /></span>
      <div>
        <h2>{title}</h2>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

export default Clientes;

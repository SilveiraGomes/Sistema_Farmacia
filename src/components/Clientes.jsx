import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Pencil, PlusCircle, Search, ShoppingBag, Trash2, UserRound, UsersRound, WalletCards } from 'lucide-react';
import { buildClientMetrics, clients, filterClientsForManagement, formatKwanza } from '../data/pharmacyData.mjs';
import { confirmDelete } from '../utils/confirmations.mjs';
import { CATALOG_KEYS } from '../configuration/catalogKeys.mjs';
import { useCatalog } from '../configuration/SettingsContext';

const EMPTY_FORM = { name: '', nif: '', phone: '', email: '', creditLimit: '', status: 'Activo', address: '' };

function Clientes() {
  const clientStatuses = useCatalog(CATALOG_KEYS.CLIENT_STATUSES);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [rows, setRows] = useState(clients);
  const [query, setQuery] = useState('');
  const metrics = useMemo(() => buildClientMetrics(rows, '2026-06-15'), [rows]);
  const visibleRows = useMemo(() => filterClientsForManagement(rows, query), [query, rows]);

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
    setShowModal(true);
  }

  function saveClient() {
    if (editingClient) {
      setRows((current) =>
        current.map((r) => r.id === editingClient.id ? { ...r, ...formData, openCredit: Number(formData.creditLimit) || 0 } : r)
      );
    } else {
      setRows((current) => [...current, { id: Date.now(), ...formData, openCredit: Number(formData.creditLimit) || 0, totalPurchases: 0, lastPurchase: '-' }]);
    }
    setShowModal(false);
  }

  async function removeClient(client) {
    if (!(await confirmDelete(`o cliente ${client.name}`))) {
      return;
    }

    setRows((current) => current.filter((row) => row.id !== client.id));
  }

  function exportClientsExcel() {
    const headers = ['ID', 'Nome', 'Telefone', 'NIF', 'Email', 'Endereço', 'Status', 'Limite de Crédito'];
    const dataRows = visibleRows.map((r) => [
      r.id, r.name, r.phone || '', r.nif || '', r.email || '',
      r.address || '', r.status || '', r.creditLimit ?? '',
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
              <label>Nome completo<input value={formData.name} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} /></label>
              <label>NIF<input value={formData.nif} onChange={(e) => setFormData((f) => ({ ...f, nif: e.target.value }))} /></label>
              <label>Telefone<input value={formData.phone} onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))} /></label>
              <label>Email<input type="email" value={formData.email} onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))} /></label>
              <label>Limite de crédito (AKZ)<input type="number" min="0" value={formData.creditLimit} onChange={(e) => setFormData((f) => ({ ...f, creditLimit: e.target.value }))} /></label>
              <label>
                Estado
                <select value={formData.status} onChange={(e) => setFormData((f) => ({ ...f, status: e.target.value }))}>
                  {clientStatuses.map((s) => <option key={s.code} value={s.name}>{s.name}</option>)}
                </select>
              </label>
              <label>Endereço<textarea value={formData.address} onChange={(e) => setFormData((f) => ({ ...f, address: e.target.value }))} /></label>
            </div>
            <div className="modal-actions">
              <button type="button" className="soft-button" onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="button" className="primary-button" onClick={saveClient}>Guardar</button>
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

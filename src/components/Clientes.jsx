import React, { useMemo, useState } from 'react';
import { Download, Pencil, PlusCircle, Search, ShoppingBag, Trash2, UserRound, UsersRound, WalletCards } from 'lucide-react';
import { buildClientMetrics, clients, filterClientsForManagement, formatKwanza } from '../data/pharmacyData.mjs';
import { confirmDelete } from '../utils/confirmations.mjs';

function Clientes() {
  const [showModal, setShowModal] = useState(false);
  const [rows, setRows] = useState(clients);
  const [query, setQuery] = useState('');
  const metrics = useMemo(() => buildClientMetrics(rows, '2026-06-15'), [rows]);
  const visibleRows = useMemo(() => filterClientsForManagement(rows, query), [query, rows]);

  async function removeClient(client) {
    if (!(await confirmDelete(`o cliente ${client.name}`))) {
      return;
    }

    setRows((current) => current.filter((row) => row.id !== client.id));
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
            <button type="button" onClick={() => setShowModal(true)}><PlusCircle size={17} /> Novo Cliente</button>
            <button type="button"><Download size={17} /> Exportar</button>
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
                  <button className="icon-button" type="button" aria-label="Editar cliente" onClick={() => setShowModal(true)}><Pencil size={16} /></button>
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
              <h2>Novo Cliente</h2>
              <button type="button" onClick={() => setShowModal(false)}>x</button>
            </div>
            <div className="form-grid">
              <input placeholder="Nome completo" />
              <input placeholder="NIF" />
              <input placeholder="Telefone" />
              <input placeholder="Email" />
              <input placeholder="Limite de credito" type="number" />
              <select defaultValue="Activo"><option>Activo</option><option>Pendente</option><option>Inactivo</option></select>
              <textarea placeholder="Endereco" />
            </div>
            <div className="modal-actions">
              <button type="button" className="soft-button" onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="button" className="primary-button" onClick={() => setShowModal(false)}>Guardar</button>
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

import React from 'react';

export default function InventarioA4({ rows, counts, result, pharmacyName, responsavel, printedAt }) {
  const date = printedAt ? new Date(printedAt).toLocaleDateString('pt-PT') : new Date().toLocaleDateString('pt-PT');
  const time = printedAt ? new Date(printedAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="inventory-a4">
      <header className="inventory-a4-header">
        <div>
          <h1>{pharmacyName || 'Farmácia'}</h1>
          <h2>Documento de Inventário</h2>
        </div>
        <div className="inventory-a4-meta">
          <span>Data: {date}</span>
          <span>Hora: {time}</span>
          <span>Responsável: {responsavel || '—'}</span>
        </div>
      </header>

      <table className="inventory-a4-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Produto</th>
            <th>Categoria</th>
            <th>Qtd. Sistema</th>
            <th>Qtd. Contada</th>
            <th>Diferença</th>
            <th>Prateleira</th>
            <th>Gaveta</th>
            <th>Zona</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const counted = counts?.[item.id] !== undefined ? Number(counts[item.id]) : null;
            const diff = counted !== null ? counted - item.quantity : null;
            return (
              <tr key={item.id} className={diff !== null && diff !== 0 ? 'inventory-a4-diff' : ''}>
                <td>{item.id}</td>
                <td>{item.name}</td>
                <td>{item.category || '—'}</td>
                <td>{item.quantity}</td>
                <td>{counted !== null ? counted : '—'}</td>
                <td>{diff !== null ? (diff > 0 ? `+${diff}` : diff) : '—'}</td>
                <td>{item.prateleira || '—'}</td>
                <td>{item.gaveta || '—'}</td>
                <td>{item.zona || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {result && (
        <div className="inventory-a4-summary">
          <span>Total: {result.totalItems} produtos</span>
          <span>Contados: {result.countedItems}</span>
          <span>Correctos: {result.correctItems}</span>
          <span>Com diferença: {result.differenceItems}</span>
        </div>
      )}

      <footer className="inventory-a4-footer">
        <div className="inventory-a4-signature">
          <div>
            <span>Responsável</span>
            <span>___________________________</span>
            <small>{responsavel}</small>
          </div>
          <div>
            <span>Aprovado por</span>
            <span>___________________________</span>
          </div>
        </div>
        <small>Impresso em {date} às {time}</small>
      </footer>
    </div>
  );
}

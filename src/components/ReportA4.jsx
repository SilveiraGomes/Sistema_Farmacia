import React from 'react';
import { formatKwanza } from '../data/pharmacyData.mjs';

function formatCell(value, type) {
  if (type === 'money') return formatKwanza(value).replace('KZ ', '');
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function formatFilterLabel(key) {
  const labels = {
    startDate: 'Data inicial',
    endDate: 'Data final',
    date: 'Data',
    compareStartDate: 'Comparar de',
    compareEndDate: 'Comparar ate',
    shift: 'Turno',
    category: 'Categoria',
    paymentMethod: 'Pagamento',
    query: 'Pesquisa',
    status: 'Status',
    type: 'Tipo',
    referenceDate: 'Referencia',
  };

  return labels[key] ?? key;
}

function formatFilterValue(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  return String(value);
}

function ReportA4({ report, branding, settings, printedBy }) {
  const activeFilters = Object.entries(report.filters ?? {})
    .map(([key, value]) => ({ key, label: formatFilterLabel(key), value: formatFilterValue(value) }))
    .filter((item) => item.value && item.value !== 'Todos');
  const companyName = settings.companyName || branding.pharmacyName;

  return (
    <article className="report-a4-page" aria-label={`${report.title} ${report.filters?.startDate || ''}`}>
      <header className="report-a4-header">
        <section className="report-a4-company">
          {branding.logoDataUrl ? <img className="report-a4-logo" src={branding.logoDataUrl} alt="" /> : null}
          <h1>{companyName}</h1>
          {settings.companyActivity ? <p>{settings.companyActivity}</p> : null}
          {settings.pharmacyTaxId ? <p><span>NIF:</span> {settings.pharmacyTaxId}</p> : null}
          {settings.pharmacyAddress ? <p>{settings.pharmacyAddress}</p> : null}
          {settings.pharmacyCity ? <p>{settings.pharmacyCity}</p> : null}
          {settings.pharmacyPhone ? <p><span>TEL:</span> {settings.pharmacyPhone}</p> : null}
          {settings.pharmacyEmail ? <p><span>EMAIL:</span> {settings.pharmacyEmail}</p> : null}
        </section>

        <section className="report-a4-document-box">
          <span>Relatorio</span>
          <h2>{report.title}</h2>
          <small>{report.mode === 'comparison' ? 'Comparativo' : report.mode === 'table' ? 'Detalhado' : 'Periodo'}</small>
        </section>
      </header>

      <section className="report-a4-filters">
        {activeFilters.length ? activeFilters.map((item) => (
          <span key={item.key}>
            <b>{item.label}</b>
            {item.value}
          </span>
        )) : (
          <span>
            <b>Filtros</b>
            Todos
          </span>
        )}
      </section>

      {report.comparison ? (
        <section className="report-a4-comparison">
          {Object.entries(report.comparison).map(([key, value]) => (
            <span key={key}>{formatFilterLabel(key)}: {formatCell(value)}</span>
          ))}
        </section>
      ) : null}

      <section className="report-a4-kpis">
        {report.kpis.map((item) => (
          <div key={item.key || item.label}>
            <span>{item.label}</span>
            <strong>{formatCell(item.value, item.type)}</strong>
          </div>
        ))}
      </section>

      <table className="report-a4-table">
        <thead>
          <tr>
            {report.columns.map((column) => <th key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row, index) => (
            <tr key={`${report.id}-${index}`}>
              {report.columns.map((column) => (
                <td key={column.key}>{formatCell(row[column.key], column.type)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {!report.rows.length ? <p className="report-a4-empty">Sem dados para os filtros selecionados.</p> : null}

      <footer className="report-a4-footer">
        <span>Impresso por {printedBy}</span>
        <span>{report.generatedAt}</span>
        <span>{settings.fiscalRegime}</span>
      </footer>
    </article>
  );
}

export default ReportA4;

import React from 'react';
import { formatKwanza } from '../data/pharmacyData.mjs';

function formatCell(value, type) {
  if (type === 'money') return formatKwanza(value).replace('KZ ', '');
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function ReportA4({ report, branding, settings, printedBy }) {
  return (
    <article className="report-a4-page" aria-label={`${report.title} ${report.filters?.startDate || ''}`}>
      <header className="report-a4-header">
        <section className="report-a4-company">
          {branding.logoDataUrl ? <img className="report-a4-logo" src={branding.logoDataUrl} alt="" /> : null}
          <p className="report-a4-company-text">{settings.documentHeaderText}</p>
        </section>

        <section className="report-a4-document-box">
          <span>Relatório</span>
          <h2>{report.title}</h2>
          {report.filters?.startDate ? (
            <small>{report.filters.startDate}{report.filters.endDate ? ` — ${report.filters.endDate}` : ''}</small>
          ) : null}
        </section>
      </header>

      <h2 className="report-a4-data-title">{report.title}</h2>

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

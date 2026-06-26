import React from 'react';
import { formatKwanza } from '../data/pharmacyData.mjs';

function formatMoney(value) {
  return formatKwanza(value).replace('KZ ', '');
}

function InvoiceA4({ viewModel }) {
  return (
    <article className="invoice-a4-page" aria-label={`${viewModel.document.title} ${viewModel.document.number}`}>
      <header className="invoice-a4-header">
        <section className="invoice-a4-company">
          {viewModel.header.logoDataUrl ? (
            <img className="invoice-a4-company-logo" src={viewModel.header.logoDataUrl} alt="" />
          ) : null}
          <p className="invoice-a4-company-text">{viewModel.header.documentHeaderText}</p>
        </section>

        <section className="invoice-a4-document-box">
          <span>{viewModel.document.viaLabel}</span>
          <h2>{viewModel.document.title}</h2>
          <strong>{viewModel.document.number}</strong>
          {viewModel.document.isCancelled ? <em>Anulado</em> : null}
          {viewModel.settings.showQrCode ? <div className="invoice-a4-qr" aria-label="QR code fiscal">QR</div> : null}
        </section>
      </header>

      <section className="invoice-a4-client">
        <h3>Exmo.(s) Sr.(s)</h3>
        <strong>{viewModel.client.name}</strong>
        {viewModel.client.taxId ? <span>Contribuinte: {viewModel.client.taxId}</span> : null}
        {viewModel.client.phone ? <span>Telefone: {viewModel.client.phone}</span> : null}
        {viewModel.client.address ? <span>{viewModel.client.address}</span> : null}
      </section>

      <section className="invoice-a4-meta">
        <span><strong>Data Emissao</strong>{viewModel.document.issueDate}</span>
        <span><strong>Data Vencimento</strong>{viewModel.document.dueDate || '-'}</span>
        <span><strong>Moeda</strong>{viewModel.document.currency}</span>
        <span><strong>Condicao Pagamento</strong>{viewModel.document.paymentCondition || '-'}</span>
      </section>

      <table className="invoice-a4-items">
        <colgroup>
          <col style={{ width: '10%' }} />
          <col style={{ width: '52%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '15%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Codigo</th>
            <th>Descricao</th>
            <th>Qtd.</th>
            <th>Preco Unit.</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {viewModel.items.map((item) => (
            <tr key={`${item.code}-${item.description}`}>
              <td>{item.code}</td>
              <td>{item.description}</td>
              <td>{item.quantity}</td>
              <td>{formatMoney(item.unitPrice)}</td>
              <td>{formatMoney(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="invoice-a4-summary">
        <table className="invoice-a4-tax-summary">
          <caption>Quadro Resumo de Imposto</caption>
          <thead>
            <tr>
              <th>Descricao</th>
              <th>Incidencia</th>
              <th>Taxa %</th>
              <th>Imposto</th>
            </tr>
          </thead>
          <tbody>
            {viewModel.totals.taxSummary.map((row) => (
              <tr key={`${row.designation}-${row.taxRate}`}>
                <td>{row.designation}</td>
                <td>{formatMoney(row.incidence)}</td>
                <td>{row.taxRate}</td>
                <td>{formatMoney(row.taxValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-a4-totals">
          <span><strong>Subtotal</strong>{formatMoney(viewModel.totals.subtotal)}</span>
          <span><strong>Desconto</strong>{formatMoney(viewModel.totals.discount)}</span>
          <span><strong>Imposto</strong>{formatMoney(viewModel.totals.tax)}</span>
          <span><strong>Retencao</strong>{formatMoney(viewModel.totals.retention)}</span>
          <span className="invoice-a4-grand-total"><strong>Total (Kz)</strong>{formatMoney(viewModel.totals.total)}</span>
        </div>
      </section>

      {viewModel.totals.totalInWords ? (
        <p className="invoice-a4-total-words">Sao: {viewModel.totals.totalInWords}</p>
      ) : null}

      {viewModel.settings.bankAccounts.length ? (
        <section className="invoice-a4-bank-accounts">
          <h3>Coordenadas Bancarias</h3>
          <div className="invoice-a4-bank-list">
            {viewModel.settings.bankAccounts.map((account) => (
              <div className="invoice-a4-bank-account" key={`${account.bank}-${account.account}-${account.iban}`}>
                <p className="invoice-a4-bank-line bank"><strong>BANCO:</strong><span>{account.bank}</span></p>
                <p className="invoice-a4-bank-line"><span>Conta N.:</span><span>{account.account}</span></p>
                <p className="invoice-a4-bank-line"><span>IBAN:</span><span>{account.iban}</span></p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {viewModel.document.proformaNotice ? <p className="invoice-a4-notice">{viewModel.document.proformaNotice}</p> : null}

      <footer className="invoice-a4-footer">
        <strong>{viewModel.footer.fiscalReference}</strong>
        <span>Impresso por {viewModel.footer.printedBy} em {viewModel.footer.printedAt}</span>
        <span>{viewModel.settings.fiscalRegime}</span>
      </footer>
    </article>
  );
}

export default InvoiceA4;

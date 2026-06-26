import React, { useState, useEffect } from 'react';
import { formatKwanza } from '../data/pharmacyData.mjs';

function formatMoney(value) {
  return formatKwanza(value).replace('KZ ', '');
}

function formatDisplayDate(str) {
  if (!str) return '-';
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}`;
    }
  } catch {}
  return String(str);
}

function useQrDataUrl(viewModel) {
  const [qrUrl, setQrUrl] = useState('');
  useEffect(() => {
    if (!viewModel.settings?.showQrCode) return;
    let cancelled = false;
    import('qrcode').then(mod => {
      const QRCode = mod.default || mod;
      const text = [
        viewModel.document?.number || '',
        viewModel.document?.issueDate || '',
        String(viewModel.totals?.total || 0),
        viewModel.header?.companyNif || '',
      ].join(';');
      return QRCode.toDataURL(text, { width: 60, margin: 1 });
    }).then(url => {
      if (!cancelled) setQrUrl(url);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [viewModel.document?.number]);
  return qrUrl;
}

function InvoiceA4({ viewModel }) {
  const qrDataUrl = useQrDataUrl(viewModel);
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
          {viewModel.settings.showQrCode ? (
            qrDataUrl
              ? <img className="invoice-a4-qr" src={qrDataUrl} alt="QR code fiscal" />
              : <div className="invoice-a4-qr" aria-label="QR code fiscal">QR</div>
          ) : null}
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
        <span><strong>Data Emissao</strong>{formatDisplayDate(viewModel.document.issueDate)}</span>
        <span><strong>Data Vencimento</strong>{viewModel.document.dueDate ? formatDisplayDate(viewModel.document.dueDate) : '-'}</span>
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
        <span>Impresso por: {viewModel.footer.printedBy}</span>
        <span>Data: {formatDisplayDate(viewModel.footer.printedAt)}</span>
        <span>Regime Fiscal: {viewModel.settings.fiscalRegime}</span>
      </footer>
    </article>
  );
}

export default InvoiceA4;

import React, { useState } from 'react';
import { BellRing, Building2, CreditCard, FileText, ImagePlus, Percent, Save, Settings } from 'lucide-react';
import {
  getStoredBranding,
  saveStoredBranding,
} from '../data/branding.mjs';
import {
  getStoredInvoiceA4Settings,
  saveStoredInvoiceA4Settings,
} from '../data/invoiceSettings.mjs';

const settings = [
  {
    id: 'pharmacy',
    title: 'Dados da Farmácia',
    description: 'Nome, NIF, endereço e contactos',
    status: 'Configurado',
    icon: Building2,
  },
  {
    id: 'payments',
    title: 'Formas de Pagamento',
    description: 'Dinheiro, TPA, transferência e crédito',
    status: '4 activas',
    icon: CreditCard,
  },
  {
    id: 'alerts',
    title: 'Alertas de Estoque',
    description: 'Limites mínimos e validade próxima',
    status: 'Activo',
    icon: BellRing,
  },
  {
    id: 'taxes',
    title: 'Impostos e Descontos',
    description: 'Taxas, descontos autorizados e arredondamento',
    status: 'Revisar',
    icon: Percent,
  },
  {
    id: 'invoiceA4',
    title: 'Modelo de Factura A4',
    description: 'Rodape fiscal, QR code, series e contas bancarias',
    status: 'A4 activo',
    icon: FileText,
  },
];

function Configuracoes() {
  const [activeSetting, setActiveSetting] = useState(null);
  const [branding, setBranding] = useState(() => getStoredBranding());
  const [invoiceA4Settings, setInvoiceA4Settings] = useState(() => getStoredInvoiceA4Settings());

  function handleSaveBranding(nextBranding) {
    setBranding(saveStoredBranding(nextBranding));
    setActiveSetting(null);
  }

  function handleSaveDocumentHeader(nextSettings, logoDataUrl) {
    setInvoiceA4Settings(saveStoredInvoiceA4Settings(nextSettings));
    setBranding(saveStoredBranding({ ...branding, logoDataUrl }));
    setActiveSetting(null);
  }

  return (
    <section className="standard-screen settings-screen">
      <div className="settings-grid">
        {settings.map((setting) => (
          <button
            className="settings-card panel"
            type="button"
            key={setting.id}
            onClick={() => setActiveSetting(setting)}
          >
            <span><setting.icon size={32} /></span>
            <div>
              <h2>{setting.title}</h2>
              <p>{setting.description}</p>
              <strong>{setting.status}</strong>
            </div>
          </button>
        ))}
      </div>

      <div className="panel table-panel">
        <div className="panel-title-row">
          <h2>Preferências do Sistema</h2>
          <button type="button" className="primary-button">
            <Save size={18} />
            Guardar Alterações
          </button>
        </div>
        <div className="settings-form">
          <label><span>Moeda padrão</span><input defaultValue="Kwanza (KZ)" /></label>
          <label><span>Factura inicial</span><input defaultValue="FAT027/26" /></label>
          <label><span>Limite baixo estoque</span><input defaultValue="25" type="number" /></label>
          <label>
            <span>Backup automático</span>
            <select defaultValue="diario">
              <option value="diario">Diário</option>
              <option value="semanal">Semanal</option>
            </select>
          </label>
        </div>
      </div>

      {activeSetting && (
        <SettingsModal
          branding={branding}
          invoiceA4Settings={invoiceA4Settings}
          onClose={() => setActiveSetting(null)}
          onSaveBranding={handleSaveBranding}
          onSaveDocumentHeader={handleSaveDocumentHeader}
          setting={activeSetting}
        />
      )}
    </section>
  );
}

function SettingsModal({
  branding,
  invoiceA4Settings,
  setting,
  onClose,
  onSaveBranding,
  onSaveDocumentHeader,
}) {
  const [logoPreview, setLogoPreview] = useState(branding.logoDataUrl);
  const [pharmacyName, setPharmacyName] = useState(branding.pharmacyName);
  const [invoiceSettingsForm, setInvoiceSettingsForm] = useState(invoiceA4Settings);

  function previewLogo(event) {
    const file = event.target.files?.[0];
    if (!file) {
      setLogoPreview('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setLogoPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  function handleSave() {
    if (setting.id === 'pharmacy') {
      onSaveBranding({
        pharmacyName,
        logoDataUrl: logoPreview,
      });
      return;
    }

    if (setting.id === 'invoiceA4') {
      onSaveDocumentHeader(invoiceSettingsForm, logoPreview);
      return;
    }

    onClose();
  }

  function updateInvoiceSettings(field, value) {
    setInvoiceSettingsForm((current) => ({ ...current, [field]: value }));
  }

  function updateBankAccount(index, field, value) {
    setInvoiceSettingsForm((current) => ({
      ...current,
      bankAccounts: current.bankAccounts.map((account, accountIndex) => (
        accountIndex === index ? { ...account, [field]: value } : account
      )),
    }));
  }

  function addBankAccount() {
    setInvoiceSettingsForm((current) => ({
      ...current,
      bankAccounts: [...current.bankAccounts, { bank: '', account: '', iban: '' }],
    }));
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card wide">
        <div className="modal-title-row">
          <h2>{setting.title}</h2>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <div className="form-grid">
          {setting.id === 'pharmacy' && (
            <>
              <label className="image-picker">
                <span className={logoPreview ? 'image-preview' : 'image-preview empty'}>
                  {logoPreview ? <img src={logoPreview} alt="Pré-visualização do logo" /> : <ImagePlus size={34} />}
                </span>
                <input type="file" accept="image/*" onChange={previewLogo} />
                <strong>Inserir logo da empresa</strong>
              </label>
              <input
                value={pharmacyName}
                onChange={(event) => setPharmacyName(event.target.value)}
                placeholder="Nome da farmacia"
              />
              <input placeholder="NIF" />
              <input placeholder="Telefone" />
              <input placeholder="Email" />
              <textarea placeholder="Endereço completo" />
            </>
          )}

          {setting.id === 'payments' && (
            <>
              <label className="check-row"><input type="checkbox" defaultChecked /> Dinheiro</label>
              <label className="check-row"><input type="checkbox" defaultChecked /> TPA</label>
              <label className="check-row"><input type="checkbox" defaultChecked /> Transferência</label>
              <label className="check-row"><input type="checkbox" defaultChecked /> Crédito do cliente</label>
              <input placeholder="Conta bancária padrão" />
              <input placeholder="Terminal TPA" />
            </>
          )}

          {setting.id === 'alerts' && (
            <>
              <input type="number" defaultValue="25" placeholder="Limite baixo estoque" />
              <input type="number" defaultValue="30" placeholder="Dias para alerta de validade" />
              <select defaultValue="sim">
                <option value="sim">Mostrar alertas no Dashboard</option>
                <option value="nao">Não mostrar no Dashboard</option>
              </select>
              <textarea placeholder="Mensagem do alerta" />
            </>
          )}

          {setting.id === 'taxes' && (
            <>
              <input type="number" defaultValue="0" placeholder="Imposto padrão (%)" />
              <input type="number" defaultValue="580.20" placeholder="Desconto máximo sem autorização" />
              <select defaultValue="centimos">
                <option value="centimos">Arredondar por cêntimos</option>
                <option value="unidade">Arredondar por unidade</option>
              </select>
              <textarea placeholder="Observações fiscais" />
            </>
          )}

          {setting.id === 'invoiceA4' && (
            <>
              <label className="settings-document-header-field">
                <span>Dados da empresa</span>
                <textarea
                  value={invoiceSettingsForm.documentHeaderText}
                  onChange={(event) => updateInvoiceSettings('documentHeaderText', event.target.value)}
                  placeholder={'Nome da empresa\nActividade\nNIF\nEndereco\nContactos'}
                />
              </label>
              <label className="image-picker settings-document-logo">
                <span className={logoPreview ? 'image-preview' : 'image-preview empty'}>
                  {logoPreview ? <img src={logoPreview} alt="Pre-visualizacao do logotipo" /> : <ImagePlus size={34} />}
                </span>
                <input type="file" accept="image/*" onChange={previewLogo} />
                <strong>Inserir logotipo</strong>
              </label>
              <input
                value={invoiceSettingsForm.validationNumber}
                onChange={(event) => updateInvoiceSettings('validationNumber', event.target.value)}
                placeholder="Numero de validacao AGT"
              />
              <input
                value={invoiceSettingsForm.softwareName}
                onChange={(event) => updateInvoiceSettings('softwareName', event.target.value)}
                placeholder="Nome do software"
              />
              <input
                value={invoiceSettingsForm.fiscalRegime}
                onChange={(event) => updateInvoiceSettings('fiscalRegime', event.target.value)}
                placeholder="Regime fiscal"
              />
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={invoiceSettingsForm.showQrCode}
                  onChange={(event) => updateInvoiceSettings('showQrCode', event.target.checked)}
                />
                Mostrar QR code
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={invoiceSettingsForm.showTotalInWords}
                  onChange={(event) => updateInvoiceSettings('showTotalInWords', event.target.checked)}
                />
                Mostrar total por extenso
              </label>
              <div className="settings-bank-accounts">
                {invoiceSettingsForm.bankAccounts.map((account, index) => (
                  <div className="settings-bank-row" key={`bank-${index}`}>
                    <input
                      value={account.bank}
                      onChange={(event) => updateBankAccount(index, 'bank', event.target.value)}
                      placeholder="Banco"
                    />
                    <input
                      value={account.account}
                      onChange={(event) => updateBankAccount(index, 'account', event.target.value)}
                      placeholder="Conta"
                    />
                    <input
                      value={account.iban}
                      onChange={(event) => updateBankAccount(index, 'iban', event.target.value)}
                      placeholder="IBAN"
                    />
                  </div>
                ))}
                <button type="button" className="soft-button" onClick={addBankAccount}>Adicionar conta</button>
              </div>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="soft-button" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary-button" onClick={handleSave}>
            <Settings size={18} />
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

export default Configuracoes;

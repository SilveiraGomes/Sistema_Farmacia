import React, { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Boxes,
  Building2,
  CloudUpload,
  CreditCard,
  Database,
  FileText,
  ImagePlus,
  Save,
  Users,
} from "lucide-react";
import { getStoredBranding, saveStoredBranding, subscribeBrandingChange } from '../data/branding.mjs';
import { useSettings } from "../configuration/SettingsContext";
import { CATALOG_KEYS } from "../configuration/catalogKeys.mjs";
import { request } from "../services/ipcClient";
import CatalogEditor from "./settings/CatalogEditor";
import SettingField from "./settings/SettingField";
import SettingsSectionNav from "./settings/SettingsSectionNav";

const SECTIONS = [
  { id: "company", label: "Empresa e documentos", icon: Building2 },
  { id: "sales", label: "Vendas", icon: CreditCard },
  { id: "operation", label: "Operação", icon: Boxes },
  { id: "stock", label: "Stock", icon: Database },
  { id: "finance", label: "Financeiro", icon: FileText },
  { id: "references", label: "Clientes e documentos", icon: Users },
  { id: "alerts", label: "Alertas e backup", icon: BellRing },
  { id: "integracoes", label: "Integrações", icon: CloudUpload },
];

const CATALOGS_BY_SECTION = {
  sales: [CATALOG_KEYS.PAYMENT_METHODS],
  operation: [CATALOG_KEYS.OPERATION_SHIFTS, CATALOG_KEYS.OPERATION_STATUSES],
  stock: [CATALOG_KEYS.STOCK_UNITS, CATALOG_KEYS.PRODUCT_LOCATIONS],
  finance: [
    CATALOG_KEYS.EXPENSE_CATEGORIES,
    CATALOG_KEYS.REVENUE_CATEGORIES,
    CATALOG_KEYS.LOSS_REASONS,
    CATALOG_KEYS.FINANCIAL_ENTRY_TYPES,
    CATALOG_KEYS.FINANCIAL_STATUSES,
  ],
  references: [
    CATALOG_KEYS.CLIENT_STATUSES,
    CATALOG_KEYS.DOCUMENT_TYPES,
    CATALOG_KEYS.DOCUMENT_STATUSES,
  ],
};

const CATALOG_LABELS = {
  payment_methods: "Formas de Pagamento",
  operation_shifts: "Turnos Operacionais",
  operation_statuses: "Estados de Operação",
  stock_units: "Unidades de Medida",
  stock_locations: "Localizações (legado)",
  product_locations: "Localizações de Produtos",
  expense_categories: "Categorias de Despesas",
  revenue_categories: "Categorias de Receitas",
  loss_reasons: "Motivos de Baixa / Perda",
  financial_entry_types: "Tipos de Movimento",
  financial_statuses: "Situações Financeiras",
  client_statuses: "Estados de Cliente",
  document_types: "Tipos de Documento",
  document_statuses: "Estados de Documento",
};

function snapshotValues(snapshot, section) {
  if (section === "company")
    return {
      "company.identity": snapshot.settings.company.identity.value,
      'documents.headerText': snapshot.settings.documents.headerText.value,
      "documents.currency": snapshot.settings.documents.currency.value,
      'documents.fiscal': snapshot.settings.documents.fiscal.value,
      'documents.printOptions': snapshot.settings.documents.printOptions?.value ?? { previewBeforePrint: true, copies: 1 },
    };
  if (section === "sales")
    return Object.fromEntries(
      Object.values(snapshot.settings.sales).map((item) => [
        item.key,
        item.value,
      ]),
    );
  if (section === "stock")
    return Object.fromEntries(
      Object.values(snapshot.settings.stock).map((item) => [
        item.key,
        item.value,
      ]),
    );
  if (section === "alerts")
    return {
      ...Object.fromEntries(
        Object.values(snapshot.settings.alerts).map((item) => [
          item.key,
          item.value,
        ]),
      ),
      "backup.options": snapshot.settings.backup.options.value,
    };
  if (section === "integracoes")
    return {
      'reports.googleSheets': snapshot.settings.reports.googleSheets.value,
    };
  return {};
}

function settingVersions(snapshot, values) {
  const versions = {};
  for (const key of Object.keys(values)) {
    const [group, name] = key.split(".");
    versions[key] = snapshot.settings[group][name].version;
  }
  return versions;
}

export default function Configuracoes() {
  const { snapshot, isLoading, error, readOnly, refresh, applySnapshot } =
    useSettings();
  const [activeSection, setActiveSection] = useState("company");
  const [draft, setDraft] = useState({});
  const [status, setStatus] = useState({ tone: "", message: "" });

  useEffect(() => {
    if (snapshot) setDraft(snapshotValues(snapshot, activeSection));
  }, [activeSection, snapshot]);

  const catalogs = useMemo(
    () => CATALOGS_BY_SECTION[activeSection] || [],
    [activeSection],
  );
  if (isLoading || !snapshot)
    return (
      <section className="standard-screen">
        <p>A carregar configurações...</p>
      </section>
    );

  function update(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus({ tone: "pending", message: "Alteracoes pendentes." });
  }

  async function saveSection() {
    if (!Object.keys(draft).length) return;
    setStatus({ tone: "pending", message: "A guardar..." });
    try {
      const groupedValues = Object.entries(draft).reduce(
        (groups, [key, value]) => {
          const group = key.split(".")[0];
          groups[group] ||= {};
          groups[group][key] = value;
          return groups;
        },
        {},
      );
      let next = snapshot;
      for (const [section, values] of Object.entries(groupedValues)) {
        next = await request("configuration.updateSection", {
          section,
          values,
          expectedVersions: settingVersions(next, values),
        });
      }
      applySnapshot(next);
      if (activeSection === 'company') {
        const identity = draft['company.identity'] || {};
        const { logoDataUrl } = getStoredBranding();
        saveStoredBranding({ pharmacyName: identity.pharmacyName || '', logoDataUrl });
      }
      setStatus({ tone: "success", message: "Configurações guardadas." });
    } catch (cause) {
      setStatus({
        tone: "error",
        message: cause?.message || "Não foi possível guardar.",
      });
    }
  }

  return (
    <section className="standard-screen settings-screen">
      <header className="settings-sync-header panel">
        <div>
          <h1>Configurações</h1>
          <p>Fonte central das preferências e catálogos do sistema.</p>
        </div>
        <span className={`settings-status ${status.tone}`}>
          {status.message ||
            error ||
            (readOnly ? "Somente leitura" : "Sincronizado")}
        </span>
      </header>
      <div className="settings-layout">
        <SettingsSectionNav
          sections={SECTIONS}
          activeSection={activeSection}
          onChange={setActiveSection}
        />
        <main className="settings-workspace panel">
          <SectionFields
            section={activeSection}
            draft={draft}
            update={update}
            snapshot={snapshot}
            disabled={readOnly}
          />
          {Object.keys(draft).length ? (
            <button
              type="button"
              className="primary-button settings-save"
              disabled={readOnly}
              onClick={saveSection}
            >
              <Save size={17} />
              Guardar secção
            </button>
          ) : null}
          {catalogs.map((catalogKey) => (
            <div className="settings-catalog-block" key={catalogKey}>
              <h2>{CATALOG_LABELS[catalogKey] ?? catalogKey}</h2>
              <CatalogEditor
                catalogKey={catalogKey}
                options={snapshot.catalogs[catalogKey]}
                readOnly={
                  readOnly ||
                  !snapshot.definitions.catalogs[catalogKey]?.editable
                }
                onChanged={refresh}
              />
            </div>
          ))}
          {activeSection === "references" ? (
            <p className="settings-origin-note">
              Perfis continuam a vir do servico oficial de perfis; categorias e
              subcategorias continuam nas tabelas de stock.
            </p>
          ) : null}
        </main>
      </div>
    </section>
  );
}

function SectionFields({ section, draft, update, snapshot, disabled }) {
  const [syncStatus, setSyncStatus] = React.useState(null);
  const [syncMessage, setSyncMessage] = React.useState('');

  async function sendNow() {
    setSyncStatus('loading');
    setSyncMessage('');
    try {
      const result = await request('reports.sync.now');
      setSyncStatus('success');
      setSyncMessage(result?.message || 'Dados enviados com sucesso.');
    } catch (err) {
      setSyncStatus('error');
      setSyncMessage(err?.message || 'Erro ao enviar dados.');
    }
  }

  if (section === "company") {
    const identity = draft["company.identity"] || {};
    const fiscal = draft["documents.fiscal"] || {};
    const printOptions = draft["documents.printOptions"] || { previewBeforePrint: true, copies: 1 };
    return (
      <div className="settings-form-grid">
        <SettingField
          label="Nome da farmácia"
          help="Nome apresentado em documentos e na interface"
        >
          <input
            disabled={disabled}
            value={identity.pharmacyName || ""}
            onChange={(e) =>
              update("company.identity", {
                ...identity,
                pharmacyName: e.target.value,
              })
            }
          />
        </SettingField>
        <SettingField label="NIF">
          <input
            disabled={disabled}
            value={identity.taxId || ""}
            onChange={(e) =>
              update("company.identity", { ...identity, taxId: e.target.value })
            }
          />
        </SettingField>
        <LogoPicker identity={identity} disabled={disabled} />
        <SettingField label="Endereço">
          <textarea
            disabled={disabled}
            value={identity.address || ""}
            onChange={(e) =>
              update("company.identity", {
                ...identity,
                address: e.target.value,
              })
            }
          />
        </SettingField>
        <SettingField label="Cabeçalho documental">
          <textarea
            disabled={disabled}
            value={draft["documents.headerText"] || ""}
            onChange={(e) => update("documents.headerText", e.target.value)}
          />
        </SettingField>
        <SettingField label="Moeda">
          <input
            disabled={disabled}
            value={draft["documents.currency"] || ""}
            onChange={(e) => update("documents.currency", e.target.value)}
          />
        </SettingField>
        <SettingField label="Número de validação AGT">
          <input
            disabled={disabled}
            value={fiscal.validationNumber || ""}
            onChange={(e) =>
              update("documents.fiscal", {
                ...fiscal,
                validationNumber: e.target.value,
              })
            }
          />
        </SettingField>
        <SettingField label="Nome do software">
          <input
            disabled={disabled}
            value={fiscal.softwareName || ""}
            onChange={(e) =>
              update("documents.fiscal", {
                ...fiscal,
                softwareName: e.target.value,
              })
            }
          />
        </SettingField>
        <SettingField label="Regime fiscal">
          <input
            disabled={disabled}
            value={fiscal.fiscalRegime || ""}
            onChange={(e) =>
              update("documents.fiscal", {
                ...fiscal,
                fiscalRegime: e.target.value,
              })
            }
          />
        </SettingField>
        <SettingField label="Mostrar QR code">
          <input
            type="checkbox"
            disabled={disabled}
            checked={fiscal.showQrCode !== false}
            onChange={(e) =>
              update("documents.fiscal", {
                ...fiscal,
                showQrCode: e.target.checked,
              })
            }
          />
        </SettingField>
        <SettingField label="Mostrar total por extenso">
          <input
            type="checkbox"
            disabled={disabled}
            checked={fiscal.showTotalInWords !== false}
            onChange={(e) =>
              update("documents.fiscal", {
                ...fiscal,
                showTotalInWords: e.target.checked,
              })
            }
          />
        </SettingField>
        <SettingField
          label="Pré-visualizar antes de imprimir"
          help="Abre a pré-visualização da factura antes de enviar para a impressora"
        >
          <input
            type="checkbox"
            disabled={disabled}
            checked={printOptions.previewBeforePrint !== false}
            onChange={(e) =>
              update("documents.printOptions", { ...printOptions, previewBeforePrint: e.target.checked })
            }
          />
        </SettingField>
        <SettingField label="Número de vias" help="Cópias impressas por factura (1 a 5)">
          <input
            type="number"
            min="1"
            max="5"
            disabled={disabled}
            value={printOptions.copies ?? 1}
            onChange={(e) =>
              update("documents.printOptions", { ...printOptions, copies: Math.max(1, Math.min(5, Number(e.target.value))) })
            }
          />
        </SettingField>
      </div>
    );
  }
  if (section === "sales")
    return (
      <div className="settings-form-grid">
        <SettingField label="Forma de pagamento padrão">
          <select
            disabled={disabled}
            value={draft["sales.defaultPaymentMethod"] || ""}
            onChange={(e) =>
              update("sales.defaultPaymentMethod", e.target.value)
            }
          >
            {snapshot.catalogs.payment_methods
              .filter((o) => o.active)
              .map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name}
                </option>
              ))}
          </select>
        </SettingField>
        <NumberField
          label="Imposto padrão (%)"
          settingKey="sales.defaultTaxRate"
          {...{ draft, update, disabled }}
        />
        <NumberField
          label="Limite de desconto"
          settingKey="sales.maxDiscount"
          {...{ draft, update, disabled }}
        />
        <SettingField label="Consumidor final">
          <input
            disabled={disabled}
            value={draft["sales.finalConsumerLabel"] || ""}
            onChange={(e) => update("sales.finalConsumerLabel", e.target.value)}
          />
        </SettingField>
      </div>
    );
  if (section === "stock")
    return (
      <div className="settings-form-grid">
        <NumberField
          label="Limite de stock baixo"
          settingKey="stock.lowStockThreshold"
          {...{ draft, update, disabled }}
        />
        <NumberField
          label="Dias para alerta de validade"
          settingKey="stock.expiryAlertDays"
          {...{ draft, update, disabled }}
        />
      </div>
    );
  if (section === "alerts") {
    const backup = draft["backup.options"] || {};
    return (
      <div className="settings-form-grid">
        <SettingField label="Alertas no Dashboard">
          <input
            type="checkbox"
            disabled={disabled}
            checked={Boolean(draft["alerts.dashboardEnabled"])}
            onChange={(e) =>
              update("alerts.dashboardEnabled", e.target.checked)
            }
          />
        </SettingField>
        <SettingField label="Mensagem padrao">
          <textarea
            disabled={disabled}
            value={draft["alerts.defaultMessage"] || ""}
            onChange={(e) => update("alerts.defaultMessage", e.target.value)}
          />
        </SettingField>
        <SettingField label="Frequência do backup">
          <select
            disabled={disabled}
            value={backup.frequency || "manual"}
            onChange={(e) =>
              update("backup.options", { ...backup, frequency: e.target.value })
            }
          >
            <option value="manual">Manual</option>
            <option value="daily">Diário</option>
            <option value="weekly">Semanal</option>
          </select>
        </SettingField>
        <NumberField
          label="Backups a reter"
          settingKey="backup.options"
          value={backup.retentionCount}
          onValue={(value) =>
            update("backup.options", { ...backup, retentionCount: value })
          }
          {...{ draft, update, disabled }}
        />
        <ManualBackupButton />
        <RestoreBackupPanel />
      </div>
    );
  }
  if (section === "integracoes") {
    const gs = draft["reports.googleSheets"] || {};
    return (
      <div className="settings-form-grid">
        <SettingField
          label="Envio automático para Google Sheets"
          help="Activa o envio diário de relatórios para a planilha do CEO"
        >
          <input
            type="checkbox"
            disabled={disabled}
            checked={Boolean(gs.syncEnabled)}
            onChange={(e) =>
              update("reports.googleSheets", { ...gs, syncEnabled: e.target.checked })
            }
          />
        </SettingField>
        <SettingField
          label="Horário de envio (HH:MM)"
          help="Hora local Angola — padrão: 21:00"
        >
          <input
            disabled={disabled}
            value={gs.syncTime || "21:00"}
            placeholder="21:00"
            onChange={(e) =>
              update("reports.googleSheets", { ...gs, syncTime: e.target.value })
            }
          />
        </SettingField>
        <SettingField
          label="ID da Planilha Google"
          help="Identificador único da Google Sheet (extraído do URL)"
        >
          <input
            disabled={disabled}
            value={gs.spreadsheetId || ""}
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            onChange={(e) =>
              update("reports.googleSheets", { ...gs, spreadsheetId: e.target.value })
            }
          />
        </SettingField>
        <SettingField
          label="Retenção de registos (dias)"
          help="Dias a manter o histórico de sincronização na fila"
        >
          <input
            type="number"
            min="1"
            disabled={disabled}
            value={gs.retentionDays || 90}
            onChange={(e) =>
              update("reports.googleSheets", { ...gs, retentionDays: Number(e.target.value) })
            }
          />
        </SettingField>
        <SettingField
          label="Credenciais da Conta de Serviço Google"
          help="Cole aqui o conteúdo JSON do ficheiro de credenciais da Service Account"
        >
          <textarea
            disabled={disabled}
            rows={8}
            value={gs.credentials || ""}
            placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
            onChange={(e) =>
              update("reports.googleSheets", { ...gs, credentials: e.target.value })
            }
          />
        </SettingField>
        <div className="settings-sync-action">
          <button
            type="button"
            className="primary-button"
            disabled={syncStatus === 'loading' || !gs.spreadsheetId || !gs.credentials}
            onClick={sendNow}
          >
            {syncStatus === 'loading' ? 'Enviando...' : 'Enviar dados agora'}
          </button>
          {syncStatus === 'success' && (
            <p className="form-success" role="status">{syncMessage}</p>
          )}
          {syncStatus === 'error' && (
            <p className="form-error" role="alert">{syncMessage}</p>
          )}
        </div>
      </div>
    );
  }
  return null;
}

function LogoPicker({ identity, disabled }) {
  const [logoDataUrl, setLogoDataUrl] = useState(() => getStoredBranding().logoDataUrl);

  useEffect(() => subscribeBrandingChange((b) => setLogoDataUrl(b.logoDataUrl)), []);

  function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      saveStoredBranding({ pharmacyName: identity?.pharmacyName || '', logoDataUrl: String(reader.result ?? '') });
    };
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    saveStoredBranding({ pharmacyName: identity?.pharmacyName || '', logoDataUrl: '' });
  }

  return (
    <div className="settings-logo-picker">
      <label className="image-picker" style={disabled ? { cursor: 'not-allowed', opacity: 0.65 } : undefined}>
        <span className={logoDataUrl ? 'image-preview' : 'image-preview empty'}>
          {logoDataUrl ? <img src={logoDataUrl} alt="Logo da farmácia" /> : <ImagePlus size={34} />}
        </span>
        <input type="file" accept="image/*" disabled={disabled} onChange={handleFile} />
        <strong>Logo da farmácia</strong>
        <small>Exibido no menu lateral e na página de login</small>
      </label>
      {logoDataUrl && !disabled && (
        <button type="button" className="soft-button" style={{ marginTop: '8px' }} onClick={clearLogo}>
          Remover logo
        </button>
      )}
    </div>
  );
}

function NumberField({
  label,
  settingKey,
  draft,
  update,
  disabled,
  value,
  onValue,
}) {
  const current = value ?? draft[settingKey] ?? 0;
  return (
    <SettingField label={label}>
      <input
        type="number"
        min="0"
        disabled={disabled}
        value={current}
        onChange={(e) =>
          (onValue || ((next) => update(settingKey, next)))(
            Number(e.target.value),
          )
        }
      />
    </SettingField>
  );
}

function ManualBackupButton() {
  const [status, setStatus] = React.useState(null);
  const [message, setMessage] = React.useState('');

  async function doBackup() {
    setStatus('loading');
    setMessage('');
    try {
      const result = await request('backup.create');
      if (result?.canceled) { setStatus(null); return; }
      setStatus('success');
      setMessage(`Backup guardado em: ${result.filePath}`);
    } catch (err) {
      setStatus('error');
      setMessage(err?.message || 'Erro ao criar backup.');
    }
  }

  return (
    <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
      <strong style={{ display: 'block', marginBottom: '6px' }}>Backup manual</strong>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '8px' }}>
        Cria uma cópia da base de dados actual num ficheiro à sua escolha.
      </p>
      <button
        type="button"
        className="soft-button"
        onClick={doBackup}
        disabled={status === 'loading'}
      >
        {status === 'loading' ? 'A criar backup...' : 'Fazer backup agora'}
      </button>
      {status === 'success' && (
        <p style={{ color: 'var(--color-success, #2e7d32)', marginTop: '6px', fontSize: '0.82rem', wordBreak: 'break-all' }}>
          {message}
        </p>
      )}
      {status === 'error' && (
        <p style={{ color: 'var(--color-error, #c0392b)', marginTop: '6px', fontSize: '0.85rem' }}>
          {message}
        </p>
      )}
    </div>
  );
}

function RestoreBackupPanel() {
  const [selectedPath, setSelectedPath] = React.useState('');
  const [status, setStatus] = React.useState(null);
  const [message, setMessage] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);

  async function selectFile() {
    setStatus(null);
    setMessage('');
    try {
      const result = await request('backup.selectFile');
      if (result?.canceled || !result?.filePath) return;
      setSelectedPath(result.filePath);
      setConfirming(false);
    } catch (err) {
      setStatus('error');
      setMessage(err?.message || 'Erro ao seleccionar ficheiro.');
    }
  }

  async function doRestore() {
    if (!selectedPath) return;
    setConfirming(false);
    setStatus('loading');
    setMessage('');
    try {
      const result = await request('backup.restore', { filePath: selectedPath });
      setStatus('success');
      setMessage(result?.message || 'Backup restaurado. Reinicie o sistema.');
      setSelectedPath('');
    } catch (err) {
      setStatus('error');
      setMessage(err?.message || 'Erro ao restaurar backup.');
    }
  }

  return (
    <div style={{ gridColumn: '1 / -1', marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
      <strong style={{ display: 'block', marginBottom: '6px' }}>Restauração de backup</strong>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '8px' }}>
        Seleccione um ficheiro de backup SQLite (.sqlite ou .db). Esta operação substitui todos os dados actuais. Reinicie manualmente após a restauração.
      </p>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
        <button type="button" className="soft-button" onClick={selectFile} disabled={status === 'loading'}>
          Seleccionar ficheiro...
        </button>
        {selectedPath && (
          <span style={{ fontSize: '0.82rem', color: 'var(--ink)', fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>
            {selectedPath}
          </span>
        )}
      </div>

      {selectedPath && !confirming && (
        <div style={{ background: '#fff8e1', border: '1px solid #f2ce3d', borderRadius: '6px', padding: '10px 12px', marginBottom: '8px' }}>
          <p style={{ color: '#7a5c00', fontSize: '0.85rem', margin: '0 0 8px' }}>
            ⚠ Atenção: todos os dados actuais serão substituídos pelo conteúdo do ficheiro seleccionado. Esta acção não pode ser desfeita.
          </p>
          <button type="button" className="primary-button" onClick={() => setConfirming(true)}>
            Restaurar este backup
          </button>
          <button type="button" className="soft-button" onClick={() => setSelectedPath('')} style={{ marginLeft: '8px' }}>
            Cancelar
          </button>
        </div>
      )}

      {confirming && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ color: '#c0392b', fontSize: '0.9rem', fontWeight: 600 }}>Confirma a substituição irreversível de todos os dados?</span>
          <button type="button" className="soft-button" onClick={() => setConfirming(false)}>Não</button>
          <button type="button" className="primary-button" onClick={doRestore} disabled={status === 'loading'} style={{ background: '#c0392b' }}>
            {status === 'loading' ? 'A restaurar...' : 'Sim, restaurar'}
          </button>
        </div>
      )}

      {status === 'success' && <p style={{ color: 'var(--color-success, #2e7d32)', marginTop: '6px', fontSize: '0.85rem' }}>{message}</p>}
      {status === 'error' && <p style={{ color: 'var(--color-error, #c0392b)', marginTop: '6px', fontSize: '0.85rem' }}>{message}</p>}
    </div>
  );
}

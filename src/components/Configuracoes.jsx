import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
  Boxes,
  Building2,
  CloudUpload,
  CreditCard,
  Database,
  FileText,
  ImagePlus,
  KeyRound,
  Monitor,
  RefreshCw,
  Save,
  Users,
} from "lucide-react";
import { useLicense } from "../licensing/LicenseContext";
import { formatLicenseKey, getLicenseValidationResult } from "../licensing/licenseUi.mjs";
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
  { id: "appearance", label: "Aparência", icon: Monitor },
  { id: "license", label: "Licença", icon: KeyRound },
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

const canEditProtectedFiscalIdentity =
  Boolean(import.meta.env?.DEV) || import.meta.env?.VITE_KILSYSTEM_ALLOW_FISCAL_EDIT === 'true';

function snapshotValues(snapshot, section) {
  if (section === "company")
    return {
      "company.identity": snapshot.settings.company.identity.value,
      'documents.headerText': snapshot.settings.documents.headerText.value,
      "documents.currency": snapshot.settings.documents.currency.value,
      'documents.fiscal': snapshot.settings.documents.fiscal.value,
      'documents.printOptions': snapshot.settings.documents.printOptions?.value ?? { previewBeforePrint: true, copies: 1, printerName: '', showDialog: false },
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
        Object.values(snapshot.settings.alerts).map((item) => [item.key, item.value]),
      ),
      "backup.options": snapshot.settings.backup.options.value,
      "backup.auto": snapshot.settings.backup.auto?.value ?? {
        enabled: true, frequency: "24h", time: "23:00", onClose: true, onRestore: true, onReset: true,
      },
      "alerts.sessionTimeoutMinutes": snapshot.settings.alerts.sessionTimeoutMinutes?.value ?? 30,
      "alerts.operationalAlerts": snapshot.settings.alerts.operationalAlerts?.value ?? {
        cashDiffShift: true, cashDiffDay: true, longShift: true, longDay: true,
      },
      "alerts.systemAlerts": snapshot.settings.alerts.systemAlerts?.value ?? {
        backupFail: true, restoreFail: true, sheetsSyncFail: true, dbCorrupt: true, integrity: true, diskSpace: true,
      },
      "alerts.securityAlerts": snapshot.settings.alerts.securityAlerts?.value ?? {
        loginAttempts: true, criticalOps: true, dataDelete: true, systemReset: true,
      },
    };
  if (section === "integracoes")
    return {
      'reports.googleSheets': snapshot.settings.reports.googleSheets.value,
    };
  if (section === "appearance")
    return {
      "appearance.startFullscreen": snapshot.settings.appearance?.startFullscreen?.value ?? true,
    };
  return {};
}

function settingVersions(snapshot, values) {
  const versions = {};
  for (const key of Object.keys(values)) {
    const [group, name] = key.split(".");
    versions[key] = snapshot.settings[group]?.[name]?.version ?? 0;
  }
  return versions;
}

function PrinterSelector({ value, onChange, disabled }) {
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    setLoading(true);
    request('printing.listPrinters')
      .then(list => setPrinters(Array.isArray(list) ? list : []))
      .catch(() => setPrinters([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <select
      disabled={disabled || loading}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">Impressora padrão do sistema</option>
      {loading && <option disabled>A carregar impressoras...</option>}
      {printers.map(p => (
        <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
      ))}
    </select>
  );
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
          {activeSection === "license" ? (
            <LicenseSettings />
          ) : (
            <SectionFields
              section={activeSection}
              draft={draft}
              update={update}
              snapshot={snapshot}
              disabled={readOnly}
            />
          )}
          {activeSection !== "license" && Object.keys(draft).length ? (
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

function LicenseSettings() {
  const { status, networkStatus, validate, busy, error } = useLicense();
  const [licenseKey, setLicenseKey] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const labels = {
    demo_active: "Demonstração activa", paid_active: "Licença activa",
    expiring: "A expirar", offline_grace: "Validação pendente",
    expired: "Expirada", revoked: "Revogada",
    clock_tampered: "Data inconsistente", corrupt: "Inválida",
  };
  return (
    <section className="license-settings" aria-labelledby="license-settings-title">
      <div>
        <p className="license-eyebrow">Licença desta instalação</p>
        <h2 id="license-settings-title">{labels[status.state] || status.state}</h2>
        <p>Consulte a validade e confirme a licença junto do servidor.</p>
      </div>
      <dl>
        <div><dt>Plano</dt><dd>{status.plan === "demo" ? "Demo — 30 dias" : status.plan || "—"}</dd></div>
        <div><dt>Estado</dt><dd>{labels[status.state] || status.state}</dd></div>
        <div><dt>Expiração</dt><dd>{status.expiresAt ? new Date(status.expiresAt).toLocaleDateString("pt-AO") : "—"}</dd></div>
        <div><dt>Rede</dt><dd>{networkStatus === "online" ? "Ligada" : "Sem ligação"}</dd></div>
      </dl>
      {error ? <p className="settings-license-error" role="alert">{error}</p> : null}
      <div className="license-settings-validation">
        <label htmlFor="settings-license-key">Chave para revalidação</label>
        <input
          id="settings-license-key"
          autoComplete="off"
          placeholder="XXXX-XXXX-XXXX-XXXX"
          value={licenseKey}
          onChange={(event) => setLicenseKey(formatLicenseKey(event.target.value))}
        />
        <button
          className="secondary-button"
          type="button"
          disabled={busy || !licenseKey || networkStatus === "offline"}
          onClick={async () => {
            setLocalMessage("");
            try {
              const nextStatus = await validate(licenseKey);
              const result = getLicenseValidationResult(nextStatus);
              setLocalMessage(result.message);
              if (result.success) setLicenseKey("");
            } catch { /* Context apresenta mensagem segura. */ }
          }}
        >
          <RefreshCw size={17} /> {busy ? "A revalidar…" : "Revalidar agora"}
        </button>
      </div>
      <p aria-live="polite">{localMessage}</p>
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
    const printOptions = draft["documents.printOptions"] || { previewBeforePrint: true, copies: 1, printerName: '', showDialog: false };
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
        <SettingField
          label="Número de validação AGT"
          help={canEditProtectedFiscalIdentity ? "" : "Campo protegido; alterável apenas em fase de desenvolvimento."}
        >
          <input
            disabled={disabled || !canEditProtectedFiscalIdentity}
            value={fiscal.validationNumber || ""}
            onChange={(e) =>
              update("documents.fiscal", {
                ...fiscal,
                validationNumber: e.target.value,
              })
            }
          />
        </SettingField>
        <SettingField
          label="Nome do software"
          help={canEditProtectedFiscalIdentity ? "" : "Campo protegido; alterável apenas em fase de desenvolvimento."}
        >
          <input
            disabled={disabled || !canEditProtectedFiscalIdentity}
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
        <SettingField
          label="Impressora padrão"
          help="Impressora usada para facturas e relatórios. Deixe vazio para usar a padrão do sistema."
        >
          <PrinterSelector
            value={printOptions.printerName || ''}
            onChange={(name) => update("documents.printOptions", { ...printOptions, printerName: name })}
            disabled={disabled}
          />
        </SettingField>
        <SettingField
          label="Mostrar diálogo do Windows"
          help="Quando activo, o diálogo de impressão do Windows abre antes de imprimir"
        >
          <input
            type="checkbox"
            disabled={disabled}
            checked={printOptions.showDialog === true}
            onChange={(e) =>
              update("documents.printOptions", { ...printOptions, showDialog: e.target.checked })
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
    const autoConfig = draft["backup.auto"] || {};
    const opAlerts = draft["alerts.operationalAlerts"] || {};
    const sysAlerts = draft["alerts.systemAlerts"] || {};
    const secAlerts = draft["alerts.securityAlerts"] || {};

    function setAuto(key, val) {
      update("backup.auto", { ...autoConfig, [key]: val });
    }
    function setOpAlert(key, val) {
      update("alerts.operationalAlerts", { ...opAlerts, [key]: val });
    }
    function setSysAlert(key, val) {
      update("alerts.systemAlerts", { ...sysAlerts, [key]: val });
    }
    function setSecAlert(key, val) {
      update("alerts.securityAlerts", { ...secAlerts, [key]: val });
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

        {/* ── 1. Alertas do Sistema ── */}
        <div>
          <h3 className="settings-section-title">Alertas do Sistema</h3>
          <div className="settings-form-grid">
            <SettingField label="Alertas no Dashboard" help="Exibe alertas administrativos e operacionais no painel.">
              <input type="checkbox" disabled={disabled}
                checked={Boolean(draft["alerts.dashboardEnabled"])}
                onChange={(e) => update("alerts.dashboardEnabled", e.target.checked)} />
            </SettingField>
            <SettingField label="Mensagem padrão" help="Aviso institucional exibido no Dashboard.">
              <textarea disabled={disabled}
                value={draft["alerts.defaultMessage"] || ""}
                onChange={(e) => update("alerts.defaultMessage", e.target.value)} />
            </SettingField>
            <SettingField label="Timeout de sessão (minutos)" help="0 = sem timeout.">
              <input type="number" min="0" max="480" step="5" disabled={disabled}
                value={draft["alerts.sessionTimeoutMinutes"] ?? 30}
                onChange={(e) => update("alerts.sessionTimeoutMinutes", Number(e.target.value))} />
            </SettingField>
          </div>

          <div style={{ marginTop: '16px' }}>
            <p style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '8px', color: 'var(--muted)' }}>Operação</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
              {[
                ['cashDiffShift', 'Diferença de caixa ao fechar turno', setOpAlert, opAlerts],
                ['cashDiffDay',   'Diferença de caixa ao fechar dia operacional', setOpAlert, opAlerts],
                ['longShift',     'Turno operacional aberto há mais de 12 horas', setOpAlert, opAlerts],
                ['longDay',       'Dia operacional aberto há mais de 24 horas', setOpAlert, opAlerts],
              ].map(([key, label, setter, obj]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: disabled ? 'default' : 'pointer' }}>
                  <input type="checkbox" disabled={disabled} checked={Boolean(obj[key])} onChange={(e) => setter(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '14px' }}>
            <p style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '8px', color: 'var(--muted)' }}>Sistema</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
              {[
                ['backupFail',     'Falha na criação de backup', setSysAlert, sysAlerts],
                ['restoreFail',    'Falha na restauração de backup', setSysAlert, sysAlerts],
                ['sheetsSyncFail', 'Falha na sincronização com Google Sheets', setSysAlert, sysAlerts],
                ['dbCorrupt',      'Banco de dados corrompido', setSysAlert, sysAlerts],
                ['integrity',      'Falha de integridade do banco', setSysAlert, sysAlerts],
                ['diskSpace',      'Espaço insuficiente em disco', setSysAlert, sysAlerts],
              ].map(([key, label, setter, obj]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: disabled ? 'default' : 'pointer' }}>
                  <input type="checkbox" disabled={disabled} checked={Boolean(obj[key])} onChange={(e) => setter(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '14px' }}>
            <p style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '8px', color: 'var(--muted)' }}>Segurança</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
              {[
                ['loginAttempts', 'Tentativas repetidas de login inválido', setSecAlert, secAlerts],
                ['criticalOps',   'Operações críticas executadas', setSecAlert, secAlerts],
                ['dataDelete',    'Exclusão de dados importantes', setSecAlert, secAlerts],
                ['systemReset',   'Reset do sistema executado', setSecAlert, secAlerts],
              ].map(([key, label, setter, obj]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: disabled ? 'default' : 'pointer' }}>
                  <input type="checkbox" disabled={disabled} checked={Boolean(obj[key])} onChange={(e) => setter(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ── 2. Backup Automático ── */}
        <div>
          <h3 className="settings-section-title">Backup Automático</h3>
          <div className="settings-form-grid">
            <SettingField label="Ativar backup automático">
              <input type="checkbox" disabled={disabled}
                checked={Boolean(autoConfig.enabled)}
                onChange={(e) => setAuto("enabled", e.target.checked)} />
            </SettingField>
            <SettingField label="Frequência">
              <select disabled={disabled || !autoConfig.enabled}
                value={autoConfig.frequency || "24h"}
                onChange={(e) => setAuto("frequency", e.target.value)}>
                <option value="24h">A cada 24 horas</option>
                <option value="weekly">Semanal</option>
                <option value="fortnightly">Quinzenal</option>
                <option value="monthly">Mensal</option>
              </select>
            </SettingField>
            <SettingField label="Hora de execução" help="Formato HH:mm">
              <input type="time" disabled={disabled || !autoConfig.enabled}
                value={autoConfig.time || "23:00"}
                onChange={(e) => setAuto("time", e.target.value)} />
            </SettingField>
            <SettingField label="Criar backup ao encerrar o sistema">
              <input type="checkbox" disabled={disabled}
                checked={Boolean(autoConfig.onClose)}
                onChange={(e) => setAuto("onClose", e.target.checked)} />
            </SettingField>
            <SettingField label="Criar backup antes da restauração">
              <input type="checkbox" disabled={disabled}
                checked={Boolean(autoConfig.onRestore)}
                onChange={(e) => setAuto("onRestore", e.target.checked)} />
            </SettingField>
            <SettingField label="Criar backup antes do reset do sistema">
              <input type="checkbox" disabled={disabled}
                checked={Boolean(autoConfig.onReset)}
                onChange={(e) => setAuto("onReset", e.target.checked)} />
            </SettingField>
          </div>
        </div>

        {/* ── 3. Retenção de Backups ── */}
        <div>
          <h3 className="settings-section-title">Retenção de Backups</h3>
          <div className="settings-form-grid">
            <NumberField label="Backups a reter"
              help="Backups mais antigos são removidos automaticamente."
              settingKey="backup.options"
              value={backup.retentionCount}
              onValue={(value) => update("backup.options", { ...backup, retentionCount: value })}
              {...{ draft, update, disabled }} />
          </div>
        </div>

        {/* ── 4. Backup Manual, Histórico e Estado ── */}
        <div>
          <h3 className="settings-section-title">Backup e Histórico</h3>
          <ManualBackupButton
            retentionCount={Number(backup.retentionCount) || 10}
            autoConfig={autoConfig}
            folderPath={backup.folderPath || ""}
            onFolderChange={(fp) => update("backup.options", { ...backup, folderPath: fp })}
            disabled={disabled}
          />
        </div>

      </div>
    );
  }
  if (section === "appearance") {
    return (
      <div className="settings-form-grid">
        <SettingField
          label="Iniciar em Fullscreen"
          help="A aplicação abre em ecrã inteiro automaticamente ao iniciar"
        >
          <input
            type="checkbox"
            disabled={disabled}
            checked={Boolean(draft["appearance.startFullscreen"])}
            onChange={(e) => update("appearance.startFullscreen", e.target.checked)}
          />
        </SettingField>
        <FullscreenToggleButton />
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

function ManualBackupButton({ retentionCount = 10, autoConfig = {}, folderPath = '', onFolderChange, disabled: formDisabled = false }) {
  const [status, setStatus] = React.useState(null);
  const [message, setMessage] = React.useState('');
  const [backups, setBackups] = React.useState([]);
  const [loadingList, setLoadingList] = React.useState(false);
  const [serviceStatus, setServiceStatus] = React.useState(null);
  const [integrityResult, setIntegrityResult] = React.useState(null);
  const [checkingIntegrity, setCheckingIntegrity] = React.useState(false);
  const [busy, setBusy] = React.useState(null); // name of backup being processed
  const [confirmAction, setConfirmAction] = React.useState(null); // { type, name }
  const [restoreConfirmText, setRestoreConfirmText] = React.useState('');

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleString('pt-AO'); } catch { return String(d); }
  }

  async function loadList() {
    setLoadingList(true);
    try {
      const list = await request('backup.list', { folderPath });
      setBackups(list || []);
    } catch { /* silent */ } finally {
      setLoadingList(false);
    }
  }

  async function loadServiceStatus() {
    try {
      const s = await request('backup.serviceStatus', { autoConfig, folderPath });
      setServiceStatus(s);
    } catch { /* silent */ }
  }

  async function doBackup() {
    setStatus('loading');
    setMessage('');
    try {
      const result = await request('backup.manual', { folderPath });
      setStatus('success');
      setMessage(`Backup criado: ${result.name} (${formatBytes(result.size)})`);
      loadList();
      loadServiceStatus();
    } catch (err) {
      setStatus('error');
      setMessage(err?.message || 'Erro ao criar backup.');
    }
  }

  async function doIntegrityCheck() {
    setCheckingIntegrity(true);
    setIntegrityResult(null);
    try {
      const res = await request('backup.integrityCheck');
      setIntegrityResult(res);
    } catch (err) {
      setIntegrityResult({ ok: false, results: [err?.message || 'Erro ao verificar.'] });
    } finally {
      setCheckingIntegrity(false);
    }
  }

  async function doChooseLocation() {
    try {
      const res = await request('backup.chooseLocation');
      if (!res.canceled && res.folderPath) {
        onFolderChange?.(res.folderPath);
        loadList();
      }
    } catch { /* silent */ }
  }

  async function doOpenFolder() {
    try { await request('backup.openFolder', { folderPath }); } catch { /* silent */ }
  }

  function startRestore(name) {
    setConfirmAction({ type: 'restore', name });
    setRestoreConfirmText('');
  }

  async function confirmRestore() {
    const name = confirmAction.name;
    setConfirmAction(null);
    setRestoreConfirmText('');
    setBusy(name);
    try {
      await request('backup.restore', { name, folderPath });
      setStatus('success');
      setMessage('Backup restaurado. Reinicie a aplicação para aplicar as alterações.');
      loadList();
    } catch (err) {
      setStatus('error');
      setMessage(err?.message || 'Erro ao restaurar backup.');
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    const name = confirmAction.name;
    setConfirmAction(null);
    setBusy(name);
    try {
      await request('backup.delete', { name, folderPath });
      setStatus('success');
      setMessage(`Backup eliminado: ${name}`);
      loadList();
    } catch (err) {
      setStatus('error');
      setMessage(err?.message || 'Erro ao eliminar backup.');
    } finally {
      setBusy(null);
    }
  }

  React.useEffect(() => {
    loadList();
    loadServiceStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderPath]);

  const visibleBackups = backups.slice(0, retentionCount);
  const isRestoreAction = confirmAction?.type === 'restore';
  const canConfirmRestore = restoreConfirmText.trim().toUpperCase() === 'RESTAURAR';

  return (
    <>
    {/* ── Confirmation modal ── */}
    {confirmAction && (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <div className="modal-card" style={{ maxWidth: 460 }}>
          <div className="modal-title-row">
            <h3 style={{ margin: 0 }}>{isRestoreAction ? 'Restaurar backup' : 'Eliminar backup'}</h3>
          </div>
          <p style={{ margin: '0 0 6px' }}>
            {isRestoreAction ? 'Vai restaurar o ficheiro' : 'Vai eliminar definitivamente'}{' '}
            <strong>{confirmAction.name}</strong>.
          </p>
          <p style={{ margin: '0 0 12px', color: 'var(--danger)', fontSize: '0.88rem' }}>
            {isRestoreAction
              ? 'Os dados actuais serão substituídos pelo conteúdo do backup. Esta acção não pode ser desfeita.'
              : 'O ficheiro de backup será apagado permanentemente.'}
          </p>
          {isRestoreAction && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '0.83rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Digite <strong>RESTAURAR</strong> para confirmar:
              </label>
              <input
                autoFocus
                type="text"
                value={restoreConfirmText}
                onChange={(e) => setRestoreConfirmText(e.target.value)}
                placeholder="RESTAURAR"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          )}
          <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="soft-button" onClick={() => { setConfirmAction(null); setRestoreConfirmText(''); }}>Cancelar</button>
            <button
              type="button"
              className="danger-button"
              disabled={isRestoreAction && !canConfirmRestore}
              onClick={isRestoreAction ? confirmRestore : confirmDelete}
            >
              {isRestoreAction ? 'Restaurar' : 'Eliminar'}
            </button>
          </div>
        </div>
      </div>
    )}

    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Localização dos backups ── */}
      <div>
        <p style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px', color: 'var(--muted)' }}>Localização dos Backups</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <code style={{ fontSize: '0.79rem', padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {folderPath || '%APPDATA%\\kilsystem-pharmacy\\backups'}
          </code>
          <button type="button" className="soft-button" style={{ whiteSpace: 'nowrap' }} onClick={doChooseLocation} disabled={formDisabled}>Alterar Localização</button>
          <button type="button" className="soft-button" style={{ whiteSpace: 'nowrap' }} onClick={doOpenFolder}>Abrir Pasta</button>
        </div>
      </div>

      {/* ── Estado do Serviço ── */}
      {serviceStatus && (
        <div>
          <p style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '8px', color: 'var(--muted)' }}>Estado do Serviço</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {[
              ['Último backup', serviceStatus.lastBackup ? formatDate(serviceStatus.lastBackup) : 'Nunca realizado'],
              ['Próximo backup', serviceStatus.nextBackup ? formatDate(serviceStatus.nextBackup) : 'Não agendado'],
              ['Estado', serviceStatus.state || 'Desconhecido'],
            ].map(([label, val]) => (
              <div key={label} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0 0 2px' }}>{label}</p>
                <p style={{ fontSize: '0.84rem', fontWeight: 600, margin: 0 }}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Acções principais ── */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="soft-button" onClick={doBackup} disabled={status === 'loading'}>
          {status === 'loading' ? 'A criar…' : '+ Fazer backup agora'}
        </button>
        <button type="button" className="soft-button" onClick={doIntegrityCheck} disabled={checkingIntegrity}>
          {checkingIntegrity ? 'A verificar…' : 'Verificar banco de dados'}
        </button>
      </div>

      {/* ── Resultado de integridade ── */}
      {integrityResult && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          border: `1px solid ${integrityResult.ok ? 'var(--success)' : 'var(--danger)'}`,
          background: integrityResult.ok ? 'var(--success-light, #edfbee)' : 'var(--danger-light, #fef2f2)',
          fontSize: '0.83rem',
        }}>
          <strong>{integrityResult.ok ? 'Integridade OK' : 'Problemas detectados'}</strong>
          {!integrityResult.ok && (
            <ul style={{ margin: '4px 0 0', paddingLeft: '16px' }}>
              {integrityResult.results?.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* ── Mensagens de status ── */}
      {status === 'success' && <p style={{ color: 'var(--success)', fontSize: '0.82rem', margin: 0 }}>{message}</p>}
      {status === 'error' && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', margin: 0 }}>{message}</p>}

      {/* ── Histórico de backups ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--muted)', margin: 0 }}>
            Histórico ({visibleBackups.length} de {backups.length})
          </p>
          <button type="button" className="soft-button" style={{ fontSize: '11px', padding: '3px 10px' }} onClick={loadList} disabled={loadingList}>
            {loadingList ? '…' : 'Actualizar'}
          </button>
        </div>
        {loadingList ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>A carregar…</p>
        ) : visibleBackups.length ? (
          <table className="backup-history-table">
            <thead>
              <tr>
                <th>Ficheiro</th>
                <th>Tipo</th>
                <th>Tamanho</th>
                <th>Data</th>
                <th>Utilizador</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleBackups.map((b) => (
                <tr key={b.name}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.name}>{b.name}</td>
                  <td style={{ color: 'var(--muted)' }}>{b.type || 'Manual'}</td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{formatBytes(b.size)}</td>
                  <td style={{ color: 'var(--muted)' }}>{formatDate(b.createdAt)}</td>
                  <td style={{ color: 'var(--muted)' }}>{b.createdBy || 'Sistema'}</td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '1px 7px',
                      borderRadius: '10px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: b.state === 'OK' ? '#e4f6e8' : '#fef2f2',
                      color: b.state === 'OK' ? '#064818' : '#7f1d1d',
                    }}>{b.state || 'OK'}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                      <button type="button" className="soft-button" style={{ fontSize: '11px', padding: '3px 8px' }}
                        disabled={!!busy} onClick={() => startRestore(b.name)}>
                        {busy === b.name ? '…' : 'Restaurar'}
                      </button>
                      <button type="button" className="danger-button" style={{ fontSize: '11px', padding: '3px 8px' }}
                        disabled={!!busy} onClick={() => setConfirmAction({ type: 'delete', name: b.name })}>
                        {busy === b.name ? '…' : 'Eliminar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Nenhum backup encontrado.</p>
        )}
      </div>

    </div>
    </>
  );
}

function FullscreenToggleButton() {
  const [isFullscreen, setIsFullscreen] = React.useState(null);
  const [status, setStatus] = React.useState(null);

  React.useEffect(() => {
    request('window.isFullscreen').then((res) => {
      setIsFullscreen(res?.fullscreen ?? false);
    }).catch(() => setIsFullscreen(false));
  }, []);

  async function toggle() {
    setStatus('loading');
    try {
      const next = !isFullscreen;
      const res = await request('window.setFullscreen', { value: next });
      setIsFullscreen(res?.fullscreen ?? next);
      setStatus(null);
    } catch {
      setStatus('error');
    }
  }

  return (
    <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
      <strong style={{ display: 'block', marginBottom: '6px' }}>Controlo imediato</strong>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '8px' }}>
        Comuta o modo ecrã inteiro sem reiniciar. Pode também usar a tecla <strong>F11</strong>.
      </p>
      <button
        type="button"
        className="soft-button"
        onClick={toggle}
        disabled={status === 'loading' || isFullscreen === null}
      >
        {isFullscreen ? 'Sair do Fullscreen' : 'Entrar em Fullscreen'}
      </button>
      {status === 'error' && (
        <p style={{ color: 'var(--color-error, #c0392b)', marginTop: '6px', fontSize: '0.85rem' }}>
          Não foi possível comutar o fullscreen.
        </p>
      )}
    </div>
  );
}

function RestoreBackupPanel() { return null; }

function _RestoreBackupPanel_UNUSED() {
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

import React, { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Boxes,
  Building2,
  CreditCard,
  Database,
  FileText,
  Save,
  Users,
} from "lucide-react";
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
];

const CATALOGS_BY_SECTION = {
  sales: [CATALOG_KEYS.PAYMENT_METHODS],
  operation: [CATALOG_KEYS.OPERATION_SHIFTS, CATALOG_KEYS.OPERATION_STATUSES],
  stock: [CATALOG_KEYS.STOCK_UNITS, CATALOG_KEYS.STOCK_LOCATIONS],
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

function snapshotValues(snapshot, section) {
  if (section === "company")
    return {
      "company.identity": snapshot.settings.company.identity.value,
      "documents.headerText": snapshot.settings.documents.headerText.value,
      "documents.currency": snapshot.settings.documents.currency.value,
      "documents.fiscal": snapshot.settings.documents.fiscal.value,
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
              <h2>
                {snapshot.definitions.catalogs[catalogKey]?.system
                  ? "Catálogo técnico"
                  : "Catálogo operacional"}
                : {catalogKey}
              </h2>
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
  if (section === "company") {
    const identity = draft["company.identity"] || {};
    const fiscal = draft["documents.fiscal"] || {};
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
      </div>
    );
  }
  return null;
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

import React from "react";
import {
  BarChart3,
  Boxes,
  CalendarClock,
  ChevronRight,
  ChevronLeft,
  ClipboardList,
  Coins,
  FileText,
  Gauge,
  PackageCheck,
  Power,
  ReceiptText,
  Settings,
  Truck,
  UserRound,
  UsersRound,
} from "lucide-react";
import BrandMark from "./BrandMark";
import { useSetting } from "../configuration/SettingsContext";
import { request } from "../services/ipcClient.js";
import { confirmSensitiveAction } from "../utils/confirmations.mjs";

const menuItems = [
  {
    id: "dashboard",
    label: "Painel",
    icon: Gauge,
    permission: "dashboard.ver",
  },
  {
    id: 'operacao',
    label: 'Operação',
    icon: CalendarClock,
    permission: 'operacao.ver',
  },
  {
    id: "vendas",
    label: "Vendas",
    icon: ReceiptText,
    permission: "vendas.ver",
  },
  { id: "estoque", label: "Estoque", icon: Boxes, permission: "estoque.ver" },
  {
    id: "financeiro",
    label: "Finanças",
    icon: Coins,
    permission: "financeiro.ver",
  },
  {
    id: "clientes",
    label: "Clientes",
    icon: UsersRound,
    permission: "clientes.ver",
  },
  {
    id: "fornecedores",
    label: "Fornecedores",
    icon: Truck,
    permission: "fornecedores.ver",
  },
  {
    id: "encomendas",
    label: "Encomendas",
    icon: ClipboardList,
    permission: "compras.ver",
  },
  {
    id: "relatorios",
    label: "Relatórios",
    icon: BarChart3,
    permission: "relatorios.ver",
  },
  {
    id: "documentos",
    label: "Documentos",
    icon: FileText,
    permission: "documentos.ver",
  },
  {
    id: "configuracoes",
    label: "Configurações",
    icon: Settings,
    permission: "configuracoes.ver",
  },
  {
    id: "usuarios",
    label: "Usuários",
    icon: UserRound,
    permission: "usuarios.ver",
  },
];
const secondaryMenuIds = new Set(["configuracoes", "usuarios"]);

function Navbar({
  currentView,
  hasPermission,
  isCollapsed,
  setCurrentView,
  toggleCollapsed,
  badges = {},
}) {
  const identity = useSetting("company.identity", {});
  const pharmacyName = identity?.pharmacyName;

  async function handleCloseApp() {
    const confirmed = await confirmSensitiveAction(
      'Tem a certeza que deseja fechar o sistema?',
      null,
      { title: 'Fechar sistema', confirmLabel: 'Fechar sistema', tone: 'close' },
    );
    if (!confirmed) return;
    request('window.close').catch(() => {});
  }
  const canView =
    typeof hasPermission === "function" ? hasPermission : () => true;
  const primaryItems = menuItems
    .filter((item) => !secondaryMenuIds.has(item.id))
    .filter((item) => canView(item.permission));
  const secondaryItems = menuItems
    .filter((item) => secondaryMenuIds.has(item.id))
    .filter((item) => canView(item.permission));
  const shouldShowDivider =
    primaryItems.length > 0 && secondaryItems.length > 0;

  return (
    <aside className="sidebar">
      <BrandMark pharmacyName={pharmacyName} />

      <button
        className="sidebar-collapse"
        aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"}
        type="button"
        onClick={toggleCollapsed}
      >
        {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
      </button>

      <nav className="side-menu" aria-label="Menu principal">
        {primaryItems.map((item) => {
          const badge = badges[item.id];
          return (
          <button
            key={item.id}
            type="button"
            className={
              currentView === item.id ? "side-link active" : "side-link"
            }
            title={isCollapsed ? item.label : undefined}
            onClick={() => setCurrentView(item.id)}
          >
            <span className="side-icon">
              <item.icon size={23} strokeWidth={2.1} />
              {badge ? <span className="nav-badge">{badge > 99 ? '99+' : badge}</span> : null}
            </span>
            <span className="side-label">{item.label}</span>
          </button>
          );
        })}

        {shouldShowDivider ? <div className="side-divider" /> : null}

        {secondaryItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              currentView === item.id ? "side-link active" : "side-link"
            }
            title={isCollapsed ? item.label : undefined}
            onClick={() => setCurrentView(item.id)}
          >
            <span className="side-icon">
              <item.icon size={23} strokeWidth={2.1} />
            </span>
            <span className="side-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <button type="button" className="backup-button">
        <span>
          <PackageCheck size={40} />
        </span>
        <strong>Backup</strong>
        <small>Actualizações</small>
      </button>

      <button
        type="button"
        className="close-app-button"
        title={isCollapsed ? 'Fechar sistema' : undefined}
        onClick={handleCloseApp}
      >
        <Power size={20} />
        <span className="close-app-label">Fechar sistema</span>
      </button>
    </aside>
  );
}

export default Navbar;

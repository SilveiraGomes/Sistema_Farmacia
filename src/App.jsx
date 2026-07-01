import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChevronDown, LogOut, Search } from "lucide-react";
import { useAuth } from "./auth/AuthContext";
import { SettingsProvider } from "./configuration/SettingsContext";
import { OperationProvider } from "./operation/OperationContext";
import Navbar from "./components/Navbar";
import ChangePassword from "./components/ChangePassword";
import Dashboard from "./components/Dashboard";
import Operacao from './components/Operacao';
import Estoque from "./components/Estoque";
import Vendas from "./components/Vendas";
import Financeiro from "./components/Financeiro";
import Clientes from "./components/Clientes";
import Login from "./components/Login";
import Relatorios from "./components/Relatorios";
import Documentos from "./components/Documentos";
import Configuracoes from "./components/Configuracoes";
import Usuarios from "./components/Usuarios";
import Fornecedores from "./components/Fornecedores";
import Encomendas from "./components/Encomendas";
import BrandMark from "./components/BrandMark";
import { confirmLogout } from "./utils/confirmations.mjs";
import { request } from "./services/ipcClient.js";
import { useLicense } from "./licensing/LicenseContext";
import LicenseActivation from "./components/LicenseActivation";
import LicenseBanner from "./components/LicenseBanner";
import LicenseWriteGuard from "./licensing/LicenseWriteGuard";
import { getLicenseEntryMode } from "./licensing/licenseUi.mjs";

const viewTitles = {
  dashboard: "Painel",
  operacao: 'Operação',
  vendas: "Vendas",
  estoque: "Estoque",
  financeiro: "Finanças",
  clientes: "Clientes",
  relatorios: "Relatórios",
  documentos: "Documentos",
  configuracoes: "Configurações",
  usuarios: "Usuários",
  fornecedores: "Fornecedores",
  encomendas: "Encomendas",
};

const viewPermissions = {
  dashboard: "dashboard.ver",
  operacao: 'operacao.ver',
  vendas: "vendas.ver",
  estoque: "estoque.ver",
  financeiro: "financeiro.ver",
  clientes: "clientes.ver",
  relatorios: "relatorios.ver",
  documentos: "documentos.ver",
  configuracoes: "configuracoes.ver",
  usuarios: "usuarios.ver",
  fornecedores: "fornecedores.ver",
  encomendas: "compras.ver",
};

const canonicalViewOrder = Object.keys(viewPermissions);

function getAllowedViews(hasPermission) {
  if (typeof hasPermission !== "function") {
    return canonicalViewOrder;
  }

  return canonicalViewOrder.filter((view) =>
    hasPermission(viewPermissions[view]),
  );
}

function getInitials(user) {
  const displayName = user?.nome_completo || user?.nome_usuario || "Utilizador";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return initials.toUpperCase() || "US";
}

function App() {
  const { status: licenseStatus } = useLicense();
  const licenseEntryMode = getLicenseEntryMode(licenseStatus.state);
  const { user, mustChangePassword, isLoading, logout, hasPermission } =
    useAuth();
  const [currentView, setCurrentView] = useState("dashboard");
  const [isMenuCollapsed, setIsMenuCollapsed] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState(() => new Set());
  const [systemAlerts, setSystemAlerts] = useState([]);
  const previousUserId = useRef(user?.id);
  const profileMenuRef = useRef(null);
  const notificationsRef = useRef(null);
  const allowedViews = useMemo(
    () => getAllowedViews(hasPermission),
    [hasPermission],
  );
  const firstAllowedView = allowedViews[0] ?? null;
  const activeView = allowedViews.includes(currentView)
    ? currentView
    : firstAllowedView;
  const rawTitle = activeView
    ? (viewTitles[activeView] ?? "Painel")
    : "Sem acesso";
  const title = rawTitle;
  const displayName = user?.nome_completo || user?.nome_usuario || "Usuario";
  const initials = getInitials(user);
  const notifications = systemAlerts;
  const unreadNotifications = notifications.filter(
    (notification) => !readNotificationIds.has(notification.id),
  );
  const navBadges = {};

  useEffect(() => {
    if (!user) return;
    async function fetchAlerts() {
      try {
        const alerts = await request("alerts.getSystemAlerts", { alertConfig: {} });
        setSystemAlerts(alerts || []);
      } catch { /* non-critical */ }
    }
    fetchAlerts();
    const timer = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    const fallbackView = firstAllowedView ?? "dashboard";

    if (previousUserId.current !== user?.id) {
      previousUserId.current = user?.id;
      setCurrentView(fallbackView);
      return;
    }

    setCurrentView((view) =>
      allowedViews.includes(view) ? view : fallbackView,
    );
  }, [allowedViews, firstAllowedView, user?.id]);

  useEffect(() => {
    function closeTopbarMenus(event) {
      if (!profileMenuRef.current?.contains(event.target)) {
        setIsProfileMenuOpen(false);
      }

      if (!notificationsRef.current?.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeTopbarMenus);
    return () => document.removeEventListener("mousedown", closeTopbarMenus);
  }, []);

  function markNotificationsRead(ids) {
    setReadNotificationIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function handleNotificationAction(notification) {
    markNotificationsRead([notification.id]);
    setIsNotificationsOpen(false);

    if (allowedViews.includes(notification.actionView)) {
      setCurrentView(notification.actionView);
    }
  }

  async function handleLogout() {
    if (!(await confirmLogout())) {
      return;
    }

    try {
      await logout();
    } catch {
      // AuthContext keeps the error message for any future shell-level display.
    }
  }

  const currentScreen = useMemo(() => {
    switch (activeView) {
      case "dashboard":
        return <Dashboard />;
      case 'operacao':
        return <Operacao />;
      case "vendas":
        return <Vendas />;
      case "estoque":
        return <Estoque />;
      case "financeiro":
        return <Financeiro />;
      case "clientes":
        return <Clientes />;
      case "relatorios":
        return <Relatorios />;
      case "documentos":
        return <Documentos />;
      case "configuracoes":
        return <Configuracoes />;
      case "usuarios":
        return <Usuarios />;
      case "fornecedores":
        return <Fornecedores />;
      case "encomendas":
        return <Encomendas />;
      default:
        return (
          <section className="empty-state">
            <h2>Sem permissões disponíveis</h2>
            <p>
              Contacte um administrador para rever o acesso deste utilizador.
            </p>
          </section>
        );
    }
  }, [activeView]);

  if (licenseEntryMode === "loading") {
    return <main className="license-boot" aria-label="A verificar licença">A verificar licença…</main>;
  }

  if (licenseEntryMode === "activation") {
    return <><LicenseBanner /><LicenseActivation /></>;
  }

  if (isLoading) {
    return (
      <main className="auth-screen">
        <section className="auth-card compact">
          <BrandMark className="auth-brand" />
          <p className="auth-loading">A carregar sessão...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (mustChangePassword) {
    return <ChangePassword />;
  }

  return (
    <SettingsProvider>
      <OperationProvider>
        <div
          className={`${isMenuCollapsed ? "app-shell menu-collapsed" : "app-shell"}${licenseStatus.readOnly ? " license-read-only" : ""}`}
        >
          <Navbar
            currentView={activeView}
            hasPermission={hasPermission}
            isCollapsed={isMenuCollapsed}
            setCurrentView={setCurrentView}
            toggleCollapsed={() => setIsMenuCollapsed((current) => !current)}
            badges={navBadges}
          />
          <div className="workspace">
            <LicenseBanner />
            <header className="topbar">
              <h1>{title}</h1>
              <div className="global-search" aria-label="Pesquisar">
                <Search className="search-icon" size={24} />
                <input aria-label="Pesquisa global" />
              </div>
              <div className="topbar-actions">
                <div className="notifications-wrapper" ref={notificationsRef}>
                  <button
                    className="notification-button"
                    aria-expanded={isNotificationsOpen}
                    aria-haspopup="menu"
                    aria-label="Notificações"
                    type="button"
                    onClick={() => {
                      setIsNotificationsOpen((current) => !current);
                      setIsProfileMenuOpen(false);
                    }}
                  >
                    <Bell size={24} />
                    {unreadNotifications.length ? (
                      <span className="nav-badge" aria-label={`${unreadNotifications.length} notificações novas`}>
                        {unreadNotifications.length > 99 ? '99+' : unreadNotifications.length}
                      </span>
                    ) : null}
                  </button>
                  {isNotificationsOpen ? (
                    <div className="notifications-menu" role="menu">
                      <div className="notifications-menu-header">
                        <span>Notificações</span>
                        <button
                          type="button"
                          onClick={() =>
                            markNotificationsRead(
                              notifications.map(
                                (notification) => notification.id,
                              ),
                            )
                          }
                        >
                          Marcar lidas
                        </button>
                      </div>
                      <div className="notifications-list">
                        {notifications.map((notification) => (
                          <article
                            className={
                              readNotificationIds.has(notification.id)
                                ? "notification-item read"
                                : `notification-item ${notification.severity}`
                            }
                            key={notification.id}
                            role="menuitem"
                          >
                            <div>
                              <span>{notification.title}</span>
                              <p>{notification.message}</p>
                              {notification.detail ? (
                                <small>{notification.detail}</small>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              disabled={
                                !allowedViews.includes(notification.actionView)
                              }
                              onClick={() =>
                                handleNotificationAction(notification)
                              }
                            >
                              {notification.actionLabel}
                            </button>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="profile-menu-wrapper" ref={profileMenuRef}>
                  <button
                    className="profile-button"
                    aria-expanded={isProfileMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Perfil do utilizador"
                    type="button"
                    onClick={() => setIsProfileMenuOpen((current) => !current)}
                  >
                    <span className="avatar">{initials}</span>
                    <strong>{displayName}</strong>
                    <span className="chevron">
                      <ChevronDown size={18} />
                    </span>
                  </button>
                  {isProfileMenuOpen ? (
                    <div className="profile-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleLogout}
                      >
                        <LogOut size={18} />
                        Sair do sistema
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </header>
            <main className="screen-frame">
              <LicenseWriteGuard>{currentScreen}</LicenseWriteGuard>
            </main>
          </div>
        </div>
      </OperationProvider>
    </SettingsProvider>
  );
}

export default App;

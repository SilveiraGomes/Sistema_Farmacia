const { ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const authService = require("./services/authService");
const userService = require("./services/userService");
const profileService = require("./services/profileService");
const operationService = require("./services/operationService");
const reportQueueService = require("./services/reportQueueService");
const reportSyncService = require("./services/reportSyncService");
const dashboardService = require("./services/dashboardService");
const fornecedorService = require("./services/fornecedorService");
const estoqueService = require("./services/estoqueService");
const encomendaService = require("./services/encomendaService");
const financeiroService = require("./services/financeiroService");
const relatorioService = require("./services/relatorioService");
const backupService = require("./services/backupService");
const alertService = require("./services/alertService");
const clienteService = require("./services/clienteService");
const vendaService = require("./services/vendaService");
const { assertPermission } = require("./services/authorizationService");
const {
  CONFIGURATION_ERROR_CODES,
  createConfigurationService,
} = require("./services/configurationService");
const invoicePrintService = require("./services/invoicePrintService");
const heldSalesService = require("./services/heldSalesService");

const CONFIGURATION_SAFE_ERROR_MESSAGES = Object.freeze({
  [CONFIGURATION_ERROR_CODES.VALIDATION]: "Dados de configuracao invalidos.",
  [CONFIGURATION_ERROR_CODES.CONFLICT]:
    "A configuracao foi alterada por outra sessao.",
  [CONFIGURATION_ERROR_CODES.NOT_FOUND]: "Configuracao nao encontrada.",
  [CONFIGURATION_ERROR_CODES.CORRUPT_DATA]:
    "Os dados de configuracao estao invalidos.",
  [CONFIGURATION_ERROR_CODES.PROTECTED]: "Esta configuracao e protegida.",
  [CONFIGURATION_ERROR_CODES.IN_USE]: "Esta configuracao esta em uso.",
  [CONFIGURATION_ERROR_CODES.INVARIANT]:
    "A alteracao viola uma regra de configuracao.",
});

const SAFE_ERROR_MESSAGES = new Set([
  "Acao IPC desconhecida.",
  "Sessao expirada.",
  "Permissao insuficiente.",
  ...fornecedorService.SAFE_ERRORS,
  ...estoqueService.SAFE_ERRORS,
  ...clienteService.SAFE_ERRORS,
  ...vendaService.SAFE_ERRORS,
  ...financeiroService.SAFE_ERRORS,
  ...encomendaService.SAFE_ERRORS,
  ...financeiroService.SAFE_ERRORS,
  ...backupService.SAFE_ERRORS,
  "Credenciais invalidas.",
  "Usuario inativo.",
  "Usuario temporariamente bloqueado.",
  "Senha atual invalida.",
  "Troca de senha obrigatoria.",
  "Dados do usuario sao obrigatorios.",
  "nome_usuario e obrigatorio.",
  "nome_completo e obrigatorio.",
  "Informe ao menos um campo para atualizar.",
  "Nome de usuario ja cadastrado.",
  "Email ja cadastrado.",
  "Perfil nao encontrado.",
  "Usuario nao encontrado.",
  "Nao e possivel remover o perfil do ultimo administrador ativo.",
  "Nao e possivel inativar o ultimo administrador ativo.",
  "Permissoes invalidas.",
  "Chaves de permissao invalidas.",
  "Nao e possivel remover permissoes essenciais do Administrador.",
  ...Object.values(CONFIGURATION_SAFE_ERROR_MESSAGES),
  ...operationService.SAFE_OPERATION_ERRORS,
]);

const SAFE_ERROR_CODES = new Set([
  "SESSION_EXPIRED",
  "UNKNOWN_ACTION",
  "PERMISSION_DENIED",
  "PASSWORD_CHANGE_REQUIRED",
  "INSUFFICIENT_STOCK",
  "VALIDATION",
  "NOT_FOUND",
  "CONFLICT",
]);

function serializeError(error) {
  const code = error && error.code ? error.code : "IPC_REQUEST_FAILED";
  const message = error && error.message ? error.message : "";
  const configurationMessage = CONFIGURATION_SAFE_ERROR_MESSAGES[code];
  const isSafeMessage =
    SAFE_ERROR_CODES.has(code) ||
    SAFE_ERROR_MESSAGES.has(message) ||
    message.startsWith("Permissoes desconhecidas:");

  return {
    message:
      configurationMessage ||
      (isSafeMessage ? message : "Erro ao processar requisicao."),
    code,
  };
}

function isPasswordChangeRequired(session) {
  return (
    session.mustChangePassword === true ||
    (session.user && session.user.deve_trocar_senha === true)
  );
}

function throwPasswordChangeRequired() {
  const error = new Error("Troca de senha obrigatoria.");
  error.code = "PASSWORD_CHANGE_REQUIRED";
  throw error;
}

async function getCurrentSession(dependencies) {
  const session = await dependencies.authService.getCurrentSession();
  if (!session || !session.user || !session.user.id) {
    await dependencies.heldSalesService.clear();
    const error = new Error("Sessao expirada.");
    error.code = "SESSION_EXPIRED";
    throw error;
  }

  return session;
}

async function withPermission(dependencies, permissionKey, handler) {
  const session = await getCurrentSession(dependencies);
  if (isPasswordChangeRequired(session)) {
    throwPasswordChangeRequired();
  }

  const actorUserId = session.user.id;
  await dependencies.assertPermission(actorUserId, permissionKey);
  return handler(actorUserId);
}

function getTargetUserId(data = {}) {
  return data.userId !== undefined ? data.userId : data.id;
}

function stripIdentityFields(data = {}) {
  const { id, userId, ...fields } = data;
  return fields;
}

function getUpdateUserData(data = {}) {
  if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) {
    return stripIdentityFields(data.data);
  }

  return stripIdentityFields(data);
}

function toProfileSummary(profile) {
  const { permissoes, ...summary } = profile;
  return summary;
}

function buildRouteMap(overrides = {}) {
  const dependencies = {
    authService,
    userService,
    profileService,
    operationService,
    reportQueueService,
    reportSyncService,
    dashboardService,
    fornecedorService,
    estoqueService,
    clienteService,
    vendaService,
    encomendaService,
    financeiroService,
    relatorioService,
    backupService,
    alertService,
    configurationService: null,
    heldSalesService,
    assertPermission,
    electronApp: null,
    getMainWindow: null,
    ...overrides,
  };

  return {
    "auth.login": (data) => dependencies.authService.login(data),
    "auth.loginWithPin": (data = {}) =>
      dependencies.authService.loginWithPin({ userId: data.userId, pin: data.pin }),
    "auth.loginUsers": () => dependencies.userService.listLoginUsers(),
    "auth.usersWithPin": () => dependencies.userService.listUsersWithPin(),
    "auth.logout": async () => {
      await dependencies.heldSalesService.clear();
      return dependencies.authService.logout();
    },
    "auth.currentSession": async () => {
      const session = await dependencies.authService.getCurrentSession();
      if (!session) {
        await dependencies.heldSalesService.clear();
      }
      return session;
    },
    "auth.changeOwnPassword": (data) =>
      dependencies.authService.changeOwnPassword(data),
    "auth.activity": () => {
      dependencies.authService.touchActivity();
      return { ok: true };
    },
    "auth.setSessionTimeout": (data = {}) => {
      dependencies.authService.setSessionTimeout(data.minutes ?? 30);
      return { ok: true };
    },

    "users.list": () =>
      withPermission(dependencies, "usuarios.ver", () =>
        dependencies.userService.listUsers(),
      ),
    "users.create": (data) =>
      withPermission(dependencies, "usuarios.criar", (actorUserId) =>
        dependencies.userService.createUser({ actorUserId, data }),
      ),
    "users.update": (data = {}) =>
      withPermission(dependencies, "usuarios.editar", (actorUserId) => {
        return dependencies.userService.updateUser({
          actorUserId,
          userId: getTargetUserId(data),
          data: getUpdateUserData(data),
        });
      }),
    "users.activate": (data = {}) =>
      withPermission(dependencies, "usuarios.editar", (actorUserId) =>
        dependencies.userService.activateUser({
          actorUserId,
          userId: getTargetUserId(data),
        }),
      ),
    "users.deactivate": (data = {}) =>
      withPermission(dependencies, "usuarios.inativar", (actorUserId) =>
        dependencies.userService.deactivateUser({
          actorUserId,
          userId: getTargetUserId(data),
        }),
      ),
    "users.setPin": (data = {}) =>
      withPermission(dependencies, "usuarios.editar", (actorUserId) =>
        dependencies.userService.setUserPin({ actorUserId, targetUserId: data.userId, pin: data.pin }),
      ),
    "users.clearPin": (data = {}) =>
      withPermission(dependencies, "usuarios.editar", (actorUserId) =>
        dependencies.userService.clearUserPin({ actorUserId, targetUserId: data.userId }),
      ),
    "users.resetPassword": (data = {}) =>
      withPermission(dependencies, "usuarios.resetar_senha", (actorUserId) =>
        dependencies.userService.resetUserPassword({
          actorUserId,
          userId: getTargetUserId(data),
        }),
      ),

    "profiles.summaries": () =>
      withPermission(dependencies, "usuarios.ver", async () => {
        const profiles = await dependencies.profileService.listProfiles();
        return profiles.map(toProfileSummary);
      }),
    "profiles.list": () =>
      withPermission(dependencies, "usuarios.gerir_permissoes", () =>
        dependencies.profileService.listProfiles(),
      ),
    "profiles.permissions": () =>
      withPermission(dependencies, "usuarios.gerir_permissoes", () =>
        dependencies.profileService.listPermissions(),
      ),
    "profiles.updatePermissions": (data = {}) =>
      withPermission(dependencies, "usuarios.gerir_permissoes", (actorUserId) =>
        dependencies.profileService.updateProfilePermissions({
          actorUserId,
          profileId: data.profileId,
          permissionKeys: data.permissionKeys,
        }),
      ),

    "fornecedores.list": (data = {}) =>
      withPermission(dependencies, "fornecedores.ver", () =>
        dependencies.fornecedorService.listFornecedores(data),
      ),
    "fornecedores.create": (data = {}) =>
      withPermission(dependencies, "fornecedores.criar", () =>
        dependencies.fornecedorService.createFornecedor(data),
      ),
    "fornecedores.update": (data = {}) =>
      withPermission(dependencies, "fornecedores.editar", () =>
        dependencies.fornecedorService.updateFornecedor(data),
      ),
    "fornecedores.toggle": (data = {}) =>
      withPermission(dependencies, "fornecedores.editar", () =>
        dependencies.fornecedorService.toggleFornecedor(data),
      ),

    "estoque.addLot": (data = {}) =>
      withPermission(dependencies, "estoque.ajustar", () =>
        dependencies.estoqueService.addStockLot(data),
      ),
    "estoque.deduct": (data = {}) =>
      withPermission(dependencies, "estoque.ajustar", () =>
        dependencies.estoqueService.deductStockFIFO(data),
      ),
    "estoque.getLotes": (data = {}) =>
      withPermission(dependencies, "estoque.ver", () =>
        dependencies.estoqueService.getLotes(data.produto_id),
      ),
    "estoque.updatePrice": (data = {}) =>
      withPermission(dependencies, "estoque.preco", () =>
        dependencies.estoqueService.updateProductPrice(data),
      ),
    "estoque.listPrices": (data = {}) =>
      withPermission(dependencies, "estoque.ver", () =>
        dependencies.estoqueService.listPrices(data),
      ),
    "estoque.listProducts": (data = {}) =>
      withPermission(dependencies, "estoque.ver", () =>
        dependencies.estoqueService.listProducts(data),
      ),
    "estoque.createProduct": (data = {}) =>
      withPermission(dependencies, "estoque.criar", () =>
        dependencies.estoqueService.createProduct(data),
      ),
    "estoque.updateProduct": (data = {}) =>
      withPermission(dependencies, "estoque.editar", () =>
        dependencies.estoqueService.updateProduct(data),
      ),
    "estoque.deleteProduct": (data = {}) =>
      withPermission(dependencies, "estoque.apagar", () =>
        dependencies.estoqueService.deleteProduct(data.produto_id),
      ),
    "estoque.getProduct": (data = {}) =>
      withPermission(dependencies, "estoque.ver", () =>
        dependencies.estoqueService.getProduct(data.produto_id),
      ),
    "estoque.listCategories": () =>
      withPermission(dependencies, "estoque.ver", () =>
        dependencies.estoqueService.listCategories(),
      ),
    "estoque.createCategory": (data = {}) =>
      withPermission(dependencies, "estoque.criar", () =>
        dependencies.estoqueService.createCategory(data),
      ),
    "estoque.listSubcategories": (data = {}) =>
      withPermission(dependencies, "estoque.ver", () =>
        dependencies.estoqueService.listSubcategories(data),
      ),
    "estoque.createSubcategory": (data = {}) =>
      withPermission(dependencies, "estoque.criar", () =>
        dependencies.estoqueService.createSubcategory(data),
      ),
    "estoque.updateCategory": (data = {}) =>
      withPermission(dependencies, "estoque.editar", () =>
        dependencies.estoqueService.updateCategory(data),
      ),
    "estoque.deleteCategory": (data = {}) =>
      withPermission(dependencies, "estoque.editar", () =>
        dependencies.estoqueService.deleteCategory(data),
      ),
    "estoque.updateSubcategory": (data = {}) =>
      withPermission(dependencies, "estoque.editar", () =>
        dependencies.estoqueService.updateSubcategory(data),
      ),
    "estoque.deleteSubcategory": (data = {}) =>
      withPermission(dependencies, "estoque.editar", () =>
        dependencies.estoqueService.deleteSubcategory(data),
      ),

    "estoque.importCategories": (data = {}) =>
      withPermission(dependencies, "estoque.editar", () =>
        dependencies.estoqueService.importCategories(data.rows || []),
      ),

    "estoque.importSubcategories": (data = {}) =>
      withPermission(dependencies, "estoque.editar", () =>
        dependencies.estoqueService.importSubcategories(data.rows || []),
      ),

    "estoque.importProducts": (data = {}) =>
      withPermission(dependencies, "estoque.editar", () =>
        dependencies.estoqueService.importProducts(data.rows || []),
      ),

    "clientes.list": (data = {}) =>
      withPermission(dependencies, "clientes.ver", () =>
        dependencies.clienteService.listClientes(data),
      ),
    "clientes.getById": (data = {}) =>
      withPermission(dependencies, "clientes.ver", () =>
        dependencies.clienteService.getCliente(data.id),
      ),
    "clientes.create": (data = {}) =>
      withPermission(dependencies, "clientes.criar", () =>
        dependencies.clienteService.createCliente(data),
      ),
    "clientes.update": (data = {}) =>
      withPermission(dependencies, "clientes.editar", () =>
        dependencies.clienteService.updateCliente(data.id, data),
      ),
    "clientes.delete": (data = {}) =>
      withPermission(dependencies, "clientes.apagar", () =>
        dependencies.clienteService.deleteCliente(data.id),
      ),

    "vendas.create": (data = {}) =>
      withPermission(dependencies, "vendas.criar", (actorUserId) =>
        dependencies.vendaService.createVenda(data, actorUserId),
      ),
    "vendas.recentDocuments": (data = {}) =>
      withPermission(dependencies, "vendas.ver", () =>
        dependencies.vendaService.listRecentDocuments(data),
      ),
    "vendas.listDocuments": (data = {}) =>
      withPermission(dependencies, "vendas.ver", () =>
        dependencies.vendaService.listDocuments(data),
      ),
    "vendas.cancelDocument": (data = {}) =>
      withPermission(dependencies, "vendas.cancelar", (actorUserId) =>
        dependencies.vendaService.cancelDocument(data, actorUserId),
      ),
    "vendas.convertProforma": (data = {}) =>
      withPermission(dependencies, "vendas.criar", (actorUserId) =>
        dependencies.vendaService.convertProforma(data, actorUserId),
      ),

    "compras.list": (data = {}) =>
      withPermission(dependencies, "compras.ver", () =>
        dependencies.encomendaService.listEncomendas(data),
      ),
    "compras.create": (data = {}) =>
      withPermission(dependencies, "compras.criar", (actorUserId) =>
        dependencies.encomendaService.createEncomenda({ ...data, actorUserId }),
      ),
    "compras.updateStatus": (data = {}) =>
      withPermission(dependencies, "compras.editar", () =>
        dependencies.encomendaService.updateEncomendaStatus(data),
      ),
    "compras.receive": (data = {}) =>
      withPermission(dependencies, "compras.receber", (actorUserId) =>
        dependencies.encomendaService.receberEncomenda({ ...data, actorUserId }),
      ),

    "financeiro.contasPagar": () =>
      withPermission(dependencies, "financeiro.ver", () =>
        dependencies.financeiroService.listContasPagar(),
      ),
    "financeiro.marcarPago": (data = {}) =>
      withPermission(dependencies, "financeiro.ver", () =>
        dependencies.financeiroService.marcarPago(data.id),
      ),
    "financeiro.list": (data = {}) =>
      withPermission(dependencies, "financeiro.ver", () =>
        dependencies.financeiroService.listTransactions(data),
      ),
    "financeiro.overview": (data = {}) =>
      withPermission(dependencies, "financeiro.ver", () =>
        dependencies.financeiroService.getOverviewData(data),
      ),
    "financeiro.create": (data = {}) =>
      withPermission(dependencies, "financeiro.criar", (actorUserId) =>
        dependencies.financeiroService.createTransaction(data, actorUserId),
      ),
    "financeiro.delete": (data = {}) =>
      withPermission(dependencies, "financeiro.apagar", (actorUserId) =>
        dependencies.financeiroService.deleteTransaction(data.id, actorUserId),
      ),

    "relatorio.data": (data = {}) =>
      withPermission(dependencies, "relatorios.ver", () =>
        dependencies.relatorioService.getReportData({ reportId: data.reportId, filters: data.filters || {} }),
      ),
    "relatorio.rawData": (data = {}) =>
      withPermission(dependencies, "relatorios.ver", () =>
        dependencies.relatorioService.getRawData({ startDate: data.startDate, endDate: data.endDate }),
      ),

    "backup.manual": (data = {}) =>
      withPermission(dependencies, "configuracoes.ver", (userId) => {
        const userName = userId ? String(userId) : "Manual";
        return dependencies.backupService.createBackup({
          app: dependencies.electronApp,
          type: "manual",
          createdBy: userName,
          folderPath: data.folderPath || undefined,
        });
      }),
    "backup.list": (data = {}) =>
      withPermission(dependencies, "configuracoes.ver", () =>
        dependencies.backupService.listBackups({ app: dependencies.electronApp, folderPath: data.folderPath || undefined }),
      ),
    "backup.restore": (data = {}) =>
      withPermission(dependencies, "configuracoes.ver", () =>
        dependencies.backupService.restoreBackup({ name: data.name, app: dependencies.electronApp }),
      ),
    "backup.delete": (data = {}) =>
      withPermission(dependencies, "configuracoes.editar", () =>
        dependencies.backupService.deleteBackup({ name: data.name, app: dependencies.electronApp, folderPath: data.folderPath }),
      ),
    "backup.integrityCheck": () =>
      withPermission(dependencies, "configuracoes.ver", () =>
        dependencies.backupService.integrityCheck(),
      ),
    "backup.serviceStatus": (data = {}) =>
      withPermission(dependencies, "configuracoes.ver", () => {
        const status = dependencies.backupService.getServiceStatus({
          app: dependencies.electronApp,
          autoConfig: data.autoConfig || {},
          folderPath: data.folderPath,
        });
        return status;
      }),
    "backup.openFolder": (data = {}) =>
      withPermission(dependencies, "configuracoes.ver", async () => {
        const folderPath = dependencies.backupService.getBackupFolderPath(
          dependencies.electronApp,
          data.folderPath,
        );
        if (folderPath && dependencies.electronApp) {
          const { shell } = require("electron");
          const fs = require("fs");
          if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
          await shell.openPath(folderPath);
        }
        return { opened: true };
      }),
    "backup.chooseLocation": () =>
      withPermission(dependencies, "configuracoes.editar", async () => {
        const result = await dialog.showOpenDialog({
          title: "Selecionar pasta de backups",
          properties: ["openDirectory", "createDirectory"],
        });
        if (result.canceled || !result.filePaths[0]) return { canceled: true };
        return { folderPath: result.filePaths[0] };
      }),
    "alerts.getSystemAlerts": (data = {}) =>
      withPermission(dependencies, "dashboard.ver", () =>
        dependencies.alertService.getSystemAlerts(data.alertConfig || {}),
      ),

    "dashboard.metrics": (data = {}) =>
      withPermission(dependencies, "dashboard.ver", () =>
        dependencies.dashboardService.getDashboardMetrics({
          shiftOpenAt: data.shiftOpenAt || null,
          lowStockThreshold: data.lowStockThreshold || 25,
        }),
      ),

    "operation.state": () =>
      withPermission(dependencies, "operacao.ver", () =>
        dependencies.operationService.getOperationalState(),
      ),
    "operation.openDay": (data = {}) =>
      withPermission(dependencies, "operacao.abrir_dia", (actorUserId) =>
        dependencies.operationService.openDay({ actorUserId, data }),
      ),
    "operation.closeDay": (data = {}) =>
      withPermission(dependencies, "operacao.fechar_dia", (actorUserId) =>
        dependencies.operationService.closeDay({ actorUserId, data }),
      ),
    "operation.openShift": (data = {}) =>
      withPermission(dependencies, "operacao.abrir_turno", (actorUserId) =>
        dependencies.operationService.openShift({ actorUserId, data }),
      ),
    "operation.closeShift": (data = {}) =>
      withPermission(dependencies, "operacao.fechar_turno", (actorUserId) =>
        dependencies.operationService.closeShift({ actorUserId, data }),
      ),

    "configuration.snapshot": () =>
      withPermission(dependencies, "configuracoes.ver", () =>
        dependencies.configurationService.getSnapshot(),
      ),
    "configuration.updateSection": (data = {}) =>
      withPermission(dependencies, "configuracoes.editar", (actorUserId) =>
        dependencies.configurationService.updateSection({
          ...data,
          actorUserId,
        }),
      ),
    "configuration.importLegacy": (data = {}) =>
      withPermission(dependencies, "configuracoes.editar", (actorUserId) =>
        dependencies.configurationService.importLegacySettings({
          ...data,
          actorUserId,
        }),
      ),
    "configuration.document.reserveNumber": (data = {}) =>
      withPermission(dependencies, "vendas.criar", (actorUserId) =>
        dependencies.configurationService.reserveNextDocumentNumber({
          ...data,
          actorUserId,
        }),
      ),
    "configuration.catalog.create": (data = {}) =>
      withPermission(dependencies, "configuracoes.editar", (actorUserId) =>
        dependencies.configurationService.createCatalogOption({
          ...data,
          actorUserId,
        }),
      ),
    "configuration.catalog.update": (data = {}) =>
      withPermission(dependencies, "configuracoes.editar", (actorUserId) =>
        dependencies.configurationService.updateCatalogOption({
          ...data,
          actorUserId,
        }),
      ),
    "configuration.catalog.reorder": (data = {}) =>
      withPermission(dependencies, "configuracoes.editar", (actorUserId) =>
        dependencies.configurationService.reorderCatalogOptions({
          ...data,
          actorUserId,
        }),
      ),
    "configuration.catalog.activate": (data = {}) =>
      withPermission(dependencies, "configuracoes.editar", (actorUserId) =>
        dependencies.configurationService.activateCatalogOption({
          ...data,
          actorUserId,
        }),
      ),
    "configuration.catalog.deactivate": (data = {}) =>
      withPermission(dependencies, "configuracoes.editar", (actorUserId) =>
        dependencies.configurationService.deactivateCatalogOption({
          ...data,
          actorUserId,
        }),
      ),

    "reports.sync.status": () =>
      withPermission(dependencies, "relatorios.ver", () =>
        dependencies.reportSyncService.getSyncStatus(),
      ),

    "reports.sync.now": () =>
      withPermission(dependencies, "relatorios.exportar", async () => {
        const snapshot = await dependencies.configurationService.getSnapshot();
        const syncConfig = snapshot?.settings?.reports?.googleSheets?.value || null;
        return dependencies.reportSyncService.syncNow(syncConfig);
      }),

    "reports.sync.history": (data = {}) =>
      withPermission(dependencies, "relatorios.ver", () =>
        dependencies.reportQueueService.getSyncHistory(
          data.limit || 50,
          data.offset || 0,
        ),
      ),

    "reports.enqueue": (data = {}) =>
      withPermission(dependencies, "relatorios.ver", (actorUserId) =>
        dependencies.reportQueueService.enqueueReport(
          data.reportId,
          data.reportData,
          data.reportType,
        ),
      ),

    "backup.create": () =>
      withPermission(dependencies, "configuracoes.editar", async () => {
        const electronApp = dependencies.electronApp;
        if (!electronApp) throw new Error("Backup nao disponivel neste ambiente.");
        const dbPath = path.join(electronApp.getPath("userData"), "database.sqlite");
        const defaultName = `backup-esayos-${new Date().toISOString().slice(0, 10)}.sqlite`;
        const result = await dialog.showSaveDialog({
          title: "Guardar backup",
          defaultPath: defaultName,
          filters: [{ name: "Backup SQLite", extensions: ["sqlite", "db"] }],
        });
        if (result.canceled || !result.filePath) return { canceled: true };
        fs.copyFileSync(dbPath, result.filePath);
        return { success: true, filePath: result.filePath, message: "Backup criado com sucesso." };
      }),
    "backup.selectFile": () =>
      withPermission(dependencies, "configuracoes.editar", async () => {
        const result = await dialog.showOpenDialog({
          title: "Seleccionar ficheiro de backup",
          filters: [{ name: "Backup SQLite", extensions: ["sqlite", "db"] }],
          properties: ["openFile"],
        });
        if (result.canceled || !result.filePaths[0]) return { canceled: true };
        return { filePath: result.filePaths[0] };
      }),
    "backup.restore": (data) =>
      withPermission(dependencies, "configuracoes.editar", async () => {
        const electronApp = dependencies.electronApp;
        if (!electronApp) throw new Error("Restauracao de backup nao disponivel neste ambiente.");
        const dbPath = path.join(electronApp.getPath("userData"), "database.sqlite");
        const srcPath = data?.filePath;
        if (!srcPath) throw new Error("Nenhum ficheiro de backup especificado.");
        if (!fs.existsSync(srcPath)) throw new Error("Ficheiro de backup nao encontrado.");
        fs.copyFileSync(dbPath, dbPath + ".pre_restore");
        fs.copyFileSync(srcPath, dbPath);
        return { success: true, message: "Backup restaurado com sucesso. Reinicie o sistema para aplicar as alteracoes." };
      }),

    "invoice.savePDF": async (data = {}) => {
      const vm = data.viewModel || {};
      const docNumber = (vm.document?.number || 'documento').replace(/\//g, '-');
      const issueDate = (vm.document?.issueDate || '').split('-').reverse().join('-');
      const filename = `${docNumber}${issueDate ? '_' + issueDate : ''}.pdf`;
      return invoicePrintService.generateInvoicePDF(vm, filename);
    },

    "heldSales.load": () => dependencies.heldSalesService.load(),

    "heldSales.save": (data = {}) => dependencies.heldSalesService.save(data.sales),

    "heldSales.clear": () => dependencies.heldSalesService.clear(),

    "printing.listPrinters": async () => {
      const win = dependencies.getMainWindow?.();
      if (!win) return [];
      try {
        if (typeof win.webContents.getPrintersAsync === 'function') {
          return await win.webContents.getPrintersAsync();
        }
        return win.webContents.getPrinters?.() ?? [];
      } catch { return []; }
    },

    "invoice.print": async (data = {}) => {
      let printOptions = { previewBeforePrint: true, copies: 1, printerName: '', showDialog: false };
      try {
        const snap = await dependencies.configurationService.getSnapshot();
        printOptions = { ...printOptions, ...(snap.settings.documents?.printOptions?.value ?? {}) };
      } catch {}

      const vm = data.viewModel || {};
      const docTitle = vm.document?.title || 'Factura';
      const docNumber = vm.document?.number || '';
      const windowTitle = docNumber ? `${docTitle} ${docNumber}` : docTitle;
      const safeNumber = docNumber.replace(/\//g, '-');
      const issueDate = (vm.document?.issueDate || '').split('-').reverse().join('-');
      const pdfFilename = `${safeNumber}${issueDate ? '_' + issueDate : ''}.pdf`;

      if (!printOptions.previewBeforePrint) {
        return invoicePrintService.printDirect(vm, printOptions);
      }
      return invoicePrintService.printInvoice(vm, windowTitle, pdfFilename, printOptions);
    },

    "report.savePDF": async (data = {}) => {
      const title = (data.report?.title || 'relatorio').replace(/\s+/g, '-').toLowerCase();
      const today = new Date().toISOString().slice(0, 10).split('-').reverse().join('-');
      const filename = `${title}_${today}.pdf`;
      return invoicePrintService.generateReportPDF(
        data.report || {}, data.branding || {}, data.settings || {}, data.printedBy || '', filename,
      );
    },

    "report.print": async (data = {}) => {
      let printOptions = { previewBeforePrint: true, copies: 1, printerName: '', showDialog: false };
      try {
        const snap = await dependencies.configurationService.getSnapshot();
        printOptions = { ...printOptions, ...(snap.settings.documents?.printOptions?.value ?? {}) };
      } catch {}

      const title = data.report?.title || 'Relatorio';
      const today = new Date().toISOString().slice(0, 10).split('-').reverse().join('-');
      const pdfFilename = `${title.replace(/\s+/g, '-').toLowerCase()}_${today}.pdf`;

      if (!printOptions.previewBeforePrint) {
        return invoicePrintService.printReportDirect(
          data.report || {}, data.branding || {}, data.settings || {}, data.printedBy || '', printOptions,
        );
      }
      return invoicePrintService.printReport(
        data.report || {}, data.branding || {}, data.settings || {}, data.printedBy || '',
        title, pdfFilename, printOptions,
      );
    },

    "window.setFullscreen": (data = {}) => {
      const win = dependencies.getMainWindow?.();
      if (!win) return { fullscreen: false };
      const value = typeof data.value === 'boolean' ? data.value : !win.isFullScreen();
      win.setFullScreen(value);
      return { fullscreen: win.isFullScreen() };
    },

    "window.isFullscreen": () => {
      const win = dependencies.getMainWindow?.();
      return { fullscreen: win ? win.isFullScreen() : false };
    },

    "window.close": () => {
      dependencies.electronApp?.quit();
      return { ok: true };
    },
  };
}

async function handleAppRequest(routes, request = {}) {
  try {
    const { action, data = {} } = request;
    const route = routes[action];
    if (!route) {
      const error = new Error("Acao IPC desconhecida.");
      error.code = "UNKNOWN_ACTION";
      throw error;
    }

    const result = await route(data);
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: serializeError(error) };
  }
}

function replyLegacyError(event, responseAction, error, logMessage) {
  console.error(logMessage, error);
  event.reply("fromMain", {
    action: responseAction,
    error: serializeError(error).message,
  });
}

async function runLegacyRoute(
  event,
  dependencies,
  permissionKey,
  responseAction,
  handler,
  logMessage,
) {
  try {
    const data = await withPermission(dependencies, permissionKey, handler);
    event.reply("fromMain", { action: responseAction, data });
  } catch (error) {
    replyLegacyError(event, responseAction, error, logMessage);
  }
}

function registerLegacyRoutes(
  ipc,
  { Categoria, Subcategoria, Produto },
  overrides = {},
) {
  const dependencies = {
    authService,
    assertPermission,
    ...overrides,
  };

  if (typeof ipc.removeAllListeners === "function") {
    ipc.removeAllListeners("toMain");
  }

  ipc.on("toMain", async (event, args) => {
    switch (args && args.action) {
      case "getProducts":
        await runLegacyRoute(
          event,
          dependencies,
          "estoque.ver",
          "getProductsResponse",
          () => Produto.findAll(),
          "Erro ao buscar produtos:",
        );
        break;
      case "addProduct":
        await runLegacyRoute(
          event,
          dependencies,
          "estoque.criar",
          "addProductResponse",
          () => Produto.create(args.data),
          "Erro ao adicionar produto:",
        );
        break;
      case "getCategories":
        await runLegacyRoute(
          event,
          dependencies,
          "estoque.ver",
          "getCategoriesResponse",
          () => Categoria.findAll({ include: [Subcategoria] }),
          "Erro ao buscar categorias:",
        );
        break;
      case "addCategory":
        await runLegacyRoute(
          event,
          dependencies,
          "estoque.criar",
          "addCategoryResponse",
          () => Categoria.create(args.data),
          "Erro ao adicionar categoria:",
        );
        break;
      case "addSubcategory":
        await runLegacyRoute(
          event,
          dependencies,
          "estoque.criar",
          "addSubcategoryResponse",
          () => Subcategoria.create(args.data),
          "Erro ao adicionar subcategoria:",
        );
        break;
      default:
        console.log("Acao IPC desconhecida:", args.action);
        event.reply("fromMain", {
          action: "unknownAction",
          error: "Acao IPC desconhecida.",
        });
    }
  });
}

async function init(models, options = {}) {
  const ipc = options.ipcMain || ipcMain;
  const configurationService =
    options.configurationService ||
    (options.createConfigurationService || createConfigurationService)({
      db: models.db,
      models,
    });
  const dependencies = {
    configurationService,
    ...(options.authService ? { authService: options.authService } : {}),
    ...(options.assertPermission
      ? { assertPermission: options.assertPermission }
      : {}),
    ...(options.electronApp ? { electronApp: options.electronApp } : {}),
    ...(options.getMainWindow ? { getMainWindow: options.getMainWindow } : {}),
  };
  await configurationService.seedDefaults();
  const routes = buildRouteMap(dependencies);

  if (typeof ipc.removeHandler === "function") {
    ipc.removeHandler("app:request");
  }
  ipc.handle("app:request", (_event, request) =>
    handleAppRequest(routes, request),
  );

  // Print-window dedicated channels (used by printWindowPreload.js)
  const PRINT_CHANNELS = [
    'print:window:listPrinters',
    'print:window:print',
    'print:window:exportPdf',
    'print:window:close',
  ];
  PRINT_CHANNELS.forEach(ch => {
    if (typeof ipc.removeHandler === 'function') ipc.removeHandler(ch);
  });

  ipc.handle('print:window:listPrinters', async (event) => {
    try {
      if (typeof event.sender.getPrintersAsync === 'function') {
        return await event.sender.getPrintersAsync();
      }
      return event.sender.getPrinters ? event.sender.getPrinters() : [];
    } catch { return []; }
  });

  // Electron 32+ removed the callback from webContents.print() — it is now Promise-based.
  // Root cause of "content/page/printable area is empty": marginType:'none' without explicit
  // pageSize leaves Chromium unable to compute page dimensions for physical printers.
  ipc.handle('print:window:print', async (event, opts = {}) => {
    const { BrowserWindow } = require('electron');
    console.log('[print] Impressora:', opts.printerName || '(padrao)');
    console.log('[print] Copias:', opts.copies || 1);
    console.log('[print] silent:', opts.silent === true);

    const win = BrowserWindow?.fromWebContents?.(event.sender);
    if (!win || win.isDestroyed()) {
      console.log('[print] Janela nao encontrada');
      return { success: false, error: 'Janela de impressao nao encontrada.' };
    }

    win.focus();

    // Ensure fonts and CSS layout are fully rendered before measuring
    try {
      await win.webContents.executeJavaScript(
        'document.fonts ? document.fonts.ready.then(function(){return true;}) : Promise.resolve(true)'
      );
    } catch {}
    await new Promise(r => setTimeout(r, 400));

    // Verify the document has measurable content
    let contentInfo = { bodyHeight: 1, bodyWidth: 1, bodyTextLength: 1 };
    try {
      contentInfo = await win.webContents.executeJavaScript(`
        ({
          bodyTextLength: document.body ? document.body.innerText.length : 0,
          bodyHeight: document.body ? document.body.scrollHeight : 0,
          bodyWidth: document.body ? document.body.scrollWidth : 0
        })
      `);
      console.log('[print] contentInfo:', JSON.stringify(contentInfo));
    } catch {}

    if (!contentInfo.bodyHeight || !contentInfo.bodyWidth) {
      return { success: false, error: 'Conteudo do documento nao carregado. Aguarde e tente novamente.' };
    }

    const copies = Math.max(1, Math.min(10, parseInt(opts.copies) || 1));
    const deviceName = opts.printerName || '';

    // Attempt 1 — printableArea margins (most printer-compatible)
    console.log('[print] pageSize: A4, margins: printableArea, deviceName:', deviceName);
    try {
      await invoicePrintService.printWebContents(win.webContents, {
        silent: opts.silent === true,
        printBackground: true,
        deviceName,
        copies,
        pageSize: 'A4',
        landscape: false,
        margins: { marginType: 'printableArea' },
      });
      console.log('[print] success: true');
      return { success: true };
    } catch (err) {
      const msg = err?.message || String(err);
      console.log('[print] error:', msg);

      if (/cancel/i.test(msg)) {
        return { success: false, error: 'Print Cancelled' };
      }

      // Attempt 2 — default margins, silent (no second dialog)
      if (/invalid|empty|size|settings/i.test(msg)) {
        console.log('[print] Tentando fallback: default margins, silent...');
        try {
          await invoicePrintService.printWebContents(win.webContents, {
            silent: true,
            printBackground: true,
            deviceName,
            copies,
            pageSize: 'A4',
            landscape: false,
            margins: { marginType: 'default' },
          });
          console.log('[print] success: true (default margins)');
          return { success: true };
        } catch (err2) {
          console.log('[print] fallback default error:', err2?.message || String(err2));
        }

        // Attempt 3 — PDF fallback: generate PDF → open in system viewer
        console.log('[print] Fallback PDF: gerando PDF temporario...');
        try {
          const pdfBuffer = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            margins: { marginType: 'none' },
          });
          const tmpPdf = path.join(require('os').tmpdir(), `kil-fallback-${Date.now()}.pdf`);
          fs.writeFileSync(tmpPdf, Buffer.from(pdfBuffer));
          const { shell } = require('electron');
          await shell.openPath(tmpPdf);
          setTimeout(() => { try { fs.unlinkSync(tmpPdf); } catch {} }, 60000);
          console.log('[print] PDF fallback aberto:', tmpPdf);
          return {
            success: true,
            method: 'pdf_fallback',
            message: 'PDF aberto no visualizador. Imprima a partir do visualizador.',
          };
        } catch (err3) {
          console.log('[print] PDF fallback error:', err3?.message || String(err3));
          return {
            success: false,
            error: 'A impressora recusou as definicoes de pagina. Exporte o PDF e imprima manualmente.',
          };
        }
      }

      return { success: false, error: msg };
    }
  });

  ipc.handle('print:window:exportPdf', async (event, opts = {}) => {
    const pdfBuffer = await event.sender.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'none' },
    });
    const { dialog, shell } = require('electron');
    const result = await dialog.showSaveDialog({
      title: 'Guardar documento em PDF',
      defaultPath: opts.filename || 'documento.pdf',
      filters: [{ name: 'Documento PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, Buffer.from(pdfBuffer));
    await shell.openPath(result.filePath);
    return { saved: true };
  });

  ipc.handle('print:window:close', (event) => {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow?.fromWebContents?.(event.sender);
    if (win && !win.isDestroyed()) win.close();
  });

  registerLegacyRoutes(ipc, models, dependencies);
}

module.exports = {
  buildRouteMap,
  handleAppRequest,
  init,
  registerLegacyRoutes,
};

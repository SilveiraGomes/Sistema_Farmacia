const { ipcMain } = require("electron");
const authService = require("./services/authService");
const userService = require("./services/userService");
const profileService = require("./services/profileService");
const operationService = require("./services/operationService");
const { assertPermission } = require("./services/authorizationService");
const {
  CONFIGURATION_ERROR_CODES,
  createConfigurationService,
} = require("./services/configurationService");

const CONFIGURATION_SAFE_ERROR_MESSAGES = Object.freeze({
  [CONFIGURATION_ERROR_CODES.VALIDATION]: "Dados de configuracao invalidos.",
  [CONFIGURATION_ERROR_CODES.CONFLICT]: "A configuracao foi alterada por outra sessao.",
  [CONFIGURATION_ERROR_CODES.NOT_FOUND]: "Configuracao nao encontrada.",
  [CONFIGURATION_ERROR_CODES.CORRUPT_DATA]: "Os dados de configuracao estao invalidos.",
  [CONFIGURATION_ERROR_CODES.PROTECTED]: "Esta configuracao e protegida.",
  [CONFIGURATION_ERROR_CODES.IN_USE]: "Esta configuracao esta em uso.",
  [CONFIGURATION_ERROR_CODES.INVARIANT]: "A alteracao viola uma regra de configuracao.",
});

const SAFE_ERROR_MESSAGES = new Set([
  "Acao IPC desconhecida.",
  "Sessao expirada.",
  "Permissao insuficiente.",
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
]);

function serializeError(error) {
  const code = error && error.code ? error.code : "IPC_REQUEST_FAILED";
  const message = error && error.message ? error.message : "";
  const configurationMessage = CONFIGURATION_SAFE_ERROR_MESSAGES[code];
  const isSafeMessage = SAFE_ERROR_CODES.has(code) || SAFE_ERROR_MESSAGES.has(message)
    || message.startsWith("Permissoes desconhecidas:");

  return {
    message: configurationMessage || (isSafeMessage ? message : "Erro ao processar requisicao."),
    code,
  };
}

function isPasswordChangeRequired(session) {
  return session.mustChangePassword === true ||
    (session.user && session.user.deve_trocar_senha === true);
}

function throwPasswordChangeRequired() {
  const error = new Error("Troca de senha obrigatoria.");
  error.code = "PASSWORD_CHANGE_REQUIRED";
  throw error;
}

async function getCurrentSession(dependencies) {
  const session = await dependencies.authService.getCurrentSession();
  if (!session || !session.user || !session.user.id) {
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
    configurationService: null,
    assertPermission,
    ...overrides,
  };

  return {
    "auth.login": (data) => dependencies.authService.login(data),
    "auth.loginUsers": () => dependencies.userService.listLoginUsers(),
    "auth.logout": () => dependencies.authService.logout(),
    "auth.currentSession": () => dependencies.authService.getCurrentSession(),
    "auth.changeOwnPassword": (data) => dependencies.authService.changeOwnPassword(data),

    "users.list": () => withPermission(dependencies, "usuarios.ver", () => (
      dependencies.userService.listUsers()
    )),
    "users.create": (data) => withPermission(dependencies, "usuarios.criar", (actorUserId) => (
      dependencies.userService.createUser({ actorUserId, data })
    )),
    "users.update": (data = {}) => withPermission(dependencies, "usuarios.editar", (actorUserId) => {
      return dependencies.userService.updateUser({
        actorUserId,
        userId: getTargetUserId(data),
        data: getUpdateUserData(data),
      });
    }),
    "users.activate": (data = {}) => withPermission(dependencies, "usuarios.editar", (actorUserId) => (
      dependencies.userService.activateUser({ actorUserId, userId: getTargetUserId(data) })
    )),
    "users.deactivate": (data = {}) => withPermission(dependencies, "usuarios.inativar", (actorUserId) => (
      dependencies.userService.deactivateUser({ actorUserId, userId: getTargetUserId(data) })
    )),
    "users.resetPassword": (data = {}) => withPermission(dependencies, "usuarios.resetar_senha", (actorUserId) => (
      dependencies.userService.resetUserPassword({ actorUserId, userId: getTargetUserId(data) })
    )),

    "profiles.summaries": () => withPermission(dependencies, "usuarios.ver", async () => {
      const profiles = await dependencies.profileService.listProfiles();
      return profiles.map(toProfileSummary);
    }),
    "profiles.list": () => withPermission(dependencies, "usuarios.gerir_permissoes", () => (
      dependencies.profileService.listProfiles()
    )),
    "profiles.permissions": () => withPermission(dependencies, "usuarios.gerir_permissoes", () => (
      dependencies.profileService.listPermissions()
    )),
    "profiles.updatePermissions": (data = {}) => withPermission(dependencies, "usuarios.gerir_permissoes", (actorUserId) => (
      dependencies.profileService.updateProfilePermissions({
        actorUserId,
        profileId: data.profileId,
        permissionKeys: data.permissionKeys,
      })
    )),

    "operation.state": () => withPermission(dependencies, "operacao.ver", () => (
      dependencies.operationService.getOperationalState()
    )),
    "operation.openDay": (data = {}) => withPermission(dependencies, "operacao.abrir_dia", (actorUserId) => (
      dependencies.operationService.openDay({ actorUserId, data })
    )),
    "operation.closeDay": (data = {}) => withPermission(dependencies, "operacao.fechar_dia", (actorUserId) => (
      dependencies.operationService.closeDay({ actorUserId, data })
    )),
    "operation.openShift": (data = {}) => withPermission(dependencies, "operacao.abrir_turno", (actorUserId) => (
      dependencies.operationService.openShift({ actorUserId, data })
    )),
    "operation.closeShift": (data = {}) => withPermission(dependencies, "operacao.fechar_turno", (actorUserId) => (
      dependencies.operationService.closeShift({ actorUserId, data })
    )),

    "configuration.snapshot": () => withPermission(dependencies, "configuracoes.ver", () => (
      dependencies.configurationService.getSnapshot()
    )),
    "configuration.updateSection": (data = {}) => withPermission(dependencies, "configuracoes.editar", (actorUserId) => (
      dependencies.configurationService.updateSection({ ...data, actorUserId })
    )),
    "configuration.importLegacy": (data = {}) => withPermission(dependencies, "configuracoes.editar", (actorUserId) => (
      dependencies.configurationService.importLegacySettings({ ...data, actorUserId })
    )),
    "configuration.document.reserveNumber": (data = {}) => withPermission(dependencies, "vendas.criar", (actorUserId) => (
      dependencies.configurationService.reserveNextDocumentNumber({ ...data, actorUserId })
    )),
    "configuration.catalog.create": (data = {}) => withPermission(dependencies, "configuracoes.editar", (actorUserId) => (
      dependencies.configurationService.createCatalogOption({ ...data, actorUserId })
    )),
    "configuration.catalog.update": (data = {}) => withPermission(dependencies, "configuracoes.editar", (actorUserId) => (
      dependencies.configurationService.updateCatalogOption({ ...data, actorUserId })
    )),
    "configuration.catalog.reorder": (data = {}) => withPermission(dependencies, "configuracoes.editar", (actorUserId) => (
      dependencies.configurationService.reorderCatalogOptions({ ...data, actorUserId })
    )),
    "configuration.catalog.activate": (data = {}) => withPermission(dependencies, "configuracoes.editar", (actorUserId) => (
      dependencies.configurationService.activateCatalogOption({ ...data, actorUserId })
    )),
    "configuration.catalog.deactivate": (data = {}) => withPermission(dependencies, "configuracoes.editar", (actorUserId) => (
      dependencies.configurationService.deactivateCatalogOption({ ...data, actorUserId })
    )),
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
  event.reply("fromMain", { action: responseAction, error: serializeError(error).message });
}

async function runLegacyRoute(event, dependencies, permissionKey, responseAction, handler, logMessage) {
  try {
    const data = await withPermission(dependencies, permissionKey, handler);
    event.reply("fromMain", { action: responseAction, data });
  } catch (error) {
    replyLegacyError(event, responseAction, error, logMessage);
  }
}

function registerLegacyRoutes(ipc, { Categoria, Subcategoria, Produto }, overrides = {}) {
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
        event.reply("fromMain", { action: "unknownAction", error: "Acao IPC desconhecida." });
    }
  });
}

async function init(models, options = {}) {
  const ipc = options.ipcMain || ipcMain;
  const configurationService = options.configurationService
    || (options.createConfigurationService || createConfigurationService)({ db: models.db, models });
  const dependencies = {
    configurationService,
    ...(options.authService ? { authService: options.authService } : {}),
    ...(options.assertPermission ? { assertPermission: options.assertPermission } : {}),
  };
  await configurationService.seedDefaults();
  const routes = buildRouteMap(dependencies);

  if (typeof ipc.removeHandler === "function") {
    ipc.removeHandler("app:request");
  }
  ipc.handle("app:request", (_event, request) => handleAppRequest(routes, request));
  registerLegacyRoutes(ipc, models, dependencies);
}

module.exports = {
  buildRouteMap,
  handleAppRequest,
  init,
  registerLegacyRoutes,
};

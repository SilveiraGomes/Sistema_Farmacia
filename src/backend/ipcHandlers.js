const { ipcMain } = require("electron");
const authService = require("./services/authService");
const userService = require("./services/userService");
const profileService = require("./services/profileService");
const { assertPermission } = require("./services/authorizationService");

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
  const isSafeMessage = SAFE_ERROR_CODES.has(code) || SAFE_ERROR_MESSAGES.has(message)
    || message.startsWith("Permissoes desconhecidas:");

  return {
    message: isSafeMessage ? message : "Erro ao processar requisicao.",
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

function init(models, options = {}) {
  const ipc = options.ipcMain || ipcMain;
  const routes = buildRouteMap();

  if (typeof ipc.removeHandler === "function") {
    ipc.removeHandler("app:request");
  }
  ipc.handle("app:request", (_event, request) => handleAppRequest(routes, request));
  registerLegacyRoutes(ipc, models);
}

module.exports = {
  buildRouteMap,
  handleAppRequest,
  init,
  registerLegacyRoutes,
};

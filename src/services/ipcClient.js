export const SESSION_INVALID_EVENT = 'auth:session-invalid';
const SESSION_INVALID_CODES = new Set(['SESSION_EXPIRED', 'PASSWORD_CHANGE_REQUIRED']);

export async function request(action, data = {}) {
  if (typeof window === 'undefined' || !window.api?.invoke) {
    throw new Error('IPC indisponivel neste ambiente.');
  }

  const response = await window.api.invoke(action, data);

  if (!response?.ok) {
    const error = new Error(response?.error?.message || 'Erro interno.');
    error.code = response?.error?.code;
    if (SESSION_INVALID_CODES.has(error.code)) {
      // A sessão mudou no backend (expirou ou passou a exigir troca de senha):
      // o AuthProvider recarrega-a e mostra o ecrã adequado.
      window.dispatchEvent(new CustomEvent(SESSION_INVALID_EVENT, { detail: { code: error.code, action } }));
    }
    throw error;
  }

  return response.data;
}

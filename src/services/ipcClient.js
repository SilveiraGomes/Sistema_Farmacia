export async function request(action, data = {}) {
  if (typeof window === 'undefined' || !window.api?.invoke) {
    throw new Error('IPC indisponivel neste ambiente.');
  }

  const response = await window.api.invoke(action, data);

  if (!response?.ok) {
    const error = new Error(response?.error?.message || 'Erro interno.');
    error.code = response?.error?.code;
    throw error;
  }

  return response.data;
}

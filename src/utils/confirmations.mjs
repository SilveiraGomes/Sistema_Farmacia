let confirmationDispatcher = null;

export function buildConfirmationOptions(options) {
  return {
    message: options.message,
    title: options.title || 'Confirmar acao',
    confirmLabel: options.confirmLabel || 'Confirmar',
    cancelLabel: options.cancelLabel || 'Cancelar',
    tone: options.tone || 'warning',
  };
}

export function setConfirmationDispatcher(dispatcher) {
  confirmationDispatcher = typeof dispatcher === 'function' ? dispatcher : null;
  return () => {
    if (confirmationDispatcher === dispatcher) {
      confirmationDispatcher = null;
    }
  };
}

async function runConfirmation(options, confirmFn) {
  if (typeof confirmFn === 'function') {
    return Boolean(await confirmFn(options));
  }

  if (confirmationDispatcher) {
    return Boolean(await confirmationDispatcher(options));
  }

  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(options.message);
  }

  return false;
}

export function confirmSensitiveAction(message, confirmFn, options = {}) {
  return runConfirmation(buildConfirmationOptions({
    message,
    title: 'Confirmar acao',
    confirmLabel: 'Confirmar',
    tone: 'warning',
    ...options,
  }), confirmFn);
}

export function confirmLogout(confirmFn) {
  return confirmSensitiveAction('Deseja realmente sair do sistema?', confirmFn, {
    title: 'Confirmar saida',
    confirmLabel: 'Sair do sistema',
    tone: 'logout',
  });
}

export function confirmDelete(target, confirmFn) {
  return confirmSensitiveAction(`Deseja realmente excluir ${target}?`, confirmFn, {
    title: 'Confirmar exclusao',
    confirmLabel: 'Excluir',
    tone: 'danger',
  });
}

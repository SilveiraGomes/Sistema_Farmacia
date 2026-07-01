export function formatLicenseKey(value) {
  const clean = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
  return clean.match(/.{1,4}/g)?.join('-') ?? '';
}

export function licenseMessage(error) {
  const messages = {
    LICENSE_NETWORK_ERROR: 'Sem ligação à Internet. Verifique a rede e tente novamente.',
    LICENSE_REQUEST_INVALID: 'A chave de activação não é válida.',
    license_not_found: 'A chave de activação não foi encontrada.',
    MACHINE_LIMIT: 'Esta licença já está associada a outra máquina.',
    DEMO_ALREADY_USED: 'Esta máquina já usou uma licença de demonstração. Contacte o suporte.',
    blocked: 'Esta licença está bloqueada. Contacte o suporte.',
    revoked: 'Esta licença foi revogada. Contacte o suporte.',
    expired: 'Esta licença expirou. Introduza uma chave renovada.',
  };
  return messages[error?.code] || 'Não foi possível validar a licença. Tente novamente.';
}

export function getLicenseEntryMode(state) {
  if (state === 'loading') return 'loading';
  if (['unactivated', 'configuration_error'].includes(state)) return 'activation';
  return 'application';
}

export function getLicenseValidationResult(status = {}) {
  const writableStates = new Set(['active', 'demo_active', 'paid_active', 'expiring', 'offline_grace']);
  if (status.canWrite === true && status.readOnly !== true && writableStates.has(status.state)) {
    return { success: true, message: 'Licença validada com sucesso.' };
  }
  const messages = {
    expired: 'A licença está expirada e não permite alterações.',
    revoked: 'A licença foi revogada e não permite alterações.',
  };
  return {
    success: false,
    message: messages[status.state] || 'A licença validada não permite alterações.',
  };
}

export function formatLicenseKey(value) {
  const clean = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 64);
  if (clean.startsWith('KILSKILFARM')) {
    const suffix = clean.slice('KILSKILFARM'.length, 'KILSKILFARM'.length + 12);
    const groups = suffix.match(/.{1,4}/g)?.join('-') ?? '';
    return `KILS-KILFARM${groups ? `-${groups}` : ''}`;
  }
  return clean.match(/.{1,4}/g)?.join('-') ?? '';
}

export function licenseMessage(error) {
  const messages = {
    SERVER_UNAVAILABLE: 'Sem ligação ao servidor de licenças. Tente novamente.',
    LICENSE_REQUEST_TIMEOUT: 'O servidor de licenças demorou demasiado a responder.',
    LICENSE_NOT_FOUND: 'A chave de activação não foi encontrada.',
    DEVICE_LIMIT: 'Esta licença atingiu o limite de dispositivos.',
    TRIAL_ALREADY_USED: 'Esta máquina já usou uma licença de demonstração deste produto.',
    PRODUCT_NOT_AUTHORIZED: 'Esta chave não pertence ao KILSYSTEM PHARMACY.',
    DEVICE_NOT_AUTHORIZED: 'Este dispositivo não está autorizado para esta licença.',
    LICENSE_SUSPENDED: 'Esta licença está suspensa. Contacte o suporte.',
    LICENSE_REVOKED: 'Esta licença foi revogada. Contacte o suporte.',
    LICENSE_EXPIRED: 'Esta licença expirou. Renove-a junto do suporte.',
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
  const writableStates = new Set(['active', 'trial_active', 'expiring', 'offline_grace']);
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

const WRITE_WORDS = [
  'guardar', 'finalizar', 'anular', 'remover', 'eliminar', 'apagar', 'pagar',
  'novo', 'nova', 'criar', 'importar', 'inventário', 'preços', 'categoria',
  'subcategoria', 'movimento', 'editar', 'adicionar', 'alterar', 'activar',
  'desactivar', 'encomendar', 'receber', 'espera', 'quantidade', 'baixa',
  'permissões', 'redefinir',
  'restaurar', 'avançar', 'configurar', 'enviar', 'limpar', 'desativar', 'ativar',
];
const READ_WORDS = ['pesquisar', 'filtrar', 'paginar', 'ver', 'imprimir', 'exportar', 'relatório', 'backup'];

export function classifyLicenseAction(label = '') {
  const text = String(label).trim().toLocaleLowerCase('pt');
  if (/^(pesquisar|filtrar|exportar|imprimir|salvar pdf|criar backup|fazer backup)\b/u.test(text)) {
    return 'read';
  }
  const words = new Set(text.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  if (WRITE_WORDS.some((word) => words.has(word))) return 'write';
  return READ_WORDS.some((word) => words.has(word)) ? 'read' : 'neutral';
}

export function isLicenseWriteTarget(target) {
  if (target?.closest?.('[data-license-read]')) return false;
  const explicit = target?.closest?.('[data-license-write]');
  if (explicit) return true;
  const control = target?.closest?.('button, [role="button"], input[type="submit"]');
  const label = [
    control?.textContent,
    control?.value,
    control?.getAttribute?.('aria-label'),
    control?.getAttribute?.('title'),
  ].filter(Boolean).join(' ');
  return classifyLicenseAction(label) === 'write';
}

export function getLicenseWriteAttributes(readOnly) {
  return readOnly
    ? {
        'aria-disabled': 'true',
        title: 'Indisponível: licença em modo somente leitura',
      }
    : {};
}

function setAttributeIfChanged(control, name, value) {
  const next = String(value);
  if (control.getAttribute(name) !== next) control.setAttribute(name, next);
}

function removeAttributeIfPresent(control, name) {
  if (control.hasAttribute(name)) control.removeAttribute(name);
}

export function applyLicenseControlState(control, readOnly) {
  if (!control) return;

  if (readOnly) {
    const attributes = getLicenseWriteAttributes(true);
    setAttributeIfChanged(control, 'aria-disabled', attributes['aria-disabled']);
    if (!control.hasAttribute('data-license-original-title')) {
      control.setAttribute('data-license-original-title', control.getAttribute('title') || '');
    }
    setAttributeIfChanged(control, 'title', attributes.title);
    if ('disabled' in control && !control.disabled) {
      setAttributeIfChanged(control, 'data-license-disabled', 'guard-pending');
      control.disabled = true;
    }
    return;
  }

  removeAttributeIfPresent(control, 'aria-disabled');
  if (control.hasAttribute('data-license-original-title')) {
    const originalTitle = control.getAttribute('data-license-original-title');
    if (originalTitle) setAttributeIfChanged(control, 'title', originalTitle);
    else removeAttributeIfPresent(control, 'title');
    removeAttributeIfPresent(control, 'data-license-original-title');
  }
  const disabledOwner = control.getAttribute('data-license-disabled');
  if (disabledOwner) {
    if (disabledOwner !== 'business' && 'disabled' in control && control.disabled) {
      control.disabled = false;
    }
    removeAttributeIfPresent(control, 'data-license-disabled');
  }
}

export function recordLicenseDisabledMutations(records = []) {
  for (const record of records) {
    if (record?.type !== 'attributes' || record.attributeName !== 'disabled') continue;
    const control = record.target;
    const owner = control?.getAttribute?.('data-license-disabled');
    if (owner === 'guard-pending') {
      setAttributeIfChanged(control, 'data-license-disabled', 'guard-owned');
    } else if (owner === 'guard-owned') {
      setAttributeIfChanged(control, 'data-license-disabled', 'business');
    }
  }
}

export function resolveLicenseEventTarget(event) {
  const target = event?.target;
  if (target?.closest?.('[data-license-read]')) return null;

  if (event?.type === 'submit') {
    if (event.submitter && isLicenseWriteTarget(event.submitter)) return event.submitter;
    return isLicenseWriteTarget(target) ? target : null;
  }

  if (event?.type === 'keydown') {
    if (!['Enter', ' '].includes(event.key)) return null;
    if (isLicenseWriteTarget(target)) return target;
    const form = target?.closest?.('form');
    return isLicenseWriteTarget(form) ? form : null;
  }

  return isLicenseWriteTarget(target) ? target : null;
}

export function getLicenseObserverOptions() {
  return {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
    attributeFilter: [
      'data-license-write',
      'data-license-read',
      'aria-label',
      'title',
      'value',
      'class',
      'disabled',
    ],
  };
}

export function shouldRefreshLicenseControls(records = []) {
  return records.some((record) => (
    record?.type === 'childList'
    || record?.type === 'characterData'
    || (
      record?.type === 'attributes'
      && getLicenseObserverOptions().attributeFilter.includes(record.attributeName)
    )
  ));
}

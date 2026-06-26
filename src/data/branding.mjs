export const BRANDING_STORAGE_KEY = 'pharmacy.branding';

export const DEFAULT_BRANDING = Object.freeze({
  pharmacyName: 'KILSYSTEM PHARMACY',
  logoDataUrl: '',
});

export const BRANDING_CHANGE_EVENT = 'pharmacy-branding-change';

function getDefaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function getDefaultEventTarget() {
  return globalThis.window;
}

function hasUsableLogo(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

export function normalizeBranding(input = {}) {
  const pharmacyName = typeof input.pharmacyName === 'string'
    ? input.pharmacyName.trim().replace(/\s+/g, ' ')
    : '';
  const logoDataUrl = hasUsableLogo(input.logoDataUrl) ? input.logoDataUrl : '';

  return {
    pharmacyName: pharmacyName || DEFAULT_BRANDING.pharmacyName,
    logoDataUrl,
  };
}

export function getStoredBranding(storage = getDefaultStorage()) {
  if (!storage) {
    return { ...DEFAULT_BRANDING };
  }

  try {
    const rawValue = storage.getItem(BRANDING_STORAGE_KEY);
    if (!rawValue) {
      return { ...DEFAULT_BRANDING };
    }

    return normalizeBranding(JSON.parse(rawValue));
  } catch {
    return { ...DEFAULT_BRANDING };
  }
}

function createBrandingEvent(branding) {
  if (typeof CustomEvent === 'function') {
    return new CustomEvent(BRANDING_CHANGE_EVENT, { detail: branding });
  }

  return { type: BRANDING_CHANGE_EVENT, detail: branding };
}

export function saveStoredBranding(input, storage = getDefaultStorage(), eventTarget = getDefaultEventTarget()) {
  const branding = normalizeBranding(input);

  if (storage) {
    storage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(branding));
  }

  eventTarget?.dispatchEvent?.(createBrandingEvent(branding));
  return branding;
}

export function subscribeBrandingChange(listener, eventTarget = getDefaultEventTarget()) {
  if (!eventTarget?.addEventListener || typeof listener !== 'function') {
    return () => {};
  }

  function handleBrandingChange(event) {
    listener(event.detail ?? getStoredBranding());
  }

  eventTarget.addEventListener(BRANDING_CHANGE_EVENT, handleBrandingChange);
  return () => eventTarget.removeEventListener(BRANDING_CHANGE_EVENT, handleBrandingChange);
}

export function getBrandingInitials(name) {
  const initials = String(name || DEFAULT_BRANDING.pharmacyName)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return initials || 'SF';
}

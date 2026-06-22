import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BRANDING_STORAGE_KEY,
  DEFAULT_BRANDING,
  getBrandingInitials,
  getStoredBranding,
  normalizeBranding,
  saveStoredBranding,
  subscribeBrandingChange,
} from '../src/data/branding.mjs';

function createStorage(initialValue) {
  const values = new Map();
  if (initialValue !== undefined) {
    values.set(BRANDING_STORAGE_KEY, initialValue);
  }

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function createEventTarget() {
  const listeners = new Set();

  return {
    addEventListener(type, listener) {
      if (type === 'pharmacy-branding-change') {
        listeners.add(listener);
      }
    },
    removeEventListener(type, listener) {
      if (type === 'pharmacy-branding-change') {
        listeners.delete(listener);
      }
    },
    dispatchEvent(event) {
      listeners.forEach((listener) => listener(event));
      return true;
    },
  };
}

test('uses generic branding when no pharmacy identity is saved', () => {
  const branding = getStoredBranding(createStorage());

  assert.deepEqual(branding, DEFAULT_BRANDING);
  assert.equal(branding.pharmacyName, 'Sistema de Farmacia');
  assert.equal(branding.logoDataUrl, '');
});

test('normalizes saved pharmacy branding and initials', () => {
  const branding = normalizeBranding({
    pharmacyName: '  Farmacia Central de Luanda  ',
    logoDataUrl: 'data:image/png;base64,abc',
  });

  assert.equal(branding.pharmacyName, 'Farmacia Central de Luanda');
  assert.equal(branding.logoDataUrl, 'data:image/png;base64,abc');
  assert.equal(getBrandingInitials(branding.pharmacyName), 'FC');
});

test('falls back to generic identity for invalid saved content', () => {
  const storage = createStorage('{"pharmacyName":"   ","logoDataUrl":42}');

  assert.deepEqual(getStoredBranding(storage), DEFAULT_BRANDING);
});

test('falls back safely when browser storage access is blocked', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('storage blocked'); },
  });
  try {
    assert.deepEqual(getStoredBranding(), DEFAULT_BRANDING);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('saves branding and notifies subscribers', () => {
  const storage = createStorage();
  const eventTarget = createEventTarget();
  const received = [];
  const unsubscribe = subscribeBrandingChange((branding) => {
    received.push(branding);
  }, eventTarget);

  const saved = saveStoredBranding({
    pharmacyName: 'Farmacia Nova Vida',
    logoDataUrl: 'data:image/jpeg;base64,xyz',
  }, storage, eventTarget);
  const storedAfterFirstSave = JSON.parse(storage.getItem(BRANDING_STORAGE_KEY));

  unsubscribe();
  saveStoredBranding({ pharmacyName: 'Outra Farmacia' }, storage, eventTarget);

  assert.equal(saved.pharmacyName, 'Farmacia Nova Vida');
  assert.deepEqual(received, [saved]);
  assert.deepEqual(storedAfterFirstSave, saved);
});

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '../auth/AuthContext';
import { getStoredBranding } from '../data/branding.mjs';
import { getStoredInvoiceA4Settings } from '../data/invoiceSettings.mjs';
import { request } from '../services/ipcClient';
import { createSafeDefaultSnapshot, filterCatalogOptions } from './catalogKeys.mjs';

const SettingsContext = createContext(null);
const EMPTY_CATALOG_OPTIONS = Object.freeze([]);
const LEGACY_MIGRATION_VERSION = 1;
let legacyMigrationPromise = null;

function errorMessage(error) {
  return error?.message || 'Nao foi possivel carregar as configuracoes.';
}

export function readLegacySettings() {
  const branding = getStoredBranding();
  const invoiceA4 = getStoredInvoiceA4Settings();

  return {
    branding: {
      pharmacyName: branding.pharmacyName,
      taxId: invoiceA4.pharmacyTaxId,
      address: [invoiceA4.pharmacyAddress, invoiceA4.pharmacyCity].filter(Boolean).join('\n'),
      phone: invoiceA4.pharmacyPhone,
      email: invoiceA4.pharmacyEmail,
      logoDataUrl: branding.logoDataUrl,
    },
    invoiceA4,
  };
}

async function migrateLegacyIfNeeded(snapshot) {
  if (!snapshot?.migrations?.legacyLocalStoragePending) return snapshot;

  if (!legacyMigrationPromise) {
    legacyMigrationPromise = (async () => {
      const legacyData = readLegacySettings();
      const migrationResult = await request('configuration.importLegacy', {
        migrationVersion: LEGACY_MIGRATION_VERSION,
        data: legacyData,
      });

      if (migrationResult?.settings && migrationResult?.catalogs) return migrationResult;
      return request('configuration.snapshot');
    })().finally(() => {
      legacyMigrationPromise = null;
    });
  }

  return legacyMigrationPromise;
}

export function SettingsProvider({ children }) {
  const { user } = useAuth();
  const requestGenerationRef = useRef(0);
  const [state, setState] = useState(() => ({
    snapshot: null,
    isLoading: Boolean(user),
    error: '',
    readOnly: false,
  }));

  const refresh = useCallback(async () => {
    const userId = user?.id;
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;

    if (!userId) {
      setState({ snapshot: null, isLoading: false, error: '', readOnly: false });
      return null;
    }

    setState((current) => ({ ...current, isLoading: true, error: '' }));
    try {
      const loadedSnapshot = await request('configuration.snapshot');
      const snapshot = await migrateLegacyIfNeeded(loadedSnapshot);
      if (requestGenerationRef.current !== generation) return null;

      setState({ snapshot, isLoading: false, error: '', readOnly: false });
      return snapshot;
    } catch (error) {
      if (requestGenerationRef.current !== generation) return null;

      setState({
        snapshot: createSafeDefaultSnapshot(),
        isLoading: false,
        error: errorMessage(error),
        readOnly: true,
      });
      return null;
    }
  }, [user?.id]);

  useEffect(() => {
    requestGenerationRef.current += 1;
    setState({ snapshot: null, isLoading: Boolean(user?.id), error: '', readOnly: false });
    refresh();
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [refresh]);

  const applySnapshot = useCallback((snapshot) => {
    if (!snapshot?.settings || !snapshot?.catalogs) return;
    requestGenerationRef.current += 1;
    setState({ snapshot, isLoading: false, error: '', readOnly: false });
  }, []);

  const value = useMemo(() => ({ ...state, refresh, applySnapshot }), [state, refresh, applySnapshot]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings deve ser usado dentro de SettingsProvider.');
  return context;
}

export function useSetting(settingKey, fallbackValue) {
  const { snapshot, isLoading } = useSettings();

  return useMemo(() => {
    if (isLoading || typeof settingKey !== 'string') return fallbackValue;
    const separator = settingKey.indexOf('.');
    if (separator < 1) return fallbackValue;
    const group = settingKey.slice(0, separator);
    const name = settingKey.slice(separator + 1);
    return snapshot?.settings?.[group]?.[name]?.value ?? fallbackValue;
  }, [fallbackValue, isLoading, settingKey, snapshot]);
}

export function useCatalog(
  catalogKey,
  { includeInactive = false, selectedCode = '' } = {},
) {
  const { snapshot, isLoading } = useSettings();

  return useMemo(() => {
    if (isLoading || !snapshot) return EMPTY_CATALOG_OPTIONS;
    return filterCatalogOptions(snapshot, catalogKey, { includeInactive, selectedCode });
  }, [catalogKey, includeInactive, isLoading, selectedCode, snapshot]);
}

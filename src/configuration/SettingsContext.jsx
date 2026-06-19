import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '../auth/AuthContext';
import { getStoredBranding } from '../data/branding.mjs';
import { getStoredInvoiceA4Settings } from '../data/invoiceSettings.mjs';
import { request } from '../services/ipcClient';
import { createSafeDefaultSnapshot, filterCatalogOptions } from './catalogKeys.mjs';
import { loadSettingsSnapshot } from './settingsLifecycle.mjs';

const SettingsContext = createContext(null);
const EMPTY_CATALOG_OPTIONS = Object.freeze([]);
const LEGACY_MIGRATION_VERSION = 1;

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

export function SettingsProvider({ children }) {
  const { user, hasPermission } = useAuth();
  const requestGenerationRef = useRef(0);
  const inFlightLoadRef = useRef(null);
  const [state, setState] = useState(() => ({
    snapshot: null,
    isLoading: Boolean(user),
    error: '',
    readOnly: !hasPermission('configuracoes.editar'),
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
      const canEdit = hasPermission('configuracoes.editar');
      const loadKey = `${userId}:${canEdit}`;
      if (inFlightLoadRef.current?.key !== loadKey) {
        const promise = loadSettingsSnapshot({
          loadSnapshot: () => request('configuration.snapshot'),
          importLegacy: (payload) => request('configuration.importLegacy', payload),
          readLegacy: readLegacySettings,
          canEdit,
          migrationVersion: LEGACY_MIGRATION_VERSION,
        }).finally(() => {
          if (inFlightLoadRef.current?.promise === promise) inFlightLoadRef.current = null;
        });
        inFlightLoadRef.current = { key: loadKey, promise };
      }
      const result = await inFlightLoadRef.current.promise;
      if (requestGenerationRef.current !== generation) return null;

      setState({ ...result, isLoading: false });
      return result.snapshot;
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
  }, [hasPermission, user?.id]);

  useEffect(() => {
    requestGenerationRef.current += 1;
    setState({
      snapshot: null,
      isLoading: Boolean(user?.id),
      error: '',
      readOnly: Boolean(user?.id) && !hasPermission('configuracoes.editar'),
    });
    refresh();
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [hasPermission, refresh, user?.id]);

  const applySnapshot = useCallback((snapshot) => {
    if (!snapshot?.settings || !snapshot?.catalogs) return;
    requestGenerationRef.current += 1;
    setState({
      snapshot,
      isLoading: false,
      error: '',
      readOnly: !hasPermission('configuracoes.editar'),
    });
  }, [hasPermission]);

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
  {
    includeInactive = false,
    selectedCode = '',
    includeEmpty = false,
    emptyLabel = 'Selecionar',
    sort = 'catalog',
  } = {},
) {
  const { snapshot, isLoading } = useSettings();

  return useMemo(() => {
    if (isLoading || !snapshot) return EMPTY_CATALOG_OPTIONS;
    return filterCatalogOptions(snapshot, catalogKey, {
      includeInactive, selectedCode, includeEmpty, emptyLabel, sort,
    });
  }, [catalogKey, emptyLabel, includeEmpty, includeInactive, isLoading, selectedCode, snapshot, sort]);
}

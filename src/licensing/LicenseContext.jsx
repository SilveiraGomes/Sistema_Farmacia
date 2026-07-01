import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { request } from '../services/ipcClient';
import { licenseMessage } from './licenseUi.mjs';

const LicenseContext = createContext(null);
const initialStatus = { state: 'loading', canWrite: false, readOnly: true };

export function LicenseProvider({ children }) {
  const [status, setStatus] = useState(initialStatus);
  const [machineId, setMachineId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [networkStatus, setNetworkStatus] = useState(
    typeof navigator === 'undefined' || navigator.onLine ? 'online' : 'offline',
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [nextStatus, machine] = await Promise.all([
        request('license.status'),
        request('license.machineId'),
      ]);
      setStatus(nextStatus);
      setMachineId(machine?.machineId || '');
      return nextStatus;
    } catch {
      const fallback = { state: 'configuration_error', canWrite: false, readOnly: true };
      setStatus(fallback);
      setError('O serviço de licenças não está configurado. Contacte o suporte.');
      return fallback;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const online = () => setNetworkStatus('online');
    const offline = () => setNetworkStatus('offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [refresh]);

  const exchange = useCallback(async (action, licenseKey) => {
    setBusy(true);
    setError('');
    try {
      const nextStatus = await request(action, { licenseKey });
      setStatus(nextStatus);
      return nextStatus;
    } catch (cause) {
      setError(licenseMessage(cause));
      throw cause;
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo(() => ({
    status, machineId, error, busy, networkStatus, refresh,
    activate: (key) => exchange('license.activate', key),
    validate: (key) => exchange('license.validate', key),
  }), [status, machineId, error, busy, networkStatus, refresh, exchange]);

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense() {
  const context = useContext(LicenseContext);
  if (!context) throw new Error('useLicense deve ser usado dentro de LicenseProvider.');
  return context;
}


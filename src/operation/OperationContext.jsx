import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { request } from '../services/ipcClient';

const OperationContext = createContext(null);

const INITIAL_STATE = {
  day: null,
  shift: null,
  canOperate: false,
  message: '',
};

function normalizeOperationState(nextState) {
  return {
    day: nextState?.day || null,
    shift: nextState?.shift || null,
    canOperate: Boolean(nextState?.canOperate),
    message: nextState?.message || '',
  };
}

export function OperationProvider({ children }) {
  const { user, mustChangePassword } = useAuth();
  const [operationState, setOperationState] = useState(INITIAL_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    setIsLoading(true);

    try {
      const nextState = await request('operation.state');
      const normalizedState = normalizeOperationState(nextState);
      setOperationState(normalizedState);
      return normalizedState;
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || mustChangePassword) {
      setOperationState(INITIAL_STATE);
      setError('');
      setIsLoading(false);
      return;
    }

    refresh().catch(() => {});
  }, [mustChangePassword, refresh, user]);

  const openDay = useCallback(async (data) => {
    setError('');

    try {
      await request('operation.openDay', data);
      return refresh();
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    }
  }, [refresh]);

  const closeDay = useCallback(async (data) => {
    setError('');

    try {
      await request('operation.closeDay', data);
      return refresh();
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    }
  }, [refresh]);

  const openShift = useCallback(async (data) => {
    setError('');

    try {
      await request('operation.openShift', data);
      return refresh();
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    }
  }, [refresh]);

  const closeShift = useCallback(async (data) => {
    setError('');

    try {
      await request('operation.closeShift', data);
      return refresh();
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    }
  }, [refresh]);

  const value = useMemo(() => ({
    day: operationState.day,
    shift: operationState.shift,
    canOperate: operationState.canOperate,
    message: operationState.message,
    isLoading,
    error,
    refresh,
    openDay,
    closeDay,
    openShift,
    closeShift,
  }), [
    operationState,
    isLoading,
    error,
    refresh,
    openDay,
    closeDay,
    openShift,
    closeShift,
  ]);

  return (
    <OperationContext.Provider value={value}>
      {children}
    </OperationContext.Provider>
  );
}

export function useOperation() {
  const context = useContext(OperationContext);

  if (!context) {
    throw new Error('useOperation deve ser usado dentro de OperationProvider.');
  }

  return context;
}

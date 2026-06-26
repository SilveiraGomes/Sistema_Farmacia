import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { request } from '../services/ipcClient';

const AuthContext = createContext(null);
const EMPTY_PERMISSIONS = Object.freeze([]);
const SESSION_EXPIRED_CODES = new Set(['SESSION_EXPIRED']);

function normalizeSession(nextSession) {
  return nextSession || null;
}

function isSessionExpiredError(error) {
  return SESSION_EXPIRED_CODES.has(error?.code);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const reloadSession = useCallback(async () => {
    setError('');

    try {
      const nextSession = await request('auth.currentSession');
      setSession(normalizeSession(nextSession));
      return nextSession;
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) {
        setSession(null);
      }

      setError(requestError.message);
      return null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function hydrateSession() {
      setIsLoading(true);
      setError('');

      try {
        const nextSession = await request('auth.currentSession');

        if (isMounted) {
          setSession(normalizeSession(nextSession));
        }
      } catch (requestError) {
        if (isMounted) {
          setSession(null);
          setError(requestError.message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    hydrateSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async ({ username, password }) => {
    setError('');

    try {
      const nextSession = await request('auth.login', { username, password });
      setSession(normalizeSession(nextSession));
      return nextSession;
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) {
        setSession(null);
      }

      setError(requestError.message);
      throw requestError;
    }
  }, []);

  // Apply a session already established by the backend (e.g. PIN login)
  const applySession = useCallback((nextSession) => {
    setError('');
    setSession(normalizeSession(nextSession));
  }, []);

  const logout = useCallback(async () => {
    setError('');

    try {
      await request('auth.logout');
      setSession(null);
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) {
        setSession(null);
      }

      setError(requestError.message);
      throw requestError;
    }
  }, []);

  const changeOwnPassword = useCallback(async ({ currentPassword, newPassword }) => {
    setError('');

    try {
      const nextSession = await request('auth.changeOwnPassword', { currentPassword, newPassword });
      setSession(normalizeSession(nextSession));
      return nextSession;
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) {
        setSession(null);
      }

      setError(requestError.message);
      throw requestError;
    }
  }, []);

  const permissions = session?.permissions || EMPTY_PERMISSIONS;

  const hasPermission = useCallback((permissionKey) => {
    if (!permissionKey) {
      return true;
    }

    return permissions.includes(permissionKey);
  }, [permissions]);

  // Idle tracker: throttled heartbeat + auto-logout on inactivity
  const lastHeartbeat = React.useRef(0);
  useEffect(() => {
    if (!session) return;

    function sendHeartbeat() {
      const now = Date.now();
      if (now - lastHeartbeat.current < 60_000) return; // once per minute max
      lastHeartbeat.current = now;
      request('auth.activity').catch(() => {});
    }

    function onActivity() { sendHeartbeat(); }

    const EVENTS = ['mousemove', 'keydown', 'pointerdown', 'wheel', 'touchstart'];
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    // Poll session every 2 min to detect backend-side timeout
    const pollId = setInterval(async () => {
      const next = await request('auth.currentSession').catch(() => null);
      if (!next) setSession(null);
    }, 2 * 60 * 1000);

    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(pollId);
    };
  }, [session]);

  const value = useMemo(() => ({
    session,
    user: session?.user || null,
    permissions,
    mustChangePassword: Boolean(session?.mustChangePassword),
    isLoading,
    error,
    setError,
    login,
    applySession,
    logout,
    changeOwnPassword,
    hasPermission,
    reloadSession,
  }), [
    session,
    permissions,
    isLoading,
    error,
    login,
    applySession,
    logout,
    changeOwnPassword,
    hasPermission,
    reloadSession,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }

  return context;
}

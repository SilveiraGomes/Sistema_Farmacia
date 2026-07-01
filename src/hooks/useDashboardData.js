import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../services/ipcClient.js';

const POLL_MS = 30_000;

export function useDashboardData({ shiftOpenAt = null, lowStockThreshold = 25 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const result = await request('dashboard.metrics', { shiftOpenAt, lowStockThreshold });
      setData(result);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[dashboard] metrics load failed:', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [shiftOpenAt, lowStockThreshold]);

  useEffect(() => {
    setLoading(true);
    load();
    clearInterval(timerRef.current);
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  // Refresh immediately when the held-sales queue changes
  useEffect(() => {
    window.addEventListener('held-sales-changed', load);
    return () => window.removeEventListener('held-sales-changed', load);
  }, [load]);

  return { data, loading, lastUpdated, refresh: load };
}

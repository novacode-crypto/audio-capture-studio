import { useCallback, useEffect, useRef, useState } from 'react';
import { getServiceStatus, type ServiceStatus } from '../export/service-client';
import type { AppSettings } from './settings';

/** Estado del servicio multimedia local, con sondeo periodico y aviso de perdida de conexion. */
export function useService(settings: AppSettings, onLost?: () => void): { status: ServiceStatus | null; refresh: () => Promise<ServiceStatus> } {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const was = useRef(false);
  const lost = useRef(onLost);
  lost.current = onLost;
  const { token, portOverride } = settings.service;

  const refresh = useCallback(async () => {
    const s = await getServiceStatus({ ...settings, service: { token, portOverride } });
    if (was.current && !s.ok) lost.current?.();
    was.current = s.ok;
    setStatus(s);
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, portOverride]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  return { status, refresh };
}

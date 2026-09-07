import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Load Supabase environment variables from import.meta.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export interface KeepAliveLog {
  id: string;
  timestamp: string;
  status: 'success' | 'failed';
  message: string;
  durationMs: number;
}

export interface KeepAliveConfig {
  enabled: boolean;
  customUrl: string;
  intervalDays: number;
}

const STORAGE_KEYS = {
  CONFIG: 'supabase_keepalive_config',
  LAST_PING: 'supabase_keepalive_last_ping',
  LOGS: 'supabase_keepalive_logs',
  STATUS: 'supabase_keepalive_status'
};

const DEFAULT_CONFIG: KeepAliveConfig = {
  enabled: true,
  customUrl: '',
  intervalDays: 0.25 // Agressivo Padrão: A cada 6 horas
};

// Retrieve configuration from local storage
export const getKeepAliveConfig = (): KeepAliveConfig => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.CONFIG);
    if (saved) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Error parsing Keep-Alive config:', e);
  }
  return DEFAULT_CONFIG;
};

// Save configuration
export const saveKeepAliveConfig = (config: KeepAliveConfig) => {
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
};

// Retrieve last ping timestamp
export const getLastPingTime = (): string | null => {
  return localStorage.getItem(STORAGE_KEYS.LAST_PING);
};

// Retrieve ping logs (limit to 20 for UI sanity)
export const getKeepAliveLogs = (): KeepAliveLog[] => {
  try {
    const logs = localStorage.getItem(STORAGE_KEYS.LOGS);
    if (logs) {
      return JSON.parse(logs);
    }
  } catch (e) {
    console.error('Error parsing Keep-Alive logs:', e);
  }
  return [];
};

// Clear ping logs
export const clearKeepAliveLogs = () => {
  localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify([]));
  localStorage.setItem(STORAGE_KEYS.STATUS, 'idle');
};

// Helper to append a log
const addLog = (status: 'success' | 'failed', message: string, durationMs: number) => {
  const logs = getKeepAliveLogs();
  const newLog: KeepAliveLog = {
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    status,
    message,
    durationMs
  };
  
  // Keep only last 20 logs
  const updatedLogs = [newLog, ...logs].slice(0, 20);
  localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(updatedLogs));
  localStorage.setItem(STORAGE_KEYS.LAST_PING, newLog.timestamp);
  localStorage.setItem(STORAGE_KEYS.STATUS, status);
  return newLog;
};

// Core ping function
export const runKeepAlivePing = async (force: boolean = false): Promise<{ success: boolean; log: KeepAliveLog }> => {
  const config = getKeepAliveConfig();
  if (!config.enabled && !force) {
    return {
      success: false,
      log: {
        id: 'disabled',
        timestamp: new Date().toISOString(),
        status: 'failed',
        message: 'Keep-alive is disabled in settings.',
        durationMs: 0
      }
    };
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    const errorMsg = 'Credenciais de Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) não configuradas.';
    const log = addLog('failed', errorMsg, 0);
    return { success: false, log };
  }

  const startTime = performance.now();
  const simulatedTables = ['users', 'production_orders', 'stop_reasons', 'system_config'];
  const queryLogs: string[] = [];
  
  try {
    // 1. Simular pesquisas reais em tabelas variadas do Supabase para manter o engine PostgreSQL ativo
    for (const table of simulatedTables) {
      try {
        const { error } = await supabase.from(table as any).select('id').limit(1);
        if (error) {
          queryLogs.push(`${table}: c${error.code || 'ERR'}`);
        } else {
          queryLogs.push(`${table}: OK`);
        }
      } catch {
        queryLogs.push(`${table}: falhou`);
      }
    }

    // 2. Acionar também o endpoint do servidor Node.js 24/7 para ping cruzado
    let backendTriggered = false;
    try {
      const serverRes = await fetch('/api/keep-alive/ping', { method: 'POST' });
      if (serverRes.ok) {
        backendTriggered = true;
      }
    } catch {
      // Ignorar caso esteja a correr num ambiente estático
    }

    // 3. Se houver Edge Function configurada
    if (config.customUrl && config.customUrl.trim() !== '') {
      try {
        await fetch(config.customUrl, {
          method: 'GET',
          headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`
          }
        });
      } catch {}
    }

    const duration = Math.round(performance.now() - startTime);
    const successMsg = `Ping agressivo e pesquisas simuladas concluídas com sucesso [Tabelas: ${queryLogs.join(', ')}]. ${backendTriggered ? '⚡ Cron do Servidor 24/7 acionado.' : ''}`;
    const log = addLog('success', successMsg, duration);
    return { success: true, log };
  } catch (error: any) {
    const duration = Math.round(performance.now() - startTime);
    const errorMsg = `O ping falhou: ${error.message || error}`;
    const log = addLog('failed', errorMsg, duration);
    return { success: false, log };
  }
};

// Automated scheduler check (to run on app initialization)
export const checkAndRunAutoPing = async (): Promise<{ triggered: boolean; success?: boolean; log?: KeepAliveLog }> => {
  const config = getKeepAliveConfig();
  if (!config.enabled) {
    return { triggered: false };
  }

  const lastPing = getLastPingTime();
  if (!lastPing) {
    // First time running, trigger a ping immediately
    const result = await runKeepAlivePing(false);
    return { triggered: true, success: result.success, log: result.log };
  }

  const lastPingDate = new Date(lastPing);
  const now = new Date();
  
  // Calculate difference in days
  const diffTime = Math.abs(now.getTime() - lastPingDate.getTime());
  const diffDays = diffTime / (1000 * 60 * 60 * 24);

  if (diffDays >= config.intervalDays) {
    console.log(`[Supabase Keep-Alive] ${diffDays.toFixed(1)} dias desde o último ping. A iniciar ping automático de rotina...`);
    const result = await runKeepAlivePing(false);
    return { triggered: true, success: result.success, log: result.log };
  }

  return { triggered: false };
};

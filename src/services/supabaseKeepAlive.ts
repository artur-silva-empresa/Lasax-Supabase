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
  intervalDays: 14 // Bi-weekly (14 days)
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
    const errorMsg = 'Supabase credentials are not configured (missing URL or Anon Key).';
    const log = addLog('failed', errorMsg, 0);
    return { success: false, log };
  }

  const startTime = performance.now();
  
  try {
    // 1. Query the 'users' table using the official, correctly-configured Supabase client.
    // This is extremely safe, respects CORS, passes the correct tokens automatically,
    // and keeps both PostgREST and Postgres alive and active.
    const { data, error } = await supabase.from('users').select('id').limit(1);
    const duration = Math.round(performance.now() - startTime);

    if (error) {
      // If there's an error, let's see if it's a database-level response (like table/relation not found,
      // or permission/RLS denied). If so, the server is fully online and responded, meaning keep-alive succeeded!
      // Any error with a postgrest code (like 42P01 or PGRSTxxx) means the database is online and answered.
      const isDatabaseAlive = !!error.code;
      
      if (isDatabaseAlive) {
        const successMsg = `Ligação ao Supabase estabelecida. O servidor está ativo. (Nota: query retornou código ${error.code}: ${error.message})`;
        const log = addLog('success', successMsg, duration);
        return { success: true, log };
      } else {
        throw new Error(error.message || 'Supabase retornou um erro na ligação.');
      }
    }

    // 2. If the user specified a custom URL/Edge Function, ping that as well
    if (config.customUrl && config.customUrl.trim() !== '') {
      const edgeStartTime = performance.now();
      try {
        const edgeResponse = await fetch(config.customUrl, {
          method: 'GET',
          headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`
          }
        });
        const edgeDuration = Math.round(performance.now() - edgeStartTime);
        
        const successMsg = `Ping ao REST da Supabase efetuado com sucesso (${duration}ms). Ping da Edge Function (${config.customUrl}) também efetuado com sucesso (${edgeDuration}ms, Status: ${edgeResponse.status}).`;
        const log = addLog('success', successMsg, duration + edgeDuration);
        return { success: true, log };
      } catch (edgeErr: any) {
        const partialMsg = `Ping REST com sucesso (${duration}ms). Contudo, o ping à Edge Function falhou: ${edgeErr.message || edgeErr}`;
        const log = addLog('success', partialMsg, duration);
        return { success: true, log };
      }
    }

    // Standard REST-only success
    const log = addLog('success', `Ping efetuado com sucesso à API do Supabase (tabela: 'users'). Serviço ativo e operacional.`, duration);
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

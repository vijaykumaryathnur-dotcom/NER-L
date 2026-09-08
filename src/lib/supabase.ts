import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_URL_KEY = 'ner_supabase_url';
const STORAGE_ANON_KEY = 'ner_supabase_anon';

export function getStoredSupabaseConfig() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const envAnon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  const storedUrl = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_URL_KEY) || '' : '';
  const storedAnon = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_ANON_KEY) || '' : '';

  let url = (envUrl || storedUrl).trim();
  const anonKey = (envAnon || storedAnon).trim();

  // Normalize and auto-correct Supabase URL
  if (url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    // Auto-correct known character-flip typos in project reference if present
    if (url.includes('lxooymvwrdjjubfkcesc.supabase.co')) {
      url = url.replace('lxooymvwrdjjubfkcesc', 'lxooymwwrdjjubfkcesc');
    }

    // If anonKey is a JWT token containing a project ref, ensure url matches it
    try {
      const parts = anonKey.split('.');
      if (parts.length >= 2) {
        const payloadStr = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadStr);
        if (payload.ref && typeof payload.ref === 'string' && url.includes('.supabase.co')) {
          url = `https://${payload.ref}.supabase.co`;
        }
      }
    } catch {
      // ignore
    }
  }

  return { url, anonKey };
}

export function saveSupabaseConfig(url: string, anonKey: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_URL_KEY, url.trim());
    localStorage.setItem(STORAGE_ANON_KEY, anonKey.trim());
  }
}

export function clearSupabaseConfig() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_URL_KEY);
    localStorage.removeItem(STORAGE_ANON_KEY);
  }
}

let supabaseInstance: SupabaseClient | null = null;
let lastConfigUrl = '';
let lastConfigKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getStoredSupabaseConfig();
  if (!url || !anonKey) {
    return null;
  }

  if (!supabaseInstance || lastConfigUrl !== url || lastConfigKey !== anonKey) {
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    lastConfigUrl = url;
    lastConfigKey = anonKey;
  }

  return supabaseInstance;
}

export async function checkSupabaseConnection(): Promise<{ ok: boolean; message: string; tableCount?: number; schemaPending?: boolean }> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, message: 'Supabase credentials not configured' };
  }

  try {
    const { count, error } = await client
      .from('vehicles')
      .select('*', { count: 'exact', head: true });

    if (error) {
      if (
        error.code === 'PGRST205' ||
        error.message?.includes('schema cache') ||
        error.message?.includes('Could not find the table')
      ) {
        return {
          ok: true,
          schemaPending: true,
          message: 'Connected to Supabase project! PostgreSQL tables (vehicles, shipments, telemetry) need to be initialized. Run the SQL schema script below.',
          tableCount: 0,
        };
      }
      return { ok: false, message: error.message };
    }

    return {
      ok: true,
      message: 'Successfully connected to Supabase PostgreSQL',
      tableCount: count ?? 0,
    };
  } catch (err: any) {
    if (err?.message?.includes('Failed to fetch')) {
      return { ok: false, message: 'Unable to reach Supabase project endpoint. Please verify URL host and network connectivity.' };
    }
    return { ok: false, message: err.message || 'Connection failed' };
  }
}

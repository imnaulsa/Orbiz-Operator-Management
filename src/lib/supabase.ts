import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.generated';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient<Database>(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}}) : null;
export function db() { if(!supabase) throw new Error('Koneksi Supabase belum dikonfigurasi');return supabase; }
export function errorText(error: unknown) { return error instanceof Error ? error.message : error && typeof error==='object' && 'message' in error ? String(error.message) : 'Terjadi kesalahan. Coba lagi.'; }

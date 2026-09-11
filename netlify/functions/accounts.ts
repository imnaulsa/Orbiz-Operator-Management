import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.generated';
const response = (status: number, message: string) => new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export default async (request: Request) => {
  if (request.method !== 'POST') return response(405, 'Method not allowed');
  const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
  const origin = process.env.CONTEXT === 'deploy-preview' ? process.env.DEPLOY_PRIME_URL : process.env.APP_ORIGIN;
  if (!url || !anon || !service || !origin) return response(503, 'Konfigurasi server belum lengkap');
  if (request.headers.get('origin') !== origin) return response(403, 'Origin ditolak');
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return response(401, 'Login diperlukan');
  const token = authorization.slice(7);
  const client = createClient<Database>(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: authError } = await client.auth.getUser(token);
  if (authError || !identity.user) return response(401, 'Sesi tidak valid');
  const { data: actor } = await client.from('profiles').select('*').eq('id', identity.user.id).single();
  if (!actor?.active || actor.role === 'staff') return response(403, 'Akses ditolak');
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 4096) return response(413, 'Payload terlalu besar');
    body = JSON.parse(text);
    if (!body || Array.isArray(body)) return response(400, 'Data tidak valid');
  } catch { return response(400, 'JSON tidak valid'); }
  const { email, name, role, location, employment, fee, effective } = body;
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof name !== 'string' || !name.trim() || name.length > 120 || !['staff', 'operator_manager', 'super_admin'].includes(String(role)) || !['jakarta','bandung'].includes(String(location)) || !['internal','mitra'].includes(String(employment))) return response(400, 'Identitas akun tidak valid');
  if (role === 'staff' && (typeof fee !== 'number' || !Number.isFinite(fee) || fee < 0 || fee > 999999999999 || typeof effective !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(effective) || Number.isNaN(Date.parse(effective)))) return response(400, 'Fee dan effective date wajib');
  if (actor.role !== 'super_admin' && (role !== 'staff' || location !== actor.location_id)) return response(403, 'Hanya staff lokasi sendiri');
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/recovery` });
  if (error || !data.user) return response(400, 'Undangan gagal. Periksa alamat email dan status akun di Supabase.');
  // Re-check role/location inside RPC after external Auth operation. Missing profiles always fail closed.
  const { error: profileError } = await client.rpc('manage_account', { p_id: data.user.id, p_name: name.trim(), p_role: role as 'staff' | 'operator_manager' | 'super_admin', p_location: String(location), p_employment: employment as 'internal' | 'mitra', p_active: true, ...(role === 'staff' ? { p_initial_fee: fee as number, p_effective: effective as string } : {}) });
  if (profileError) return response(409, 'Undangan tercipta tetapi profile belum tersimpan. Admin perlu melengkapi profile lewat SQL editor; akun ini belum memiliki akses.');
  return response(201, 'Undangan terkirim dan profile tersimpan');
};

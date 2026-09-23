begin;

-- Explicit management RPC: no client-side DML and no implicit master cascades.
create or replace function public.production_manage(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles; q public.production_quotations; b public.production_brands;
 st public.production_studios; target uuid; selected uuid[]; affected integer:=0;
 account_value text; before_value jsonb; loc text;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 if actor.id is null then raise exception 'Akses ditolak' using errcode='42501'; end if;
 if p_action in ('quotation_edit','quotation_delete') then
  if actor.role not in ('super_admin','admin_sales') then raise exception 'Hanya Admin Sales / Super Admin' using errcode='42501'; end if;
 elsif p_action in ('brand_edit','brand_delete','studio_edit','studio_delete') then
  if actor.role<>'super_admin' then raise exception 'Hanya Super Admin' using errcode='42501'; end if;
 elsif p_action='sessions_delete' then
  if actor.role not in ('super_admin','operator_manager','host_manager') then raise exception 'Hanya Manager' using errcode='42501'; end if;
 else raise exception 'Aksi tidak valid'; end if;

 -- Serialize validation with all existing writers, including the legacy RPCs.
 lock table public.production_brands,public.production_studios,public.production_quotations,
 public.live_sessions,public.live_checks in share row exclusive mode;
 target:=nullif(p_payload->>'id','')::uuid;
 if p_action in ('quotation_edit','quotation_delete') then
  select * into q from public.production_quotations where id=target;
  if not found then raise exception 'Quotation tidak ditemukan. Refresh halaman.'; end if;
  before_value:=to_jsonb(q);
  if p_action='quotation_delete' then
   if (p_payload->>'confirm') is distinct from 'true' then raise exception 'Konfirmasi penghapusan diperlukan'; end if;
   delete from public.live_checks where session_id in (select id from public.live_sessions where quotation_id=target);
   delete from public.live_sessions where quotation_id=target;
   get diagnostics affected=row_count;
   delete from public.production_quotations where id=target;
  else
   select * into b from public.production_brands where id=(p_payload->>'brand')::uuid and active;
   if not found then raise exception 'Brand tidak valid'; end if;
   account_value:=case p_payload->>'platform' when 'TikTok' then b.shop_id_tiktok when 'Shopee' then b.shop_id_shopee when 'Mirror' then b.shop_id_mirror end;
   if account_value is null then raise exception 'Shop ID platform belum diisi'; end if;
   if exists(select 1 from public.live_sessions where quotation_id=target) and
    (q.brand_id is distinct from b.id or q.platform is distinct from p_payload->>'platform' or q.account is distinct from account_value)
   then raise exception 'Brand/platform tidak dapat diganti selama quotation masih memiliki jadwal'; end if;
   if (p_payload->>'hours')::integer < (select coalesce(sum(end_hour-start_hour),0) from public.live_sessions where quotation_id=target and status<>'cancelled')
   then raise exception 'Kuota tidak boleh lebih kecil dari jam terplot'; end if;
   if exists(select 1 from public.live_sessions where quotation_id=target and status<>'cancelled' and
    (work_date<(p_payload->>'period_start')::date or work_date>(p_payload->>'period_end')::date))
   then raise exception 'Periode harus mencakup seluruh jadwal aktif'; end if;
   update public.production_quotations set reference=trim(p_payload->>'reference'),brand_id=b.id,brand=b.name,account=account_value,
    platform=p_payload->>'platform',period_start=(p_payload->>'period_start')::date,period_end=(p_payload->>'period_end')::date,
    hours=(p_payload->>'hours')::integer,rate=(p_payload->>'rate')::numeric where id=target;
  end if;
 elsif p_action in ('brand_edit','brand_delete') then
  select * into b from public.production_brands where id=target;
  if not found then raise exception 'Brand tidak ditemukan'; end if;
  before_value:=to_jsonb(b);
  if p_action='brand_delete' then
   if exists(select 1 from public.production_quotations where brand_id=target) then raise exception 'Brand masih dipakai quotation. Hapus atau ubah quotation terlebih dahulu.'; end if;
   delete from public.production_brands where id=target;
  else
   if exists(select 1 from public.production_quotations where brand_id=target) and (
    b.shop_id_tiktok is distinct from nullif(upper(trim(p_payload->>'tiktok')),'') or
    b.shop_id_shopee is distinct from nullif(upper(trim(p_payload->>'shopee')),'') or
    b.shop_id_mirror is distinct from nullif(upper(trim(p_payload->>'mirror')),''))
   then raise exception 'Shop ID tidak dapat diubah selama brand masih dipakai quotation'; end if;
   update public.production_brands set name=trim(p_payload->>'name'),shop_id_tiktok=nullif(upper(trim(p_payload->>'tiktok')),''),
    shop_id_shopee=nullif(upper(trim(p_payload->>'shopee')),''),shop_id_mirror=nullif(upper(trim(p_payload->>'mirror')),'') where id=target;
   update public.production_quotations set brand=trim(p_payload->>'name') where brand_id=target;
  end if;
 elsif p_action in ('studio_edit','studio_delete') then
  select * into st from public.production_studios where id=target;
  if not found then raise exception 'Studio tidak ditemukan'; end if;
  before_value:=to_jsonb(st); loc:=st.location_id;
  if p_action='studio_delete' then
   if exists(select 1 from public.live_sessions where studio_id=target) then raise exception 'Studio masih dipakai jadwal. Pindahkan atau hapus jadwal terlebih dahulu.'; end if;
   delete from public.production_studios where id=target;
  else
   if st.location_id is distinct from p_payload->>'location' and exists(select 1 from public.live_sessions where studio_id=target)
   then raise exception 'Lokasi studio tidak dapat diganti selama masih memiliki jadwal'; end if;
   if exists(select 1 from public.live_sessions where studio_id=target and status<>'cancelled' and lane>(p_payload->>'capacity')::integer)
   then raise exception 'Kapasitas baru lebih kecil dari slot jadwal terpakai'; end if;
   update public.production_studios set name=trim(p_payload->>'name'),location_id=p_payload->>'location',capacity=(p_payload->>'capacity')::integer where id=target;
  end if;
 else
  if jsonb_typeof(p_payload->'ids') is distinct from 'array' or jsonb_array_length(p_payload->'ids') not between 1 and 1000 then raise exception 'Pilih 1–1000 jadwal'; end if;
  if (p_payload->>'confirm') is distinct from 'true' then raise exception 'Konfirmasi penghapusan diperlukan'; end if;
  select array_agg(distinct value::uuid) into selected from jsonb_array_elements_text(p_payload->'ids');
  if (select count(*) from public.live_sessions where id=any(selected))<>cardinality(selected) then raise exception 'Sebagian jadwal sudah berubah/dihapus. Refresh dan pilih ulang.'; end if;
  if exists(select 1 from public.live_sessions where id=any(selected) and not private.production_manager(location_id)) then raise exception 'Jadwal di luar lokasi akses Anda' using errcode='42501'; end if;
  select jsonb_agg(to_jsonb(s)) into before_value from public.live_sessions s where id=any(selected);
  delete from public.live_checks where session_id=any(selected);
  delete from public.live_sessions where id=any(selected);
  get diagnostics affected=row_count;
 end if;
 perform private.audit(loc,'production.'||p_action,target,jsonb_build_object('before',before_value,'deleted_sessions',affected));
 return jsonb_build_object('id',target,'deleted',affected);
end $$;
revoke all on function public.production_manage(text,jsonb) from public,anon;
grant execute on function public.production_manage(text,jsonb) to authenticated;
commit;

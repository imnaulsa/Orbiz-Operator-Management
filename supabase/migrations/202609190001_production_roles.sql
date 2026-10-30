-- Run only against the isolated staging database until UAT is approved.
alter type public.app_role add value if not exists 'host_manager';
alter type public.app_role add value if not exists 'host';
alter type public.app_role add value if not exists 'admin_sales';

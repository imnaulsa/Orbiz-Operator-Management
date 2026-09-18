-- Safe to rerun. No real identity, email, password, or role inferred from metadata.
insert into public.locations(id,name) values ('jakarta','Jakarta'),('bandung','Bandung') on conflict(id) do nothing;
-- Initial administrator must be provisioned by the project owner after an Auth user exists.
-- Replace placeholders in a PRIVATE SQL editor session, never commit real identifiers:
-- insert into public.profiles(id,display_name,role,location_id,employment_type)
-- values ('<NAULSA_AUTH_UUID>','Naulsa','super_admin',null,'internal');
-- Then use Account Management to create Hilal (Jakarta) and Samuel (Bandung).
-- Five synthetic example identities are provisioned exclusively in scripts/test-db.mjs.

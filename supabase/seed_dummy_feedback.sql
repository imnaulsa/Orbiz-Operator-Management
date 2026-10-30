-- =========================================================================
-- SEED DUMMY LIVE CHECKS & FEEDBACK (HOST & OPERATOR)
-- Digunakan untuk mengisi sampel data feedback pada sesi live yang sudah ada
-- =========================================================================

DO $$
DECLARE
  v_sess RECORD;
  v_host_id uuid;
  v_op_id uuid;
  v_loc text;
  v_counter integer := 0;
BEGIN
  -- Ambil satu profile operator untuk mengisi submitted_by check operator
  SELECT id INTO v_op_id FROM public.profiles WHERE role = 'operator' OR role = 'super_admin' LIMIT 1;

  -- Iterasi setiap sesi published yang belum memiliki live_checks
  FOR v_sess IN 
    SELECT s.id, s.work_date, s.start_hour, s.end_hour, s.location_id, s.host_id
    FROM public.live_sessions s
    WHERE s.status = 'published'
    ORDER BY s.work_date DESC, s.start_hour DESC
    LIMIT 25
  LOOP
    v_counter := v_counter + 1;
    v_loc := COALESCE(v_sess.location_id, 'jakarta');
    v_host_id := v_sess.host_id;

    -- Scenario rotasi berdasarkan counter
    IF (v_counter % 3 = 1) THEN
      -- Skenario: Lancar (Payday / Rutin)
      IF v_host_id IS NOT NULL THEN
        INSERT INTO public.live_checks (id, session_id, location_id, kind, submitted_by, answers, note, actual_start, actual_end, created_at)
        VALUES (
          gen_random_uuid(),
          v_sess.id,
          v_loc,
          'host',
          v_host_id,
          '{"ready": true, "brief": true}'::jsonb,
          'Live berjalan sangat lancar, host menguasai brief promo payday & flash sale. Penonton ramai dan interaktif, target GMV tercapai.',
          (v_sess.work_date || ' ' || LPAD(v_sess.start_hour::text, 2, '0') || ':00:00+07')::timestamptz,
          (v_sess.work_date || ' ' || LPAD(v_sess.end_hour::text, 2, '0') || ':00:00+07')::timestamptz,
          (v_sess.work_date || ' ' || LPAD(v_sess.end_hour::text, 2, '0') || ':05:00+07')::timestamptz
        ) ON CONFLICT DO NOTHING;
      END IF;

      IF v_op_id IS NOT NULL THEN
        INSERT INTO public.live_checks (id, session_id, location_id, kind, submitted_by, answers, note, created_at)
        VALUES (
          gen_random_uuid(),
          v_sess.id,
          v_loc,
          'operator',
          v_op_id,
          '{"audio": true, "camera": true, "network": true}'::jsonb,
          'Setup Sony FX3 tajam dan jernih, audio Sennheiser wireless normal, koneksi internet 150Mbps sangat stabil tanpa drop frame.',
          (v_sess.work_date || ' ' || LPAD(v_sess.start_hour::text, 2, '0') || ':00:00+07')::timestamptz
        ) ON CONFLICT DO NOTHING;
      END IF;

    ELSIF (v_counter % 3 = 2) THEN
      -- Skenario: Kendala Audio / Jaringan
      IF v_host_id IS NOT NULL THEN
        INSERT INTO public.live_checks (id, session_id, location_id, kind, submitted_by, answers, note, actual_start, actual_end, created_at)
        VALUES (
          gen_random_uuid(),
          v_sess.id,
          v_loc,
          'host',
          v_host_id,
          '{"ready": true, "brief": true}'::jsonb,
          'Live berjalan baik, namun mic clip-on sempat kresek di menit ke-25 karena receiver kendor. OP sigap mengganti dengan mic cadangan.',
          (v_sess.work_date || ' ' || LPAD(v_sess.start_hour::text, 2, '0') || ':00:00+07')::timestamptz,
          (v_sess.work_date || ' ' || LPAD(v_sess.end_hour::text, 2, '0') || ':00:00+07')::timestamptz,
          (v_sess.work_date || ' ' || LPAD(v_sess.end_hour::text, 2, '0') || ':10:00+07')::timestamptz
        ) ON CONFLICT DO NOTHING;
      END IF;

      IF v_op_id IS NOT NULL THEN
        INSERT INTO public.live_checks (id, session_id, location_id, kind, submitted_by, answers, note, created_at)
        VALUES (
          gen_random_uuid(),
          v_sess.id,
          v_loc,
          'operator',
          v_op_id,
          '{"audio": false, "camera": true, "network": true}'::jsonb,
          'Kendala pada jack wireless transmitter channel 1 mengalami interferensi di menit ke-25. Segera dialihkan ke channel 4 cadangan, audio kembali jernih.',
          (v_sess.work_date || ' ' || LPAD(v_sess.start_hour::text, 2, '0') || ':00:00+07')::timestamptz
        ) ON CONFLICT DO NOTHING;
      END IF;

    ELSE
      -- Skenario: Kendala Lighting / Delay Host (Macet)
      IF v_host_id IS NOT NULL THEN
        INSERT INTO public.live_checks (id, session_id, location_id, kind, submitted_by, answers, note, actual_start, actual_end, created_at)
        VALUES (
          gen_random_uuid(),
          v_sess.id,
          v_loc,
          'host',
          v_host_id,
          '{"ready": false, "brief": true}'::jsonb,
          'Lampu softbox kiri sempat mati 10 menit di awal sesi karena kabel adaptor kendor. Sudah diperbaiki OP. Sesi live tetap selesai optimal.',
          (v_sess.work_date || ' ' || LPAD(v_sess.start_hour::text, 2, '0') || ':10:00+07')::timestamptz,
          (v_sess.work_date || ' ' || LPAD(v_sess.end_hour::text, 2, '0') || ':00:00+07')::timestamptz,
          (v_sess.work_date || ' ' || LPAD(v_sess.end_hour::text, 2, '0') || ':05:00+07')::timestamptz
        ) ON CONFLICT DO NOTHING;
      END IF;

      IF v_op_id IS NOT NULL THEN
        INSERT INTO public.live_checks (id, session_id, location_id, kind, submitted_by, answers, note, created_at)
        VALUES (
          gen_random_uuid(),
          v_sess.id,
          v_loc,
          'operator',
          v_op_id,
          '{"audio": true, "camera": true, "network": false}'::jsonb,
          'ISP utama sempat packet loss 8% selama 3 menit pada jam prime time. Operator mengaktifkan koneksi backup Orbit, streaming kembali stabil.',
          (v_sess.work_date || ' ' || LPAD(v_sess.start_hour::text, 2, '0') || ':00:00+07')::timestamptz
        ) ON CONFLICT DO NOTHING;
      END IF;

    END IF;

  END LOOP;
  
  RAISE NOTICE 'Seed dummy live checks selesai: % sesi telah diupdate.', v_counter;
END $$;

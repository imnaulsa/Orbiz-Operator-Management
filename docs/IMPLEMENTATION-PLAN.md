# Audit dan implementation plan

## Kondisi awal yang diperiksa

- Workspace awal kosong; URL GitHub user masih `[ISI URL REPOSITORY]`.
- Prototype ditemukan: Orbiz Operator Management, source commit `e992a19` (Group operator hours into single daily rows).
- Source prototype hanya `dist/index.html` dan konfigurasi hosting Sites. Tidak ada React project, package manager, Supabase, migration atau auth backend.
- Prototype menggunakan arrays simulasi dan pergantian role di browser. Fee per jam; cost dihitung dari angka contoh, bukan assignment. Export HTML bernama `.xls`.
- Prototype tidak dimodifikasi atau dipublikasikan ulang. Implementasi React ditempatkan di project terpisah untuk target Netlify.

## Urutan implementasi

1. Branch lokal `feature/operator-management-v1`; foundation React/Vite/TypeScript/npm.
2. Schema, enum, composite FK, unique partial index non-overlap, grants, RLS.
3. Authentication + session/profile guard; fungsi account memakai validasi Auth server dan role/location database.
4. RPC availability → approval → izin/cancellation → plotting → copy → publication.
5. Rate history + cost snapshot; personal schedule + restricted colleagues RPC + export OOXML.
6. Invalidation Realtime lewat sinyal lokasi tanpa data personal; polling/focus recovery.
7. Test PostgreSQL/RLS, unit/server tests, typecheck, production build, workbook verification, secret checks.
8. Integrasi GitHub branch dan PR setelah repository tujuan diberikan.
9. Netlify Deploy Preview memakai Supabase development; hosted tests dan UAT.
10. Production hanya setelah approval eksplisit user untuk merge main.

## Keputusan implementasi yang terlihat

- Slot assignment dan availability atomik per jam. Unique index mencegah jam ganda per operator/hari/layer. Jam berdempetan digabung sebagai rentang saat rendering dan export; rentang terpisah tetap satu baris operator.
- Draft dan published terpisah. Publish membuat snapshot baru per lokasi/minggu; snapshot sebelumnya ditandai superseded, tidak dihapus.
- Izin boleh menit dalam satu tanggal. Setiap atom jam overlap dibatalkan sepenuhnya. Batas `[start,end)` berarti izin 09:00 tidak overlap shift berakhir 09:00.
- Akhir hari `24:00` didukung sebagai batas hari itu. Rentang yang benar-benar melewati tanggal belum diaktifkan sampai aturan dikonfirmasi.
- Cost = jumlah fee snapshot per jam published yang aktif; bukan absensi aktual atau payroll final.
- Rate append-only, perubahan tidak backdate dan tidak boleh mencakup tanggal yang sudah pernah dipublikasikan. Ini menjaga laporan lama stabil, termasuk saat republish.
- Nonaktif akun membatalkan seluruh assignment sejak hari ini. Transfer lokasi yang sudah memiliki histori ditolak; butuh proses migrasi bisnis terpisah.
- Pending izin belum membatalkan assignment. Approved izin membatalkan draft dan published bersamaan.
- Sinyal lokasi hanya memiliki `location_id` dan `revision`, sehingga staff menerima invalidation tanpa membaca data rekan.

## Status keputusan dan environment

| Item | Status / dampak |
|---|---|
| URL repository GitHub | Terhubung ke `imnaulsa/Orbiz-Operator-Management`; PR feature branch aktif |
| Supabase development | Terhubung; hosted Auth, PostgREST/RLS dan Realtime/fallback sudah diuji |
| Netlify | Deploy Preview PR #1 aktif dan dipakai untuk UAT |
| Identitas akun | Tidak ditulis di source; akun nyata dikelola melalui undangan aplikasi |
| Data operator | Data UAT dikelola di project development; tidak ada kredensial di repository |
| Lintas tengah malam | Menunggu keputusan tanggal payroll, availability dan pemecahan shift |
| Cutoff Mitra | Final: tanggal 21 bulan sebelumnya sampai tanggal 20 bulan berjalan, inklusif; preset aktif di Cost Operator |
| Kolom tambahan HR | Hanya enam kolom minimum diimplementasikan; tambahan menunggu konfirmasi |

# Panduan setup Supabase dan Netlify lewat browser

Repository: https://github.com/imnaulsa/Orbiz-Operator-Management
Branch aplikasi: `feature/operator-management-v1`. Pilih branch ini ketika membaca file, karena `main` baru berisi README awal.

## 1. Buat Supabase development

1. Buka https://supabase.com/dashboard dan pilih **New project** pada organization milikmu.
2. Beri nama `orbiz-operator-management-dev`. Pilih region dekat pengguna, misalnya Singapore bila tersedia. Simpan password database di password manager; jangan masukkan ke GitHub/chat.
3. Tunggu project siap. Pastikan Data API aktif dan schema `public` tersedia. Jangan expose schema `private`.
4. Buka **SQL Editor** → query baru. Dari feature branch di GitHub, buka setiap file berikut, pilih **Raw**, copy seluruh SQL, lalu jalankan satu per satu sesuai urutan:

| Urutan | File |
|---|---|
| 1 | `supabase/migrations/202609110001_foundation.sql` |
| 2 | `supabase/migrations/202609110002_workflows.sql` |
| 3 | `supabase/migrations/202609110003_accounts.sql` |
| 4 | `supabase/migrations/202609110004_live_invalidation.sql` |
| 5 | `supabase/seed.sql` |

Gunakan project baru yang masih kosong. Jangan menjalankan ulang migration yang sudah sukses. Jika query gagal, berhenti dan periksa error sebelum lanjut; jangan mematikan RLS atau menghapus database untuk menghilangkan error.

Jalur SQL Editor ini tidak otomatis mengisi migration history milik Supabase CLI. Simpan catatan migration mana yang sukses. Jika nanti beralih ke CLI, verifikasi schema dan sinkronkan history menggunakan `supabase migration repair --status applied <VERSION>` untuk empat versi yang sudah diterapkan. Jangan langsung `db push` sebelum rekonsiliasi; jangan melakukan repair jika SQL-nya belum berhasil dijalankan.

5. Di Table Editor, periksa 10 tabel: `locations`, `profiles`, `operator_rates`, `availability_submissions`, `availability_slots`, `leave_requests`, `schedule_publications`, `schedule_assignments`, `audit_logs`, `schedule_signals`. `locations` harus memiliki Jakarta dan Bandung.
6. Pastikan `schedule_signals` aktif dalam publication `supabase_realtime`. Migration 004 menambahkannya bila publication tersebut ada.

## 2. Siapkan akun Super Admin pertama

1. Pada **Authentication → Users**, gunakan **Add user/Create user** untuk email milik Naulsa sendiri. Buat password pribadi; bila ada pilihan konfirmasi email otomatis untuk akun bootstrap ini, aktifkan. Email aktual tidak diasumsikan oleh source.
2. Copy UUID akun tersebut, lalu jalankan query berikut di SQL Editor setelah mengganti placeholder:

```sql
insert into public.profiles
  (id, display_name, role, location_id, employment_type, active)
values
  ('GANTI_DENGAN_AUTH_UUID_NAULSA', 'Naulsa', 'super_admin', null, 'internal', true);
```

3. Nonaktifkan public signup di konfigurasi Auth. Akun staff dibuat melalui undangan aplikasi setelah Netlify Functions selesai dikonfigurasi.
4. Email Hilal dan Samuel belum diasumsikan. Setelah login nanti: switch Jakarta → undang Hilal sebagai Operator Manager; switch Bandung → undang Samuel sebagai Operator Manager.

## 3. Ambil URL dan key Supabase

Di **Connect** ambil project URL dan public/publishable key. Semua jenis key juga tersedia di **Settings → API Keys**.

Source mempertahankan nama environment `ANON_KEY` sesuai spesifikasi awal. Nilainya dapat memakai public **publishable key** (`sb_publishable_...`) atau legacy `anon` jika masih diaktifkan. Secret/server key hanya untuk backend: masukkan langsung ke Netlify, bukan chat, source, atau variable `VITE_*`.

## 4. Hubungkan repository ke Netlify

1. Buka https://app.netlify.com dan pilih **Add new project / Import an existing project**. Nama menu dapat sedikit berbeda.
2. Pilih GitHub, authorize akses ke `imnaulsa/Orbiz-Operator-Management`, lalu pilih repo tersebut.
3. Set **Production branch = main**, **Build command = npm run build**, **Publish directory = dist**, base/package directory kosong (root).
4. Aktifkan **Deploy Previews** untuk pull request yang menuju `main`.
5. Masukkan environment development pada context **Deploy Previews** menggunakan tabel di bawah.
6. Tetapkan nama site, misalnya `orbiz-operator-management` bila tersedia. Nama sebenarnya menentukan origin preview.

PENTING: pengujian dilakukan dari PR feature branch melalui Deploy Preview sebelum merge. Preview aktif berada di `https://deploy-preview-1--dynamic-unicorn-4cd699.netlify.app`; `main` baru menjadi production source setelah approval eksplisit dan seluruh check commit terakhir hijau.

## 5. Isi environment Netlify

Gunakan project Supabase **development** untuk Deploy Preview. Untuk sekarang jangan menaruh data production di preview.

| Key | Isi | Scope jika dapat dipilih |
|---|---|---|
| `VITE_SUPABASE_URL` | Project URL development | Builds |
| `VITE_SUPABASE_ANON_KEY` | Public publishable/anon key development | Builds |
| `SUPABASE_URL` | Project URL yang sama | Functions |
| `SUPABASE_ANON_KEY` | Public key yang sama | Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Server secret key atau legacy service_role development | Functions saja |
| `APP_ORIGIN` | Origin Deploy Preview, tanpa slash terakhir | Functions |

Contoh pola APP_ORIGIN: `https://deploy-preview-NOMOR_PR--NAMA_SITE.netlify.app`. Gunakan nomor PR dan nama site yang benar, jangan copy placeholder. Jika UI paket tidak menyediakan pemilihan scope, tetap gunakan nama server variable tanpa prefix `VITE_`; source tidak memasukkannya ke frontend. Jangan menyimpan secret di `netlify.toml`.

Semua enam variable harus merujuk project/environment yang cocok. Setelah edit environment, redeploy preview untuk memastikan build dan Functions menerima nilai baru.

## 6. Sambungkan callback login/recovery

Setelah origin preview diketahui, buka **Authentication → URL Configuration** di Supabase development:

- Site URL: origin preview, misalnya `https://deploy-preview-NOMOR_PR--NAMA_SITE.netlify.app`.
- Redirect URLs: origin tersebut ditambah `/recovery`.
- Tambahkan `http://localhost:5173/recovery` hanya jika akan melakukan development lokal.

Daftarkan origin spesifik. Hindari wildcard luas pada konfigurasi production. URL ini bukan service key dan aman dibagikan untuk proses setup.

## 7. Tes berurutan

1. Buka Deploy Preview dan login sebagai Super Admin.
2. Refresh route untuk memeriksa SPA redirect dan session persistence.
3. Undang satu staff Jakarta dan satu staff Bandung; periksa delivery email dan set password.
4. Staff submit beberapa jam availability → Manager approve → plot → publish.
5. Buka Staff/Manager bersamaan, approve izin overlap → pastikan jadwal hilang tanpa republish.
6. Tes cost dan download `.xlsx`.
7. Lanjutkan seluruh checklist `docs/UAT.md`, termasuk akses lewat request langsung.

SMTP default Supabase memiliki batas penggunaan. Uji email pada project development; konfigurasi SMTP yang sesuai diperlukan sebelum penggunaan organisasi. Jangan menganggap undangan/recovery selesai hanya karena build hijau.

## 8. Setelah UAT disetujui

Siapkan project Supabase production terpisah, migration yang direview, akun nyata dan context Netlify Production. Merge ke main hanya setelah persetujuan eksplisit Naulsa. Netlify kemudian membangun versi production dari main.

Referensi resmi: [Supabase React](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Netlify environment variables](https://docs.netlify.com/build/configure-builds/environment-variables/).

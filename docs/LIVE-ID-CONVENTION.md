# Live ID sesi livestreaming

Migration `202609230002_live_ids.sql` menambahkan tiga identitas ke sesi yang sudah ada dan sesi baru. Jalankan migration pada staging setelah `202609230001_operator_reference_access.sql` sebelum memakai preview versi ini.

| Kolom | Contoh | Aturan |
|---|---|---|
| `id` | UUID | PK relasional internal, tetap selama sesi ada. |
| `live_code` | `LS-26-000123` | Live ID bisnis yang unik dan tetap, termasuk saat sesi diubah atau dijadwalkan ulang. Nomor dari sequence global; tahun adalah tahun tanggal saat sesi dibuat. Nomor yang dihapus tidak dipakai ulang. |
| `live_label` | `20260923_1100-1300_TTFONTERRA` | Label jadwal dari tanggal WIB, jam dan akun Shop ID quotation. Ikut berubah saat jadwal atau akun berubah. Jam saat ini bulat. |
| `legacy_live_id` | `23926_1113_TTFONTERRA` | Alias sesuai format DMYY tanpa nol di depan tanggal/bulan, `HHmulaiHHselesai_ShopID`. Boleh bertabrakan, jadi jangan dipakai sebagai PK atau join otomatis. |

Contoh 1 Februari 2026: prefix legacy `1226`. Format legacy ambigu: 1 November dan 11 Januari 2026 sama-sama memiliki prefix `11126`. Jika data historis hanya menyediakan alias legacy, pencocokan harus meminta konteks tanggal/platform/Shop ID dan menolak hasil lebih dari satu; jangan memilih salah satu diam-diam.

Satu sesi Mirror memiliki **satu** `id` dan **satu** `live_code`. Data performance TikTok dan Shopee kelak dapat menjadi dua baris sumber yang merujuk Live ID yang sama, dibedakan oleh platform dan native Shop ID di master brand. `live_label`/alias untuk Mirror memakai akun quotation (`ST...`), bukan dua Live ID yang terpisah. Import performance dan perhitungan ERR/CTR/AVD belum dibuat; gunakan `live_code` untuk integrasi tersebut ketika dibangun.

Live ID, label, alias dan UUID tersedia pada export jadwal. Kolom import tambahan diabaikan; import jadwal membuat sesi baru dan Live ID baru, bukan mengubah sesi dengan ID pada file. UI jadwal memperlihatkan Live ID dan label, sementara label legacy tersedia pada export.

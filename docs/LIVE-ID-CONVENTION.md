# Rencana format Live ID / PK untuk integrasi performance

Dicatat dari arahan Naulsa pada 23 September 2026. Aturan ini **belum diterapkan** ke jadwal, database, import, ataupun logbook. Gunakan saat pekerjaan menghubungkan sistem jadwal dengan data performance melalui Live ID dimulai.

Pola yang diminta: `DDMMYY_HHmulaiHHselesai_ShopID`.

- Tanggal dan jam mengacu pada jadwal live waktu WIB.
- `HHmulaiHHselesai` mengambil jam mulai dan jam selesai. Contoh 11.00–13.00 menjadi `1113`.
- Komponen terakhir menggunakan Shop ID yang sesuai dengan brand dan platform pada sesi tersebut. Contoh yang diberikan: `TTFONTERRA`.
- Contoh persis dari pengguna untuk Fonterra pada 23 September 2026 pukul 11.00–13.00: `23926_1113_TTFONTERRA`.

**Hal yang perlu diputuskan sebelum implementasi:** `DDMMYY` berarti enam digit dengan nol di depan, sehingga tanggal contoh menjadi `230926`, sedangkan contoh pengguna memakai `23926` (lima digit). Pastikan bentuk tanggal final bersama pengguna sebelum menghasilkan Live ID secara otomatis atau menjadikannya kunci pencocokan data. Tentukan juga penanganan sesi Mirror (`ST` versus ID `TT`/`SP`), jadwal melewati tengah malam, dan dua sesi dengan Shop ID serta tanggal/jam yang sama agar ID tetap unik. Untuk saat ini, primary key internal berupa UUID tetap digunakan; Live ID yang direncanakan ini adalah identifier bisnis untuk integrasi di kemudian hari.

# Rencana format Live ID / PK untuk integrasi performance

Dicatat dari arahan Naulsa pada 23 September 2026. Aturan ini **belum diterapkan** ke jadwal, database, import, ataupun logbook. Gunakan saat pekerjaan menghubungkan sistem jadwal dengan data performance melalui Live ID dimulai.

Pola yang dikonfirmasi: `DMYY_HHmulaiHHselesai_ShopID`.

- `D` adalah tanggal 1–31 dan `M` adalah bulan 1–12, masing-masing **tanpa nol di depan**. `YY` memakai dua digit akhir tahun. Tanggal dan jam mengacu pada jadwal live waktu WIB.
- `HHmulaiHHselesai` mengambil jam mulai dan jam selesai. Contoh 11.00–13.00 menjadi `1113`.
- Komponen terakhir menggunakan Shop ID yang sesuai dengan brand dan platform pada sesi tersebut. Contoh yang diberikan: `TTFONTERRA`.
- Contoh yang dikonfirmasi pengguna untuk Fonterra pada 23 September 2026 pukul 11.00–13.00: `23926_1113_TTFONTERRA` (`23` + `9` + `26`).
- Contoh tanggal satu digit: 1 Februari 2026 menghasilkan prefiks `1226` (`1` + `2` + `26`).

**Perhatian sebelum memakai Live ID sebagai PK:** tanpa pemisah atau nol di depan, 1 November dan 11 Januari pada tahun yang sama sama-sama menjadi `111YY`. Jika jam dan Shop ID sama, Live ID akan bertabrakan. Saat implementasi nanti, tentukan cara membedakan tanggal yang menghasilkan rangkaian digit identik serta penanganan sesi Mirror (`ST` versus ID `TT`/`SP`), jadwal melewati tengah malam, dan dua sesi dengan Shop ID serta tanggal/jam yang sama. Untuk saat ini, primary key internal berupa UUID tetap digunakan; Live ID yang direncanakan ini adalah identifier bisnis untuk integrasi di kemudian hari.

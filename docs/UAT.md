# UAT pada Netlify Deploy Preview + Supabase development

Jangan gunakan project production untuk UAT. Buat lima akun uji minimum: Super Admin, Manager Jakarta, Manager Bandung, Staff Jakarta, Staff Bandung. Tambahkan staff Jakarta kedua untuk uji nama rekan overlap. Undang akun melalui email yang ditetapkan user; gunakan password unik yang dibuat pemilik akun.

1. Login semua role. Refresh route `/plotting`, `/availability`, `/cost`, `/my-schedule`. Periksa tidak ada 404, menu sesuai role, session tetap ada. Keluar dan pastikan back/refresh tidak membuka data.
2. Uji forgot-password, link kedaluwarsa, undangan baru, password baru (12 karakter minimum), akun nonaktif, dan Auth user tanpa profile.
3. Dengan REST client dan access token staff, request `profiles`, `operator_rates`, `availability_slots`, `leave_requests`, `schedule_assignments` milik operator lain. Harus kosong. Coba PATCH role/location/employment/fee: permission denied.
4. Pakai token Manager Jakarta untuk query dan RPC ke Bandung, lalu sebaliknya. Read kosong dan mutasi gagal. Uji endpoint accounts dengan manipulasi target role/location, serta token tidak valid.
5. Staff kirim availability 08–10 saja. Pending terkunci. Manager tidak dapat plot. Approve → dapat plot. Reject pengajuan lain → slot terbuka dan bisa dikirim ulang. Kirim sisa hari tanpa membuka slot approved.
6. Plot 08–09, tambah 09–10, lalu 14–15. Operator tetap satu line dengan rentang 08–10 dan 14–15. Hapus 14–15: satu jam hilang. Plot tanpa approved availability harus ditolak melalui UI dan RPC langsung.
7. Copy satu hari ke beberapa hari dengan availability berbeda. Bandingkan preview valid/existing/skipped. Uji merge, replace, source kosong, source termasuk target, input tanggal invalid. Preview tidak mengubah data. Replace hanya mengganti draft tujuan.
8. Publish minggu. Staff hanya melihat published miliknya. Edit draft lagi → staff tetap melihat versi sebelumnya sampai publish. Rekan overlap hanya muncul sebagai nama; profile, fee dan detail izinnya tetap tidak dapat dibaca.
9. Buka Manager dan Staff bersamaan. Ajukan izin 08:30–09:30 lalu approve. Jam 08–09 dan 09–10 hilang pada dua layar tanpa republish. Verifikasi Realtime aktif; putuskan websocket dan pastikan polling 15 detik memulihkan data. Pastikan cancellation dan review tercatat di audit.
10. Dua manager bersamaan melakukan publish/copy/izin untuk lokasi sama. Periksa tidak ada duplikasi, assignment terlarang, snapshot parsial atau deadlock. Ini adalah gate concurrency yang belum dapat dibuktikan PGlite.
11. Tetapkan rate awal, plot dan publish, lalu tambah rate baru untuk tanggal setelah published terakhir. Laporan sebelum effective date tidak berubah. Rentang lintas rate menghitung masing-masing tarif. Coba backdate dan edit row rate langsung: harus ditolak.
12. Cost: cek distinct working days, total hours, custom range, bulan kalender, combined hanya Super Admin. Preset Mitra belum final; jangan approve acceptance tersebut sebelum aturan diputuskan.
13. Staff export `.xlsx`. Buka Excel/LibreOffice, cocokkan enam kolom, tanggal, rentang, jam dan hanya data pribadi. Uji nama berawalan `=`, `+`, `@`: harus menjadi teks, bukan formula.
14. Uji pagination dengan >1.000 atom jam; export/calendar tidak boleh terpotong. Uji network error supaya data lama tidak ditampilkan sebagai data terkini.
15. Uji desktop dan mobile: horizontal timeline scroll, touch select start/end, konfirmasi, loading/error/empty, keyboard tab/focus.
16. Verifikasi invite/profile split failure: Auth user tanpa profile tidak bisa masuk dan repair dilakukan admin. Tidak boleh ada account escalation melalui user_metadata.

Release gate: semua acceptance kritis hijau, aturan yang pending disepakati, bukti hosted Auth/REST/Realtime/concurrency tersimpan, dependency audit terbaru bersih/reviewed, dan user memberi approval merge main. Preview URL belum tersedia pada handoff ini.

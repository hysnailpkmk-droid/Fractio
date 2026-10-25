# FRACTIO (English version) – Panduan Setup

Stack: **GitHub** (kode) → **Netlify** (hosting) + **Supabase** (login & database). Dashboard guru bisa **Export to Excel (.xlsx)**.

Isi folder:
- `index.html` – halaman siswa (Home/login, Introduction, Fraction Learning, Laboratory, Challenge, Quiz Master, Closing)
- `teacher.html` – login & Dashboard Guru
- `js/config.js` – isi URL dan anon key Supabase
- `supabase/schema.sql` – tabel database + keamanan (RLS)
- `netlify.toml` – pengaturan Netlify

## 1. Supabase
1. Buat project baru di supabase.com.
2. **SQL Editor** → New query → tempel seluruh isi `supabase/schema.sql` → Run.
3. **Authentication → Providers → Email**: matikan **"Confirm email"** (siswa login pakai username, bukan email asli).
4. **Project Settings → API**: salin **Project URL** dan **anon public key**.
5. Buka `js/config.js`, ganti `SUPABASE_URL` dan `SUPABASE_ANON_KEY` dengan nilai tadi. (Jangan pakai `service_role` key.)

## 2. Akun guru
1. Supabase → **Authentication → Users → Add user** → isi email & password guru, centang **Auto Confirm User**.
2. Di **SQL Editor**, jalankan (ganti emailnya):
   ```sql
   update public.profiles set role = 'teacher'
   where id = (select id from auth.users where email = 'EMAIL_GURU');
   ```
3. Guru login di `teacher.html` memakai email & password tersebut.

## 3. GitHub
1. Buat repository baru di github.com (misal `fractio`).
2. Upload semua isi folder ini (drag & drop file lewat tombol **Add file → Upload files**, pastikan `config.js` sudah terisi).

## 4. Netlify
1. Netlify → **Add new site → Import an existing project → GitHub** → pilih repository `fractio`.
2. Build command dikosongkan, publish directory `.` (sudah diatur di `netlify.toml`) → **Deploy**.
3. Setiap kali kamu mengubah file di GitHub, Netlify otomatis deploy ulang.

(Alternatif tanpa GitHub: drag & drop folder/zip ke Netlify Drop.)

## 5. Export ke Excel
Di `teacher.html` → tombol **⬇ Export to Excel** mengunduh file `.xlsx` berisi sheet:
Summary, Student Progress, Quiz Results (per soal ✓/✗), Reflections, All Answers.
Data selalu diambil langsung dari Supabase saat tombol ditekan (klik **Refresh** dulu untuk data terbaru).

## Catatan
- Siswa mendaftar sendiri di halaman depan (nama, kelas, username, password). Username dipetakan ke email palsu `username@students.fractio.app`.
- Anon key aman ada di kode karena data dilindungi RLS: siswa hanya bisa melihat datanya sendiri, guru bisa melihat semua.
- Lupa password siswa: reset lewat Supabase → Authentication → Users.

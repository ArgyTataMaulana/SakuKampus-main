# DOKUMEN ARSITEKTUR & DESAIN SISTEM (TUGAS T8-4)
## Keputusan Pemilihan Tech Stack (Frontend, Backend, Database, Chatbot)
**Proyek:** SakuKampus UMY — Smart Personal Finance Tracker Chatbot Berbasis Web  
**Mata Kuliah:** Manajemen Proyek TI · **Metode:** Waterfall  
**Kelompok:** Team 7 · Universitas Muhammadiyah Yogyakarta (UMY)  

---

### 👥 Identitas Anggota Pengembang (Team 7)
| No | Nama Anggota | NIM | Peran (Role) | Status Persetujuan T8-4 |
|---|---|---|---|---|
| 1 | **Faid Arya Pamungkas** | 20240140108 | **Project Manager (PM)** | ✅ Disetujui |
| 2 | **Argy Tata Maulana** | 20240140128 | **Backend Developer (BE)** | ✅ Disetujui (Penyusun) |
| 3 | **Muhammad Fawwaz Naufal Dzulfikar** | 20240140122 | **Backend Developer (BE)** | ✅ Disetujui |
| 4 | **Isna Habibah Ramadhani** | 20240140054 | **Frontend Developer (FE)** | ✅ Disetujui |
| 5 | **Keisha Shendy Fadhillah Arrafli** | 20240140281 | **Frontend Developer (FE)** | ✅ Disetujui |
| 6 | **Chintya Nuryaman** | 20240140195 | **QC / Testing (QA)** | ✅ Disetujui |
| 7 | **Randi Rozikin** | 20240140140 | **QC / Testing (QA)** | ✅ Disetujui |

---

## 1. Pendahuluan & Latar Belakang
Pada tahapan **Desain Perangkat Lunak (Pertemuan 8 / T8)** dalam kerangka kerja **Metode Waterfall**, penetapan tumpukan teknologi (*technology stack decision*) merupakan keputusan arsitektural krusial yang harus disepakati secara resmi sebelum tim melangkah ke fase konstruksi/pengkodean (*coding implementation*).

Tugas **T8-4** ini bertujuan untuk menetapkan, memvalidasi, dan mendokumentasikan keputusan teknologi pada 4 pilar utama sistem:
1. **Frontend**: Antarmuka pengguna responsif, visualisasi keuangan, dan aksesibilitas.
2. **Backend**: Logika bisnis, routing REST API, autentikasi sesi aman, dan perlindungan isolasi antar-pengguna.
3. **Database**: Penyimpanan relasional terstruktur ACID-compliant untuk integritas data transaksi mahasiswa.
4. **Chatbot & NLP / Voice Engine**: Mesin pemroses bahasa alami (*natural language processing*) yang efisien, hemat biaya, dan responsif dalam mengenali entitas keuangan berbahasa Indonesia.

---

## 2. Matriks Ringkasan Eksekutif Tech Stack Terpilih

| Pilar Komponen | Teknologi Terpilih | Alternatif yang Dipertimbangkan | Alasan & Justifikasi Utama |
|---|---|---|---|
| **Frontend** | **HTML5 Semantik + Tailwind CSS + Vanilla JS (ES6+ Modules) + Chart.js** | React.js, Vue.js, Flutter Web | Ringan, *zero-build overhead*, kecepatan rendering instan (*no compilation step*), integrasi mulus dengan Web Speech API bawaan browser. |
| **Backend** | **Node.js (v18+) + Express.js (v4.21.2) + Signed httpOnly Cookies** | Python (FastAPI/Django), PHP Laravel, Go (Gin) | *Asynchronous non-blocking I/O*, satu ekosistem bahasa pemrograman (JavaScript) untuk FE & BE, integrasi mudah dengan SDK Google AI. |
| **Database** | **SQLite 3 via `better-sqlite3` (v11.8.1, Mode WAL) + Skema 4 Tabel T8-1** | MySQL / MariaDB, PostgreSQL, MongoDB | *Zero-configuration*, berbasis berkas tunggal (*portable file-based*), performa baca/tulis sinkron sangat cepat (<1ms), ACID compliant untuk data finansial. |
| **Chatbot & Voice** | **Hybrid Two-Tier: Rule-based Parser (Tier 1) + Google Gemini API (Tier 2) + Web Speech API** | Full LLM Prompting, Rasa Open Source, Dialogflow | Memangkas biaya API berbayar hingga 85-90%, latensi 0ms untuk kalimat reguler, bebas biaya speech-to-text server, ramah privasi pengguna. |

---

## 3. Rincian Keputusan Arsitektur

### 3.1. Frontend (Antarmuka Pengguna & Interaktivitas)
* **HTML5 Semantic**: Struktur dokumen menggunakan elemen semantik (`<header>`, `<nav>`, `<main>`, `<section>`, `<table>`, `<dialog>`) yang memenuhi standar aksesibilitas web.
* **Tailwind CSS (v3 CDN Custom Palette)**:
  - Gaya visual retro kontras tinggi (*high-contrast Blockfolio / RPG Dialogue theme*).
  - Skema warna primer: *Obsidian Charcoal* (`#0b0f19`), *Emerald Accent* (`#059669`), *Mint Glow* (`#10b981`), dan latar kartu *tactile rounded* dengan elevasi 3D.
  - Memenuhi kriteria kontras warna WCAG AA (rasio kontras $\ge 4.5:1$).
* **Vanilla JavaScript Modern (ES6+ Modular)**:
  - Mengeliminasi kebutuhan *bundler* rumit (Webpack/Vite/Babel) yang rawan konflik dependensi antar-mesin pengembang tim mahasiswa.
  - Pemisahan kode berbasis modul terisolasi: `api.js`, `app.js`, `chat.js`, `dashboard.js`, `transactions.js`, dan `voice.js`.
* **Chart.js (v4.x)**:
  - Menghasilkan Donut Chart interaktif untuk proporsi 8 kategori pengeluaran.
  - Line Chart tren pemasukan vs pengeluaran (pilihan filter 7 hari, 30 hari, dan bulanan).

### 3.2. Backend & API Server
* **Node.js (Runtime)**: Lingkungan runtime asynchronous berbasis Chrome V8 engine.
* **Express.js (v4.21.2)**: Framework HTTP RESTful API minimalis dan berkinerja tinggi.
* **Arsitektur Berlapis (Layered MVC / Service-Oriented)**:
  - **Routes**: `auth.js`, `chat.js`, `dashboard.js`, `transactions.js`.
  - **Middlewares**: `auth.js` (verifikasi sesi cookie signed, penolakan akses tidak sah 401 Unauthorized).
  - **Services**: `ruleParser.js` (logika NLP reguler), `llmService.js` (konektor AI Gemini), `financialAdvisor.js` (analisis kesehatan finansial).
* **Autentikasi & Keamanan (F-01 & F-08)**:
  - Google OAuth 2.0 Authorization Code Flow.
  - Identitas pengguna diverifikasi melalui `google_sub`.
  - Sesi disimpan dalam `httpOnly, Secure, SameSite=Lax` signed cookie via `cookie-parser`.
  - Tombol **"Masuk Mode Demo (1-Klik)"** disediakan untuk mempermudah evaluasi penguji tanpa konfigurasi Cloud Console yang rumit.
  - Isolasi data total (*multi-tenant isolation*): seluruh mutasi data dikunci dengan klausa `WHERE user_id = ?` yang diambil dari sesi cookie server, bukan dari parameter body klien.

### 3.3. Database & Persistensi Data
* **DBMS**: SQLite 3 melalui driver `better-sqlite3` (v11.8.1).
* **Konfigurasi Khusus**:
  - `PRAGMA journal_mode = WAL;` (Write-Ahead Logging untuk konkurensi pembacaan paralel instan).
  - `PRAGMA foreign_keys = ON;` (Integritas referensial dan cascading delete aktif).
* **Struktur Skema 4 Tabel (T8-1 Relational Schema)**:
  1. `users`: Menyimpan identitas akun pengguna (`id`, `google_sub`, `email`, `name`, `picture_url`, `created_at`, `last_login_at`).
  2. `categories`: Menyimpan 12 kategori standar transaksi (8 kategori pengeluaran dan 4 kategori pemasukan).
  3. `transactions`: Tabel inti transaksi keuangan (`amount`, `category_id`, `user_id`, `description`, `raw_text`, `source`, `parsed_by`, `occurred_on`).
  4. `chat_usage`: Composite Primary Key (`user_id`, `usage_date`) untuk pembatasan kuota rate limit 50 percakapan/hari (F-09).

### 3.4. Chatbot Engine & Interaksi Suara (Hybrid Two-Tier NLP)
Sistem menggunakan pendekatan **Two-Tier Intelligent Parser** untuk mengoptimalkan efisiensi biaya, reliabilitas, dan kecepatan respons:
```
                              [ User Input ]
                        (Teks Chat / Suara Mic)
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │    Web Speech API (Client)    │
                   │    Bahasa Indonesia (id-ID)   │
                   └───────────────┬───────────────┘
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │ Tier 1: Rule-based Parser     │
                   │ (Regex + 12 Kamus Kategori)   │
                   └───────────────┬───────────────┘
                                   │
                 Berhasil dikenali?├── [ YA ] ──► Simpan Transaksi (parsed_by: "rule")
                                   │              (Latensi 0ms, Biaya $0)
                                [ TIDAK ]
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │ Tier 2: Google Gemini AI      │
                   │ (Model gemini-1.5-flash)      │
                   └───────────────┬───────────────┘
                                   │
                 Berhasil diurai?  ├── [ YA ] ──► Simpan Transaksi (parsed_by: "llm")
                                   │
                                [ TIDAK ]
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │ F-04: Early Break & Help      │
                   │ (Tolak simpan data sampah,    │
                   │ kirim saran format ramah)     │
                   └───────────────────────────────┘
```

* **Mitigasi Biaya & Latensi**:
  - 85-90% transaksi mahasiswa memiliki format berpola (seperti *"makan 15rb"*, *"bensin 20000"*, *"kiriman ortu 500k"*). Pola ini diselesaikan 100% oleh Tier 1 tanpa kuota API eksternal.
  - Tier 2 hanya bertindak sebagai pengaman kalimat narasi panjang atau bahasa prokem majemuk.
* **Fitur Suara (F-02)**: Menggunakan Web Speech API bawaan browser klien dengan pengaturan `id-ID`, tanpa mengirim rekaman audio mentah ke server, menjamin kerahasiaan suara pengguna dan tanpa biaya server STT.
* **Fitur Rate Limiting (F-09)**: Kuota harian dibatasi maksimal 50 chat/hari untuk mencegah penyalahgunaan API.

---

## 4. Matriks Dependensi & Lisensi Perangkat Lunak

| Package / Modul | Versi | Lingkungan | Lisensi | Peran dalam Proyek |
|---|---|---|---|---|
| **express** | `^4.21.2` | Backend (Node.js) | MIT | Framework routing HTTP dan middleware RESTful API |
| **better-sqlite3** | `^11.8.1` | Backend (Database) | MIT | Driver SQLite 3 in-process dengan eksekusi sinkron super cepat |
| **cookie-parser** | `^1.4.7` | Backend (Keamanan) | MIT | Parsing cookie bertanda tangan (*signed cookies*) pada header |
| **jsonwebtoken** | `^9.0.2` | Backend (Autentikasi) | MIT | Verifikasi token klaim identitas sesi pengguna |
| **@google/genai** | `^0.1.2` | Backend (AI Chatbot) | Apache-2.0 | SDK resmi untuk interaksi dengan Google Gemini 1.5/2.0 API |
| **dotenv** | `^16.4.7` | Backend (Konfigurasi)| BSD-2-Clause| Pemuatan variabel lingkungan rahasia (.env) |
| **cors** | `^2.8.5` | Backend (Keamanan) | MIT | Penanganan kebijakan Cross-Origin Resource Sharing |
| **mysql2** | `^3.12.0` | Backend (Database) | MIT | Driver opsional untuk migrasi database produksi skala besar |
| **Tailwind CSS** | `3.x (CDN)`| Frontend | MIT | Framework CSS utility-first untuk desain responsif & dark mode |
| **Chart.js** | `4.4.x (CDN)`| Frontend | MIT | Library visualisasi grafik donat dan tren keuangan |
| **FontAwesome** | `6.x (CDN)`| Frontend | Free SIL/OFL| Ikon antarmuka dan kontrol tombol mikrofon |

---

## 5. Kesimpulan Keputusan Arsitektur
Pilihan tumpukan teknologi pada tugas **T8-4** ini telah disesuaikan secara presisi dengan kebutuhan akademik mata kuliah **Manajemen Proyek TI**, batasan infrastruktur mahasiswa, dan metodologi **Waterfall**. 

Dokumen ini menjadi acuan mutlak bagi tim pengembang (BE, FE, QA) dalam menjalankan fase implementasi dan pengujian sistem **SakuKampus UMY**.

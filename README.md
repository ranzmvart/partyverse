# Ryuu Connect - Community Voice, Chat, Music, Screen Share

Project ini adalah aplikasi komunitas realtime bergaya Discord-like, dibuat original sebagai **Ryuu Connect**.

## Fitur

- Login / daftar username + PIN
- Akun owner: `ryuu` / `291206`
- Profile, avatar upload, bio
- Servers / communities
- Text channel realtime
- Voice channel WebRTC
- Screen share WebRTC
- Daftar peserta voice
- Shared music host via YouTube search
- Mode musik: Dengar Host / Streaming Sendiri
- Friends, invite friend ke server
- Persistent data JSON
- Responsive HP dan laptop
- Siap deploy Railway

## Deploy Railway

1. Upload isi folder ini ke GitHub repo.
2. Railway → New Project → Deploy from GitHub.
3. Build command otomatis dari `railway.json`.
4. Generate domain di Railway Networking.
5. Tambahkan Volume agar data tidak hilang:

```txt
Mount Path: /app/data
```

Data disimpan di:

```txt
/app/data/db.json
```

## Catatan Voice dan Screen Share

Voice dan screen share butuh HTTPS. Railway domain `up.railway.app` sudah HTTPS.

## Catatan Musik

Music search memakai YouTube search dan YouTube iframe player. Beberapa video mungkin tidak bisa diputar sebagai embed; pilih hasil lain jika itu terjadi.

## Local Run

```bash
npm install
npm start
```

Buka `http://localhost:3000`.

## v1.1 Voice + Screen Share Polish

Update kecil:
- Tambah tombol Mute / Unmute untuk microphone sendiri.
- Daftar voice menampilkan status muted dan share screen.
- Screen share tampil menempel di halaman channel, bukan floating window.
- Screen share meminta izin audio perangkat/tab (`getDisplayMedia` dengan audio). Di Chrome desktop, pilih tab/window lalu centang opsi audio agar suara ikut terkirim.
- Beberapa browser atau OS mungkin tidak mengizinkan system audio untuk seluruh layar. Cara paling stabil: share tab Chrome dan aktifkan Share tab audio.


## v1.2 Clean Voice + Persistent Screen Fix

Patch ini hanya fokus ke permintaan terakhir:

- Fitur Shop, Inventory, Crates, dan Leaderboard disembunyikan dari UI agar tampilan lebih clean.
- Join voice dibuat satu klik: tombol Join Voice otomatis memilih voice channel pertama.
- Share Screen otomatis join voice dulu kalau belum join.
- Jika seseorang sudah share screen, user yang masuk belakangan akan melihat banner live screen dan bisa klik Join & Watch.
- Server mengirim status live screen ke seluruh member server, sehingga share screen tidak hanya muncul untuk user lama.
- Tampilan voice/screen dibuat lebih bersih untuk HP dan laptop.

Catatan: suara screen share paling stabil di Chrome desktop saat memilih Chrome Tab dan mencentang Share tab audio.

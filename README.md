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
- Shop, inventory, equip skin/frame/badge/theme
- Crate / gacha animation
- Leaderboard top 100
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

# PartyVerse v2.0 — Discord-inspired UI

Aplikasi komunitas original bergaya modern: server, category, text/voice channel, voice, mute, music, YouTube watch party, screen share, friends, profile, dan persistent data.

## Deploy Railway

Upload isi folder ini ke GitHub, lalu deploy ke Railway.

Gunakan Volume untuk data permanen:

```
/app/data
```

## Catatan

UI dibuat Discord-inspired dengan nama/warna/branding PartyVerse sendiri dan tanpa aset/logo Discord.


## v2.1 Device Layout Final

Versi ini memisahkan layout desktop dan mobile melalui kelas `device-desktop` dan `device-mobile`.

- Desktop/laptop: sidebar server, channel list, chat/stage, dan panel member dibuat dalam grid khusus laptop.
- Mobile/HP: channel list menjadi drawer, ruang menjadi chip horizontal, tombol utama hanya Ruang/Voice/YouTube/Share, stage share screen diprioritaskan agar tidak ketutupan.
- Fitur inti tetap dipertahankan: login, server, text/voice channel, YouTube, music, voice, share screen, friends, dan persistent data.

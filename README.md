# PartyVerse v1.4 - Simple Mobile + YouTube Watch Party

Versi ini fokus pada perbaikan UI agar tidak penuh di HP/laptop dan menambahkan fitur nonton video YouTube di ruang voice.

## Update utama

- UI server lebih simple dan tidak menumpuk.
- Di HP, daftar ruang dibuat menjadi strip kecil horizontal.
- Tombol penting saja yang tampil saat berada di server: Ruang, Join Voice, YouTube, Share.
- Fitur Watch YouTube untuk cari video dan menonton di stage.
- Host/owner server bisa memutar video ke room lewat tombol Room di hasil pencarian Watch YouTube.
- Share screen tetap tersedia; di HP akan mencoba API browser yang tersedia. Jika browser HP tidak mendukung, akan muncul pesan yang jelas.
- Chat, voice, friends, music host/self, server, channel/category tetap dipertahankan.

## Deploy Railway

Upload isi folder ini ke GitHub repo, lalu deploy ke Railway. Tambahkan Volume jika ingin data persistent:

```text
/app/data
```

Voice dan screen share butuh HTTPS, gunakan domain Railway `.up.railway.app`.

# Teks listing Play Store

Tempel di **Grow → Store presence → Main store listing**. Bahasa default: English (United
States); tambahkan terjemahan Indonesian (id) lewat **Manage translations**.
Batas Play: judul 30 karakter, deskripsi pendek 80, deskripsi lengkap 4000.

- Kategori: **Communication**
- Tag: Messaging, Privacy & security
- Email kontak: isi dengan email developer pilihanmu (wajib di Console, tampil publik)
- Situs: `https://github.com/delfiboyz/PhoenixChat`
- Kebijakan privasi: `https://delfiboyz.github.io/PhoenixChat/privacy/`

Grafis ada di [`graphics/`](graphics/): ikon 512×512, feature graphic 1024×500, dan
screenshot ponsel 1080×1920 (9:16) untuk `en-US` dan `id` (`5.png` = layar Rute Tor).

## English (en-US)

**App name** (12/30)

```
Phoenix Chat
```

**Short description** (80/80)

```
Private chat without accounts or servers. Messages go device to device over Tor.
```

**Full description**

```
Phoenix Chat lets you chat without an account, a phone number, or an email address. Your identity is a random key created on your phone, your messages are stored only on your devices, and they travel directly between devices over the Tor network.

HOW IT WORKS
• Each device runs its own Tor onion service. Messages go straight to your friend's device, end-to-end encrypted, and your IP address stays hidden.
• There is no user directory. Add a contact by scanning their QR code or pasting their code, and approve every new contact yourself.
• When a friend is offline, messages wait on your phone and are delivered automatically when you are both online.
• Clear status labels show where each message is: Saved locally, Queued, Sent, or Read.

FEATURES
• Attachments with a size limit you choose
• Password-encrypted backups to move to a new phone (also works with the Linux desktop app)
• PIN lock, auto-delete after 30 days, optional read receipts
• Tor route: see the relays your messages pass through (guard, middle relay, rendezvous point) with their IP and country, and who sees what. Your ISP only sees the Tor guard's IP, and .onion chats never use an exit node
• obfs4 and Snowflake bridges for networks that block Tor
• Battery saver: turn off background Tor if you only need messages while the app is open
• English and Indonesian, dark theme
• Free and open source (GPL-3.0)

GOOD TO KNOW
There is no server, so there is no account recovery: keep a backup. Messages are received while Phoenix Chat is running; a notification shows when it keeps Tor connected in the background.

Phoenix Chat collects no data: no analytics, no ads, no tracking.
```

## Indonesian (id)

**Nama aplikasi**

```
Phoenix Chat
```

**Deskripsi pendek** (77/80)

```
Chat pribadi tanpa akun dan server. Pesan langsung antar perangkat lewat Tor.
```

**Deskripsi lengkap**

```
Phoenix Chat memungkinkan kamu mengobrol tanpa akun, nomor HP, atau email. Identitasmu adalah kunci acak yang dibuat di ponselmu, pesan hanya disimpan di perangkatmu, dan dikirim langsung antar perangkat lewat jaringan Tor.

CARA KERJA
• Setiap perangkat menjalankan layanan onion Tor sendiri. Pesan langsung menuju perangkat temanmu, terenkripsi ujung ke ujung, dan alamat IP-mu tetap tersembunyi.
• Tidak ada direktori pengguna. Tambahkan kontak dengan memindai kode QR atau menempel kodenya, dan setujui sendiri setiap kontak baru.
• Saat teman offline, pesan menunggu di ponselmu dan terkirim otomatis begitu kalian sama-sama online.
• Label status menunjukkan posisi setiap pesan: Tersimpan lokal, Antre, Terkirim, atau Dibaca.

FITUR
• Lampiran dengan batas ukuran yang kamu atur sendiri
• Cadangan terenkripsi kata sandi untuk pindah ke ponsel baru (juga bisa di aplikasi desktop Linux)
• Kunci PIN, hapus otomatis setelah 30 hari, tanda "Dibaca" opsional
• Rute Tor: lihat relay yang dilewati pesanmu (gerbang, relay tengah, titik temu) lengkap dengan IP dan negaranya, plus siapa melihat apa. ISP-mu hanya melihat IP gerbang Tor, dan chat lewat .onion tidak pernah memakai exit node
• Bridge obfs4 dan Snowflake untuk jaringan yang memblokir Tor
• Mode hemat baterai: matikan Tor di latar jika pesan cukup diterima saat aplikasi terbuka
• Bahasa Indonesia dan Inggris, tampilan gelap
• Gratis dan open source (GPL-3.0)

PERLU DIKETAHUI
Tidak ada server, jadi tidak ada pemulihan akun: buat cadangan. Pesan diterima selama Phoenix Chat berjalan; notifikasi muncul saat aplikasi menjaga Tor tetap tersambung di latar.

Phoenix Chat tidak mengumpulkan data: tanpa analitik, iklan, atau pelacakan.
```

## Catatan rilis (Release notes) untuk versi pertama

```
<en-US>
First release: account-free chat over Tor, English and Indonesian, dark theme.
</en-US>
<id>
Rilis pertama: chat tanpa akun lewat Tor, bahasa Indonesia dan Inggris, tampilan gelap.
</id>
```

## Catatan rilis (Release notes) versi 0.2.0

```
<en-US>
New Tor route screen: see the relays your messages pass through (guard, middle relay, rendezvous point) and who sees what. Fix: messages not delivered and contacts shown offline after Tor's control connection dropped.
</en-US>
<id>
Layar baru Rute Tor: lihat relay yang dilewati pesanmu (gerbang, relay tengah, titik temu) dan siapa melihat apa. Perbaikan: pesan tidak terkirim dan kontak tampil offline setelah koneksi kontrol Tor terputus.
</id>
```

## Catatan rilis (Release notes) versi 0.2.1

```
<en-US>
Fix: contacts no longer stay offline while Tor is connected. Online status is now checked as soon as Tor is ready and regularly afterwards.
</en-US>
<id>
Perbaikan: kontak tidak lagi tertahan offline padahal Tor sudah tersambung. Status online kini diperiksa begitu Tor siap dan berkala sesudahnya.
</id>
```

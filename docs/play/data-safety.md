# Jawaban formulir Data safety dan App content

Semua di **Play Console → Policy → App content**. Jawaban di bawah sesuai cara kerja
Phoenix Chat versi ini; periksa ulang bila nanti ada fitur yang mengirim data ke server.

## Data safety

| Pertanyaan | Jawaban |
| --- | --- |
| Does your app collect or share any of the required user data types? | **No** |

Dengan jawaban **No**, Play menampilkan "No data collected" dan "No data shared with third parties"; pertanyaan lanjutan (enkripsi saat transit, permintaan penghapusan) tidak ditanyakan.

**Alasannya** (untuk berjaga bila peninjau bertanya):

- Tidak ada server milik pengembang, analitik, iklan, atau SDK pihak ketiga yang mengirim data.
- Pesan, lampiran, nama panggilan, dan kunci publik hanya berpindah dari perangkat ke perangkat kontak, atas tindakan pengguna sendiri, dan terenkripsi ujung ke ujung sehingga tidak bisa dibaca siapa pun selain pengirim dan penerima. Panduan Data safety Google memperlakukan data seperti ini (end-to-end encrypted, dikirim atas permintaan pengguna ke penerima pilihannya) sebagai tidak dikumpulkan maupun dibagikan oleh pengembang. Cocokkan dengan artikel bantuan "Provide information for Google Play's Data safety section" versi terbaru saat mengisi.
- Kamera hanya memproses gambar di perangkat untuk membaca kode QR.
- Relay Tor hanya meneruskan lalu lintas terenkripsi; pengembang tidak mengoperasikan relay dan tidak menerima data dari mereka.

**Jika peninjau tetap menganggap pesan "dikumpulkan"**, jawaban cadangan yang jujur:
Data type **Messages → Other in-app messages** dan **Files and docs**: *Collected: Yes*,
*Shared: No*, *Processed ephemerally: No*, *Required* (inti aplikasi), purpose
*App functionality*; *Encrypted in transit: Yes*; *Users can request deletion: Yes*
(Settings → Delete all data).

## App content lainnya

| Bagian | Jawaban |
| --- | --- |
| Privacy policy | `https://delfiboyz.github.io/PhoenixChat/privacy/` |
| App access | All functionality is available without special access (tidak ada login) |
| Ads | No, my app does not contain ads |
| Content rating | Kategori **Communication**. *Users can interact or exchange content*: **Yes**. *Shares user's current location*: **No**. Kekerasan, konten seksual, judi, narkoba: **No**. |
| Target audience | **13+** (bukan untuk anak); tidak menarik bagi anak |
| News app | No |
| COVID-19 contact tracing / status | No |
| Government app | No |
| Financial features | None |
| Health | No |
| Foreground service permissions | Lihat [foreground-service.md](foreground-service.md) |
| Advertising ID | No (aplikasi tidak memakai Advertising ID) |

## Fitur keselamatan konten buatan pengguna

Kebijakan User Generated Content Play meminta cara memblokir dan melaporkan pengguna yang
menyalahgunakan aplikasi. Phoenix Chat tidak punya direktori pengguna: orang hanya bisa
menghubungimu setelah kamu menyetujui permintaan kontaknya, dan setiap kontak bisa diblokir
atau dihapus dari layar info kontak. Karena tidak ada server, tidak ada moderasi terpusat;
sebutkan ini apa adanya bila ditanya.

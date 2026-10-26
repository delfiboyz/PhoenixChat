# Persiapan Google Play

Semua bahan untuk menerbitkan Phoenix Chat di Google Play. Urutan kerja di Play Console:

1. **Buat aplikasi** — nama *Phoenix Chat*, bahasa default English (United States), jenis App,
   gratis.
2. **Tanda tangan** — pilih *use existing app signing key* sebelum mengunggah apa pun:
   [signing.md](signing.md).
3. **App content** — kebijakan privasi, Data safety, rating konten, target audiens, iklan, dan
   deklarasi layanan latar: [data-safety.md](data-safety.md),
   [foreground-service.md](foreground-service.md).
4. **Store listing** — teks dan grafis: [listing.md](listing.md), [`graphics/`](graphics/).
5. **Build** — `npm run build`, lalu `cd android && ./gradlew bundleRelease` (atau
   `-PplayUpload` dengan kunci upload terpisah). Unggah
   `android/app/build/outputs/bundle/release/app-release.aab`.
6. **Pengujian tertutup** — akun developer pribadi yang dibuat setelah November 2023 wajib
   menjalankan *closed testing* dengan minimal 12 penguji selama 14 hari sebelum bisa
   mengajukan akses produksi.
7. **Produksi** — ajukan rilis setelah semua bagian App content berstatus selesai.

## Yang sudah diperiksa

| Syarat Play | Status |
| --- | --- |
| App Bundle (.aab) | `bundleRelease` menghasilkan AAB bertanda tangan, versionCode 19 untuk 0.1.0 |
| Target API | `targetSdk 36`, `minSdk 26` |
| Halaman memori 16 KB | Semua pustaka native (Tor, IPtProxy, libsodium, JNA) selaras 16 KB |
| Izin | Internet, status jaringan, notifikasi, kamera (QR), layanan latar `specialUse`; tidak ada izin sensitif lain |
| Fitur kamera | Tidak wajib, sehingga perangkat tanpa kamera tetap bisa memasang |
| Kebijakan privasi | Web: `https://delfiboyz.github.io/PhoenixChat/privacy/` (sumber: `site/privacy/`) dan di aplikasi: Settings → About → Privacy policy |
| Cadangan cloud | Dimatikan (`allowBackup=false`, aturan ekstraksi data) |

## Risiko peninjauan

Layanan latar bertipe `specialUse` adalah bagian yang paling mungkin dipertanyakan peninjau.
Teks pembenaran, alasan menolak alternatif, dan skrip video ada di
[foreground-service.md](foreground-service.md).

Periksa juga apakah nama "Phoenix Chat" sudah dipakai aplikasi lain di Play sebelum membuat
listing.

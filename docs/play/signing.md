# Tanda tangan aplikasi di Play: pakai kunci yang sudah ada

Phoenix Chat versi GitHub dan F-Droid ditandatangani dengan `android/release.keystore`
(alias `phoenixchat`, sidik jari SHA-256
`dd9178ba552770128ee27ef6b3d8aa71f96f1235235c1e84c7808d1138cb2b1c`).
Agar versi Play bisa memperbarui versi GitHub/F-Droid (dan sebaliknya), **Play harus memakai
kunci yang sama sebagai app signing key**. Jika Google dibiarkan membuat kunci baru, pengguna
harus mencopot aplikasi (dan kehilangan semua pesan) untuk pindah sumber.

Pilihan ini hanya bisa diambil **saat membuat rilis pertama**, sebelum mengunggah App Bundle
apa pun. Setelah itu tidak bisa diubah.

## 1. Daftarkan kunci yang ada sebagai app signing key

1. Play Console → buat aplikasi → **Test and release → Setup → App signing**
   (atau saat membuat rilis pertama, di kartu *App integrity*) → **Choose signing key** →
   **Use existing app signing key from Java KeyStore** (*Export and upload a key from Java keystore*).
2. Unduh `pepk.jar` dan `encryption_public_key.pem` dari halaman itu ke folder `android/`.
   Keduanya tidak ikut git.
3. Jalankan dari folder `android/` (kata sandi ada di `keystore.properties`):

   ```bash
   java -jar pepk.jar --keystore=release.keystore --alias=phoenixchat --output=phoenixchat-signing-key.zip --include-cert --rsa-aes-encryption --encryption-key-path=encryption_public_key.pem
   ```

4. Unggah `phoenixchat-signing-key.zip` di halaman yang sama, lalu hapus file zip itu dari disk.

## 2. Kunci upload

Kunci upload dipakai untuk menandatangani App Bundle yang kamu kirim ke Play; Google lalu
menandatangani ulang APK untuk pengguna dengan app signing key di atas.

**Pilihan A — paling sederhana:** pakai kunci yang sama sebagai kunci upload. Jika tidak
mendaftarkan kunci upload terpisah, app signing key sekaligus menjadi kunci upload. Build:

```bash
cd android && ./gradlew bundleRelease
```

**Pilihan B — disarankan Google:** kunci upload terpisah, sehingga `release.keystore` bisa
disimpan offline dan hanya dipakai untuk GitHub/F-Droid.

```bash
cd android && keytool -genkeypair -keystore upload.keystore -storetype PKCS12 -alias upload -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Phoenix Chat Upload"
```

```bash
cd android && keytool -export -rfc -keystore upload.keystore -alias upload -file upload_certificate.pem
```

Unggah `upload_certificate.pem` di **App signing → Upload key certificate**. Lalu buat
`android/upload.properties` (tidak ikut git):

```
storeFile=upload.keystore
storePassword=…
keyAlias=upload
keyPassword=…
```

Build App Bundle untuk Play dengan kunci upload:

```bash
cd android && ./gradlew bundleRelease -PplayUpload
```

Hasil: `android/app/build/outputs/bundle/release/app-release.aab`.

## 3. Cadangan

Simpan cadangan di luar komputer ini (mis. pengelola kata sandi dan media terenkripsi):

- `android/release.keystore` + `android/keystore.properties` — app signing key; hilang berarti
  versi GitHub/F-Droid tidak bisa diperbarui lagi.
- `android/upload.keystore` + `android/upload.properties` (jika pilihan B) — kalau hilang,
  minta reset kunci upload lewat Play Console; app signing key tidak terpengaruh.
- `fdroid/keystore.p12` + `fdroid/config.yml` — kunci repo F-Droid.

## versionCode

`versionCode` = versi×10 + kode: armeabi-v7a=1, arm64-v8a=2, x86_64=3 untuk APK split
(GitHub/F-Droid), dan 9 untuk App Bundle Play serta APK universal. Untuk versi 0.1.0, App
Bundle Play bernomor 19, lebih besar dari APK F-Droid 11–13, sehingga pengguna bisa pindah ke
Play. Saat merilis versi baru, naikkan `versionCode` dasar di
`android/app/build.gradle.kts` (mis. 1 → 2) dan `versionName`.

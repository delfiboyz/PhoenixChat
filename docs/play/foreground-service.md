# Deklarasi layanan latar (foreground service) untuk Play Console

Phoenix Chat memakai satu layanan foreground, `app.chatlokal.ChatService`, bertipe
`specialUse`. Play Console memintanya di **App content → Foreground service permissions**.
Pilih **Special use**, tempel teks di bawah (dalam bahasa Inggris, untuk peninjau), lalu
lampirkan tautan video.

Nilai `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` di `AndroidManifest.xml` sudah berisi ringkasan
yang sama, jadi deklarasi di Console dan di aplikasi konsisten.

## Teks untuk Play Console

**Feature / use case (pendek):**

> Peer-to-peer messaging over a Tor onion service, with no server: keeps the app reachable so contacts' messages can be delivered directly to the device.

**Description (panjang):**

> Phoenix Chat is a messaging app without accounts or servers. Each device runs its own Tor onion service, and contacts deliver end-to-end encrypted messages directly to that onion service. There is no developer server that stores messages or could wake the app, so the device itself must stay reachable on the Tor network to receive messages.
>
> The foreground service keeps the embedded Tor process and the local onion service running while the app is in the background. It starts only after the user has created an identity, shows a persistent notification ("Phoenix Chat is active – receiving messages over Tor"), and stops as soon as the user enables "Battery saver" in Settings, in which case messages are received only while the app is open. Messages sent to an offline device wait on the sender's device and are delivered when the recipient becomes reachable.
>
> Why other options do not fit:
> - Firebase Cloud Messaging / push: would require a server that knows each user and their device token. The app deliberately has no server and no accounts, so there is nothing that could send a push.
> - `dataSync`: intended for finite uploads/downloads and limited to 6 hours per day on Android 15+. Receiving messages is not a finite transfer.
> - `remoteMessaging`: intended for continuing a messaging task on another device of the same user, not for receiving messages from contacts.
> - WorkManager / periodic jobs: an onion service is only reachable while it is running; periodic wake-ups would make the user unreachable most of the time and messages would be lost to timeouts.
>
> The user can see the service at all times through the notification, and can stop it at any time with the Battery saver setting.

**User impact if the service is deferred or stopped:**

> The user stops receiving messages until they open the app again. Contacts' messages stay queued on the contacts' devices and are delivered later.

## Video demo (wajib)

Rekam layar ponsel (±60 detik), unggah ke YouTube sebagai *Unlisted*, lalu tempel tautannya.
Urutan yang memperlihatkan semua poin di atas:

1. Buka Phoenix Chat, buat nama panggilan → tampil "Connecting to the Tor network…", lalu siap.
2. Tarik panel notifikasi: tampil notifikasi "Phoenix Chat is active".
3. Tutup aplikasi (kembali ke layar utama). Dari perangkat kedua, kirim pesan → notifikasi pesan baru muncul walau aplikasi ditutup.
4. Buka **Settings → Privacy → Battery saver (Android)**, nyalakan → notifikasi layanan hilang.
5. Tutup aplikasi, kirim pesan dari perangkat kedua → pesan baru diterima setelah aplikasi dibuka lagi.

## Preseden

Aplikasi pesan peer-to-peer lain di Play juga menjaga koneksi lewat layanan foreground karena
tidak memakai server, misalnya Briar. Sebut ini bila peninjau meminta penjelasan tambahan.

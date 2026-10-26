package app.chatlokal.core

// Padanan server/i18n.js: pesan dari core (galat, notifikasi, status Tor) dan
// teks milik Android sendiri. Bahasa mengikuti pengaturan `lang` perangkat.
object I18n {
    private val id = mapOf(
        "failed" to "Gagal",
        "tooLarge" to "Terlalu besar",
        "badToken" to "Token tidak valid",
        "locked" to "Aplikasi terkunci",
        "notFound" to "Tidak ditemukan",
        "noCode" to "Belum ada kode",
        "noAttachment" to "Lampiran belum ada",
        "identityExists" to "Identitas sudah ada",
        "nameRequired" to "Isi nama panggilan",
        "nameEmpty" to "Nama tidak boleh kosong",
        "wrongPin" to "PIN salah",
        "pinFormat" to "PIN harus 4–8 angka",
        "badCode" to "Kode tidak dikenali",
        "ownCode" to "Ini kode milikmu sendiri",
        "badOnion" to "Alamat .onion tidak valid",
        "noContact" to "Kontak tidak ada",
        "noChat" to "Obrolan tidak ada",
        "notApproved" to "Kontak belum disetujui",
        "emptyMessage" to "Pesan kosong",
        "shortPassword" to "Kata sandi minimal 8 karakter",
        "badBackup" to "Isi cadangan tidak valid",
        "notBackup" to "Bukan file cadangan Phoenix Chat",
        "wrongPassword" to "Kata sandi salah atau file rusak",
        "torTimeout" to "Tidak bisa terhubung ke jaringan Tor. Periksa koneksi internet atau aktifkan bridge.",
        "bridgeNoLines" to "Alamat bridge belum diisi",
        "notifyRequestTitle" to "Permintaan kontak",
        "notifyRequestBody" to "{name} ingin mengobrol",
        "notifyQueueSent" to "Pesan dari antrean sudah terkirim",
        "notifyAttachment" to "Lampiran: {name}",
        // Teks Android
        "channelMessages" to "Pesan",
        "channelMessagesDesc" to "Pesan baru dan permintaan kontak",
        "channelService" to "Koneksi Tor",
        "channelServiceDesc" to "Menjaga Phoenix Chat menerima pesan di latar belakang",
        "serviceTitle" to "Phoenix Chat aktif",
        "serviceText" to "Menerima pesan lewat Tor. Pesan tetap hanya di perangkat ini.",
        "newMessage" to "Pesan baru",
        "fileSaved" to "File disimpan",
        "fileSaveFailed" to "Gagal menyimpan file",
        "clipLabel" to "Kode Phoenix Chat",
        "shareTitle" to "Bagikan kode Phoenix Chat",
        "scanPrompt" to "Arahkan kamera ke kode QR temanmu",
    )

    private val en = mapOf(
        "failed" to "Failed",
        "tooLarge" to "Too large",
        "badToken" to "Invalid token",
        "locked" to "The app is locked",
        "notFound" to "Not found",
        "noCode" to "No code yet",
        "noAttachment" to "Attachment not available yet",
        "identityExists" to "An identity already exists",
        "nameRequired" to "Enter a nickname",
        "nameEmpty" to "The name can't be empty",
        "wrongPin" to "Wrong PIN",
        "pinFormat" to "The PIN must be 4–8 digits",
        "badCode" to "Code not recognized",
        "ownCode" to "This is your own code",
        "badOnion" to "Invalid .onion address",
        "noContact" to "Contact not found",
        "noChat" to "Chat not found",
        "notApproved" to "Contact not approved yet",
        "emptyMessage" to "The message is empty",
        "shortPassword" to "The password must be at least 8 characters",
        "badBackup" to "The backup contents are invalid",
        "notBackup" to "Not a Phoenix Chat backup file",
        "wrongPassword" to "Wrong password or damaged file",
        "torTimeout" to "Can't connect to the Tor network. Check your internet connection or turn on a bridge.",
        "bridgeNoLines" to "No bridge addresses entered",
        "notifyRequestTitle" to "Contact request",
        "notifyRequestBody" to "{name} wants to chat",
        "notifyQueueSent" to "Queued message delivered",
        "notifyAttachment" to "Attachment: {name}",
        "channelMessages" to "Messages",
        "channelMessagesDesc" to "New messages and contact requests",
        "channelService" to "Tor connection",
        "channelServiceDesc" to "Keeps Phoenix Chat receiving messages in the background",
        "serviceTitle" to "Phoenix Chat is active",
        "serviceText" to "Receiving messages over Tor. Messages stay only on this device.",
        "newMessage" to "New message",
        "fileSaved" to "File saved",
        "fileSaveFailed" to "Couldn't save the file",
        "clipLabel" to "Phoenix Chat code",
        "shareTitle" to "Share your Phoenix Chat code",
        "scanPrompt" to "Point the camera at your friend's QR code",
    )

    fun has(key: String) = id.containsKey(key)

    fun msg(lang: String?, key: String, vars: Map<String, String> = emptyMap()): String {
        var s = (if (lang == "en") en else id)[key] ?: id[key] ?: key
        vars.forEach { (k, v) -> s = s.replace("{$k}", v) }
        return s
    }
}

// Galat yang ditampilkan ke pengguna: membawa kunci pesan, diterjemahkan saat dikirim.
class UserError(val key: String, val vars: Map<String, String> = emptyMap()) : Exception(key)

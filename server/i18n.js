// Pesan dari server (galat, notifikasi, status Tor) dalam dua bahasa.
// Bahasa mengikuti pengaturan `lang` perangkat; padanannya ada di Android (I18n.kt).

const M = {
  id: {
    failed: 'Gagal',
    tooLarge: 'Terlalu besar',
    badToken: 'Token tidak valid',
    locked: 'Aplikasi terkunci',
    notFound: 'Tidak ditemukan',
    noCode: 'Belum ada kode',
    noAttachment: 'Lampiran belum ada',
    identityExists: 'Identitas sudah ada',
    nameRequired: 'Isi nama panggilan',
    nameEmpty: 'Nama tidak boleh kosong',
    wrongPin: 'PIN salah',
    pinFormat: 'PIN harus 4–8 angka',
    badCode: 'Kode tidak dikenali',
    ownCode: 'Ini kode milikmu sendiri',
    badOnion: 'Alamat .onion tidak valid',
    noContact: 'Kontak tidak ada',
    noChat: 'Obrolan tidak ada',
    notApproved: 'Kontak belum disetujui',
    emptyMessage: 'Pesan kosong',
    shortPassword: 'Kata sandi minimal 8 karakter',
    badBackup: 'Isi cadangan tidak valid',
    notBackup: 'Bukan file cadangan Chat Lokal',
    wrongPassword: 'Kata sandi salah atau file rusak',
    torMissing: 'Program tor tidak ditemukan. Pasang paket tor terlebih dahulu.',
    torStopped: 'Tor berhenti (kode {code}). Periksa koneksi internet atau aktifkan bridge.',
    torTimeout: 'Tidak bisa terhubung ke jaringan Tor. Periksa koneksi internet atau aktifkan bridge.',
    bridgeProgram: 'Program bridge {type} tidak ditemukan di sistem',
    bridgeNoLines: 'Alamat bridge belum diisi',
    notifyRequestTitle: 'Permintaan kontak',
    notifyRequestBody: '{name} ingin mengobrol',
    notifyQueueSent: 'Pesan dari antrean sudah terkirim',
    notifyAttachment: 'Lampiran: {name}',
  },
  en: {
    failed: 'Failed',
    tooLarge: 'Too large',
    badToken: 'Invalid token',
    locked: 'The app is locked',
    notFound: 'Not found',
    noCode: 'No code yet',
    noAttachment: 'Attachment not available yet',
    identityExists: 'An identity already exists',
    nameRequired: 'Enter a nickname',
    nameEmpty: "The name can't be empty",
    wrongPin: 'Wrong PIN',
    pinFormat: 'The PIN must be 4–8 digits',
    badCode: 'Code not recognized',
    ownCode: 'This is your own code',
    badOnion: 'Invalid .onion address',
    noContact: 'Contact not found',
    noChat: 'Chat not found',
    notApproved: 'Contact not approved yet',
    emptyMessage: 'The message is empty',
    shortPassword: 'The password must be at least 8 characters',
    badBackup: 'The backup contents are invalid',
    notBackup: 'Not a Chat Lokal backup file',
    wrongPassword: 'Wrong password or damaged file',
    torMissing: "The tor program wasn't found. Install the tor package first.",
    torStopped: 'Tor stopped (code {code}). Check your internet connection or turn on a bridge.',
    torTimeout: "Can't connect to the Tor network. Check your internet connection or turn on a bridge.",
    bridgeProgram: "The {type} bridge program wasn't found on this system",
    bridgeNoLines: 'No bridge addresses entered',
    notifyRequestTitle: 'Contact request',
    notifyRequestBody: '{name} wants to chat',
    notifyQueueSent: 'Queued message delivered',
    notifyAttachment: 'Attachment: {name}',
  },
};

export function msg(lang, key, vars) {
  let s = (M[lang] || M.id)[key] ?? M.id[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  return s;
}

// Galat yang ditampilkan ke pengguna: membawa kunci pesan, diterjemahkan saat dikirim.
export class UserError extends Error {
  constructor(key, vars) {
    super(msg('id', key, vars));
    this.key = key;
    this.vars = vars;
  }
}

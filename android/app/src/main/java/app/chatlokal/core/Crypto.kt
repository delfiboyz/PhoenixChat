package app.chatlokal.core

import com.goterl.lazysodium.LazySodiumAndroid
import com.goterl.lazysodium.SodiumAndroid
import com.sun.jna.Library
import com.sun.jna.Native
import com.sun.jna.NativeLong
import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

// Padanan server/crypto.js. Formatnya harus identik agar perangkat Android dan
// desktop bisa saling mengirim pesan dan memakai file cadangan yang sama.
object Crypto {
    private val sodium = LazySodiumAndroid(SodiumAndroid())

    // lazysodium tidak membungkus scrypt mentah; panggil libsodium langsung (size_t = NativeLong).
    private interface ScryptLib : Library {
        fun crypto_pwhash_scryptsalsa208sha256_ll(
            passwd: ByteArray, passwdlen: NativeLong, salt: ByteArray, saltlen: NativeLong,
            n: Long, r: Int, p: Int, buf: ByteArray, buflen: NativeLong,
        ): Int
    }
    private val scryptLib: ScryptLib by lazy { Native.load("sodium", ScryptLib::class.java) }
    private val random = SecureRandom()
    private const val NONCE = 24
    private const val MAC = 16

    private fun b64(b: ByteArray): String = Base64.getEncoder().encodeToString(b)
    private fun unb64(s: String): ByteArray = Base64.getDecoder().decode(s)

    fun randomBytes(n: Int) = ByteArray(n).also { random.nextBytes(it) }

    fun randomId(): String = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes(9))

    fun newBoxKeys(): JSONObject {
        val pk = ByteArray(32)
        val sk = ByteArray(32)
        check(sodium.cryptoBoxKeypair(pk, sk))
        return JSONObject().put("publicKey", b64(pk)).put("secretKey", b64(sk))
    }

    // Sama dengan nacl.box di tweetnacl: keluaran = MAC(16) || ciphertext.
    fun seal(obj: JSONObject, theirPublic: String, mySecret: String): JSONObject {
        val nonce = randomBytes(NONCE)
        val msg = obj.toString().toByteArray(Charsets.UTF_8)
        val out = ByteArray(msg.size + MAC)
        check(sodium.cryptoBoxEasy(out, msg, msg.size.toLong(), nonce, unb64(theirPublic), unb64(mySecret)))
        return JSONObject().put("nonce", b64(nonce)).put("box", b64(out))
    }

    fun open(env: JSONObject, theirPublic: String, mySecret: String): JSONObject? = try {
        val box = unb64(env.getString("box"))
        val nonce = unb64(env.getString("nonce"))
        val pk = unb64(theirPublic)
        if (box.size < MAC || nonce.size != NONCE || pk.size != 32) {
            null
        } else {
            val out = ByteArray(box.size - MAC)
            if (sodium.cryptoBoxOpenEasy(out, box, box.size.toLong(), nonce, pk, unb64(mySecret))) {
                JSONObject(String(out, Charsets.UTF_8))
            } else {
                null
            }
        }
    } catch (e: Exception) {
        null
    }

    fun sha256Hex(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    // ID perangkat yang ditampilkan: ringkasan alamat, mis. 7F3A-91C2-B04E.
    fun deviceId(address: String): String {
        val h = sha256Hex(address).substring(0, 12).uppercase()
        return "${h.substring(0, 4)}-${h.substring(4, 8)}-${h.substring(8, 12)}"
    }

    // Kode kontak = alamat + kunci publik + nama, dikodekan base64url.
    fun encodeContactCode(name: String, address: String, publicKey: String): String {
        val json = JSONObject().put("v", 1).put("n", name).put("a", address).put("k", publicKey)
        return "chatlokal:" + Base64.getUrlEncoder().withoutPadding().encodeToString(json.toString().toByteArray(Charsets.UTF_8))
    }

    data class ContactCode(val name: String, val address: String, val publicKey: String)

    fun decodeContactCode(code: String?): ContactCode? = try {
        val raw = (code ?: "").trim().replace(Regex("^chatlokal:(//add\\?c=)?"), "").trimEnd('=')
        val obj = JSONObject(String(Base64.getUrlDecoder().decode(raw), Charsets.UTF_8))
        val k = obj.getString("k")
        if (obj.optInt("v") != 1 || unb64(k).size != 32) null
        else ContactCode(obj.optString("n").take(40), obj.getString("a"), k)
    } catch (e: Exception) {
        null
    }

    private fun scrypt(password: ByteArray, salt: ByteArray, n: Long): ByteArray {
        val out = ByteArray(32)
        val rc = scryptLib.crypto_pwhash_scryptsalsa208sha256_ll(
            password, NativeLong(password.size.toLong()), salt, NativeLong(salt.size.toLong()), n, 8, 1, out, NativeLong(out.size.toLong()),
        )
        check(rc == 0) { "scrypt gagal" }
        return out
    }

    // File cadangan: "CLB1" | salt(16) | iv(12) | tag(16) | isi — scrypt(N=2^15) + AES-256-GCM.
    fun encryptBackup(data: ByteArray, password: String): ByteArray {
        val salt = randomBytes(16)
        val iv = randomBytes(12)
        val key = scrypt(password.toByteArray(Charsets.UTF_8), salt, 1L shl 15)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        val sealed = c.doFinal(data) // isi || tag
        val body = sealed.copyOfRange(0, sealed.size - 16)
        val tag = sealed.copyOfRange(sealed.size - 16, sealed.size)
        return "CLB1".toByteArray() + salt + iv + tag + body
    }

    fun decryptBackup(buf: ByteArray, password: String): ByteArray {
        if (buf.size < 48 || String(buf.copyOfRange(0, 4)) != "CLB1") throw UserError("notBackup")
        val salt = buf.copyOfRange(4, 20)
        val iv = buf.copyOfRange(20, 32)
        val tag = buf.copyOfRange(32, 48)
        val body = buf.copyOfRange(48, buf.size)
        val key = scrypt(password.toByteArray(Charsets.UTF_8), salt, 1L shl 15)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        return try {
            c.doFinal(body + tag)
        } catch (e: Exception) {
            throw UserError("wrongPassword")
        }
    }

    // PIN: scrypt(pin, salt-hex sebagai teks, N=2^14), seperti hashPin di desktop.
    fun hashPin(pin: String, salt: String = randomBytes(16).joinToString("") { "%02x".format(it) }): JSONObject {
        val hash = scrypt(pin.toByteArray(Charsets.UTF_8), salt.toByteArray(Charsets.UTF_8), 1L shl 14)
        return JSONObject().put("salt", salt).put("hash", hash.joinToString("") { "%02x".format(it) })
    }

    fun checkPin(pin: String, rec: JSONObject?): Boolean {
        if (rec == null) return true
        val got = hashPin(pin, rec.getString("salt")).getString("hash")
        return MessageDigest.isEqual(got.toByteArray(), rec.getString("hash").toByteArray())
    }
}

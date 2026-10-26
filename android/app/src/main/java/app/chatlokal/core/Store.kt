package app.chatlokal.core

import android.os.StatFs
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

// Penyimpanan lokal berbasis file JSON, sama dengan server/store.js di desktop.
// Tidak ada database: setiap jenis data adalah satu file, ditulis secara atomik.
class Store(val dir: File) {
    init {
        File(dir, "chats").mkdirs()
        File(dir, "files").mkdirs()
    }

    fun file(name: String) = File(dir, name)

    fun readObj(name: String): JSONObject? = try {
        JSONObject(file(name).readText())
    } catch (e: Exception) {
        null
    }

    fun readArr(name: String): JSONArray? = try {
        JSONArray(file(name).readText())
    } catch (e: Exception) {
        null
    }

    fun write(name: String, value: Any) {
        val target = file(name)
        target.parentFile?.mkdirs()
        val tmp = File(target.path + ".tmp")
        tmp.writeText(value.toString())
        if (!tmp.renameTo(target)) {
            target.delete()
            tmp.renameTo(target)
        }
    }

    fun remove(name: String) {
        file(name).deleteRecursively()
    }

    // Lampiran disimpan sebagai file biner terpisah, nama = id lampiran.
    private fun safeBlob(id: String): File? =
        if (Regex("^[A-Za-z0-9_-]+$").matches(id)) File(dir, "files/$id") else null

    fun writeBlob(id: String, bytes: ByteArray) {
        safeBlob(id)?.writeBytes(bytes)
    }

    fun readBlob(id: String): ByteArray? = safeBlob(id)?.takeIf { it.isFile }?.readBytes()

    fun removeBlob(id: String) {
        safeBlob(id)?.delete()
    }

    private fun sizeOf(rel: String): Long {
        val f = File(dir, rel)
        if (!f.exists()) return 0
        return f.walkTopDown().filter { it.isFile }.sumOf { it.length() }
    }

    // Ukuran per jenis data, untuk meteran di layar Pengaturan.
    fun usage(): JSONObject {
        val messages = sizeOf("chats") + sizeOf("contacts.json")
        val files = sizeOf("files")
        val keys = sizeOf("identity.json") + sizeOf("tor/hs")
        val free = try {
            StatFs(dir.path).availableBytes
        } catch (e: Exception) {
            -1L
        }
        return JSONObject()
            .put("messages", messages)
            .put("files", files)
            .put("keys", keys)
            .put("total", messages + files + keys)
            .put("free", if (free >= 0) free else JSONObject.NULL)
    }

    fun wipe() {
        dir.listFiles()?.forEach { it.deleteRecursively() }
        File(dir, "chats").mkdirs()
        File(dir, "files").mkdirs()
    }
}

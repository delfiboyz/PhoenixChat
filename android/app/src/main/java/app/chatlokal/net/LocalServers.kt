package app.chatlokal.net

import android.content.res.AssetManager
import app.chatlokal.core.Core
import app.chatlokal.core.UserError
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.net.URLDecoder
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

// Padanan server/http.js. Dua server yang sengaja dipisah:
// - server peer: satu-satunya yang terjangkau lewat layanan onion (ping + kotak masuk);
// - server UI: hanya 127.0.0.1, butuh token, melayani antarmuka dan API-nya.

private const val MB = 1024L * 1024

object LocalServers {
    // Batas waktu baca permintaan; aliran SSE tidak terpengaruh karena hanya menulis.
    const val TIMEOUT = 30_000
}

private fun status(code: Int, text: String) = object : NanoHTTPD.Response.IStatus {
    override fun getDescription() = "$code $text"
    override fun getRequestStatus() = code
}

private fun readBody(session: NanoHTTPD.IHTTPSession, max: Long): ByteArray {
    val len = session.headers["content-length"]?.toLongOrNull() ?: 0L
    if (len > max) throw UserError("tooLarge")
    val out = ByteArray(len.toInt())
    var off = 0
    val input = session.inputStream
    while (off < out.size) {
        val n = input.read(out, off, out.size - off)
        if (n < 0) break
        off += n
    }
    return out
}

class PeerServer(port: Int, private val core: Core) : NanoHTTPD("127.0.0.1", port) {
    override fun serve(session: IHTTPSession): Response = try {
        when {
            session.method == Method.GET && session.uri == "/ping" -> newFixedLengthResponse("ok")
            session.method == Method.POST && session.uri == "/inbox" -> {
                // Lampiran dikirim base64 dalam amplop JSON; batas mengikuti pengaturan penerima.
                val cap = minOf(Core.limitBytes(core.settings.optString("limit", "25")), 200 * MB) * 14 / 10 + MB
                val body = readBody(session, maxOf(cap, 2 * MB))
                val ok = core.receive(JSONObject(String(body, Charsets.UTF_8)))
                newFixedLengthResponse(if (ok) Response.Status.OK else Response.Status.BAD_REQUEST, MIME_PLAINTEXT, "")
            }
            else -> newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "")
        }
    } catch (e: Exception) {
        newFixedLengthResponse(Response.Status.BAD_REQUEST, MIME_PLAINTEXT, "")
    }
}

// Aliran SSE: antrean baris yang dibaca NanoHTTPD sebagai respons chunked.
private class EventStream : InputStream() {
    val queue = LinkedBlockingQueue<ByteArray>()
    @Volatile var closed = false
    private var current: ByteArray = ": ok\n\n".toByteArray()
    private var pos = 0

    fun push(s: String) {
        if (!closed) queue.offer(s.toByteArray(Charsets.UTF_8))
    }

    override fun read(): Int {
        val b = ByteArray(1)
        return if (read(b, 0, 1) < 0) -1 else b[0].toInt() and 0xff
    }

    override fun read(b: ByteArray, off: Int, len: Int): Int {
        while (pos >= current.size) {
            if (closed) return -1
            current = queue.poll(25, TimeUnit.SECONDS) ?: ": ka\n\n".toByteArray()
            pos = 0
        }
        val n = minOf(len, current.size - pos)
        System.arraycopy(current, pos, b, off, n)
        pos += n
        return n
    }

    override fun close() {
        closed = true
    }
}

class UiServer(port: Int, private val core: Core, private val token: String, private val assets: AssetManager) :
    NanoHTTPD("127.0.0.1", port) {
    private val clients = CopyOnWriteArrayList<EventStream>()

    // SSE tanpa gzip: kompresor menahan data sampai aliran ditutup, sehingga event tidak pernah sampai.
    // NanoHTTPD memutuskan gzip lewat fungsi ini setelah serve(), jadi harus di-override di sini.
    override fun useGzipWhenAccepted(r: Response): Boolean =
        r.mimeType?.startsWith("text/event-stream") != true && super.useGzipWhenAccepted(r)
    private val allowedHosts = setOf("127.0.0.1", "localhost")

    init {
        core.onEvent { type, data ->
            val line = "event: $type\ndata: $data\n\n"
            clients.removeAll { it.closed }
            clients.forEach { it.push(line) }
        }
    }

    private class Route(val method: Method, pattern: String, val handler: (IHTTPSession, Map<String, String>) -> Any?, val whenLocked: Boolean = false) {
        val keys = Regex(":(\\w+)").findAll(pattern).map { it.groupValues[1] }.toList()
        val re = Regex("^" + pattern.replace(Regex(":(\\w+)"), "([^/]+)") + "$")
    }

    private fun json(session: IHTTPSession) = readBody(session, MB).let { if (it.isEmpty()) JSONObject() else JSONObject(String(it, Charsets.UTF_8)) }
    private fun JSONObject.str(k: String): String? = if (isNull(k)) null else optString(k)

    private val routes = listOf(
        Route(Method.GET, "/api/status", { _, _ -> core.status() }, whenLocked = true),
        Route(Method.POST, "/api/unlock", { s, _ -> core.unlock(json(s).str("pin")); core.status() }, whenLocked = true),
        Route(Method.POST, "/api/onboard", { s, _ -> core.onboard(json(s).str("name")); core.status() }),
        Route(Method.POST, "/api/restore", { s, _ ->
            val buf = readBody(s, 2048 * MB)
            core.restore(buf, URLDecoder.decode(s.headers["x-password"] ?: "", "UTF-8"))
            core.status()
        }),
        Route(Method.GET, "/api/chats", { s, _ -> core.chatList(s.parameters["q"]?.firstOrNull()) }),
        Route(Method.GET, "/api/chats/:id", { _, p -> core.chat(p["id"]!!) }),
        Route(Method.POST, "/api/chats/:id/read", { _, p -> core.markRead(p["id"]!!); JSONObject() }),
        Route(Method.POST, "/api/chats/:id/messages", { s, p -> core.send(p["id"]!!, json(s).str("text")) }),
        Route(Method.POST, "/api/chats/:id/files", { s, p ->
            val buf = readBody(s, 200 * MB)
            core.sendFile(p["id"]!!, URLDecoder.decode(s.headers["x-name"] ?: "file", "UTF-8"), s.headers["content-type"], buf)
        }),
        Route(Method.POST, "/api/chats/:id/files/:fid/request", { _, p -> core.requestFile(p["id"]!!, p["fid"]!!); JSONObject() }),
        Route(Method.POST, "/api/contacts", { s, _ -> core.addContact(json(s).str("code")) }),
        Route(Method.POST, "/api/contacts/:id/accept", { _, p -> core.acceptContact(p["id"]!!); JSONObject() }),
        Route(Method.POST, "/api/contacts/:id/block", { _, p -> core.blockContact(p["id"]!!); JSONObject() }),
        Route(Method.DELETE, "/api/contacts/:id", { _, p -> core.deleteContact(p["id"]!!); JSONObject() }),
        Route(Method.GET, "/api/settings", { _, _ -> core.publicSettings() }),
        Route(Method.PATCH, "/api/settings", { s, _ -> core.patchSettings(json(s)); core.publicSettings() }),
        Route(Method.POST, "/api/me", { s, _ -> core.setName(json(s).str("name")); core.status() }),
        Route(Method.POST, "/api/pin", { s, _ -> core.setPin(json(s).str("pin")); core.publicSettings() }),
        Route(Method.GET, "/api/network/circuits", { _, _ -> core.circuits() }),
        Route(Method.POST, "/api/network/retry", { _, _ -> core.retryNetwork(); JSONObject() }),
        Route(Method.POST, "/api/wipe", { _, _ -> core.wipe(); core.status() }),
    )

    private fun jsonResponse(code: Response.IStatus, body: Any): Response =
        newFixedLengthResponse(code, "application/json; charset=utf-8", body.toString()).apply { addHeader("Cache-Control", "no-store") }

    private fun err(code: Int, text: String, msg: String) = jsonResponse(status(code, text), JSONObject().put("error", msg))

    override fun serve(session: IHTTPSession): Response {
        // Tolak Host asing (perlindungan DNS rebinding).
        val host = (session.headers["host"] ?: "").substringBefore(':')
        if (host !in allowedHosts) return newFixedLengthResponse(Response.Status.FORBIDDEN, MIME_PLAINTEXT, "")
        val path = session.uri
        if (!path.startsWith("/api/")) return serveStatic(path)

        val given = session.headers["x-token"] ?: session.parameters["token"]?.firstOrNull()
        if (given != token) return err(401, "Unauthorized", core.m("badToken"))

        return try {
            if (session.method == Method.GET && path == "/api/events") {
                val stream = EventStream()
                clients.add(stream)
                return newChunkedResponse(Response.Status.OK, "text/event-stream", stream).apply { addHeader("Cache-Control", "no-store") }
            }
            if (core.locked && path != "/api/status" && path != "/api/unlock") return err(423, "Locked", core.m("locked"))
            if (session.method == Method.GET && path == "/api/qr") return qr()
            Regex("^/api/files/([\\w-]+)$").find(path)?.let { m ->
                if (session.method != Method.GET) return@let
                val bytes = core.getFile(m.groupValues[1]) ?: return err(404, "Not Found", core.m("noAttachment"))
                val type = session.parameters["type"]?.firstOrNull() ?: "application/octet-stream"
                return newFixedLengthResponse(Response.Status.OK, type, ByteArrayInputStream(bytes), bytes.size.toLong()).apply {
                    addHeader("Cache-Control", "no-store")
                    addHeader("X-Content-Type-Options", "nosniff")
                    addHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'")
                }
            }
            if (session.method == Method.POST && path == "/api/backup/export") {
                val bytes = core.exportBackup(json(session).str("password"))
                return newFixedLengthResponse(Response.Status.OK, "application/octet-stream", ByteArrayInputStream(bytes), bytes.size.toLong())
            }
            for (r in routes) {
                if (r.method != session.method) continue
                val m = r.re.find(path) ?: continue
                val params = r.keys.mapIndexed { i, k -> k to URLDecoder.decode(m.groupValues[i + 1], "UTF-8") }.toMap()
                return jsonResponse(Response.Status.OK, r.handler(session, params) ?: JSONObject())
            }
            err(404, "Not Found", core.m("notFound"))
        } catch (e: UserError) {
            err(if (e.key == "tooLarge") 413 else 400, "Bad Request", core.m(e.key, e.vars))
        } catch (e: Exception) {
            err(400, "Bad Request", e.message ?: core.m("failed"))
        }
    }

    private fun qr(): Response {
        val code = core.status().optJSONObject("me")?.optString("code")?.takeIf { it.isNotEmpty() && it != "null" }
            ?: return err(404, "Not Found", core.m("noCode"))
        val m = QRCodeWriter().encode(code, BarcodeFormat.QR_CODE, 0, 0, mapOf(
            EncodeHintType.MARGIN to 0,
            EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
        ))
        val path = StringBuilder()
        for (y in 0 until m.height) for (x in 0 until m.width) if (m.get(x, y)) path.append("M$x ${y}h1v1h-1z")
        val svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.width} ${m.height}" shape-rendering="crispEdges">""" +
            """<rect width="100%" height="100%" fill="#FFFFFF"/><path fill="#15201B" d="$path"/></svg>"""
        return newFixedLengthResponse(Response.Status.OK, "image/svg+xml", svg).apply { addHeader("Cache-Control", "no-store") }
    }

    private val mime = mapOf(
        "html" to "text/html; charset=utf-8", "js" to "text/javascript", "css" to "text/css", "svg" to "image/svg+xml",
        "woff2" to "font/woff2", "woff" to "font/woff", "png" to "image/png",
    )

    private fun serveStatic(path: String): Response {
        val rel = path.trimStart('/').takeIf { it.isNotEmpty() && !it.contains("..") } ?: "index.html"
        val (name, stream) = try {
            rel to assets.open("web/$rel")
        } catch (e: Exception) {
            "index.html" to assets.open("web/index.html")
        }
        val bytes = stream.use { it.readBytes() }
        return newFixedLengthResponse(Response.Status.OK, mime[name.substringAfterLast('.')] ?: "application/octet-stream", ByteArrayInputStream(bytes), bytes.size.toLong()).apply {
            addHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'")
        }
    }
}

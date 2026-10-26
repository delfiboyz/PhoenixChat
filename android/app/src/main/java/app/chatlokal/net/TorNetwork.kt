package app.chatlokal.net

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.net.LocalSocket
import android.net.LocalSocketAddress
import android.os.IBinder
import android.util.Log
import app.chatlokal.core.Network
import IPtProxy.IPtProxy
import IPtProxy.OnTransportEvents
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import net.freehaven.tor.control.TorControlConnection
import org.torproject.jni.TorService
import java.io.File
import java.net.InetSocketAddress
import java.net.Proxy
import java.util.Base64
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

// Tor tertanam lewat tor-android (TorService, dalam proses aplikasi).
// Layanan onion dibuat dengan ADD_ONION, kuncinya disimpan di tor/hs dalam format
// yang sama dengan HiddenServiceDir di desktop, agar cadangan bisa dipindah.
class TorNetwork(
    private val context: Context,
    private val dataDir: File,
    private val peerPort: Int,
    private val onChange: () -> Unit,
) : Network {
    private val hsDir = File(dataDir, "tor/hs")
    private val ticker = Executors.newSingleThreadScheduledExecutor()
    @Volatile private var service: TorService? = null
    @Volatile private var phase = "idle"
    @Volatile private var progress = 0
    @Volatile private var error: String? = null
    @Volatile private var serviceId: String? = null
    @Volatile private var startedAt = 0L
    @Volatile private var bridge: JSONObject = JSONObject().put("type", "none")
    @Volatile private var client: OkHttpClient? = null
    @Volatile private var ctl: TorControlConnection? = null
    private var pt: IPtProxy.Controller? = null

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            service = (binder as TorService.LocalBinder).service
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            service = null
        }
    }

    // Koneksi kontrol sendiri ke ControlSocket milik TorService. Koneksi bawaan
    // TorService bisa gagal sekali saat start (balapan waktu) dan tidak dicoba ulang.
    private fun control(): TorControlConnection? {
        ctl?.let { return it }
        val sock = File(context.getDir("TorService", Context.MODE_PRIVATE), "data/ControlSocket")
        if (!sock.exists()) return null
        return try {
            val ls = LocalSocket()
            ls.connect(LocalSocketAddress(sock.path, LocalSocketAddress.Namespace.FILESYSTEM))
            val c = TorControlConnection(ls.inputStream, ls.outputStream)
            c.launchThread(true)
            c.authenticate(ByteArray(0))
            c.setConf(listOf("DisableNetwork 0"))
            ctl = c
            c
        } catch (e: Exception) {
            Log.w("ChatLokal", "Port kontrol belum siap: ${e.message}")
            null
        }
    }

    private fun socksPort(conn: TorControlConnection): Int =
        Regex(":(\\d+)").find(conn.getInfo("net/listeners/socks") ?: "")?.groupValues?.get(1)?.toIntOrNull() ?: 9050

    init {
        ticker.scheduleWithFixedDelay({ runCatching { tick() } }, 1, 1, TimeUnit.SECONDS)
    }

    override fun state(): JSONObject = JSONObject()
        .put("phase", phase)
        .put("progress", progress)
        .put("error", error ?: JSONObject.NULL)
        .put("address", address() ?: JSONObject.NULL)

    override fun address(): String? = try {
        File(hsDir, "hostname").readText().trim().ifEmpty { null }
    } catch (e: Exception) {
        null
    }

    private fun set(newPhase: String, newProgress: Int = progress, newError: String? = null) {
        val changed = newPhase != phase || newProgress != progress || newError != error
        phase = newPhase
        progress = newProgress
        error = newError
        if (changed) onChange()
    }

    @Synchronized
    override fun start(bridge: JSONObject) {
        this.bridge = bridge
        try {
            TorService.getTorrc(context).writeText(torrc(bridge))
        } catch (e: Exception) {
            set("error", 0, e.message)
            return
        }
        startedAt = System.currentTimeMillis()
        set("connecting", 0)
        if (service == null) {
            val intent = Intent(context, TorService::class.java).setAction(TorService.ACTION_START)
            context.startService(intent)
            context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        } else {
            runCatching { applyConf(bridge) }
        }
    }

    // Bridge dijalankan IPtProxy (lyrebird/snowflake) dan diumumkan ke tor sebagai proxy SOCKS lokal.
    private fun transportLine(type: String): String {
        val c = pt ?: IPtProxy.newController(File(context.filesDir, "pt").apply { mkdirs() }.path, false, false, "ERROR", object : OnTransportEvents {
            override fun connected(transport: String?) {}
            override fun error(transport: String?, e: Exception?) { Log.w("ChatLokal", "PT $transport: ${e?.message}") }
            override fun stopped(transport: String?, e: Exception?) {}
        }).also { pt = it }
        val name = if (type == "snowflake") IPtProxy.Snowflake else IPtProxy.Obfs4
        c.start(name, "")
        return "ClientTransportPlugin $type socks5 ${c.localAddress(name)}"
    }

    private fun bridgeLines(bridge: JSONObject): List<String> {
        val type = bridge.optString("type", "none")
        if (type == "none") return emptyList()
        val lines = bridge.optString("lines").lines().map { it.trim().removePrefix("Bridge ").trim() }.filter { it.isNotEmpty() }
        if (lines.isEmpty()) throw IllegalArgumentException("Alamat bridge belum diisi")
        return listOf("UseBridges 1", transportLine(type)) + lines.map { "Bridge $it" }
    }

    private fun torrc(bridge: JSONObject) = (listOf("ClientOnly 1") + bridgeLines(bridge)).joinToString("\n") + "\n"

    private fun applyConf(bridge: JSONObject) {
        val conn = control() ?: return
        val lines = bridgeLines(bridge)
        if (lines.isEmpty()) conn.setConf(listOf("UseBridges 0")) else conn.setConf(lines)
        TorService.getTorrc(context).writeText(torrc(bridge))
    }

    override fun applyBridge(bridge: JSONObject) {
        this.bridge = bridge
        try {
            startedAt = System.currentTimeMillis()
            set("connecting", 0)
            applyConf(bridge)
            control()?.setConf(listOf("DisableNetwork 1"))
            control()?.setConf(listOf("DisableNetwork 0"))
        } catch (e: Exception) {
            set("error", 0, e.message)
        }
    }

    override fun retry() {
        if (service == null) start(bridge) else applyBridge(bridge)
    }

    // Pantau bootstrap dan pastikan layanan onion terdaftar.
    private fun tick() {
        if (service == null) return
        if (phase == "idle" || phase == "stopped") return
        val conn = control() ?: return
        if (serviceId == null) ensureOnion(conn)
        val info = try {
            conn.getInfo("status/bootstrap-phase")
        } catch (e: Exception) {
            ctl = null // koneksi putus; sambung ulang di detik berikutnya
            return
        } ?: return
        val p = Regex("PROGRESS=(\\d+)").find(info)?.groupValues?.get(1)?.toIntOrNull() ?: return
        if (p >= 100) {
            if (client == null || phase != "ready") client = buildClient(socksPort(conn))
            set("ready", 100)
        } else if (phase == "error") {
            // tetap error sampai pengguna mencoba lagi
        } else if (System.currentTimeMillis() - startedAt > 120_000) {
            set("error", p, "Tidak bisa terhubung ke jaringan Tor. Periksa koneksi internet atau aktifkan bridge.")
        } else {
            set("connecting", p)
        }
    }

    // Kunci onion disimpan sebagai file HiddenServiceDir milik tor:
    // header 32 byte "== ed25519v1-secret: type0 ==" + 64 byte kunci rahasia terekspansi.
    private fun ensureOnion(conn: TorControlConnection) {
        val ports = mapOf(80 to "127.0.0.1:$peerPort")
        val keyFile = File(hsDir, "hs_ed25519_secret_key")
        try {
            if (keyFile.isFile) {
                val raw = keyFile.readBytes()
                val blob = Base64.getEncoder().encodeToString(raw.copyOfRange(32, 96))
                val reply = conn.addOnion("ED25519-V3:$blob", ports)
                serviceId = reply["onionAddress"]
            } else {
                if (!File(dataDir, "identity.json").isFile) return
                val reply = conn.addOnion("NEW:ED25519-V3", ports)
                val id = reply["onionAddress"] ?: return
                val key = Base64.getDecoder().decode(reply["onionPrivKey"]!!.substringAfter(':'))
                val header = "== ed25519v1-secret: type0 ==".toByteArray().copyOf(32)
                hsDir.mkdirs()
                keyFile.writeBytes(header + key)
                File(hsDir, "hostname").writeText("$id.onion\n")
                serviceId = id
            }
            if (address() == null && serviceId != null) File(hsDir, "hostname").writeText("$serviceId.onion\n")
            onChange()
        } catch (e: Exception) {
            Log.w("ChatLokal", "ADD_ONION gagal: ${e.message}")
        }
    }

    override fun forgetOnion() {
        val id = serviceId ?: return
        runCatching { control()?.delOnion(id) }
        serviceId = null
    }

    private fun buildClient(socksPort: Int) = OkHttpClient.Builder()
        // OkHttp mengirim nama host .onion ke proxy SOCKS tanpa resolusi DNS lokal.
        .proxy(Proxy(Proxy.Type.SOCKS, InetSocketAddress("127.0.0.1", socksPort)))
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    private fun target(address: String): String {
        if (!Regex("^[a-z2-7]{56}\\.onion$").matches(address)) throw IllegalArgumentException("Alamat bukan .onion")
        return "http://$address"
    }

    override fun send(address: String, envelope: JSONObject) {
        val c = client ?: throw IllegalStateException("Tor belum aktif")
        val req = Request.Builder().url(target(address) + "/inbox")
            .post(envelope.toString().toRequestBody("application/json".toMediaType())).build()
        c.newCall(req).execute().use { if (!it.isSuccessful) throw IllegalStateException("HTTP ${it.code}") }
    }

    override fun ping(address: String): Boolean = try {
        val c = client ?: throw IllegalStateException("Tor belum aktif")
        c.newCall(Request.Builder().url(target(address) + "/ping").build()).execute().use { it.isSuccessful }
    } catch (e: Exception) {
        false
    }
}

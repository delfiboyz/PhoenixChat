package app.chatlokal

import android.app.Application
import android.content.Intent
import androidx.core.content.ContextCompat
import app.chatlokal.core.Core
import app.chatlokal.core.Crypto
import app.chatlokal.core.Store
import app.chatlokal.net.LocalServers
import app.chatlokal.net.PeerServer
import app.chatlokal.net.TorNetwork
import app.chatlokal.net.UiServer
import java.io.File
import java.net.ServerSocket
import java.util.Base64

// Satu runtime per proses: Core + Tor + server peer + server UI.
// Activity hanya WebView di atasnya; ChatService menjaga proses tetap hidup di latar.
class ChatLokalApp : Application() {
    lateinit var core: Core
        private set
    lateinit var uiUrl: String
        private set

    override fun onCreate() {
        super.onCreate()

        val dataDir = File(filesDir, "data")
        // Port peer tetap per perangkat, karena layanan onion memetakan ke port ini.
        val peerPort = Store(dataDir).readObj("identity.json")?.optInt("peerPort")?.takeIf { it > 0 } ?: freePort()
        lateinit var c: Core
        val tor = TorNetwork(this, dataDir, peerPort) { c.networkChanged() }
        c = Core(dataDir, peerPort, tor)
        core = c
        Notifier.createChannels(this, core.lang())

        PeerServer(peerPort, core).start(LocalServers.TIMEOUT, true)
        val token = Base64.getUrlEncoder().withoutPadding().encodeToString(Crypto.randomBytes(24))
        val ui = UiServer(0, core, token, assets).apply { start(LocalServers.TIMEOUT, true) }
        uiUrl = "http://127.0.0.1:${ui.listeningPort}/#token=$token"

        core.onEvent { type, data ->
            when (type) {
                "notify" -> if (!MainActivity.visible) Notifier.message(this, data.optString("title"), data.optString("body"), core.lang())
                "change" -> if (data.optString("kind") in setOf("me", "settings")) {
                    Notifier.createChannels(this, core.lang())
                    syncService()
                }
            }
        }
        if (core.identity != null) core.startNetwork()
    }

    // Tanpa mode hemat baterai, layanan foreground menjaga Tor tetap menerima pesan.
    fun syncService() {
        val wanted = core.identity != null && !core.settings.optBoolean("battery")
        val intent = Intent(this, ChatService::class.java)
        if (wanted) {
            runCatching { ContextCompat.startForegroundService(this, intent) }
        } else {
            stopService(intent)
        }
    }

    private fun freePort(): Int = ServerSocket(0).use { it.localPort }
}

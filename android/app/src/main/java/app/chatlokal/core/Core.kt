package app.chatlokal.core

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

// Padanan server/core.js: identitas, kontak, pesan, antrean kirim, lampiran,
// cadangan. Semua status ada di file lokal (Store); jaringan lewat Network.
interface Network {
    fun state(): JSONObject
    fun address(): String?
    fun start(bridge: JSONObject)
    fun applyBridge(bridge: JSONObject)
    fun retry()
    fun forgetOnion()
    fun send(address: String, envelope: JSONObject)
    fun ping(address: String): Boolean
    // Sirkuit BUILT dari port kontrol: {id, purpose, rendQuery, hops: [{fp, nick, ip, country, bridge}]}.
    fun circuits(): JSONArray?
}

class Core(val dataDir: File, private val peerPort: Int, private val net: Network) {
    val store = Store(dataDir)
    var identity: JSONObject? = null
        private set
    lateinit var settings: JSONObject
        private set
    private var contacts = JSONObject()
    private var outbox = JSONArray()
    @Volatile var locked = false
        private set

    private val pool = Executors.newScheduledThreadPool(3)
    private val flushing = ConcurrentHashMap.newKeySet<String>()
    private val backoff = ConcurrentHashMap<String, LongArray>() // [step, nextAt]
    private val fileRequests = ConcurrentHashMap.newKeySet<String>()
    private val listeners = mutableListOf<(String, JSONObject) -> Unit>()

    companion object {
        private const val DAY = 24L * 60 * 60 * 1000
        private const val MB = 1024L * 1024
        private val RETRY = longArrayOf(5000, 15000, 30000, 60000, 120000)

        fun defaultSettings(): JSONObject = JSONObject()
            .put("autoDelete", true)
            .put("readReceipts", true)
            .put("battery", false)
            .put("limit", "25")
            .put("bridge", JSONObject().put("type", "none").put("lines", ""))
            .put("pin", JSONObject.NULL)
            .put("lang", JSONObject.NULL)

        fun limitBytes(limit: String): Long = if (limit == "none") Long.MAX_VALUE else (limit.toLongOrNull() ?: 25) * MB

        fun contactIdOf(publicKey: String) = Crypto.sha256Hex(publicKey).substring(0, 16)
    }

    init {
        load()
        locked = settings.opt("pin") is JSONObject
        pool.scheduleWithFixedDelay({ runCatching { flushAll(false) } }, 5, 5, TimeUnit.SECONDS)
        pool.scheduleWithFixedDelay({ runCatching { sweep() } }, 1, 60, TimeUnit.MINUTES)
    }

    @Synchronized
    private fun load() {
        identity = store.readObj("identity.json")
        val s = defaultSettings()
        store.readObj("settings.json")?.let { saved -> saved.keys().forEach { s.put(it, saved.get(it)) } }
        settings = s
        contacts = store.readObj("contacts.json") ?: JSONObject()
        outbox = store.readArr("outbox.json") ?: JSONArray()
    }

    fun onEvent(l: (String, JSONObject) -> Unit) {
        synchronized(listeners) { listeners.add(l) }
    }

    private fun emit(type: String, data: JSONObject) {
        val ls = synchronized(listeners) { listeners.toList() }
        ls.forEach { runCatching { it(type, data) } }
    }

    private fun changed(kind: String, cid: String? = null) =
        emit("change", JSONObject().put("kind", kind).put("cid", cid ?: JSONObject.NULL))

    // Pesan untuk pengguna dalam bahasa perangkat.
    fun lang(): String? = settings.optString("lang").takeIf { it == "id" || it == "en" }
    fun m(key: String, vars: Map<String, String> = emptyMap()) = I18n.msg(lang(), key, vars)

    private fun notify(title: String, body: String) =
        emit("notify", JSONObject().put("title", title).put("body", body))

    private fun saveContacts() = store.write("contacts.json", contacts)
    private fun saveOutbox() = store.write("outbox.json", outbox)
    private fun saveSettings() = store.write("settings.json", settings)
    private fun saveIdentity() = store.write("identity.json", identity!!)
    fun messages(cid: String): JSONArray = store.readArr("chats/$cid.json") ?: JSONArray()
    private fun saveMessages(cid: String, list: JSONArray) = store.write("chats/$cid.json", list)
    private fun contact(cid: String): JSONObject? = contacts.optJSONObject(cid)
    private fun JSONArray.objs(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }

    // ---------- identitas dan jaringan ----------

    fun address(): String? = if (identity == null) null else net.address()

    fun networkState(): JSONObject {
        if (identity == null) return JSONObject().put("phase", "idle").put("progress", 0)
        val s = net.state()
        val err = s.optString("error")
        if (!s.isNull("error") && I18n.has(err)) s.put("error", m(err))
        return s
    }

    fun startNetwork() {
        if (identity == null) return
        net.start(settings.getJSONObject("bridge"))
    }

    fun retryNetwork() = net.retry()

    // Rute relay untuk layar Rute Tor. Sirkuit ke kontak dikenali dari REND_QUERY;
    // sirkuit masuk tidak menyebut pengirimnya, jadi kontaknya tidak bisa diketahui.
    fun circuits(): JSONObject {
        val bridgeType = settings.getJSONObject("bridge").optString("type", "none")
        val raw = runCatching { net.circuits() }.getOrNull()
            ?: return JSONObject().put("available", false).put("bridge", bridgeType).put("circuits", JSONArray())
        val byOnion = synchronized(this) { contacts.keys().asSequence().mapNotNull { contacts.optJSONObject(it) }.associateBy { it.optString("address") } }
        val out = JSONArray()
        raw.objs().forEach { c ->
            val kind = when (c.optString("purpose")) {
                "HS_CLIENT_REND" -> "out"
                "HS_SERVICE_REND" -> "in"
                "HS_SERVICE_INTRO" -> "intro"
                else -> return@forEach
            }
            val contact = if (kind == "out") byOnion[c.optString("rendQuery") + ".onion"] ?: return@forEach else null
            out.put(JSONObject().put("id", c.getString("id")).put("kind", kind).put("hops", c.getJSONArray("hops"))
                .put("contact", contact?.let { JSONObject().put("id", it.getString("id")).put("name", it.getString("name")).put("color", it.optInt("color")) } ?: JSONObject.NULL))
        }
        return JSONObject().put("available", true).put("bridge", bridgeType).put("circuits", out)
    }

    // Dipanggil oleh lapisan Tor saat status berubah.
    fun networkChanged() {
        if (net.state().optString("phase") == "ready") pool.execute { flushAll(true) }
        changed("network")
    }

    @Synchronized
    fun status(): JSONObject {
        val addr = address()
        val me = identity?.let { id ->
            JSONObject()
                .put("name", id.getString("name"))
                .put("address", addr ?: JSONObject.NULL)
                .put("deviceId", addr?.let { Crypto.deviceId(it) } ?: JSONObject.NULL)
                .put("code", addr?.let { Crypto.encodeContactCode(id.getString("name"), it, id.getJSONObject("box").getString("publicKey")) } ?: JSONObject.NULL)
        }
        return JSONObject()
            .put("onboarded", identity != null)
            .put("lang", lang() ?: JSONObject.NULL)
            .put("locked", locked)
            .put("network", networkState())
            .put("me", me ?: JSONObject.NULL)
            .put("usage", store.usage())
    }

    fun onboard(name: String?) {
        synchronized(this) {
            if (identity != null) throw UserError("identityExists")
            val clean = (name ?: "").trim().take(40)
            if (clean.isEmpty()) throw UserError("nameRequired")
            identity = JSONObject()
                .put("name", clean)
                .put("box", Crypto.newBoxKeys())
                .put("peerPort", peerPort)
                .put("createdAt", System.currentTimeMillis())
            saveIdentity()
            saveSettings()
        }
        startNetwork()
        changed("me")
    }

    @Synchronized
    fun setName(name: String?) {
        val clean = (name ?: "").trim().take(40)
        if (clean.isEmpty()) throw UserError("nameEmpty")
        identity!!.put("name", clean)
        saveIdentity()
        changed("me")
    }

    // ---------- kunci PIN (hanya di antarmuka) ----------

    fun unlock(pin: String?) {
        if (!Crypto.checkPin(pin ?: "", settings.optJSONObject("pin"))) throw UserError("wrongPin")
        locked = false
    }

    @Synchronized
    fun setPin(pin: String?) {
        if (pin == null) {
            settings.put("pin", JSONObject.NULL)
        } else {
            if (!Regex("^\\d{4,8}$").matches(pin)) throw UserError("pinFormat")
            settings.put("pin", Crypto.hashPin(pin))
        }
        saveSettings()
        changed("settings")
    }

    // ---------- kontak ----------

    private fun colorIndex(publicKey: String) = contactIdOf(publicKey).substring(0, 2).toInt(16) % 6

    @Synchronized
    private fun upsertContact(name: String?, address: String?, publicKey: String, status: String): JSONObject {
        val id = contactIdOf(publicKey)
        val existing = contact(id)
        if (existing != null) {
            if (!name.isNullOrEmpty()) existing.put("name", name)
            if (!address.isNullOrEmpty()) existing.put("address", address)
            if (status == "ok" && existing.optString("status") == "pending") existing.put("status", "ok")
        } else {
            contacts.put(id, JSONObject()
                .put("id", id)
                .put("name", if (name.isNullOrEmpty()) "Tanpa nama" else name)
                .put("address", address)
                .put("publicKey", publicKey)
                .put("status", status)
                .put("color", colorIndex(publicKey))
                .put("unread", 0)
                .put("online", JSONObject.NULL)
                .put("lastCheck", 0)
                .put("createdAt", System.currentTimeMillis()))
        }
        saveContacts()
        return contact(id)!!
    }

    fun addContact(code: String?): JSONObject {
        val c = Crypto.decodeContactCode(code) ?: throw UserError("badCode")
        if (c.publicKey == identity!!.getJSONObject("box").getString("publicKey")) throw UserError("ownCode")
        if (!Regex("^[a-z2-7]{56}\\.onion$").matches(c.address)) throw UserError("badOnion")
        val contact = upsertContact(c.name, c.address, c.publicKey, "ok")
        val cid = contact.getString("id")
        enqueue(cid, JSONObject().put("t", "hello"))
        changed("contacts", cid)
        return contact
    }

    fun acceptContact(cid: String) {
        synchronized(this) {
            val c = contact(cid) ?: throw UserError("noContact")
            c.put("status", "ok")
            saveContacts()
        }
        enqueue(cid, JSONObject().put("t", "hello"))
        changed("contacts", cid)
    }

    @Synchronized
    fun blockContact(cid: String) {
        val c = contact(cid) ?: throw UserError("noContact")
        c.put("status", "blocked")
        outbox = JSONArray(outbox.objs().filter { it.getString("cid") != cid })
        saveOutbox()
        saveContacts()
        changed("contacts", cid)
    }

    @Synchronized
    fun deleteContact(cid: String) {
        messages(cid).objs().forEach { m -> m.optJSONObject("file")?.let { store.removeBlob(it.getString("id")) } }
        store.remove("chats/$cid.json")
        contacts.remove(cid)
        outbox = JSONArray(outbox.objs().filter { it.getString("cid") != cid })
        saveOutbox()
        saveContacts()
        changed("contacts", cid)
    }

    @Synchronized
    fun chatList(query: String?): JSONArray {
        val q = (query ?: "").trim().lowercase()
        val rows = contacts.keys().asSequence().mapNotNull { contacts.optJSONObject(it) }
            .filter { it.optString("status") != "blocked" }
            .mapNotNull { c ->
                val msgs = messages(c.getString("id")).objs()
                val last = msgs.lastOrNull()
                val hit = q.isEmpty() || c.getString("name").lowercase().contains(q) ||
                    msgs.any { it.optString("text").lowercase().contains(q) }
                if (!hit) return@mapNotNull null
                val lastInfo = last?.let {
                    JSONObject().put("mine", it.optBoolean("mine")).put("text", it.optString("text"))
                        .put("file", it.optJSONObject("file")?.getString("name") ?: JSONObject.NULL)
                }
                JSONObject()
                    .put("id", c.getString("id")).put("name", c.getString("name")).put("color", c.optInt("color"))
                    .put("status", c.optString("status")).put("unread", c.optInt("unread")).put("online", c.opt("online"))
                    .put("last", lastInfo ?: JSONObject.NULL)
                    .put("ts", last?.optLong("ts") ?: c.optLong("createdAt"))
                    .put("queued", msgs.any { it.optBoolean("mine") && it.optString("status") in setOf("queued", "local") })
            }
            .sortedByDescending { it.getLong("ts") }
        return JSONArray(rows.toList())
    }

    fun chat(cid: String): JSONObject {
        val c = synchronized(this) { contact(cid) } ?: throw UserError("noChat")
        // Cek apakah teman sedang online, paling sering tiap 30 detik.
        if (c.optString("status") == "ok" && System.currentTimeMillis() - c.optLong("lastCheck") > 30000) {
            c.put("lastCheck", System.currentTimeMillis())
            pool.execute {
                val ok = net.ping(c.getString("address"))
                synchronized(this) { c.put("online", ok); saveContacts() }
                changed("contacts", cid)
                if (ok) flush(cid, true)
            }
        }
        val contact = JSONObject()
            .put("id", c.getString("id")).put("name", c.getString("name")).put("color", c.optInt("color"))
            .put("status", c.optString("status")).put("online", c.opt("online"))
            .put("deviceId", Crypto.deviceId(c.getString("address"))).put("address", c.getString("address"))
        return JSONObject().put("contact", contact).put("messages", messages(cid))
    }

    fun markRead(cid: String) {
        val ids = JSONArray()
        var sendReceipt: Boolean
        synchronized(this) {
            val c = contact(cid) ?: return
            val msgs = messages(cid)
            msgs.objs().filter { !it.optBoolean("mine") && !it.optBoolean("seen") }.forEach { ids.put(it.getString("id")) }
            if (ids.length() == 0 && c.optInt("unread") == 0) return
            msgs.objs().filter { !it.optBoolean("mine") }.forEach { it.put("seen", true) }
            saveMessages(cid, msgs)
            c.put("unread", 0)
            saveContacts()
            sendReceipt = ids.length() > 0 && settings.optBoolean("readReceipts", true) && c.optString("status") == "ok"
        }
        if (sendReceipt) enqueue(cid, JSONObject().put("t", "read").put("ids", ids))
        changed("contacts", cid)
    }

    // ---------- pesan keluar ----------

    private fun enqueue(cid: String, payload: JSONObject, msgId: String? = null) {
        synchronized(this) {
            outbox.put(JSONObject().put("oid", Crypto.randomId()).put("cid", cid).put("payload", payload).put("msgId", msgId ?: JSONObject.NULL))
            saveOutbox()
        }
        pool.execute { flush(cid, true) }
    }

    @Synchronized
    private fun addMessage(cid: String, msg: JSONObject) {
        val list = messages(cid)
        list.put(msg)
        saveMessages(cid, list)
        changed("messages", cid)
    }

    @Synchronized
    private fun updateMessage(cid: String, id: String, patch: (JSONObject) -> Unit) {
        val list = messages(cid)
        val m = list.objs().find { it.getString("id") == id } ?: return
        patch(m)
        saveMessages(cid, list)
        changed("messages", cid)
    }

    private fun requireOk(cid: String): JSONObject {
        val c = synchronized(this) { contact(cid) }
        if (c == null || c.optString("status") != "ok") throw UserError("notApproved")
        return c
    }

    fun send(cid: String, text: String?): JSONObject {
        requireOk(cid)
        val body = (text ?: "").trim().take(8000)
        if (body.isEmpty()) throw UserError("emptyMessage")
        val msg = JSONObject().put("id", Crypto.randomId()).put("mine", true).put("text", body)
            .put("ts", System.currentTimeMillis()).put("status", "local")
        addMessage(cid, msg)
        enqueue(cid, JSONObject().put("t", "msg").put("id", msg.getString("id")).put("text", body).put("ts", msg.getLong("ts")), msg.getString("id"))
        return msg
    }

    fun sendFile(cid: String, name: String, mime: String?, bytes: ByteArray): JSONObject {
        requireOk(cid)
        val id = Crypto.randomId()
        store.writeBlob(id, bytes)
        val file = JSONObject().put("id", id).put("name", name.take(120)).put("mime", mime ?: "application/octet-stream")
            .put("size", bytes.size).put("state", "have")
        val msg = JSONObject().put("id", id).put("mine", true).put("text", "").put("file", file)
            .put("ts", System.currentTimeMillis()).put("status", "local")
        addMessage(cid, msg)
        enqueue(cid, JSONObject().put("t", "file").put("id", id).put("name", file.getString("name"))
            .put("mime", file.getString("mime")).put("size", bytes.size).put("ts", msg.getLong("ts")), id)
        return msg
    }

    // Lampiran besar tidak diunduh otomatis; pengguna memintanya manual.
    fun requestFile(cid: String, id: String) {
        requireOk(cid)
        fileRequests.add(id)
        updateMessage(cid, id) { it.getJSONObject("file").put("state", "downloading") }
        enqueue(cid, JSONObject().put("t", "file-req").put("id", id))
    }

    fun getFile(id: String): ByteArray? = store.readBlob(id)

    fun flushAll(force: Boolean) {
        val cids = synchronized(this) { outbox.objs().map { it.getString("cid") }.toSet() }
        cids.forEach { flush(it, force) }
    }

    private fun flush(cid: String, force: Boolean) {
        if (net.state().optString("phase") != "ready") {
            markQueued(cid)
            return
        }
        if (!flushing.add(cid)) return
        try {
            val b = backoff[cid] ?: longArrayOf(0, 0)
            if (!force && System.currentTimeMillis() < b[1]) return
            while (true) {
                val (c, item, env) = synchronized(this) {
                    val c = contact(cid) ?: return
                    val item = outbox.objs().find { it.getString("cid") == cid } ?: return
                    val payload = JSONObject(item.getJSONObject("payload").toString())
                        .put("me", JSONObject().put("name", identity!!.getString("name")).put("address", address()))
                    val box = identity!!.getJSONObject("box")
                    val env = Crypto.seal(payload, c.getString("publicKey"), box.getString("secretKey"))
                        .put("from", box.getString("publicKey"))
                    Triple(c, item, env)
                }
                try {
                    net.send(c.getString("address"), env)
                } catch (e: Exception) {
                    val step = minOf(b[0] + 1, (RETRY.size - 1).toLong())
                    backoff[cid] = longArrayOf(step, System.currentTimeMillis() + RETRY[step.toInt()])
                    if (c.opt("online") != false) {
                        synchronized(this) { c.put("online", false); saveContacts() }
                        changed("contacts", cid)
                    }
                    markQueued(cid)
                    return
                }
                val msgId = item.optString("msgId").takeIf { it.isNotEmpty() && it != "null" }
                var wasQueued = false
                synchronized(this) {
                    outbox = JSONArray(outbox.objs().filter { it.getString("oid") != item.getString("oid") })
                    saveOutbox()
                    if (c.opt("online") != true) {
                        c.put("online", true).put("lastCheck", System.currentTimeMillis())
                        saveContacts()
                        changed("contacts", cid)
                    }
                    if (msgId != null) wasQueued = messages(cid).objs().find { it.getString("id") == msgId }?.optString("status") == "queued"
                }
                backoff.remove(cid)
                if (msgId != null) {
                    updateMessage(cid, msgId) { if (it.optString("status") != "read") it.put("status", "sent") }
                    if (wasQueued) notify(c.getString("name"), m("notifyQueueSent"))
                }
            }
        } finally {
            flushing.remove(cid)
        }
    }

    @Synchronized
    private fun markQueued(cid: String) {
        val ids = outbox.objs().filter { it.getString("cid") == cid && it.optString("msgId").let { m -> m.isNotEmpty() && m != "null" } }
            .map { it.getString("msgId") }.toSet()
        if (ids.isEmpty()) return
        val list = messages(cid)
        var dirty = false
        list.objs().forEach { if (it.getString("id") in ids && it.optString("status") == "local") { it.put("status", "queued"); dirty = true } }
        if (dirty) { saveMessages(cid, list); changed("messages", cid) }
    }

    // ---------- pesan masuk (dari server peer) ----------

    fun receive(env: JSONObject): Boolean {
        val id = identity ?: return false
        val from = env.optString("from").takeIf { it.isNotEmpty() } ?: return false
        val cid = contactIdOf(from)
        var c = synchronized(this) { contact(cid) }
        if (c?.optString("status") == "blocked") return true // diam-diam diabaikan
        val p = Crypto.open(env, from, id.getJSONObject("box").getString("secretKey")) ?: return false
        val me = p.optJSONObject("me") ?: return false
        val theirAddress = me.optString("address").takeIf { it.isNotEmpty() } ?: return false
        val theirName = me.optString("name").take(40)

        if (c == null) {
            // Orang yang belum ada di kontak: jadi permintaan yang harus disetujui.
            c = upsertContact(theirName, theirAddress, from, "pending")
            notify(m("notifyRequestTitle"), m("notifyRequestBody", mapOf("name" to c.getString("name"))))
        } else if (theirName.isNotEmpty() && theirName != c.getString("name")) {
            synchronized(this) { c.put("name", theirName) }
        }
        synchronized(this) { c.put("online", true).put("lastCheck", System.currentTimeMillis()) }
        backoff.remove(cid)
        val now = System.currentTimeMillis()

        when (p.optString("t")) {
            "msg" -> {
                val mid = p.optString("id")
                if (messages(cid).objs().none { it.getString("id") == mid }) {
                    val text = p.optString("text").take(8000)
                    addMessage(cid, JSONObject().put("id", mid).put("mine", false).put("text", text).put("ts", p.optLong("ts", now)))
                    synchronized(this) { c.put("unread", c.optInt("unread") + 1) }
                    notify(c.getString("name"), text.take(120))
                }
            }
            "file" -> {
                val fid = p.optString("id")
                if (messages(cid).objs().none { it.getString("id") == fid }) {
                    val size = p.optLong("size")
                    val auto = size <= limitBytes(settings.optString("limit", "25")) && c.optString("status") == "ok"
                    val file = JSONObject().put("id", fid).put("name", p.optString("name", "file").take(120))
                        .put("mime", p.optString("mime")).put("size", size).put("state", if (auto) "downloading" else "offered")
                    addMessage(cid, JSONObject().put("id", fid).put("mine", false).put("text", "").put("file", file).put("ts", p.optLong("ts", now)))
                    synchronized(this) { c.put("unread", c.optInt("unread") + 1) }
                    notify(c.getString("name"), m("notifyAttachment", mapOf("name" to file.getString("name"))))
                    if (auto) {
                        fileRequests.add(fid)
                        synchronized(this) {
                            outbox.put(JSONObject().put("oid", Crypto.randomId()).put("cid", cid)
                                .put("payload", JSONObject().put("t", "file-req").put("id", fid)).put("msgId", JSONObject.NULL))
                            saveOutbox()
                        }
                    }
                }
            }
            "file-req" -> {
                val fid = p.optString("id")
                val own = messages(cid).objs().find { it.getString("id") == fid && it.optBoolean("mine") && it.has("file") }
                val bytes = own?.let { store.readBlob(fid) }
                if (bytes != null) synchronized(this) {
                    outbox.put(JSONObject().put("oid", Crypto.randomId()).put("cid", cid)
                        .put("payload", JSONObject().put("t", "file-data").put("id", fid).put("data", Base64.getEncoder().encodeToString(bytes)))
                        .put("msgId", JSONObject.NULL))
                    saveOutbox()
                }
            }
            "file-data" -> {
                val fid = p.optString("id")
                if (fileRequests.remove(fid)) { // hanya terima yang kita minta
                    store.writeBlob(fid, Base64.getDecoder().decode(p.optString("data")))
                    updateMessage(cid, fid) { it.getJSONObject("file").put("state", "have") }
                }
            }
            "read" -> {
                val ids = p.optJSONArray("ids")?.let { a -> (0 until a.length()).map { a.optString(it) }.toSet() } ?: emptySet()
                synchronized(this) {
                    val list = messages(cid)
                    list.objs().forEach { if (it.optBoolean("mine") && it.getString("id") in ids) it.put("status", "read") }
                    saveMessages(cid, list)
                }
                changed("messages", cid)
            }
        }
        synchronized(this) { saveContacts() }
        changed("contacts", cid)
        // Teman sedang online: kirim antrean untuknya sekarang juga.
        pool.execute { flush(cid, true) }
        return true
    }

    // ---------- pengaturan, pembersihan, cadangan ----------

    @Synchronized
    fun publicSettings(): JSONObject {
        val out = JSONObject(settings.toString())
        out.remove("pin")
        return out.put("hasPin", settings.opt("pin") is JSONObject)
    }

    fun patchSettings(patch: JSONObject) {
        synchronized(this) {
            for (k in listOf("autoDelete", "readReceipts", "battery", "limit", "bridge", "lang")) if (patch.has(k)) settings.put(k, patch.get(k))
            if (settings.optString("limit") !in setOf("5", "25", "100", "none")) settings.put("limit", "25")
            if (settings.optString("lang") !in setOf("id", "en")) settings.put("lang", JSONObject.NULL)
            saveSettings()
        }
        if (patch.has("bridge")) net.applyBridge(settings.getJSONObject("bridge"))
        if (patch.optBoolean("autoDelete")) pool.execute { sweep() }
        changed("settings")
    }

    // Hapus pesan yang lebih tua dari 30 hari bila diaktifkan.
    fun sweep() {
        if (!settings.optBoolean("autoDelete")) return
        val cutoff = System.currentTimeMillis() - 30 * DAY
        val cids = synchronized(this) { contacts.keys().asSequence().toList() }
        for (cid in cids) synchronized(this) {
            val list = messages(cid).objs()
            val keep = list.filter { it.optLong("ts") >= cutoff }
            if (keep.size != list.size) {
                list.filter { it.optLong("ts") < cutoff }.forEach { m -> m.optJSONObject("file")?.let { store.removeBlob(it.getString("id")) } }
                saveMessages(cid, JSONArray(keep))
                changed("messages", cid)
            }
        }
    }

    @Synchronized
    fun exportBackup(password: String?): ByteArray {
        if (password == null || password.length < 8) throw UserError("shortPassword")
        val hs = JSONObject()
        File(dataDir, "tor/hs").listFiles()?.filter { it.isFile }?.forEach { hs.put(it.name, Base64.getEncoder().encodeToString(it.readBytes())) }
        val chats = JSONObject()
        val files = JSONObject()
        contacts.keys().forEach { cid ->
            val list = messages(cid)
            chats.put(cid, list)
            list.objs().forEach { m -> m.optJSONObject("file")?.let { f -> store.readBlob(f.getString("id"))?.let { files.put(f.getString("id"), Base64.getEncoder().encodeToString(it)) } } }
        }
        val s = JSONObject(settings.toString()).apply { remove("pin") }
        val data = JSONObject().put("v", 1).put("identity", identity).put("settings", s).put("contacts", contacts)
            .put("outbox", outbox).put("chats", chats).put("files", files).put("hs", hs)
        return Crypto.encryptBackup(data.toString().toByteArray(Charsets.UTF_8), password)
    }

    fun restore(buf: ByteArray, password: String?) {
        val data = JSONObject(String(Crypto.decryptBackup(buf, password ?: ""), Charsets.UTF_8))
        if (data.optInt("v") != 1 || data.optJSONObject("identity") == null) throw UserError("badBackup")
        net.forgetOnion()
        synchronized(this) {
            store.wipe()
            store.write("identity.json", data.getJSONObject("identity").put("peerPort", peerPort))
            val s = defaultSettings()
            data.optJSONObject("settings")?.let { saved -> saved.keys().forEach { s.put(it, saved.get(it)) } }
            store.write("settings.json", s.put("pin", JSONObject.NULL))
            store.write("contacts.json", data.optJSONObject("contacts") ?: JSONObject())
            store.write("outbox.json", data.optJSONArray("outbox") ?: JSONArray())
            data.optJSONObject("chats")?.let { ch -> ch.keys().forEach { saveMessages(it, ch.getJSONArray(it)) } }
            data.optJSONObject("files")?.let { fs -> fs.keys().forEach { store.writeBlob(it, Base64.getDecoder().decode(fs.getString(it))) } }
            val hsDir = File(dataDir, "tor/hs").apply { mkdirs() }
            data.optJSONObject("hs")?.let { hs ->
                hs.keys().forEach { n -> if (Regex("^[\\w.-]+$").matches(n)) File(hsDir, n).writeBytes(Base64.getDecoder().decode(hs.getString(n))) }
            }
            load()
            locked = false
        }
        startNetwork()
        changed("me")
    }

    fun wipe() {
        net.forgetOnion()
        synchronized(this) {
            val keepLang = lang()
            store.wipe()
            // Bahasa tetap dipakai di layar Mulai setelah semua data dihapus.
            if (keepLang != null) store.write("settings.json", JSONObject().put("lang", keepLang))
            load()
            locked = false
        }
        changed("me")
    }
}

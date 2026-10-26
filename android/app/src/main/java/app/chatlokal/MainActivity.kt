package app.chatlokal

import android.Manifest
import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.json.JSONObject
import java.util.Base64

// Satu WebView yang memuat antarmuka React yang sama dengan versi desktop,
// dilayani oleh server UI lokal. Jembatan JS menangani hal yang tidak bisa
// dilakukan WebView sendiri: menyimpan file, berbagi, salin, dan pindai QR.
class MainActivity : ComponentActivity() {
    companion object {
        @Volatile var visible = false
    }

    private lateinit var web: WebView
    private lateinit var origin: String
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSave: ByteArray? = null
    private var pendingCode: String? = null
    private var pageReady = false

    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        fileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        fileCallback = null
    }

    private val saveFile = registerForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        val bytes = pendingSave
        pendingSave = null
        if (uri != null && bytes != null) {
            runCatching { contentResolver.openOutputStream(uri)!!.use { it.write(bytes) } }
                .onSuccess { toast("File disimpan") }
                .onFailure { toast("Gagal menyimpan file") }
        }
    }

    private val scan = registerForActivityResult(ScanContract()) { result ->
        result.contents?.let { dispatch("chatlokal:scan", it) }
    }

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) {}

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val app = application as ChatLokalApp
        origin = Uri.parse(app.uiUrl).let { "${it.scheme}://${it.authority}" }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web = WebView(this).apply {
            setBackgroundColor(0xFFF3F4EF.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mediaPlaybackRequiresUserGesture = true
            addJavascriptInterface(Bridge(), "ChatLokalAndroid")
            webViewClient = object : WebViewClient() {
                // Jangan pernah membuka halaman luar di dalam aplikasi: bisa membocorkan IP di luar Tor.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) =
                    !request.url.toString().startsWith(origin)

                override fun onPageFinished(view: WebView, url: String) {
                    pageReady = true
                    pendingCode?.let { code -> view.postDelayed({ dispatch("chatlokal:code", code) }, 600) }
                    pendingCode = null
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = callback
                    pickFile.launch("*/*")
                    return true
                }
            }
        }
        // Status bar, notch, dan keyboard: WebView diberi ruang di luar konten.
        ViewCompat.setOnApplyWindowInsetsListener(web) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(web)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("window.__chatlokalBack ? window.__chatlokalBack() : false") { handled ->
                    if (handled != "true") moveTaskToBack(true)
                }
            }
        })

        if (Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        handleIntent(intent)
        web.loadUrl(app.uiUrl)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    // Tautan chatlokal:… dari aplikasi lain membuka layar Tambah kontak.
    private fun handleIntent(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "chatlokal") return
        val code = data.toString()
        if (pageReady) dispatch("chatlokal:code", code) else pendingCode = code
    }

    override fun onResume() {
        super.onResume()
        visible = true
        (application as ChatLokalApp).syncService()
    }

    override fun onPause() {
        visible = false
        super.onPause()
    }

    private fun dispatch(event: String, detail: String) {
        val js = "window.dispatchEvent(new CustomEvent(${JSONObject.quote(event)}, { detail: ${JSONObject.quote(detail)} }))"
        web.post { web.evaluateJavascript(js, null) }
    }

    private fun toast(msg: String) = runOnUiThread { Toast.makeText(this, msg, Toast.LENGTH_SHORT).show() }

    inner class Bridge {
        @JavascriptInterface
        fun saveFile(name: String, mime: String, base64: String) {
            pendingSave = Base64.getDecoder().decode(base64)
            runOnUiThread { saveFile.launch(name) }
        }

        @JavascriptInterface
        fun copyText(text: String) {
            val cm = getSystemService(ClipboardManager::class.java)
            cm.setPrimaryClip(ClipData.newPlainText("Kode Chat Lokal", text))
        }

        @JavascriptInterface
        fun share(text: String) {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
            runOnUiThread { startActivity(Intent.createChooser(send, "Bagikan kode Chat Lokal")) }
        }

        @JavascriptInterface
        fun scanQr() {
            val opts = ScanOptions()
                .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                .setPrompt("Arahkan kamera ke kode QR temanmu")
                .setBeepEnabled(false)
                .setOrientationLocked(false)
            runOnUiThread { scan.launch(opts) }
        }
    }
}

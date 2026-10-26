package app.chatlokal

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.ServiceCompat

// Layanan foreground: menjaga proses (dan Tor di dalamnya) tetap hidup agar pesan
// diterima saat aplikasi ditutup. Dimatikan oleh "Mode hemat baterai".
class ChatService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        ServiceCompat.startForeground(this, Notifier.SERVICE_ID, Notifier.service(this), type)
        return START_STICKY
    }
}

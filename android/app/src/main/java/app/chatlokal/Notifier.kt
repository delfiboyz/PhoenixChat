package app.chatlokal

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

object Notifier {
    const val CHANNEL_MESSAGES = "messages"
    const val CHANNEL_SERVICE = "service"
    const val SERVICE_ID = 1
    private var nextId = 100

    fun createChannels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL_MESSAGES, "Pesan", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Pesan baru dan permintaan kontak"
        })
        nm.createNotificationChannel(NotificationChannel(CHANNEL_SERVICE, "Koneksi Tor", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Menjaga Chat Lokal menerima pesan di latar belakang"
            setShowBadge(false)
        })
    }

    private fun openApp(ctx: Context) = PendingIntent.getActivity(
        ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    fun service(ctx: Context): Notification = NotificationCompat.Builder(ctx, CHANNEL_SERVICE)
        .setSmallIcon(R.drawable.ic_stat)
        .setContentTitle("Chat Lokal aktif")
        .setContentText("Menerima pesan lewat Tor. Pesan tetap hanya di perangkat ini.")
        .setOngoing(true)
        .setContentIntent(openApp(ctx))
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()

    // Isi pesan ikut ditampilkan; layar kunci hanya melihat versi tanpa isi.
    fun message(ctx: Context, title: String, body: String) {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            android.os.Build.VERSION.SDK_INT >= 33
        ) return
        val public = NotificationCompat.Builder(ctx, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle("Chat Lokal")
            .setContentText("Pesan baru")
            .build()
        val n = NotificationCompat.Builder(ctx, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(public)
            .setContentIntent(openApp(ctx))
            .build()
        runCatching { NotificationManagerCompat.from(ctx).notify(nextId++, n) }
    }
}

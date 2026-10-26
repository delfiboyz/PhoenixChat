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
import app.chatlokal.core.I18n

object Notifier {
    const val CHANNEL_MESSAGES = "messages"
    const val CHANNEL_SERVICE = "service"
    const val SERVICE_ID = 1
    private var nextId = 100

    // Dipanggil ulang saat bahasa berubah: membuat kanal dengan id yang sama hanya memperbarui namanya.
    fun createChannels(ctx: Context, lang: String?) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL_MESSAGES, I18n.msg(lang, "channelMessages"), NotificationManager.IMPORTANCE_HIGH).apply {
            description = I18n.msg(lang, "channelMessagesDesc")
        })
        nm.createNotificationChannel(NotificationChannel(CHANNEL_SERVICE, I18n.msg(lang, "channelService"), NotificationManager.IMPORTANCE_LOW).apply {
            description = I18n.msg(lang, "channelServiceDesc")
            setShowBadge(false)
        })
    }

    private fun openApp(ctx: Context) = PendingIntent.getActivity(
        ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    fun service(ctx: Context, lang: String?): Notification = NotificationCompat.Builder(ctx, CHANNEL_SERVICE)
        .setSmallIcon(R.drawable.ic_stat)
        .setContentTitle(I18n.msg(lang, "serviceTitle"))
        .setContentText(I18n.msg(lang, "serviceText"))
        .setOngoing(true)
        .setContentIntent(openApp(ctx))
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()

    // Isi pesan ikut ditampilkan; layar kunci hanya melihat versi tanpa isi.
    fun message(ctx: Context, title: String, body: String, lang: String?) {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            android.os.Build.VERSION.SDK_INT >= 33
        ) return
        val public = NotificationCompat.Builder(ctx, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle("Phoenix Chat")
            .setContentText(I18n.msg(lang, "newMessage"))
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

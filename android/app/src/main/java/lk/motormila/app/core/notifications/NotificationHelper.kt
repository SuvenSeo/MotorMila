package lk.motormila.app.core.notifications

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import lk.motormila.app.R

/**
 * Local notification helper (data-layer owned, no UI imports).
 * Channels: price_drops (high), market_news (default), sync (low, silent-ish).
 * Callers pass a content [PendingIntent]; deep-link targets are defined by the
 * UI layer via NAV_CONTRACT routes.
 */
@Singleton
class NotificationHelper @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        const val CHANNEL_PRICE_DROPS = "price_drops"
        const val CHANNEL_MARKET_NEWS = "market_news"
        const val CHANNEL_SYNC = "sync"
    }

    fun ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        listOf(
            NotificationChannel(CHANNEL_PRICE_DROPS, "Price drops", NotificationManager.IMPORTANCE_HIGH),
            NotificationChannel(CHANNEL_MARKET_NEWS, "Market news", NotificationManager.IMPORTANCE_DEFAULT),
            NotificationChannel(CHANNEL_SYNC, "Background sync", NotificationManager.IMPORTANCE_LOW),
        ).forEach { channel ->
            if (channel.id == CHANNEL_SYNC) channel.setShowBadge(false)
            nm.createNotificationChannel(channel)
        }
    }

    fun hasPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ActivityCompat.checkSelfPermission(
                context, Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED

    fun notifyPriceDrop(
        id: Int,
        title: String,
        body: String,
        contentIntent: PendingIntent?,
        bigPicture: Bitmap? = null,
    ) {
        val style = if (bigPicture != null) {
            NotificationCompat.BigPictureStyle().bigPicture(bigPicture).setSummaryText(body)
        } else {
            NotificationCompat.BigTextStyle().bigText(body)
        }
        post(
            id = id,
            channel = CHANNEL_PRICE_DROPS,
            title = title,
            body = body,
            style = style,
            contentIntent = contentIntent,
        )
    }

    fun notifyMarketNews(id: Int, title: String, body: String, contentIntent: PendingIntent?) {
        post(
            id = id,
            channel = CHANNEL_MARKET_NEWS,
            title = title,
            body = body,
            style = NotificationCompat.BigTextStyle().bigText(body),
            contentIntent = contentIntent,
        )
    }

    @SuppressLint("MissingPermission")
    private fun post(
        id: Int,
        channel: String,
        title: String,
        body: String,
        style: NotificationCompat.Style,
        contentIntent: PendingIntent?,
    ) {
        if (!hasPermission()) return
        ensureChannels()
        val builder = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF0A7AFF.toInt())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(style)
            .setAutoCancel(true)
            .setPriority(
                if (channel == CHANNEL_PRICE_DROPS) NotificationCompat.PRIORITY_HIGH
                else NotificationCompat.PRIORITY_DEFAULT,
            )
        if (contentIntent != null) builder.setContentIntent(contentIntent)
        NotificationManagerCompat.from(context).notify(id, builder.build())
    }

    fun cancel(id: Int) {
        NotificationManagerCompat.from(context).cancel(id)
    }
}

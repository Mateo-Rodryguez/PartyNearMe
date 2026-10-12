package com.partynearme.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.launch

/** The one notification channel; Android shows its name in the app's notification settings. */
const val PUSH_CHANNEL = "general"

fun createPushChannel(context: Context) {
    val channel = NotificationChannel(PUSH_CHANNEL, "Messages and parties", NotificationManager.IMPORTANCE_HIGH)
    context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
}

/**
 * Receives Firebase push messages. In the background Android shows them itself; this
 * shows the ones that arrive while the app is open, and keeps the server's copy of
 * this phone's token current.
 */
class PushService : FirebaseMessagingService() {
    private val app get() = application as PartyApp

    override fun onNewToken(token: String) {
        if (app.core.sessions.session.value == null) return
        app.scope.launch { runCatching { app.core.registerForPush(token, "android") } }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val shown = message.notification ?: return
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        // The same extras Android adds when the user taps a notification shown in the background.
        val open = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        message.data.forEach { (key, value) -> open.putExtra(key, value) }
        val tap = PendingIntent.getActivity(
            this, message.messageId.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = android.app.Notification.Builder(this, PUSH_CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(shown.title)
            .setContentText(shown.body)
            .setContentIntent(tap)
            .setAutoCancel(true)
            .build()
        getSystemService(NotificationManager::class.java)?.notify(message.messageId.hashCode(), notification)
    }
}

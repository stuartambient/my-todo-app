package expo.modules.todoexactalarms

import android.content.Context
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import expo.modules.notifications.service.interfaces.PresentationDelegate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** SDK 57 receiver/delegate extension point; no notification-listener permission. */
class TodoNotificationService : NotificationsService() {
  override fun getPresentationDelegate(context: Context): PresentationDelegate = TodoPresentationDelegate(context)
}

internal class TodoPresentationDelegate(context: Context) : ExpoPresentationDelegate(context) {
  fun capturePresented(): Collection<Notification> {
    val shown = getAllPresentedNotifications()
    shown.forEach { ReminderDeliveryStore.record(context, it) }
    return shown
  }

  override fun presentNotification(notification: Notification, behavior: NotificationBehaviorRecord?) {
    if (!notification.notificationRequest.identifier.startsWith("todo-reminder:") || behavior?.shouldPresentAlert == false) {
      super.presentNotification(notification, behavior)
      return
    }
    CoroutineScope(Dispatchers.IO).launch {
      try {
        val restored = notification.notificationRequest.content.body?.optBoolean("reminderRestored", false) == true
        // Restored cards are silent even if the user backgrounds the app mid-restore.
        val allowed = if (restored) NotificationBehaviorRecord(shouldShowList = true, shouldPlaySound = false) else behavior
        val androidNotification = createNotification(notification, allowed)
        NotificationManagerCompat.from(context).notify(notification.notificationRequest.identifier, getNotifyId(notification.notificationRequest), androidNotification)
        // Observe the actual shade entry after notify, not just an alarm's due time
        // or an attempted delivery (which Android permissions may have blocked).
        // Android enqueues notify() internally, so its binder call can return
        // before activeNotifications contains the new card. Observe boundedly.
        repeat(10) {
          val shown = capturePresented()
          if (shown.any {
            it.notificationRequest.identifier == notification.notificationRequest.identifier &&
              it.notificationRequest.content.body?.optString("reminderAt") == notification.notificationRequest.content.body?.optString("reminderAt") &&
              it.originDate.time >= notification.originDate.time
          }) return@launch
          delay(50)
        }
      } catch (error: Exception) {
        Log.e("Todo reminders", "Unable to present reminder notification", error)
      }
    }
  }
}

package expo.modules.todoexactalarms

import android.content.Context
import android.util.Log
import expo.modules.notifications.notifications.model.Notification
import org.json.JSONArray
import org.json.JSONObject

/** Delivery evidence only, separate from todo.db and portable todo backups. */
internal object ReminderDeliveryStore {
  private const val STORE = "todo-confirmed-reminder-deliveries-v1"
  private const val PREFIX = "todo-reminder:"

  private fun preferences(context: Context) = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)

  @Synchronized
  fun record(context: Context, notification: Notification) {
    try {
      val request = notification.notificationRequest
      val data = request.content.body ?: return
      val id = data.optString("todoId")
      val reminderAt = data.optString("reminderAt")
      val deliveredAt = notification.originDate.time
      if (id.isEmpty() || request.identifier != PREFIX + id || data.optInt("reminderVersion") != 1) return
      if (reminderAt.isEmpty() || deliveredAt <= 0) return
      val key = JSONArray().put(id).put(reminderAt).toString()
      val prefs = preferences(context)
      if (prefs.contains(key)) return
      val record = JSONObject().put("todoId", id).put("reminderAt", reminderAt).put("deliveredAt", deliveredAt)
      if (!prefs.edit().putString(key, record.toString()).commit()) {
        Log.w("Todo reminders", "Unable to persist reminder delivery")
      }
    } catch (error: Exception) {
      // Recording a receipt must not prevent the actual notification.
      Log.w("Todo reminders", "Unable to record reminder delivery", error)
    }
  }

  @Synchronized
  fun read(context: Context): List<Map<String, Any>> = preferences(context).all.values.mapNotNull { value ->
    try {
      val row = JSONObject(value as String)
      mapOf("todoId" to row.getString("todoId"), "reminderAt" to row.getString("reminderAt"), "deliveredAt" to row.getLong("deliveredAt"))
    } catch (_: Exception) { null }
  }

  @Synchronized
  fun retain(context: Context, keys: List<String>) {
    val keep = keys.toSet()
    val prefs = preferences(context)
    val remove = prefs.all.keys.filter { !keep.contains(it) }
    if (remove.isEmpty()) return
    val edit = prefs.edit()
    remove.forEach { edit.remove(it) }
    if (!edit.commit()) throw IllegalStateException("Unable to update reminder delivery history")
  }
}

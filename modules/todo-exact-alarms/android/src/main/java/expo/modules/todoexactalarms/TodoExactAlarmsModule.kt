package expo.modules.todoexactalarms

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** SDK 57 does not expose AlarmManager's special-access check to JavaScript. */
class TodoExactAlarmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun canScheduleExactAlarms(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager)
      .canScheduleExactAlarms()
  }

  override fun definition() = ModuleDefinition {
    Name("TodoExactAlarms")

    AsyncFunction("canScheduleExactAlarmsAsync") {
      canScheduleExactAlarms()
    }

    AsyncFunction("getDeliveredRemindersAsync") {
      TodoPresentationDelegate(context).capturePresented()
      ReminderDeliveryStore.read(context)
    }

    AsyncFunction("retainDeliveredRemindersAsync") { keys: List<String> ->
      ReminderDeliveryStore.retain(context, keys)
    }

    // Resolves after opening Settings. AppState checks access again on return.
    AsyncFunction("openSettingsAsync") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !canScheduleExactAlarms()) {
        val intent = Intent(
          Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
          Uri.parse("package:${context.packageName}")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }.runOnQueue(Queues.MAIN)
  }
}

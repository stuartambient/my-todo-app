# Saved todo reminders

The installed native TodoApp now schedules Android notifications from the
Reminder date/time saved on each open todo. The notification title is the todo
subject. The app must have notification permission and the **Todo reminders**
notification category must be enabled.

## Install precise-reminder support

This update adds a local Android module for exact-alarm access. Stop Metro,
keep the emulator running, and run these from the project folder in PowerShell:

```powershell
git pull
npx.cmd expo prebuild --platform android
npx.cmd expo run:android
```

No database migration or reset is needed. Keep the same application package and
signing setup. Leave the build terminal running when Metro starts. On later
sessions use `npm.cmd start` and press **a** to launch TodoApp.

Save an open todo with a future Reminder. If exact access is off, the home
screen offers **Enable precise reminders**. Tap it, enable **Allow setting
alarms and reminders** for TodoApp in Android Settings, and return to TodoApp.
The app checks access and re-arms its future reminders. Declining access keeps
approximate reminders working; system settings never open automatically.
If Android notification permission or the channel is off, that notice takes
priority over the timing notice.

On Android before API 31 no special alarm access is needed. An older installed
TodoApp binary without the new local module still schedules approximate
reminders and explains that an app update is required for precise reminders.

For opening a todo by tapping its notification, see
[Notification navigation](notification-navigation.md).

## Behavior

- Saving a future reminder schedules one notification for that todo.
- Editing its subject or reminder time replaces its pending notification.
- Clearing the reminder, completing the todo, or deleting it cancels the
  pending notification. Outdated notifications are also removed from the tray.
- Completing a repeating todo cancels the completed occurrence's reminder and
  schedules the next occurrence using its shifted reminder time.
- Reopening a completed todo restores its reminder if its saved time is still
  in the future. The existing successor of a repeating occurrence is retained.
- The database remains the source of truth. Startup and returning to the app
  repair missing or stale requests. Future alarms are re-armed under their
  existing identifiers, without creating duplicates, even when Expo's stored
  request survives an Android-side alarm cancellation.
- Past reminder times stay saved but are not replayed as catch-up alerts.
  An already scheduled alarm is preserved after its requested time if Android
  has not delivered it yet. Returning to the app must not cancel a delayed
  alarm. Completing/deleting the todo or clearing/changing the reminder still
  cancels it. A subject edit after the scheduled time retains the delayed
  alarm's original title so the reminder is not lost.
- Permission is requested when saving a future reminder or tapping **Allow
  reminders**, not automatically on startup. A notice offers permission,
  Settings, or retry when notifications cannot be scheduled.
- A native notification failure does not discard a successfully saved todo or
  report a successful save/delete/completion as failed. The notice remains
  visible on the home screen and synchronization retries on app resume.
- Only notifications whose identifiers start with `todo-reminder:` are
  reconciled; notifications from other features are left alone.

Reminders are scheduled locally with Android and do not require a push server.
They can arrive while the app is in the background. Android permission, device
power settings, and alarm timing restrictions still affect presentation and
delivery. With exact access, SDK 57 schedules using `setExactAndAllowWhileIdle`;
without it, it uses `setAndAllowWhileIdle`. Exact access improves timing, but
Android idle quotas, notification settings and manufacturer power policies can
still affect delivery. Force-stopping an Android app is different from normally
placing it in the background.

Only `SCHEDULE_EXACT_ALARM` is requested. This is user-controlled special app
access, not automatic `USE_EXACT_ALARM` access. Android stops the app and cancels
its future exact alarms if access is revoked. On next launch/resume TodoApp
re-arms future saved reminders, falling back to approximate timing if needed.
If access is granted externally while TodoApp stays stopped, open TodoApp to
apply the change to its reminders.

## Emulator / device check

1. Create a todo with a distinctive subject and a Reminder two or three minutes
   in the future. Save it and allow permission if asked.
2. Press the emulator's Home button, keeping the emulator running. Verify a
   notification with that subject appears at the reminder time (allow for
   Android delivery delays). Also test once with TodoApp in the foreground.
3. Create another reminder and move it to a later time. Verify the old time
   does not notify and the new time does.
4. Create a future reminder, then complete, delete, or clear the reminder before
   it fires. Verify no notification arrives for the cancelled reminder.
5. Complete a repeating todo with a future reminder. Open the new occurrence
   and confirm its Reminder moved with the due date. For a quick delivery test,
   edit the new occurrence's Reminder to a few minutes from now and save it.
6. Turn TodoApp notifications off in Android Settings, then save a reminder.
   Confirm the todo is retained and the home-screen notice offers help. Turn
   permission back on and return to the app; future reminders are restored.

## Precise timing checks

1. With access off, save a reminder and confirm the timing notice appears. No
   system settings screen should open until **Enable precise reminders** is tapped.
2. Open that screen and return without enabling access. The reminder should
   remain scheduled approximately and the notice should remain available.
3. Enable access, return to TodoApp, and confirm the notice clears. Check the
   existing reminder still delivers, without needing to edit and save it again.
4. Repeatedly edit one todo's reminder a few minutes ahead. Verify delivery
   and verify the old time no longer delivers.
5. Repeat in foreground, background, and with the emulator screen off. Exact
   alarms are still subject to Android idle quotas; do not assume a hard real-time guarantee.
6. Revoke access in Android Settings, then reopen TodoApp. Future reminders
   should be re-armed approximately, the timing notice should return, and no
   completed/deleted or changed reminders should be resurrected.
7. Return to the app after a requested time while Android still holds a delayed
   alarm. It must remain pending instead of being cancelled.

Optional PowerShell diagnostics:

```powershell
adb shell appops get com.sambi.todoapp SCHEDULE_EXACT_ALARM
adb shell dumpsys alarm |
    Select-String 'com.sambi.todoapp|todo-reminder:' -Context 3,8
```

Use `[Todo reminders]` records to inspect `timingAccess`, `rescheduleFuture` and
native pending requests. Android's alarm dump should show a zero delivery window
for an exact alarm. The app does not claim a stored request proves OS delivery.

## Automated verification

```sh
npx tsc --noEmit
npx expo lint
npx jest --preset jest-expo --runInBand
```

The integration check below uses Node 24+ with built-in SQLite. It runs actual
repository, schema, migration, recurrence and reconciliation code against an
in-memory database; only Android native APIs are replaced:

```sh
node scripts/verify-reminders.cjs
```

Tests cover saved timestamps, edits, completion/deletion, recurrence, reopening,
denied permission, stale-request cleanup, duplicate prevention, overlapping
writes/resume refreshes, database rollback and recovery after simulated native
scheduling/cancellation failures. Automated tests do not confirm OS delivery;
use the device checklist above for that.

## Development diagnostics

Development builds log `[Todo reminders]` records with the emulator's UTC clock,
reminder identifiers and saved timestamps, without subjects or notes. `scheduled`
means the native scheduling call resolved; `native-pending` reads back Expo's
native request store. Neither proves that AlarmManager delivered the notification.
`cancelled-stale` and `cancelled-permission` show app-side cancellations;
`foreground-received` and `presentation-error` trace foreground handling only.
There is no polling or change to release scheduling behavior.

For an intermittent delivery failure, save a future reminder once, retain those
logs, and check Android's alarm queue in a separate PowerShell terminal:

```powershell
adb shell date
adb shell dumpsys alarm |
    Select-String 'com.sambi.todoapp|todo-reminder:' -Context 3,8
```

After a miss, collect native notification errors without clearing logcat:

```powershell
adb logcat -d -v time 'expo-notifications:V' 'AndroidRuntime:E' '*:S'
```

Keep the server running and leave the reminder unchanged until the evidence is
captured. A native pending request is not sufficient to distinguish an Android
alarm delay from a notification presentation failure; compare it with dumpsys
and native errors before changing scheduling or permissions.


References:
- https://developer.android.com/develop/background-work/services/alarms
- https://developer.android.com/about/versions/14/changes/schedule-exact-alarms
- https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
- https://docs.expo.dev/modules/get-started/

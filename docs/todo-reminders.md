# Saved todo reminders

The installed native TodoApp now schedules Android notifications from the
Reminder date/time saved on each open todo. The notification title is the todo
subject. The app must have notification permission and the **Todo reminders**
notification category must be enabled.

This update only changes JavaScript/TypeScript. No package installation,
database reset, or native rebuild is needed if the existing native build
already delivers saved todo reminders. Pull the update and reload that
installed TodoApp from your running Metro session. Continue using the native
TodoApp that worked, rather than Expo Go.

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
  repair missing or stale requests without duplicating matching reminders.
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
delivery; this update does not add exact-alarm privileges. Force-stopping an
Android app is different from normally placing it in the background.

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

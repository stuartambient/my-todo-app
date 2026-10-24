# Complete and Snooze from Android notifications

Saved todo reminders now have **Complete** and **Snooze 10 min** actions. Android
may hide these until you expand the card in the notification shade. Tapping the
notification body opens the todo and leaves the reminder in the notification
shade. Complete and Snooze remove the current card after saving their action.

## Install once

This adds expo-task-manager and updates the Expo SDK 57 patch packages to the
versions recommended by the compatibility check. Stop Metro, keep the emulator
running, and run these one at a time from the project folder in PowerShell:

```powershell
git pull
npm.cmd ci
npx.cmd expo prebuild --platform android
npx.cmd expo run:android
```

Keep Metro running after the build. Later sessions still use `npm.cmd start`
and **a**. Do not uninstall TodoApp or clear its data. The schema additions are
created in place; existing todos remain intact. Create or reschedule a future
reminder to see the new buttons. Notifications already delivered before this
update do not gain buttons retroactively.

## Behavior

- **Complete** uses the same transactional completion as the app, including
  recording history and creating one successor for a recurring todo.
- **Snooze 10 min** changes the current todo's reminder to ten minutes from action
  processing time. Its due date, subject, notes, priority and recurrence settings
  remain unchanged. The snoozed notification has both action buttons too.
- Buttons do not bring TodoApp to the foreground. The live response listener
  handles actions while the UI is running; Expo TaskManager handles Android
  action responses in the background or after process death. The task is defined
  at module scope in the custom entry before Expo Router registration.
- Simply receiving a notification or tapping its body never completes or snoozes.
  Body taps use Android `autoDismiss: false`; users can reopen the same retained
  card later. Notifications remain swipe-dismissible (`sticky: false`).
- Completing removes the delivered card; snoozing removes it and schedules a new
  reminder. An unchanged open todo keeps its card through app resume, opening,
  saving unchanged fields, and subject edits. Deleting a todo, clearing its
  reminder, or rescheduling it also removes the outdated card.
- The retention change only needs a pull and reload of an existing development
  build. Future pending reminders are upgraded during synchronization; already
  delivered cards keep their original Android flags. Test with a fresh reminder.
- An old button cannot change a todo whose reminder was edited to a new time.
  Actions for missing, completed or otherwise stale reminders are ignored.
- The first action for one delivered notification wins. A transactional SQLite
  receipt prevents duplicate UI/headless events from applying a second action,
  including replay after reload or after reopening a completed todo.
- After a failed database transaction, its receipt rolls back so retry remains
  possible. If native scheduling fails after a committed action, a duplicate or
  normal app refresh repairs notifications without moving the snooze again.
- Native alarm reconciliation holds a separate SQLite writer lock while reading
  the current snapshot and updating alarms. This prevents foreground/headless
  snapshots from cancelling each other's newer reminders. Permission prompts run
  before that lock is acquired. A busy timeout is set on every new transaction
  connection, not only the main SQLite connection.
- Foreground lists refresh after actions and on app resume. An open edit screen
  reloads current data; the form remounts only when the saved updatedAt changes.
- If task/category registration fails, basic reminder delivery continues without
  action buttons and the home screen offers **Retry actions**.

The installed development build and its background JS tasks still need Metro.
TaskManager does not bypass Android force-stop or OS background restrictions.
Use normal backgrounding or `am kill` for process-death tests, not `am force-stop`.

## Device checks

1. Schedule a fresh reminder and tap its body. Confirm the todo opens and its
   notification stays in the shade. Go Back and tap that same card again; it
   should reopen the todo. Confirm saving without changing its reminder leaves
   the card present. Then expand its notification.
   Tap **Complete**. TodoApp should not open. Open it manually and confirm the todo
   is in Completed and no pending reminder remains.
2. Repeat with a recurring todo and confirm exactly one next occurrence appears.
3. On another reminder tap **Snooze 10 min**. Confirm the saved Reminder moved
   roughly ten minutes ahead, its due date stayed the same, and a new notification
   arrives at the snoozed time with the same actions.
4. Repeat with TodoApp in the foreground; its list should update automatically.
5. After a notification arrives, press Home and run
   `adb shell am kill com.sambi.todoapp` in another terminal. Tap an action on the
   existing notification. Reopen TodoApp and verify the saved result. Leave Metro
   running throughout.
6. Tap the notification body and confirm the existing open-todo navigation still
   works. Verify precise timing permission remains enabled.
7. Edit a reminder again and confirm only its newest alarm fires. Complete or
   clear it before that time and confirm it no longer fires.

## Automated checks

```sh
npx tsc --noEmit
npx expo lint
npx jest --preset jest-expo --runInBand
node scripts/verify-reminders.cjs
```

The SQLite checks use a temporary database file, actual application repository
code, and native notification doubles. A second SQLite connection verifies the
writer lock is held through alarm scheduling and released afterward. Other
checks cover transactional receipts, conflicting/duplicate actions, stale and
deleted rows, snooze preservation of other fields, recurrence, rollback and
repair after simulated native failures. Native background execution and visible
Android buttons still require the device checks above.

References:
- https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
- https://docs.expo.dev/versions/v57.0.0/sdk/task-manager/
- https://docs.expo.dev/router/installation/

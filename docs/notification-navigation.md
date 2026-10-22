# Open a todo from its reminder

Tapping a saved todo reminder opens that todo's edit/details screen. This is a
JavaScript-only change: pull it and reload TodoApp; the existing native build
already includes the notification response APIs. No rebuild or data reset is
needed. Keep Metro running while using the development build.

## Behavior

- A live tap works with TodoApp open or in the background.
- On a cold launch, the last native response is read after subscribing to live
  taps. Navigation waits for the root navigator to be ready, and the todo lookup
  waits for SQLite initialization.
- Only the default tap action on a `todo-reminder:<todoId>` notification with a
  matching `data.todoId` is accepted. Arbitrary notification URLs are not followed.
- The todo is read from SQLite when tapped. Existing completed todos still open;
  a missing/deleted todo returns to the list with a short explanation.
- Duplicate response delivery is handled once. A newer tap supersedes an older
  lookup. Consumed responses are cleared so a reload does not reopen the todo.
- Ordinary app startup without a response keeps the normal launch behavior.
- The root list is the navigation anchor for cold links. Navigation uses
  `navigate` so the same todo is not repeatedly pushed onto the stack.
- Changing the selected ID remounts the editor and form, preventing old field
  values from being shown or saved onto the newly selected todo.
- Simply receiving a notification does not navigate or mark a todo complete.

The adapter keeps using SDK 57's local-only build imports, including
`NotificationsEmitter`, and avoids the root barrel's remote-topic module.
Recheck these internal paths on SDK upgrades.

## Emulator checks

1. Open TodoApp, schedule a reminder a few minutes ahead, then tap its popup or
   notification-shade card. Confirm the correct subject and reminder appear.
2. From a fresh list screen, repeat with TodoApp in the background. Tapping the
   card should open the todo; Back should return to the list.
3. For a cold process test, wait until a reminder is visible in the shade. Press
   Home and run `adb shell am kill com.sambi.todoapp` from another terminal.
   Leave Metro running. Tap the existing notification and confirm the todo opens.
   Do not use `am force-stop` to test future alarm delivery: force-stop disables
   scheduled alarms until the app is opened again.
4. After opening a todo from its reminder, go Back to the list and reload the
   app. The already-consumed response should not reopen that todo.
5. Deliver reminders for two different todos. Open one todo, then tap the
   other's notification. Confirm every form field belongs to the second todo.
6. Repeat a reminder for the same todo after editing its time. Its new
   notification should still open it. Only the duplicate event for the same
   notification is suppressed.

If an old notification survives a deletion race, tapping it should show
"Todo unavailable" and return to the list. Normal deletion removes its tray
notification, so this edge case is also tested with a simulated stale response.

Development logs use `[Todo reminders]` events `tap-received`, `tap-opened`,
`tap-missing`, and `tap-clear-error`. They include IDs rather than todo text.

## Verification

```sh
npx tsc --noEmit
npx expo lint
npx jest --preset jest-expo --runInBand
node scripts/verify-reminders.cjs
```

Automated tests exercise queued cold-start and live responses, duplicate
suppression, later occurrences, deleted and completed rows, invalid payloads,
cleanup during an outstanding database read, failed reads and overlapping taps.
The import-graph regression evaluates the installed SDK's real response wrapper
and verifies Android dataString mapping and response consumption without a
remote-topic native module. OS-level launch and UI/back behavior still require
the emulator checks above.

References:
- https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
- https://docs.expo.dev/router/advanced/router-settings/

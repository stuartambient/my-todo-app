# Restore reminder notifications (Android V1)

Home → three-dot menu → **Restore reminder notifications** opens a preview. The user must explicitly confirm before any cards are posted. Restoration returns cards to the Android notification shade with the existing **Complete** and **Snooze 10 min** actions. Restored cards are silent, do not show a heads-up banner, and can be swiped away. This is manual recovery, not automatic reposting on every launch/reboot.

## Eligibility and limitations

A reminder qualifies only when:

- The todo still exists and is open.
- Its current reminder timestamp has passed and matches confirmed delivery evidence on this device.
- A matching card is not already in the shade.
- A matching original alarm is not still pending, including delayed approximate alarms.

Completed/deleted todos, changed or snoozed reminder times, future reminders, and unverified past reminder times are excluded. Mere passage of a reminder time is not proof that Android displayed a notification. Preview and restore use fresh snapshots, so edits/completions between the two are respected. A restored card does not change todo status, due date/time, notes, recurrence, or reminder time.

The app previously kept no durable delivery evidence. This release can learn from old cards **still visible** and from new deliveries after rebuilding. A card already cleared before this release may not be recoverable. The screen explains this and counts unverifiable past reminders. History is device-specific and is not included in portable todo backups or copied to another phone.

The app cannot determine whether Android removed a card during an OS update or the user deliberately dismissed it. The confirmation explicitly notes that manually restoring can also bring back cards the user swiped away.

## Native delivery evidence

The existing local `todo-exact-alarms` Expo module now includes `TodoNotificationService`, a non-exported subclass of the SDK 57 `NotificationsService`. Expo resolves the highest-priority receiver for its internal `expo.modules.notifications.NOTIFICATION_EVENT`; our module's priority 10 receiver overrides the library's priority -1 receiver for that event only. The original Expo receiver continues handling boot/package replacement setup. All other delegates and notification behaviors remain inherited.

The presentation delegate uses Expo's existing builder, notification tag/ID, action categories, and behavior. After posting a TodoApp reminder it observes Android's actual active notifications, allowing briefly for asynchronous Android presentation, and records only matching app-owned cards. It does **not** infer success from an elapsed alarm or a scheduling request. Delivery recording runs in native Android code and does not require a live JS runtime or Metro connection.

Evidence contains only todo ID, reminder timestamp, and delivery timestamp in private SharedPreferences. Synchronized writes preserve the first confirmed delivery for each pair. A normal startup/resume/save sync also captures currently presented cards and prunes history to current open todo/reminder pairs. Failure of optional history maintenance is logged without blocking normal notification scheduling. Failures to present or persist evidence are logged natively; absence of evidence excludes recovery rather than generating an unsupported catch-up alert.

Restored cards force silent list-only behavior natively, including if the user backgrounds the app during recovery. The foreground handler also honors the `reminderRestored` flag. Normal future reminders retain their existing audible behavior.

This is intentionally tied to the installed SDK 57 native extension points and model APIs; review the receiver/delegate integration when upgrading Expo. There is no NotificationListenerService, broad notification-access permission, or access to other apps' notifications.

## Restore synchronization and failures

Both preview and restoration use the existing repository write queue and cross-runtime SQLite writer lock. Native history, presented cards, pending alarms, and current todo state are compared under that lock. Android permission prompts occur outside the transaction; eligibility is checked again afterward. Notification permission/channel denial is reported clearly. Working Complete/Snooze category registration is required before restoring.

Notification identifiers remain `todo-reminder:<todoId>`, so Android replacements use the same card identity. Original reminder timestamps remain in action data; stale-action guards still apply. Snooze changes only the reminder time and Complete uses the existing recurrence transaction. Actual notification dates distinguish a restored card from already processed actions on an older card.

Per-card scheduling failures are counted. A partial restore does not report all cards successful; retry checks the actual shade and attempts only missing eligible cards. The result counts accepted posting requests; Android still controls actual presentation. The operation never cancels future or delayed original alarms. The asynchronous presentation may mean a very immediate **Check again** briefly reports a restored request as pending before the card appears.

## Install and device review

Native module source/manifest/Gradle changes require **one development-build rebuild**. No npm dependency, app database migration, or database reset is needed:

```powershell
git pull
npx.cmd expo run:android --device
```

Stop Metro first if running the build command in its terminal. Select the connected phone and keep the new Metro session running for development UI use. An older installed native binary receives a clear rebuild message when opening restore rather than crashing the app.

Device tests:

1. Create a test todo with a reminder a few minutes ahead; let it appear while TodoApp is backgrounded.
2. Swipe that card away, open TodoApp → Restore reminder notifications, confirm one eligible card, and restore. Verify a silent card returns with Complete/Snooze buttons.
3. Check again and restore again; the existing card must not duplicate.
4. Snooze the restored card and verify it disappears and alerts again about ten minutes later.
5. Restore a repeating todo's card and Complete it; verify one next occurrence and removal of the old card.
6. Try completing, clearing, or changing a reminder before restoration and verify exclusion. Future alarms must remain scheduled.
7. Test persistence across a phone restart/update after the new build has observed a delivery. A deliberate **force-stop** cancels scheduled alarms on Android, so do not use force-stop to simulate simply backgrounding before a scheduled reminder fires.

## Automated validation

- `npx jest --preset jest-expo --runInBand --silent --testTimeout=15000` (the first React form test can exceed Jest's 5-second default during cold compilation)
- `node scripts/verify-reminder-restore.cjs` (Node 24+, real temporary SQLite, native bridge stubbed)
- `node scripts/verify-backup.cjs`
- `TZ=America/Denver node scripts/verify-reminders.cjs`
- `npx tsc --noEmit`
- `npx expo lint`
- `npx expo-modules-autolinking resolve --platform android --json`
- `npx expo export --platform android --output-dir /tmp/todo-restore-reminders-export`

Automated coverage includes evidence requirements, duplicates, stale and pending reminders, permission/channel denial, partial retry, cross-connection write exclusion, no todo changes, and restored notification Complete/Snooze behavior. Autolinking and JS export are checked here; native Android compilation and OS notification-shade behavior require the development build and physical-device testing.

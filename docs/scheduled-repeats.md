# Scheduled repeats and series deletion

## Behavior

The existing **Repeat based on** choice controls generation:

- **Due date:** calendar occurrences are created independently of completion. Yesterday can remain overdue while today's occurrence exists. Missed dates are retained, rather than silently skipped. Weekly intervals and monthly/yearly anchors retain their existing calendar arithmetic.
- **Completion date:** the next occurrence waits for completion. Completing older, reopened history cannot fork the live chain. Skipping the current occurrence creates its next instance so the series continues.

There is no additional generation-mode setting. Both modes respect the optional inclusive end date. A daily series ending November 6 includes November 6 and never generates November 7. Nothing automatically completes an overdue occurrence.

Calendar series prepare occurrences and their individual local notifications through **30 days ahead** when the app opens/resumes, the home list refreshes, the local day changes while the list is mounted, or a notification action is processed. Prepared dates appear within their selected date ranges. Date-range views also calculate later due-date repeats on demand without saving them or registering their notifications; see [Future repeats in date-range planning](repeat-projections.md). A later refresh extends the preparation window and catches up missed dates. Large backlogs advance in atomic batches of 1,000 periods without skipping dates.

This is advance scheduling, not an Android periodic background worker. Already-prepared alarms work with the app closed; if the app is neither opened nor used through reminder actions for longer than the prepared window, it must be reopened to extend the schedule. Old missed reminder times are not replayed as immediate alerts. Native Android permissions, precise-alarm access and channel behavior remain unchanged.

## Deletion

Repeating todos offer **Cancel**, **Delete this occurrence**, and **Delete entire series** in their confirmation dialog. Non-repeating todos retain their ordinary delete confirmation. Unsaved-edit warnings and failed-write draft protection remain.

- **This occurrence:** removes the selected row and its delivered/pending reminder, retains the series, and records its date as skipped. Refreshing or editing the rule cannot recreate that skipped date. Deleting the original or only remaining instance does not erase the rule.
- **Entire series:** stops the persisted rule and removes every open member, including overdue and prepared future occurrences. Completed history stays. All open-member reminders/cards are removed by the existing reconciliation path. Reopening completed history does not reactivate a stopped rule.

Rules are identified by stable series IDs, never subject text or the continued existence of an original parent row. Unrelated todos with the same subject are independent.

## Editing

Calculated future previews link to an existing saved occurrence through **Edit repeating todo**. They support completion and deletion, but do not directly edit a distant date or advance the preparation cursor.

Editing an open repeating occurrence updates the series template and applicable upcoming open occurrences. Earlier overdue occurrences and completed history are preserved. Ordinary edits retain future occurrence IDs and do not overwrite independently snoozed reminders unless the reminder itself was changed. Changing the calendar schedule rebuilds applicable open future dates; shortening an end date removes open future occurrences beyond the new limit. Skipped dates remain excluded. Turning Repeat to None stops that series; enabling it again creates a fresh series.

Completed-history edits do not change the live template. Existing no-duplicate behavior applies to completion and reminder-action replays.

## Persistence and compatibility

Database version 3 adds nullable `todos.recurrence_series_id` and the `todo_recurrence_series` table. Startup uses the existing atomic migration and writer lock; prior todo fields and end dates are preserved. Legacy parent/source chains are adopted on first repository refresh or backup, retaining every existing occurrence. Generation continues after their last known occurrence; gaps already skipped by the old completion-driven code are not retroactively reconstructed. Legacy chains with only completed history are kept inactive so previously stopped chains do not unexpectedly restart.

The table persists the validated form template, original calendar anchor, generation cursor, active/stopped flag and skipped dates. Generation, edits, completion and deletion use the existing JS queue plus a SQLite writer transaction so foreground and headless runtimes cannot interleave conflicting changes. Native notification operations run against a committed snapshot under the existing reconciliation lock.

Backup version 3 includes membership and series state, with type/category IDs remapped in both todos and templates during restore. Versions 1 and 2 remain importable. Additive restores preserve newer local rules and skips; a version-3 backup cannot reactivate a locally stopped series. Missing deleted parents are allowed. Current backups require an updated app to restore.

## Verification

Automated: TypeScript, Expo lint, Jest (including delete-dialog scope/cancel/failure tests), `verify-scheduled-repeats.cjs`, `verify-reminders.cjs`, `verify-backup.cjs`, `verify-reminder-restore.cjs`, and `verify-database-startup.cjs`. The SQLite scripts run on Node 24+ with native notification APIs stubbed; the scheduled-repeat script uses a controlled local clock and `TZ=America/Denver`. They cover independent generation, inclusive limits, missing parents, skipped dates, stopping versus completion, reminder cancellation/dismissal, overlapping refreshes, rollback, stable edited IDs, snoozes, legacy upgrades, and portable backup state.

Phone review (save a fresh backup first; never uninstall or clear data):

1. Install/open the current development build after pulling. Check the existing overdue daily todo: it stays overdue and today's instance exists without completing it.
2. Set an end date a few days ahead. Check upcoming instances include that date and exclude the following date.
3. Delete one future occurrence. Close/reopen, then edit an ordinary field: the skipped date stays absent and other dates remain.
4. Complete one occurrence. Delete the entire series from another member: open members and their reminders disappear, but the completed item stays in history.
5. Keep another series with the same subject and confirm it is unaffected.
6. Verify a future prepared reminder on the phone with the app closed; exercise Complete and Snooze.
7. Check a completion-based repeat still waits for completion. Export/restore a backup on the emulator as a separate installation and confirm series limits/skips/state.

No native dependencies or signing settings changed. Metro can deliver the change to an installed development build. A standalone APK must be rebuilt using `npm.cmd run android:standalone` after testing.

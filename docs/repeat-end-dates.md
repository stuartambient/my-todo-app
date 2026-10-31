# Optional repeat end date

Edit an existing repeating todo or create one. Under Repeat, choose **Ends on (optional)**. The default **Never** preserves unlimited recurrence. **Never end** clears a chosen date. Non-repeating todos do not show this field; choosing None clears it.

The limit applies to occurrence due dates in the device's local calendar, independently of reminder time. It must be on or after the current due date. Completing an occurrence creates its next scheduled occurrence only if that due date is on or before the end date. Daily repeats can therefore have their final occurrence on the end date. Weekly/monthly/interval repeats keep their schedule; choosing an off-schedule limit does not add an extra occurrence on that date. Existing rules still skip missed dates when completing late.

The occurrence due on the end date is final, including when completed early with completion-based recurrence. The end date never completes, deletes, hides or disables reminders on an open todo. Unfinished occurrences remain open and become overdue normally. Snooze retains its current behavior. Completion from either the app or a notification follows the same limit.

Existing series receive no end date until the user selects one. The limit is copied to every new successor. Editing one occurrence does not alter already-created successors. Reopening and recompleting retains the existing no-duplicate-successor behavior.

Database version 2 adds a nullable column inside the existing atomic migration. No todo rows are removed or replaced. Backup exports use format version 2 and include the limit; old version-1 backups import with null limits. New backups require a current app to restore.

## Phone verification

Save a backup before updating. Pull the changes and fully close/reopen TodoApp with Metro running so the database upgrades before testing. No native dependencies changed and no uninstall is needed.

1. Edit each existing daily todo, select its own end date, save and reopen to confirm it persists.
2. A repeat with no end date still saves and repeats normally.
3. Complete a daily occurrence due the day before its end date: the successor is due on the end date with the same limit/reminder pattern.
4. Complete that final occurrence: no successor appears. Check notification Complete as well.
5. Leave a past-due occurrence uncompleted: it stays open/overdue even after the end date.
6. Clear an end date to resume unlimited recurrence; invalid limits before the due date must not save.
7. Export/restore a backup and check the limit is preserved.

After testing, stop Metro and run `npm.cmd run android:standalone` to embed the changes. Reinstall over the app with the same signing key; do not uninstall or clear data.

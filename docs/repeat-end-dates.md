# Optional repeat end date

Edit an existing repeating todo or create one. Under Repeat, choose **Ends on (optional)**. The default **Never** preserves unlimited recurrence. **Never end** clears a chosen date. Non-repeating todos do not show this field; choosing None clears it.

The limit applies to occurrence due dates in the device's local calendar, independently of reminder time. It must be on or after the current due date. Scheduled generation and completion-driven generation both limit new occurrences to due dates on or before the end date. Daily repeats can therefore have their final occurrence on the end date. Weekly/monthly/interval repeats keep their schedule; choosing an off-schedule limit does not add an extra occurrence on that date. Due-date repeats now retain missed occurrences; see [scheduled repeats](scheduled-repeats.md).

The occurrence due on the end date is final, including when completed early with completion-based recurrence. Reaching the end date never automatically completes or removes unfinished occurrences. Shortening the limit removes prepared open future occurrences beyond the new end date; earlier overdue occurrences and completed history stay. Unfinished occurrences remain open and become overdue normally. Snooze retains its current behavior. Completion from either the app or a notification follows the same limit.

Existing series receive no end date until the user selects one. The limit is copied to every new successor. Editing an open occurrence updates applicable upcoming occurrences while preserving earlier overdue and completed ones. Reopening and recompleting retains the existing no-duplicate-successor behavior.

Database version 2 adds a nullable column inside the existing atomic migration. No todo rows are removed or replaced. The current database is version 3 and backups use format version 3, preserving the limit and series state. Old version-1 backups import with null limits; version-2 files retain their existing limits. New backups require a current app to restore.

## Phone verification

Save a backup before updating. Pull the changes and fully close/reopen TodoApp with Metro running so the database upgrades before testing. No native dependencies changed and no uninstall is needed.

1. Edit each existing daily todo, select its own end date, save and reopen to confirm it persists.
2. A repeat with no end date still saves and repeats normally.
3. A daily due-date series includes its scheduled occurrence on the end date even if earlier occurrences are unfinished. Completion-based repeats generate the next occurrence only on completion.
4. Complete that final occurrence: no successor appears. Check notification Complete as well.
5. Leave a past-due occurrence uncompleted: it stays open/overdue even after the end date.
6. Clear an end date to resume unlimited recurrence; invalid limits before the due date must not save.
7. Export/restore a backup and check the limit is preserved.

After testing, stop Metro and run `npm.cmd run android:standalone` to embed the changes. Reinstall over the app with the same signing key; do not uninstall or clear data.

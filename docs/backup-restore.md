# Backup and restore (Android V1)

Open the home screen's three-dot menu → **Backup & restore**.

## Save a backup

**Save backup** takes one consistent database snapshot and opens Android's folder picker. Choose or create a backup folder and grant access using **Use this folder**. Some Android versions do not allow granting access to the root of Downloads; create/select a subfolder instead. The JSON file is written outside TodoApp's private app storage. Canceling does not create a file or show a success message. A write failure reports an error and attempts to remove the incomplete file.

Copy the file to a computer or cloud storage for protection against losing the phone. This is manual backup, not automatic cloud sync. Files are readable plain text, including notes. App uninstall does not normally remove a separately saved user document; no guarantee is made for provider-specific storage or device loss.

Included: all open/completed todos, notes, priority, due date/time, reminder timestamps, recurrence interval/basis/anchor/lineage, types (including inactive types), and categories retained in the database. This preserves the 31st-of-month recurrence anchor across shorter months. Notification delivery history, action receipts, permissions, and Android channel/settings are device-specific and are not exported.

## Restore

**Choose backup file** opens the document picker. Selection copies the file to cache so providers can be read reliably; that temporary copy is removed after reading, including validation failures. A validated preview displays the filename, backup creation time in the device's locale, and open/completed counts. No database changes occur until the user confirms **Restore missing todos**.

Restore is additive: existing todo IDs are skipped, preserving local edits and completion state. Todos deleted since the backup can be recovered. Restoring the same file repeatedly does not duplicate todos. Matching type/category names reuse the receiving installation's IDs because default types have different UUIDs on each installation. New names are imported, resolving ID collisions without overwriting local metadata. A conflicting repeat successor and its imported descendants are skipped to avoid forking a recurring series. The result reports added and skipped counts.

The complete import runs in an exclusive SQLite transaction under the same repository write queue and cross-runtime writer lock used for notification actions. An insertion failure rolls back todos and metadata together. Native reminders are reconciled only after commit. Future reminders on newly restored open todos request notification permission if needed. Past reminders are not replayed. Permissions and precise alarm access must be allowed on the receiving device; a successful data restore does not guarantee a notification if Android permissions are denied. The existing home reminder notice reports scheduling problems.

This is not a way to replace the current database with an old snapshot or undo current edits. There is no destructive replace option in V1.

## Format and limits

`format: "todoapp-backup"`, `version: 1`, `exportedAt`, `todoTypes`, `categories`, `todos`.

Files are validated before preview and again before restore: strict fields/enums, valid dates/times/timestamps, completion/repeat consistency, unique IDs/names/recurrence sources, no circular ancestry, and valid type/category references. Missing deleted recurrence predecessors are allowed. Unknown format versions receive an update message. Limits: 20 MiB UTF-8 JSON, 50,000 todos, 10,000 types/categories each. Export enforces the same size/format constraints so it cannot quietly produce an unrestorable file. SQL column names come only from strict validated records and table names are fixed constants.

## Installation for this change

Adds SDK 57-compatible `expo-document-picker` and a direct dependency on the already-transitive `expo-file-system`. Rebuild the installed development app once after pulling and installing dependencies. Subsequent JavaScript-only changes still need only reload.

## Validation

- `npx tsc --noEmit`
- `npx expo lint`
- `npx jest --preset jest-expo --runInBand --silent`
- `node scripts/verify-backup.cjs` (Node 24+, real temporary SQLite database, native APIs stubbed)
- `TZ=America/Denver node scripts/verify-reminders.cjs`
- `npx expo export --platform android --output-dir /tmp/todo-backup-export`

Device review: save a backup containing open/completed and repeating todos; cancel each picker; preview without restoring; restore the same file and verify zero duplicates; delete one test todo and restore to recover it; verify a future restored reminder fires and recurrence still works. Check malformed files show an error without a preview. For migration testing, use the emulator as a separate installation, copy the backup there, and restore without clearing the phone's working database. Android folder picker, file provider permissions, and notification delivery require actual Android testing.

# Database initialization and lock recovery

The foreground UI and headless notification actions can open `todo.db` at the same time. A development reload can also overlap work still held by the previous runtime. Each runtime shares a single initialization promise among its callers, but that promise is not a cross-runtime lock.

Previously every startup ran the full schema script, recurrence migration, and default type inserts. Even an existing, healthy database needed a writer. A real SQLite regression test reproduces `database is locked` from the old schema setup while an ordinary read succeeds under the same competing writer.

## Current behavior

- Initialization opens a dedicated `useNewConnection: true` handle. A failed attempt closes only that handle; it does not borrow or close a native cached connection another runtime may be using.
- Connection-local foreign key enforcement and a busy timeout are configured before use.
- `PRAGMA user_version` identifies an up-to-date database. Version 1 means the existing schema, recurrence backfill/index, and default types have all been committed. Healthy startups perform no schema, seed, or lock-row writes.
- For an unversioned/older database, WAL is enabled only if necessary, before starting the upgrade transaction. `BEGIN IMMEDIATE` acquires the writer before migration reads. The version is checked again inside the transaction in case another runtime already upgraded it.
- Schema creation, recurrence migration, default types, and the version stamp commit together. Errors roll the whole upgrade back; the original todo rows remain. This also upgrades existing installations whose previous code never set `user_version`.
- Only SQLite lock/busy failures retry, at most five attempts, with short asynchronous backoff. Non-lock failures propagate immediately. Rollback failure aborts the connection instead of retrying inside an uncertain transaction.
- Errors include the initialization phase so a later device log can distinguish connection setup, version/journal configuration, acquiring the writer, schema/defaults, and commit.
- After successful initialization the foreground connection retains the existing 5-second busy timeout used by repository writes. Notification and backup transactions retain their own timeouts and locking.

The initializer owns `todo.db`'s `user_version`. Future schema or seed changes must increment `DATABASE_VERSION` and remain compatible with older schema versions. `migrateDatabase` must run inside the initializer's transaction, not open a nested transaction. `INITIAL_SCHEMA` now contains schema statements only; connection pragmas belong to initialization.

## Validation

- `node scripts/verify-database-startup.cjs` (Node 24+): separate real SQLite connections reproduce the old failure and verify healthy startup under a writer. A worker holds a legacy database's writer beyond the first busy timeout, then releases it so the upgrade retries and preserves data. A trigger-induced seed failure verifies rollback of schema changes and version, followed by a successful retry.
- `node scripts/verify-backup.cjs`
- `TZ=America/Denver node scripts/verify-reminders.cjs`
- `npx jest --preset jest-expo --runInBand --silent`
- `npx tsc --noEmit`
- `npx expo lint`

No native/dependency changes. Pull and fully restart the installed development app once, with Metro running, to release any connection held by the old runtime. No database reset or reinstall is needed. Physical Android startup and backup/reminder review remain necessary; the automated contention tests use SQLite with native Expo APIs stubbed.

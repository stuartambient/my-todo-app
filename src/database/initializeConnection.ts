import type { SQLiteDatabase } from 'expo-sqlite';

import { INITIAL_SCHEMA, migrateDatabase } from './migrations';
import { seedDatabase } from './seed';

// Owns todo.db's user_version. Future schema/seed changes must bump this value.
export const DATABASE_VERSION = 2;
const MAX_ATTEMPTS = 5;

export function isDatabaseLock(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /\bSQLITE_(?:BUSY|LOCKED)(?:_\w+)?\b|database (?:table |schema )?is locked/i.test(
        message,
    );
}

export async function initializeConnection(
    database: SQLiteDatabase,
): Promise<void> {
    let stage = 'connection settings';
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        let transactionOpen = false;
        try {
            // This is a private connection until initialization succeeds. Never
            // borrow a cached connection that another runtime may be using.
            stage = 'connection settings';
            await database.execAsync(
                'PRAGMA busy_timeout = 1000; PRAGMA foreign_keys = ON;',
            );
            stage = 'schema version';
            const version = await database.getFirstAsync<{
                user_version: number;
            }>('PRAGMA user_version');
            if ((version?.user_version ?? 0) > DATABASE_VERSION) {
                throw new Error(
                    'This todo database needs a newer version of TodoApp.',
                );
            }
            // A healthy WAL database can be read during another connection's
            // write transaction. Do not turn every startup into a schema write.
            if (version?.user_version === DATABASE_VERSION) return;

            stage = 'journal settings';
            const journal = await database.getFirstAsync<{
                journal_mode: string;
            }>('PRAGMA journal_mode');
            if (journal?.journal_mode.toLowerCase() !== 'wal') {
                await database.execAsync('PRAGMA journal_mode = WAL;');
            }

            stage = 'upgrade lock';
            // Acquire the writer before any migration reads. This avoids
            // promoting a stale WAL snapshot after a competing writer commits.
            await database.execAsync('BEGIN IMMEDIATE');
            transactionOpen = true;
            const lockedVersion = await database.getFirstAsync<{
                user_version: number;
            }>('PRAGMA user_version');
            if ((lockedVersion?.user_version ?? 0) > DATABASE_VERSION) {
                throw new Error(
                    'This todo database needs a newer version of TodoApp.',
                );
            }
            if ((lockedVersion?.user_version ?? 0) < DATABASE_VERSION) {
                stage = 'schema upgrade';
                await database.execAsync(INITIAL_SCHEMA);
                await migrateDatabase(database);
                stage = 'default todo types';
                await seedDatabase(database);
                await database.execAsync(
                    `PRAGMA user_version = ${DATABASE_VERSION};`,
                );
            }
            stage = 'upgrade commit';
            await database.execAsync('COMMIT');
            transactionOpen = false;
            return;
        } catch (error) {
            if (transactionOpen) {
                // A failed rollback leaves an uncertain connection. Abort it;
                // the caller closes it instead of retrying inside a live tx.
                try {
                    await database.execAsync('ROLLBACK');
                } catch (rollbackError) {
                    throw new Error(
                        `Todo database initialization failed during rollback (${stage}).`,
                        { cause: rollbackError },
                    );
                }
            }
            if (!isDatabaseLock(error) || attempt === MAX_ATTEMPTS - 1) {
                throw new Error(
                    `Todo database initialization failed (${stage}): ${error instanceof Error ? error.message : String(error)}`,
                    { cause: error },
                );
            }
            // Yield to the other runtime, including native notification work.
            // Retrying the complete, rolled-back setup is safe and bounded.
            await new Promise<void>((resolve) =>
                setTimeout(resolve, 100 * 2 ** attempt),
            );
        }
    }
}

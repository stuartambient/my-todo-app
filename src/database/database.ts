import * as SQLite from 'expo-sqlite';

import { initializeConnection } from './initializeConnection';

const DATABASE_NAME = 'todo.db';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openAndInitializeDatabase(): Promise<SQLite.SQLiteDatabase> {
    const database = await SQLite.openDatabaseAsync(DATABASE_NAME, {
        useNewConnection: true,
    });
    try {
        await initializeConnection(database);
        await database.execAsync('PRAGMA busy_timeout = 5000;');
        return database;
    } catch (error) {
        // This connection belongs to this attempt. A failed initialization must
        // not leak a handle/transaction or close another runtime's connection.
        await database.closeAsync().catch(() => undefined);
        throw error;
    }
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (!databasePromise) {
        databasePromise = openAndInitializeDatabase().catch((error) => {
            // Allow a later call to retry if initialization fails.
            databasePromise = null;

            console.error('Database initialization failed:', error);
            throw error;
        });
    }

    return databasePromise;
}

export async function initializeDatabase(): Promise<void> {
    await getDatabase();
}

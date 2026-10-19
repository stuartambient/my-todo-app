import * as SQLite from 'expo-sqlite';

import { INITIAL_SCHEMA, migrateDatabase } from './migrations';
import { seedDatabase } from './seed';

const DATABASE_NAME = 'todo.db';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openAndInitializeDatabase(): Promise<SQLite.SQLiteDatabase> {
    const database = await SQLite.openDatabaseAsync(DATABASE_NAME);

    await database.execAsync(INITIAL_SCHEMA);
    await migrateDatabase(database);
    await seedDatabase(database);

    return database;
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

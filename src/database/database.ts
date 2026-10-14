import * as SQLite from 'expo-sqlite';

import { INITIAL_SCHEMA } from './migrations';

import { seedDatabase } from './seed';

const DATABASE_NAME = 'todo.db';

let database: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (database) {
        return database;
    }

    database = await SQLite.openDatabaseAsync(DATABASE_NAME);

    await database.execAsync(INITIAL_SCHEMA);

    await seedDatabase(database);

    /*     const types = await database.getAllAsync(
        'SELECT * FROM todo_types ORDER BY sort_order',
    );

    console.log('TODO TYPES:', types); */

    return database;
}

export async function initializeDatabase(): Promise<void> {
    await getDatabase();
}

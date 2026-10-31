import type { SQLiteDatabase } from 'expo-sqlite';

export const INITIAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS todo_types (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
        CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
        CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY NOT NULL,

    type_id TEXT NOT NULL,
    category_id TEXT,

    subject TEXT NOT NULL,
    notes TEXT,

    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'completed')),

    priority INTEGER NOT NULL DEFAULT 0
        CHECK (priority IN (0, 1)),

    due_date TEXT,
    due_time TEXT,

    reminder_at TEXT,

    recurrence_frequency TEXT
        CHECK (
            recurrence_frequency IS NULL
            OR recurrence_frequency IN ('day', 'week', 'month', 'year')
        ),

    recurrence_interval INTEGER
        CHECK (
            recurrence_interval IS NULL
            OR recurrence_interval > 0
        ),

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,

    FOREIGN KEY (type_id)
        REFERENCES todo_types(id),

    FOREIGN KEY (category_id)
        REFERENCES categories(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS todo_notification_sync (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO todo_notification_sync (id, revision) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS todo_notification_actions (
    response_key TEXT PRIMARY KEY NOT NULL,
    processed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_todos_status
    ON todos(status);

CREATE INDEX IF NOT EXISTS idx_todos_due_date
    ON todos(due_date);

CREATE INDEX IF NOT EXISTS idx_todos_type_id
    ON todos(type_id);

CREATE INDEX IF NOT EXISTS idx_todos_category_id
    ON todos(category_id);
`;

/**
 * Upgrade existing installations in place. The initializer calls this inside
 * its BEGIN IMMEDIATE transaction; do not open a nested transaction here.
 * CREATE TABLE IF NOT EXISTS cannot add columns to existing tables.
 */
export async function migrateDatabase(
    transaction: SQLiteDatabase,
): Promise<void> {
    await transaction.execAsync('PRAGMA busy_timeout = 5000;');
    await transaction.runAsync(
        'UPDATE todo_notification_sync SET revision = revision + 1 WHERE id = 1',
    );
    const columns = await transaction.getAllAsync<{ name: string }>(
        'PRAGMA table_info(todos)',
    );
    const existing = new Set(columns.map((column) => column.name));
    const additions = [
        [
            'recurrence_basis',
            "TEXT CHECK (recurrence_basis IS NULL OR recurrence_basis IN ('due_date', 'completion_date'))",
        ],
        ['recurrence_anchor_date', 'TEXT'],
        ['recurrence_source_id', 'TEXT'],
        ['recurrence_end_date', 'TEXT'],
    ] as const;

    for (const [name, definition] of additions) {
        if (!existing.has(name)) {
            // Both values are fixed constants above, never user input.
            await transaction.execAsync(
                `ALTER TABLE todos ADD COLUMN ${name} ${definition};`,
            );
        }
    }

    await transaction.execAsync(`
            UPDATE todos
            SET recurrence_basis = 'due_date'
            WHERE recurrence_frequency IS NOT NULL AND recurrence_basis IS NULL;

            UPDATE todos
            SET recurrence_anchor_date = due_date
            WHERE recurrence_frequency IS NOT NULL
                AND recurrence_anchor_date IS NULL;

            CREATE UNIQUE INDEX IF NOT EXISTS idx_todos_recurrence_source
                ON todos(recurrence_source_id)
                WHERE recurrence_source_id IS NOT NULL;
        `);
}

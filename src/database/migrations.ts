export const INITIAL_SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

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

CREATE INDEX IF NOT EXISTS idx_todos_status
    ON todos(status);

CREATE INDEX IF NOT EXISTS idx_todos_due_date
    ON todos(due_date);

CREATE INDEX IF NOT EXISTS idx_todos_type_id
    ON todos(type_id);

CREATE INDEX IF NOT EXISTS idx_todos_category_id
    ON todos(category_id);
`;

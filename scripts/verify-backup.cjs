// Integration check: Node 24+; run `node scripts/verify-reminders.cjs`.
// Uses a real temporary SQLite file and application code; replaces only native APIs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const os = require('node:os');
const databaseDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'todo-backup-'),
);
const databaseFilename = path.join(databaseDirectory, 'todo.db');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let checks = 0;
const check = (name, fn) => {
    fn();
    checks += 1;
    console.log('PASS', name);
};

class SQLiteAdapter {
    constructor() {
        this.db = new DatabaseSync(databaseFilename);
    }
    async execAsync(sql) {
        this.db.exec(sql);
    }
    async runAsync(sql, ...params) {
        const result = this.db.prepare(sql).run(...params);
        return {
            changes: Number(result.changes),
            lastInsertRowId: Number(result.lastInsertRowid),
        };
    }
    async getFirstAsync(sql, ...params) {
        return this.db.prepare(sql).get(...params) ?? null;
    }
    async getAllAsync(sql, ...params) {
        return this.db.prepare(sql).all(...params);
    }
    async withExclusiveTransactionAsync(callback) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            await callback(this);
            this.db.exec('COMMIT');
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
}
const database = new SQLiteAdapter();
const reconciliations = [];
const realLoad = Module._load;
Module._load = function (request, parent, main) {
    if (request === 'expo-crypto') return { randomUUID };
    if (request === 'expo-sqlite')
        return { openDatabaseAsync: async () => database };
    if (request === '@/services/reminderDeliveryHistory')
        return { maintainDeliveryHistory: async () => {} };
    if (request === '@/services/todoReminders')
        return {
            reconcileTodoReminders: async (todos) => {
                reconciliations.push(todos);
            },
            reportReminderError: (error) => {
                throw error;
            },
            requestTodoReminderPermission: async () => true,
        };
    if (request.startsWith('@/'))
        request = path.join(root, 'src', request.slice(2));
    return realLoad.call(this, request, parent, main);
};
require.extensions['.ts'] = (module, filename) => {
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText;
    module._compile(compiled, filename);
};
const repo = require(path.join(root, 'src/repositories/todo.repository.ts'));
const backupRepo = require(
    path.join(root, 'src/repositories/backup.repository.ts'),
);
const { getDatabase } = require(path.join(root, 'src/database/database.ts'));
const { seedDatabase } = require(path.join(root, 'src/database/seed.ts'));

async function main() {
    await getDatabase();
    const type = await database.getFirstAsync(
        "SELECT id FROM todo_types WHERE name = 'Payment'",
    );
    const values = {
        typeId: type.id,
        categoryId: null,
        subject: 'Monthly bill',
        notes: 'Résumé ✓',
        priority: 'high',
        dueDate: '2035-01-31',
        dueTime: '00:00',
        reminderAt: '2035-01-30T12:00:00.000Z',
        recurrenceFrequency: 'month',
        recurrenceInterval: 1,
        recurrenceBasis: 'due_date',
    };
    const first = await repo.createTodo(values);
    await repo.completeTodo(first.id);
    const overdue = await repo.createTodo({
        ...values,
        subject: 'Old reminder',
        reminderAt: '2020-01-01T12:00:00.000Z',
        recurrenceFrequency: null,
        recurrenceInterval: null,
        recurrenceBasis: null,
    });
    const backup = await backupRepo.createBackup();
    check(
        'export includes open/completed rows, notes, midnight and recurrence lineage',
        () => {
            assert.equal(backup.todos.length, 3);
            assert.equal(
                backup.todos.find((row) => row.id === first.id).status,
                'completed',
            );
            assert.equal(
                backup.todos.find(
                    (row) => row.recurrence_source_id === first.id,
                ).recurrence_anchor_date,
                '2035-01-31',
            );
            assert.equal(backup.todos[0].notes, 'Résumé ✓');
            assert.equal(backup.todos[0].due_time, '00:00');
        },
    );
    check(
        'notification receipts and runtime synchronization state stay out of the portable file',
        () => {
            assert.deepEqual(
                Object.keys(backup).sort(),
                [
                    'format',
                    'version',
                    'exportedAt',
                    'todos',
                    'todoTypes',
                    'categories',
                ].sort(),
            );
        },
    );
    const duplicate = await backupRepo.restoreBackup(backup);
    check('same backup adds zero rows', () =>
        assert.deepEqual(duplicate, { added: 0, skipped: 3 }),
    );
    await repo.updateTodo(overdue.id, {
        ...values,
        subject: 'Locally edited',
        reminderAt: null,
    });
    await backupRepo.restoreBackup(backup);
    check('restore preserves a newer local edit', () =>
        assert.equal(
            database.db
                .prepare('SELECT subject FROM todos WHERE id = ?')
                .get(overdue.id).subject,
            'Locally edited',
        ),
    );
    await database.execAsync('DELETE FROM todos; DELETE FROM todo_types;');
    await seedDatabase(database);
    const freshType = await database.getFirstAsync(
        "SELECT id FROM todo_types WHERE name = 'Payment'",
    );
    assert.notEqual(freshType.id, type.id);
    const restored = await backupRepo.restoreBackup(backup);
    check(
        'fresh installation restores all rows and maps seeded type IDs by name',
        () => {
            assert.deepEqual(restored, { added: 3, skipped: 0 });
            assert.equal(
                database.db
                    .prepare('SELECT COUNT(*) AS n FROM todo_types')
                    .get().n,
                8,
            );
            assert.equal(
                database.db
                    .prepare('SELECT type_id FROM todos WHERE id = ?')
                    .get(first.id).type_id,
                freshType.id,
            );
            for (const expected of backup.todos) {
                assert.deepEqual(
                    {
                        ...database.db
                            .prepare('SELECT * FROM todos WHERE id = ?')
                            .get(expected.id),
                    },
                    { ...expected, type_id: freshType.id },
                );
            }
        },
    );
    check('reminders are reconciled once after committed restore', () => {
        assert.equal(reconciliations.at(-1).length, 3);
    });
    const successor = await database.getFirstAsync(
        'SELECT id FROM todos WHERE recurrence_source_id = ?',
        first.id,
    );
    await repo.completeTodo(successor.id);
    check('restored recurrence retains the 31st anchor after February', () =>
        assert.equal(
            database.db
                .prepare(
                    'SELECT due_date FROM todos WHERE recurrence_source_id = ?',
                )
                .get(successor.id).due_date,
            '2035-03-31',
        ),
    );
    const empty = { ...backup, todos: [], categories: [], todoTypes: [] };
    const emptyResult = await backupRepo.restoreBackup(empty);
    check('empty restore is harmless', () =>
        assert.deepEqual(emptyResult, { added: 0, skipped: 0 }),
    );
    const conflict = {
        ...backup,
        todos: [
            {
                ...backup.todos.find(
                    (row) => row.recurrence_source_id === first.id,
                ),
                id: 'competing-successor',
            },
        ],
    };
    conflict.todos.unshift({
        ...conflict.todos[0],
        id: 'conflicting-grandchild',
        recurrence_source_id: 'competing-successor',
    });
    const conflictResult = await backupRepo.restoreBackup(conflict);
    check('repeat conflicts skip descendants regardless of file order', () =>
        assert.deepEqual(conflictResult, { added: 0, skipped: 2 }),
    );
    const extraType = {
        ...backup.todoTypes[0],
        id: freshType.id,
        name: 'Imported custom type',
        active: 0,
    };
    const category = {
        id: 'category',
        name: 'Imported category',
        active: 0,
        sort_order: 1,
        created_at: extraType.created_at,
        updated_at: extraType.updated_at,
    };
    const extra = {
        ...backup,
        todoTypes: [extraType],
        categories: [category],
        todos: [
            {
                ...backup.todos[0],
                id: 'extra-row',
                type_id: extraType.id,
                category_id: category.id,
                recurrence_source_id: null,
            },
        ],
    };
    await backupRepo.restoreBackup(extra);
    check(
        'custom/inactive metadata survives ID collisions and category references',
        () => {
            const type = database.db
                .prepare('SELECT * FROM todo_types WHERE name = ?')
                .get(extraType.name);
            assert.notEqual(type.id, freshType.id);
            assert.equal(type.active, 0);
            const row = database.db
                .prepare('SELECT type_id,category_id FROM todos WHERE id = ?')
                .get('extra-row');
            assert.equal(row.type_id, type.id);
            assert.equal(row.category_id, category.id);
        },
    );
    await repo.deleteTodo(overdue.id);
    const recovered = await backupRepo.restoreBackup(backup);
    check(
        'a deleted todo can be recovered without duplicating the others',
        () => assert.deepEqual(recovered, { added: 1, skipped: 2 }),
    );
    await database.execAsync(
        "CREATE TRIGGER fail_backup_insert BEFORE INSERT ON todos WHEN NEW.id = 'broken' BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END;",
    );
    const before = await backupRepo.createBackup();
    const now = new Date().toISOString();
    const failure = {
        ...backup,
        todoTypes: [
            ...backup.todoTypes,
            {
                ...backup.todoTypes[0],
                id: 'custom',
                name: 'Custom imported type',
                created_at: now,
                updated_at: now,
            },
        ],
        todos: [
            {
                ...backup.todos[0],
                id: 'new-good',
                type_id: 'custom',
                recurrence_source_id: null,
            },
            { ...backup.todos[0], id: 'broken', recurrence_source_id: null },
        ],
    };
    const syncCount = reconciliations.length;
    await assert.rejects(
        () => backupRepo.restoreBackup(failure),
        /simulated disk failure/,
    );
    const after = await backupRepo.createBackup();
    check(
        'mid-import failure rolls back todos and types together; no alarm side effects',
        () => {
            assert.deepEqual(after.todos, before.todos);
            assert.deepEqual(after.todoTypes, before.todoTypes);
            assert.equal(reconciliations.length, syncCount);
        },
    );
    const malformed = {
        ...backup,
        todos: [{ ...backup.todos[0], type_id: 'missing' }],
    };
    assert.throws(() => backupRepo.restoreBackup(malformed), /not a valid/);
    check('malformed backup changes nothing', () =>
        assert.equal(reconciliations.length, syncCount),
    );
    console.log(`${checks} backup integration checks passed.`);
}
main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => {
        database.db.close();
        fs.rmSync(databaseDirectory, { recursive: true, force: true });
    });

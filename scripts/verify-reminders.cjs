// Integration check: Node 24+; run `node scripts/verify-reminders.cjs`.
// Uses real in-memory SQLite and application code; replaces only native APIs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
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
        this.db = new DatabaseSync(':memory:');
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
const pending = new Map();
let failScheduling = false;
let failCancellation = false;
let granted = true;
let exactAccess = true;
let permissionRequests = 0;
const native = {
    AndroidImportance: { HIGH: 6, NONE: 2 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    getAllScheduledNotificationsAsync: async () => [...pending.values()],
    getPresentedNotificationsAsync: async () => [],
    dismissNotificationAsync: async () => {},
    setNotificationChannelAsync: async () => null,
    getNotificationChannelAsync: async () => null,
    getPermissionsAsync: async () => ({ granted, canAskAgain: true }),
    requestPermissionsAsync: async () => {
        permissionRequests += 1;
        return { granted, canAskAgain: true };
    },
    scheduleNotificationAsync: async (request) => {
        if (failScheduling)
            throw new Error('Simulated native scheduling failure');
        pending.set(request.identifier, request);
        return request.identifier;
    },
    cancelScheduledNotificationAsync: async (id) => {
        if (failCancellation)
            throw new Error('Simulated native cancellation failure');
        pending.delete(id);
    },
};
const realLoad = Module._load;
Module._load = function (request, parent, main) {
    if (request === 'expo-modules-core')
        return {
            requireOptionalNativeModule: () => ({
                canScheduleExactAlarmsAsync: async () => exactAccess,
            }),
        };
    if (request === 'expo-crypto') return { randomUUID };
    if (request === 'expo-sqlite')
        return { openDatabaseAsync: async () => database };
    if (request === 'react-native') return { Platform: { OS: 'android' } };
    if (
        request === './localNotifications' &&
        parent.filename.endsWith('todoReminders.ts')
    )
        return native;
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
const repository = require(
    path.join(root, 'src/repositories/todo.repository.ts'),
);
const { getDatabase } = require(path.join(root, 'src/database/database.ts'));
const { getReminderNotice } = require(
    path.join(root, 'src/services/todoReminders.ts'),
);
const idFor = (id) => `todo-reminder:${id}`;

async function main() {
    await getDatabase();
    const type = await database.getFirstAsync(
        'SELECT id FROM todo_types LIMIT 1',
    );
    const reminderAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const dueDate = new Date().toISOString().slice(0, 10);
    const values = {
        typeId: type.id,
        categoryId: null,
        subject: 'Integration payment',
        notes: null,
        priority: 'normal',
        dueDate,
        reminderAt,
        recurrenceFrequency: null,
        recurrenceInterval: null,
        recurrenceBasis: null,
    };
    const first = await repository.createTodo(values);
    check('creating a todo schedules its saved reminder', () => {
        assert.equal(
            pending.get(idFor(first.id)).trigger.date.toISOString(),
            reminderAt,
        );
        assert.equal(
            pending.get(idFor(first.id)).content.title,
            values.subject,
        );
    });
    const originalRequest = pending.get(idFor(first.id));
    await repository.refreshTodoReminders();
    check(
        'resume re-arms a saved future reminder under the same identifier',
        () => {
            assert.notEqual(pending.get(idFor(first.id)), originalRequest);
            assert.equal(pending.size, 1);
        },
    );
    exactAccess = false;
    await repository.refreshTodoReminders();
    check(
        'revoking exact access restores approximate delivery from SQLite',
        () => {
            assert.equal(
                pending.get(idFor(first.id)).content.data.reminderTiming,
                'approximate',
            );
            assert.equal(getReminderNotice().status, 'approximate');
        },
    );
    exactAccess = true;
    await repository.refreshTodoReminders();
    check(
        'granting exact access upgrades the existing saved reminder without duplicates',
        () => {
            assert.equal(
                pending.get(idFor(first.id)).content.data.reminderTiming,
                'exact',
            );
            assert.equal(pending.size, 1);
        },
    );

    const changedTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    await repository.updateTodo(first.id, {
        ...values,
        subject: 'Changed subject',
        reminderAt: changedTime,
    });
    check(
        'editing replaces the reminder time and subject without duplicates',
        () => {
            assert.equal(pending.size, 1);
            assert.equal(
                pending.get(idFor(first.id)).trigger.date.toISOString(),
                changedTime,
            );
            assert.equal(
                pending.get(idFor(first.id)).content.title,
                'Changed subject',
            );
        },
    );
    await repository.completeTodo(first.id);
    check('completion cancels the saved reminder', () =>
        assert.equal(pending.has(idFor(first.id)), false),
    );
    await repository.reopenTodo(first.id);
    check('reopening restores a reminder that is still in the future', () =>
        assert.equal(pending.has(idFor(first.id)), true),
    );
    await repository.updateTodo(first.id, { ...values, reminderAt: null });
    check('clearing the reminder cancels its request', () =>
        assert.equal(pending.has(idFor(first.id)), false),
    );
    await repository.updateTodo(first.id, values);
    await repository.deleteTodo(first.id);
    check('deleting the todo removes its notification', () =>
        assert.equal(pending.has(idFor(first.id)), false),
    );

    const recurringValues = {
        ...values,
        recurrenceFrequency: 'month',
        recurrenceInterval: 1,
        recurrenceBasis: 'due_date',
    };
    const recurring = await repository.createTodo(recurringValues);
    await repository.completeTodo(recurring.id);
    const successor = await database.getFirstAsync(
        'SELECT * FROM todos WHERE recurrence_source_id = ?',
        recurring.id,
    );
    check('recurrence commits history and schedules the new occurrence', () => {
        assert.equal(pending.has(idFor(recurring.id)), false);
        assert.equal(pending.has(idFor(successor.id)), true);
        assert.equal(
            pending.get(idFor(successor.id)).trigger.date.toISOString(),
            successor.reminder_at,
        );
    });
    await repository.reopenTodo(recurring.id);
    await repository.completeTodo(recurring.id);
    check(
        'reopening/recompleting does not duplicate the future occurrence or reminder',
        () => {
            assert.equal(
                database.db
                    .prepare(
                        'SELECT count(*) AS count FROM todos WHERE recurrence_source_id = ?',
                    )
                    .get(recurring.id).count,
                1,
            );
            assert.equal(
                [...pending.values()].filter(
                    (request) => request.content.data.todoId === successor.id,
                ).length,
                1,
            );
        },
    );
    const rollback = await repository.createTodo(recurringValues);
    const beforeFailure = [...pending.keys()].sort();
    await database.execAsync(
        `CREATE TRIGGER reject_completion BEFORE UPDATE OF status ON todos WHEN OLD.id = '${rollback.id}' AND NEW.status = 'completed' BEGIN SELECT RAISE(ABORT, 'Simulated database failure'); END;`,
    );
    await assert.rejects(
        repository.completeTodo(rollback.id),
        /Simulated database failure/,
    );
    check(
        'rolled-back completion does not alter scheduled notifications',
        () => {
            assert.equal(
                database.db
                    .prepare('SELECT status FROM todos WHERE id = ?')
                    .get(rollback.id).status,
                'open',
            );
            assert.deepEqual([...pending.keys()].sort(), beforeFailure);
        },
    );
    await database.execAsync('DROP TRIGGER reject_completion');

    failScheduling = true;
    const saved = await repository.createTodo({
        ...values,
        subject: 'Native failure',
    });
    check('a native scheduling failure still returns the saved todo', () => {
        assert.equal(
            database.db
                .prepare('SELECT subject FROM todos WHERE id = ?')
                .get(saved.id).subject,
            'Native failure',
        );
        assert.equal(getReminderNotice().status, 'error');
    });
    failScheduling = false;
    await repository.refreshTodoReminders();
    check('a retry restores the unscheduled reminder from SQLite', () => {
        assert.equal(pending.has(idFor(saved.id)), true);
        assert.equal(getReminderNotice().status, 'ready');
    });
    // A later snapshot must not overwrite the most recent save.
    const latest = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    await Promise.all([
        repository.updateTodo(saved.id, { ...values, reminderAt: changedTime }),
        repository.refreshTodoReminders(),
        repository.updateTodo(saved.id, { ...values, reminderAt: latest }),
    ]);
    check(
        'foreground refresh and overlapping writes preserve the newest reminder',
        () => {
            assert.equal(
                pending.get(idFor(saved.id)).trigger.date.toISOString(),
                latest,
            );
        },
    );

    failCancellation = true;
    await repository.deleteTodo(saved.id);
    check(
        'native cancellation failure does not report a successful database delete as failed',
        () => {
            assert.equal(
                database.db
                    .prepare('SELECT * FROM todos WHERE id = ?')
                    .get(saved.id),
                undefined,
            );
            assert.equal(getReminderNotice().status, 'error');
        },
    );
    failCancellation = false;
    await repository.refreshTodoReminders();
    check(
        'recovery removes the orphaned reminder after a failed cancellation',
        () => assert.equal(pending.has(idFor(saved.id)), false),
    );

    granted = false;
    const denied = await repository.createTodo(values);
    check('denied notification permission does not discard the todo', () => {
        assert.ok(
            database.db
                .prepare('SELECT * FROM todos WHERE id = ?')
                .get(denied.id),
        );
        assert.equal(pending.has(idFor(denied.id)), false);
        assert.equal(getReminderNotice().status, 'permission-denied');
        assert.ok(permissionRequests > 0);
    });
    granted = true;
    await repository.refreshTodoReminders();
    check(
        'returning from settings restores future reminders without another save',
        () => assert.equal(pending.has(idFor(denied.id)), true),
    );

    const expired = await repository.createTodo({
        ...values,
        reminderAt: new Date(Date.now() - 60_000).toISOString(),
    });
    check(
        'past reminder times are saved without generating immediate catch-up alerts',
        () => {
            assert.ok(
                database.db
                    .prepare('SELECT * FROM todos WHERE id = ?')
                    .get(expired.id),
            );
            assert.equal(pending.has(idFor(expired.id)), false);
        },
    );
    console.log(`\n${checks} SQLite integration checks passed.`);
    database.db.close();
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

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
    path.join(os.tmpdir(), 'todo-reminder-restore-'),
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
const competitor = new DatabaseSync(databaseFilename);
const presented = new Map();
const pending = new Map();
const delivered = new Map();
const posted = [];
let granted = true;
let blockedChannel = false;
let failId = null;
let beforePermission = null;
let checkRestoreLock = false;
let restoreLockChecked = false;
const key = (id, at) => JSON.stringify([id, at]);
const nativeHistory = {
    canScheduleExactAlarmsAsync: async () => true,
    getDeliveredRemindersAsync: async () => {
        for (const notification of presented.values()) {
            const data = notification.request.content.data;
            delivered.set(key(data.todoId, data.reminderAt), {
                todoId: data.todoId,
                reminderAt: data.reminderAt,
                deliveredAt: notification.date,
            });
        }
        return [...delivered.values()];
    },
    retainDeliveredRemindersAsync: async (keep) => {
        for (const id of delivered.keys())
            if (!keep.includes(id)) delivered.delete(id);
    },
};
const native = {
    AndroidImportance: { HIGH: 6, NONE: 2 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    getAllScheduledNotificationsAsync: async () => [...pending.values()],
    getPresentedNotificationsAsync: async () => [...presented.values()],
    dismissNotificationAsync: async (id) => {
        presented.delete(id);
    },
    cancelScheduledNotificationAsync: async (id) => {
        pending.delete(id);
    },
    setNotificationChannelAsync: async () => null,
    getNotificationChannelAsync: async () => ({
        importance: blockedChannel ? 2 : 6,
    }),
    getPermissionsAsync: async () => {
        if (beforePermission) {
            const callback = beforePermission;
            beforePermission = null;
            callback();
        }
        return { granted, canAskAgain: false };
    },
    scheduleNotificationAsync: async (request) => {
        if (request.identifier === failId)
            throw new Error('Simulated restore failure');
        if (request.content.data.reminderRestored) {
            if (checkRestoreLock) {
                assert.throws(
                    () =>
                        competitor.exec(
                            'UPDATE todo_notification_sync SET revision=revision+1 WHERE id=1',
                        ),
                    /database is locked/,
                );
                restoreLockChecked = true;
            }
            presented.set(request.identifier, { date: Date.now(), request });
            posted.push(request);
        } else pending.set(request.identifier, request);
        return request.identifier;
    },
};
const realLoad = Module._load;
Module._load = function (request, parent, main) {
    if (request === 'expo-crypto') return { randomUUID };
    if (request === 'expo-sqlite')
        return { openDatabaseAsync: async () => database };
    if (request === 'expo-modules-core')
        return { requireOptionalNativeModule: () => nativeHistory };
    if (request === 'react-native')
        return { Platform: { OS: 'android', Version: 37 } };
    if (
        request === './localNotifications' ||
        request === '@/services/localNotifications'
    )
        return native;
    if (
        request === './notificationActionRegistration' ||
        request === '@/services/notificationActionRegistration'
    )
        return { configureReminderActions: async () => {} };
    if (request.startsWith('@/'))
        request = path.join(root, 'src', request.slice(2));
    return realLoad.call(this, request, parent, main);
};
require.extensions['.ts'] = (module, filename) =>
    module._compile(
        ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
            },
        }).outputText,
        filename,
    );
const todos = require('../src/repositories/todo.repository.ts');
const restore = require('../src/repositories/reminderRestore.repository.ts');
const getDatabase = require('../src/database/database.ts').getDatabase;
const idFor = (todo) => 'todo-reminder:' + todo.id;
function evidence(todo, at = todo.reminderAt) {
    delivered.set(key(todo.id, at), {
        todoId: todo.id,
        reminderAt: at,
        deliveredAt: Date.now() - 1000,
    });
}
function card(todo) {
    return {
        date: Date.now() - 1000,
        request: {
            identifier: idFor(todo),
            content: {
                title: todo.subject,
                data: {
                    todoId: todo.id,
                    reminderAt: todo.reminderAt,
                    reminderVersion: 1,
                },
            },
        },
    };
}
async function main() {
    await getDatabase();
    const type = await database.getFirstAsync(
        'SELECT id FROM todo_types LIMIT 1',
    );
    const past = new Date(Date.now() - 3600000).toISOString();
    const base = {
        typeId: type.id,
        categoryId: null,
        subject: 'Restore candidate',
        notes: 'Keep this note',
        priority: 'high',
        dueDate: '2035-01-31',
        dueTime: '15:00',
        reminderAt: past,
        recurrenceFrequency: null,
        recurrenceInterval: null,
        recurrenceBasis: null,
    };
    const missing = await todos.createTodo(base);
    const repeating = await todos.createTodo({
        ...base,
        subject: 'Repeating',
        recurrenceFrequency: 'month',
        recurrenceInterval: 1,
        recurrenceBasis: 'due_date',
    });
    const shown = await todos.createTodo({ ...base, subject: 'Already shown' });
    const late = await todos.createTodo({
        ...base,
        subject: 'Pending original',
    });
    const future = await todos.createTodo({
        ...base,
        subject: 'Future',
        reminderAt: new Date(Date.now() + 3600000).toISOString(),
    });
    const done = await todos.createTodo({ ...base, subject: 'Completed' });
    await todos.completeTodo(done.id);
    const changed = await todos.createTodo({
        ...base,
        subject: 'Changed time',
        reminderAt: new Date(Date.now() - 1800000).toISOString(),
    });
    await todos.createTodo({ ...base, subject: 'Never verified' });
    presented.set(idFor(shown), card(shown));
    pending.set(idFor(late), {
        identifier: idFor(late),
        content: { data: { reminderAt: past } },
    });
    for (const todo of [missing, repeating, future, done]) evidence(todo);
    evidence(changed, past);
    const preview = await restore.getReminderRestorePreview();
    check(
        'preview requires delivery evidence, skips completed/future/changed reminders and existing/pending cards',
        () =>
            assert.deepEqual(preview, {
                eligible: 2,
                alreadyVisible: 1,
                pending: 1,
                unverified: 2,
            }),
    );
    check(
        'preview records legacy cards that are still presented without posting anything',
        () => {
            assert(delivered.has(key(shown.id, shown.reminderAt)));
            assert.equal(posted.length, 0);
        },
    );
    const before = await database.getAllAsync(
        'SELECT * FROM todos ORDER BY id',
    );
    checkRestoreLock = true;
    const result = await restore.restoreReminderNotifications();
    checkRestoreLock = false;
    const after = await database.getAllAsync('SELECT * FROM todos ORDER BY id');
    check(
        'restoration posts two silent actionable cards without changing any todo field',
        () => {
            assert.equal(result.restored, 2);
            assert.equal(result.failed, 0);
            assert.deepEqual(after, before);
            for (const request of posted) {
                assert.equal(request.content.sound, false);
                assert.equal(request.content.autoDismiss, false);
                assert.equal(
                    request.content.categoryIdentifier,
                    'todoReminderActions',
                );
                assert.equal(request.content.data.reminderAt, past);
                assert.equal(request.content.data.reminderRestored, true);
                assert.deepEqual(request.trigger, {
                    channelId: 'todoapp-reminders',
                });
            }
        },
    );
    check('native posting excludes competing SQLite mutations', () =>
        assert.equal(restoreLockChecked, true),
    );
    check('future and delayed original alarm requests are retained', () => {
        assert(pending.has(idFor(future)));
        assert(pending.has(idFor(late)));
    });
    const repeat = await restore.restoreReminderNotifications();
    check(
        'repeated restore does not duplicate cards already in the shade',
        () => {
            assert.equal(repeat.restored, 0);
            assert.equal(posted.length, 2);
        },
    );
    const snoozedCard = presented.get(idFor(missing));
    const snoozeStart = Date.now();
    await todos.applyTodoReminderAction({
        id: missing.id,
        reminderAt: past,
        notificationDate: snoozedCard.date,
        action: 'snooze',
    });
    const snoozed = await todos.getTodoById(missing.id);
    check(
        'Snooze on a restored card creates one future reminder and removes its old card',
        () => {
            assert.equal(snoozed.status, 'open');
            assert.equal(snoozed.dueTime, '15:00');
            assert(Date.parse(snoozed.reminderAt) >= snoozeStart + 600000);
            assert(!presented.has(idFor(missing)));
            assert(pending.has(idFor(missing)));
        },
    );
    const completedCard = presented.get(idFor(repeating));
    await todos.applyTodoReminderAction({
        id: repeating.id,
        reminderAt: past,
        notificationDate: completedCard.date,
        action: 'complete',
    });
    check(
        'Complete on a restored repeating card creates exactly one successor and removes its card',
        () => {
            assert.equal(
                database.db
                    .prepare('SELECT status FROM todos WHERE id=?')
                    .get(repeating.id).status,
                'completed',
            );
            assert.equal(
                database.db
                    .prepare(
                        'SELECT COUNT(*) AS n FROM todos WHERE recurrence_source_id=?',
                    )
                    .get(repeating.id).n,
                1,
            );
            assert(!presented.has(idFor(repeating)));
        },
    );
    const partialA = await todos.createTodo({ ...base, subject: 'Partial A' });
    const partialB = await todos.createTodo({ ...base, subject: 'Partial B' });
    evidence(partialA);
    evidence(partialB);
    failId = idFor(partialA);
    const originalError = console.error;
    console.error = () => {};
    const partial = await restore.restoreReminderNotifications();
    console.error = originalError;
    check(
        'partial native failure reports one success and one failure without changing todos',
        () => {
            assert.equal(partial.restored, 1);
            assert.equal(partial.failed, 1);
        },
    );
    failId = null;
    const retry = await restore.restoreReminderNotifications();
    check('retry restores only the failed card', () =>
        assert.equal(retry.restored, 1),
    );
    const race = await todos.createTodo({
        ...base,
        subject: 'Completed during permission work',
    });
    evidence(race);
    beforePermission = () => {
        assert.equal(database.db.isTransaction, false);
        database.db
            .prepare(
                "UPDATE todos SET status='completed',completed_at=?,updated_at=? WHERE id=?",
            )
            .run(new Date().toISOString(), new Date().toISOString(), race.id);
    };
    const raceResult = await restore.restoreReminderNotifications();
    check(
        'permission work holds no database lock and final restore rechecks current todo status',
        () => assert.equal(raceResult.restored, 0),
    );
    granted = false;
    await assert.rejects(
        () => restore.restoreReminderNotifications(),
        /Allow TodoApp notifications/,
    );
    granted = true;
    blockedChannel = true;
    await assert.rejects(
        () => restore.restoreReminderNotifications(),
        /Enable the Todo reminders/,
    );
    blockedChannel = false;
    check(
        'denied permission and disabled channels stop restoration clearly',
        () => assert(!presented.has(idFor(race))),
    );
    console.log(`${checks} reminder restoration checks passed.`);
}
main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => {
        competitor.close();
        database.db.close();
        fs.rmSync(databaseDirectory, { recursive: true, force: true });
    });

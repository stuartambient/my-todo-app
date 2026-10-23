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
    path.join(os.tmpdir(), 'todo-actions-'),
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
const competingConnection = new DatabaseSync(databaseFilename);
let verifySyncLock = false;
let syncLockChecked = false;
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
        if (verifySyncLock) {
            assert.throws(
                () =>
                    competingConnection
                        .prepare(
                            'UPDATE todo_notification_sync SET revision = revision + 1 WHERE id = 1',
                        )
                        .run(),
                /locked/,
            );
            syncLockChecked = true;
        }
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
    if (request === './notificationActionRegistration')
        return { configureReminderActions: async () => {} };
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
        dueTime: null,
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

    // Actual SQLite mutations used by both the UI response listener and headless task.
    const actionTodo = await repository.createTodo({
        ...values,
        notes: 'Keep my notes',
        priority: 'high',
    });
    const actionInput = {
        id: actionTodo.id,
        reminderAt,
        notificationDate: 1,
        action: 'snooze',
    };
    const beforeSnooze = Date.now();
    const snoozeResult = await repository.applyTodoReminderAction(actionInput);
    let snoozed = await repository.getTodoById(actionTodo.id);
    const snoozedTime = snoozed.reminderAt;
    check(
        'Snooze changes only the reminder by ten minutes from processing time',
        () => {
            assert.equal(snoozeResult, 'snoozed');
            assert.ok(Date.parse(snoozedTime) >= beforeSnooze + 600_000);
            assert.ok(Date.parse(snoozedTime) <= Date.now() + 600_000);
            for (const key of [
                'dueDate',
                'dueTime',
                'status',
                'notes',
                'priority',
                'typeId',
                'recurrenceFrequency',
                'recurrenceInterval',
                'recurrenceBasis',
            ]) {
                assert.equal(snoozed[key], actionTodo[key]);
            }
            assert.equal(
                pending.get(idFor(actionTodo.id)).trigger.date.toISOString(),
                snoozedTime,
            );
        },
    );
    await repository.applyTodoReminderAction(actionInput);
    check('duplicate Snooze delivery does not move the reminder again', () => {
        assert.equal(
            database.db
                .prepare('SELECT reminder_at FROM todos WHERE id = ?')
                .get(actionTodo.id).reminder_at,
            snoozedTime,
        );
    });
    const conflicting = await repository.applyTodoReminderAction({
        ...actionInput,
        action: 'complete',
    });
    check(
        'Complete and Snooze racing for the same card apply only the first action',
        () => {
            assert.equal(conflicting, 'ignored');
            assert.equal(
                database.db
                    .prepare('SELECT status FROM todos WHERE id = ?')
                    .get(actionTodo.id).status,
                'open',
            );
        },
    );
    const stale = await repository.applyTodoReminderAction({
        ...actionInput,
        notificationDate: 2,
        action: 'complete',
    });
    check(
        'an old reminder time cannot complete an edited or snoozed todo',
        () => {
            assert.equal(stale, 'ignored');
            assert.equal(
                database.db
                    .prepare('SELECT status FROM todos WHERE id = ?')
                    .get(actionTodo.id).status,
                'open',
            );
        },
    );
    const completedAction = {
        id: actionTodo.id,
        reminderAt: snoozedTime,
        notificationDate: 3,
        action: 'complete',
    };
    const completedResult =
        await repository.applyTodoReminderAction(completedAction);
    check(
        'Complete from the next notification commits completion and cancels its alarm',
        () => {
            assert.equal(completedResult, 'completed');
            assert.equal(
                database.db
                    .prepare('SELECT status FROM todos WHERE id = ?')
                    .get(actionTodo.id).status,
                'completed',
            );
            assert.equal(pending.has(idFor(actionTodo.id)), false);
        },
    );
    await repository.reopenTodo(actionTodo.id);
    const replayResult =
        await repository.applyTodoReminderAction(completedAction);
    check(
        'replaying a consumed Complete does not complete a subsequently reopened todo',
        () => {
            assert.equal(replayResult, 'ignored');
            assert.equal(
                database.db
                    .prepare('SELECT status FROM todos WHERE id = ?')
                    .get(actionTodo.id).status,
                'open',
            );
        },
    );
    await repository.deleteTodo(actionTodo.id);
    const deletedResult = await repository.applyTodoReminderAction({
        ...completedAction,
        notificationDate: 4,
    });
    check('actions on a deleted todo are harmless', () => {
        assert.equal(deletedResult, 'ignored');
    });

    const repeatingActionTodo = await repository.createTodo({
        ...values,
        recurrenceFrequency: 'day',
        recurrenceInterval: 1,
        recurrenceBasis: 'due_date',
    });
    const repeatingAction = {
        id: repeatingActionTodo.id,
        reminderAt,
        notificationDate: 5,
        action: 'complete',
    };
    await Promise.all([
        repository.applyTodoReminderAction(repeatingAction),
        repository.applyTodoReminderAction(repeatingAction),
    ]);
    check(
        'duplicate recurring Complete creates exactly one successor and schedules it',
        () => {
            const successors = database.db
                .prepare('SELECT * FROM todos WHERE recurrence_source_id = ?')
                .all(repeatingActionTodo.id);
            assert.equal(successors.length, 1);
            assert.equal(pending.has(idFor(repeatingActionTodo.id)), false);
            assert.equal(pending.has(idFor(successors[0].id)), true);
        },
    );

    const retryActionTodo = await repository.createTodo({
        ...values,
        recurrenceFrequency: 'day',
        recurrenceInterval: 1,
        recurrenceBasis: 'due_date',
    });
    const retryAction = {
        id: retryActionTodo.id,
        reminderAt,
        notificationDate: 6,
        action: 'complete',
    };
    await database.runAsync(
        'UPDATE todos SET due_date = NULL WHERE id = ?',
        retryActionTodo.id,
    );
    await assert.rejects(
        repository.applyTodoReminderAction(retryAction),
        /due date/,
    );
    check(
        'a failed recurrence rolls back both the completion and its action receipt',
        () => {
            assert.equal(
                database.db
                    .prepare('SELECT status FROM todos WHERE id = ?')
                    .get(retryActionTodo.id).status,
                'open',
            );
            const key = JSON.stringify([
                retryAction.id,
                retryAction.reminderAt,
                retryAction.notificationDate,
            ]);
            assert.equal(
                database.db
                    .prepare(
                        'SELECT * FROM todo_notification_actions WHERE response_key = ?',
                    )
                    .get(key),
                undefined,
            );
        },
    );
    await database.runAsync(
        'UPDATE todos SET due_date = ? WHERE id = ?',
        dueDate,
        retryActionTodo.id,
    );
    const retriedAction = await repository.applyTodoReminderAction(retryAction);
    check('the same action can retry after a rolled-back failure', () => {
        assert.equal(retriedAction, 'completed');
    });

    const schedulingActionTodo = await repository.createTodo(values);
    const schedulingAction = {
        id: schedulingActionTodo.id,
        reminderAt,
        notificationDate: 7,
        action: 'snooze',
    };
    failScheduling = true;
    await repository.applyTodoReminderAction(schedulingAction);
    const savedSnooze = (await repository.getTodoById(schedulingActionTodo.id))
        .reminderAt;
    failScheduling = false;
    await repository.applyTodoReminderAction(schedulingAction);
    check(
        'a duplicate repairs failed native scheduling without snoozing a second time',
        () => {
            assert.equal(
                database.db
                    .prepare('SELECT reminder_at FROM todos WHERE id = ?')
                    .get(schedulingActionTodo.id).reminder_at,
                savedSnooze,
            );
            assert.equal(
                pending
                    .get(idFor(schedulingActionTodo.id))
                    .trigger.date.toISOString(),
                savedSnooze,
            );
        },
    );

    verifySyncLock = true;
    await repository.refreshTodoReminders();
    verifySyncLock = false;
    check(
        'native alarm synchronization excludes a writer from a separate SQLite connection',
        () => {
            assert.equal(syncLockChecked, true);
        },
    );
    check('the cross-runtime lock is released after reconciliation', () => {
        assert.doesNotThrow(() =>
            competingConnection
                .prepare(
                    'UPDATE todo_notification_sync SET revision = revision + 1 WHERE id = 1',
                )
                .run(),
        );
    });
    const pendingBeforeDueTime = pending.size;
    const requestsBeforeDueTime = permissionRequests;
    const timedValues = {
        ...values,
        subject: 'Timed appointment',
        dueDate: '2030-06-15',
        dueTime: '15:05',
        reminderAt: null,
    };
    const timed = await repository.createTodo(timedValues);
    check(
        'a due time round-trips through SQLite without creating a reminder',
        () => {
            assert.equal(timed.dueTime, '15:05');
            assert.equal(timed.reminderAt, null);
            assert.equal(pending.size, pendingBeforeDueTime);
            assert.equal(permissionRequests, requestsBeforeDueTime);
        },
    );
    await repository.updateTodo(timed.id, { ...timedValues, dueTime: '00:00' });
    check('editing a due time stores midnight correctly', () => {
        assert.equal(
            database.db
                .prepare('SELECT due_time FROM todos WHERE id = ?')
                .get(timed.id).due_time,
            '00:00',
        );
    });
    await repository.updateTodo(timed.id, { ...timedValues, reminderAt });
    const timedReminder = pending.get(idFor(timed.id));
    await repository.updateTodo(timed.id, {
        ...timedValues,
        dueTime: '18:30',
        reminderAt,
    });
    check(
        'changing only the due time preserves the separately scheduled reminder',
        () => {
            assert.equal(pending.get(idFor(timed.id)), timedReminder);
            assert.equal(
                database.db
                    .prepare('SELECT reminder_at FROM todos WHERE id = ?')
                    .get(timed.id).reminder_at,
                reminderAt,
            );
        },
    );
    await repository.updateTodo(timed.id, {
        ...timedValues,
        dueTime: null,
        reminderAt,
    });
    check('clearing a due time keeps the date and reminder', () => {
        const row = database.db
            .prepare('SELECT * FROM todos WHERE id = ?')
            .get(timed.id);
        assert.equal(row.due_time, null);
        assert.equal(row.due_date, timedValues.dueDate);
        assert.equal(row.reminder_at, reminderAt);
    });
    await repository.updateTodo(timed.id, {
        ...timedValues,
        dueDate: null,
        dueTime: null,
        reminderAt,
    });
    check('an undated todo can still have its independent reminder', () => {
        assert.equal(pending.get(idFor(timed.id)), timedReminder);
    });
    await assert.rejects(
        repository.updateTodo(timed.id, { ...timedValues, dueDate: null }),
    );
    check(
        'an invalid time-without-date save leaves the previous row intact',
        () => {
            const row = database.db
                .prepare('SELECT * FROM todos WHERE id = ?')
                .get(timed.id);
            assert.equal(row.due_date, null);
            assert.equal(row.due_time, null);
            assert.equal(row.reminder_at, reminderAt);
        },
    );

    const orderValues = { ...timedValues, dueDate: '2031-06-15' };
    const dateOnly = await repository.createTodo({
        ...orderValues,
        dueTime: null,
        priority: 'high',
    });
    const afternoon = await repository.createTodo({
        ...orderValues,
        dueTime: '15:00',
    });
    const morning = await repository.createTodo({
        ...orderValues,
        dueTime: '09:00',
    });
    const midnight = await repository.createTodo({
        ...orderValues,
        dueTime: '00:00',
    });
    const later = await repository.createTodo({
        ...orderValues,
        dueDate: '2031-06-16',
        dueTime: '08:00',
    });
    const undated = await repository.createTodo({
        ...orderValues,
        dueDate: null,
        dueTime: null,
    });
    const orderedIds = [
        midnight,
        morning,
        afternoon,
        dateOnly,
        later,
        undated,
    ].map((todo) => todo.id);
    const openOrder = (await repository.getOpenTodos())
        .filter((todo) => orderedIds.includes(todo.id))
        .map((todo) => todo.id);
    check(
        'open todos sort by date, timed hours first, date-only last, then undated',
        () => {
            assert.deepEqual(openOrder, orderedIds);
        },
    );
    await repository.completeTodo(afternoon.id);
    const completedTime = (await repository.getCompletedTodos()).find(
        (todo) => todo.id === afternoon.id,
    );
    check('completed history retains the saved due time', () => {
        assert.equal(completedTime.dueTime, '15:00');
    });

    const timedRepeatValues = {
        ...timedValues,
        dueDate: '2030-01-31',
        dueTime: '09:15',
        recurrenceFrequency: 'month',
        recurrenceInterval: 1,
        recurrenceBasis: 'due_date',
    };
    const timedRepeat = await repository.createTodo(timedRepeatValues);
    await repository.completeTodo(timedRepeat.id);
    const timedSuccessor = await database.getFirstAsync(
        'SELECT * FROM todos WHERE recurrence_source_id = ?',
        timedRepeat.id,
    );
    check(
        'monthly recurrence preserves the local due time without creating a reminder',
        () => {
            assert.equal(timedSuccessor.due_date, '2030-02-28');
            assert.equal(timedSuccessor.due_time, '09:15');
            assert.equal(timedSuccessor.reminder_at, null);
            assert.equal(pending.has(idFor(timedSuccessor.id)), false);
        },
    );
    await repository.updateTodo(timedSuccessor.id, {
        ...timedRepeatValues,
        dueDate: '2030-02-28',
        dueTime: '10:30',
    });
    await repository.completeTodo(timedSuccessor.id);
    check('editing only the time preserves the monthly calendar anchor', () => {
        const next = database.db
            .prepare('SELECT * FROM todos WHERE recurrence_source_id = ?')
            .get(timedSuccessor.id);
        assert.equal(next.due_date, '2030-03-31');
        assert.equal(next.due_time, '10:30');
    });
    const completionRepeat = await repository.createTodo({
        ...timedRepeatValues,
        recurrenceBasis: 'completion_date',
    });
    await repository.completeTodo(completionRepeat.id);
    check(
        'completion-based recurrence also preserves the local due time',
        () => {
            const next = database.db
                .prepare('SELECT * FROM todos WHERE recurrence_source_id = ?')
                .get(completionRepeat.id);
            assert.equal(next.due_time, '09:15');
        },
    );
    const timedAction = await repository.createTodo({
        ...timedRepeatValues,
        reminderAt,
    });
    await repository.applyTodoReminderAction({
        id: timedAction.id,
        reminderAt,
        notificationDate: 800,
        action: 'snooze',
    });
    const snoozedTimedAction = await repository.getTodoById(timedAction.id);
    check(
        'notification Snooze changes the reminder while preserving its due time',
        () => {
            assert.equal(snoozedTimedAction.dueTime, '09:15');
            assert.equal(snoozedTimedAction.dueDate, timedRepeatValues.dueDate);
        },
    );
    await repository.applyTodoReminderAction({
        id: timedAction.id,
        reminderAt: snoozedTimedAction.reminderAt,
        notificationDate: 801,
        action: 'complete',
    });
    check(
        'notification Complete carries the due time into the next occurrence',
        () => {
            const next = database.db
                .prepare('SELECT * FROM todos WHERE recurrence_source_id = ?')
                .get(timedAction.id);
            assert.equal(next.due_time, '09:15');
            assert.equal(next.due_date, '2030-02-28');
        },
    );
    console.log(`\n${checks} SQLite integration checks passed.`);
}
main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => {
        competingConnection.close();
        database.db.close();
        fs.rmSync(databaseDirectory, { recursive: true, force: true });
    });

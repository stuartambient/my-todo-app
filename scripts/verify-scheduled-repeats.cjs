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
const presented = new Map();
const scheduledCalls = [];
let failScheduling = false;
let failCancellation = false;
let granted = true;
let exactAccess = true;
let permissionRequests = 0;
const native = {
    AndroidImportance: { HIGH: 6, NONE: 2 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    getAllScheduledNotificationsAsync: async () => [...pending.values()],
    getPresentedNotificationsAsync: async () => [...presented.values()],
    dismissNotificationAsync: async (id) => {
        presented.delete(id);
    },
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
        scheduledCalls.push(request);
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

// Pin the local clock to exercise overdue generation, resumes and DST reliably.
const NativeDate = Date;
let clock = new NativeDate(2026, 10, 3, 10).getTime();
global.Date = class extends NativeDate {
    constructor(...args) {
        super(...(args.length ? args : [clock]));
    }
    static now() {
        return clock;
    }
};
const { localDateKey } = require('../src/utils/recurrence.ts');
const backups = require('../src/repositories/backup.repository.ts');
function day(offset) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return localDateKey(date);
}
function rows(id) {
    return database.db
        .prepare(
            'SELECT * FROM todos WHERE recurrence_series_id = ? ORDER BY due_date, id',
        )
        .all(id);
}
function series(id) {
    return database.db
        .prepare('SELECT * FROM todo_recurrence_series WHERE id = ?')
        .get(id);
}
async function main() {
    await getDatabase();
    const type = await database.getFirstAsync(
        'SELECT id FROM todo_types LIMIT 1',
    );
    const defaults = {
        typeId: type.id,
        categoryId: null,
        subject: 'Drops',
        notes: 'Keep these notes',
        priority: 'normal',
        dueDate: day(0),
        dueTime: '23:55',
        reminderAt: new Date(clock + 60 * 60 * 1000).toISOString(),
        recurrenceFrequency: 'day',
        recurrenceInterval: 1,
        recurrenceBasis: 'due_date',
        recurrenceEndDate: day(3),
    };
    // A real installed legacy series: yesterday's todo was never completed.
    const legacy = await repository.createTodo({
        ...defaults,
        dueDate: day(-1),
        recurrenceFrequency: null,
        recurrenceInterval: null,
        recurrenceBasis: null,
    });
    database.db
        .prepare(
            "UPDATE todos SET recurrence_frequency = 'day', recurrence_interval = 1, recurrence_basis = 'due_date', recurrence_end_date = ?, recurrence_anchor_date = ? WHERE id = ?",
        )
        .run(day(3), day(-1), legacy.id);
    const before = database.db
        .prepare('SELECT * FROM todos WHERE id = ?')
        .get(legacy.id);
    await repository.getOpenTodos();
    const adopted = await repository.getTodoById(legacy.id);
    check(
        'regression: yesterday remains open and today exists without completing yesterday',
        () => {
            assert.equal(
                rows(adopted.recurrenceSeriesId).find(
                    (row) => row.due_date === day(-1),
                ).status,
                'open',
            );
            assert.equal(
                rows(adopted.recurrenceSeriesId).find(
                    (row) => row.due_date === day(0),
                ).status,
                'open',
            );
            const { recurrence_series_id, ...after } = database.db
                .prepare('SELECT * FROM todos WHERE id = ?')
                .get(legacy.id);
            const { recurrence_series_id: omitted, ...old } = before;
            assert.deepEqual({ ...after }, { ...old });
        },
    );
    const bounded = await repository.createTodo(defaults);
    const sid = bounded.recurrenceSeriesId;
    check(
        'calendar generation includes the end date and stops before the following day',
        () => {
            assert.deepEqual(
                rows(sid).map((row) => row.due_date),
                [day(0), day(1), day(2), day(3)],
            );
            assert(
                rows(sid).every((row) => row.recurrence_end_date === day(3)),
            );
            assert.equal(pending.size, 9);
        },
    );
    const snapshot = rows(sid).map((row) => row.id);
    await Promise.all([
        repository.refreshRecurringTodos(),
        repository.refreshTodoReminders(),
        repository.getOpenTodos(),
    ]);
    check(
        'overlapping refreshes and repeated startup do not duplicate occurrences',
        () => {
            assert.deepEqual(
                rows(sid).map((row) => row.id),
                snapshot,
            );
            assert.equal(
                database.db
                    .prepare(
                        'SELECT COUNT(*) AS n FROM (SELECT recurrence_series_id,due_date FROM todos GROUP BY recurrence_series_id,due_date HAVING COUNT(*)>1)',
                    )
                    .get().n,
                0,
            );
        },
    );
    const middle = rows(sid).find((row) => row.due_date === day(1));
    presented.set(idFor(middle.id), { request: pending.get(idFor(middle.id)) });
    await repository.deleteTodo(middle.id, 'occurrence');
    await repository.getOpenTodos();
    check(
        'delete this occurrence skips only its date and cancels its reminder',
        () => {
            assert.deepEqual(
                rows(sid).map((row) => row.due_date),
                [day(0), day(2), day(3)],
            );
            assert(!pending.has(idFor(middle.id)));
            assert(!presented.has(idFor(middle.id)));
            assert(JSON.parse(series(sid).excluded_dates).includes(day(1)));
        },
    );
    await repository.updateTodo(bounded.id, {
        ...defaults,
        subject: 'Updated drops',
    });
    check(
        'editing a series does not resurrect an explicitly skipped occurrence',
        () => {
            assert.deepEqual(
                rows(sid).map((row) => row.due_date),
                [day(0), day(2), day(3)],
            );
            assert(rows(sid).every((row) => row.subject === 'Updated drops'));
        },
    );
    const tomorrow = rows(sid).find((row) => row.due_date === day(2));
    await repository.completeTodo(tomorrow.id);
    const existingCount = rows(sid).length;
    await repository.completeTodo(bounded.id);
    await repository.reopenTodo(bounded.id);
    await repository.completeTodo(bounded.id);
    check(
        'completing and reopening old calendar occurrences does not fork their future',
        () => {
            assert.equal(rows(sid).length, existingCount);
        },
    );
    const live = rows(sid).find((row) => row.status === 'open');
    presented.set(idFor(live.id), { request: pending.get(idFor(live.id)) });
    presented.set(idFor(legacy.id), { request: pending.get(idFor(legacy.id)) });
    const beforeStop = await backups.createBackup();
    await repository.deleteTodo(live.id, 'series');
    await repository.refreshTodoReminders();
    check(
        'delete entire series removes open occurrences, preserves completed history and cancels every alarm',
        () => {
            assert.equal(series(sid).active, 0);
            assert(!presented.has(idFor(live.id)));
            assert(presented.has(idFor(legacy.id)));
            assert.equal(rows(sid).length, 2);
            assert(rows(sid).every((row) => row.status === 'completed'));
            for (const id of [...snapshot, live.id])
                assert(!pending.has(idFor(id)));
        },
    );
    await backups.restoreBackup(beforeStop);
    check(
        'restoring an older backup cannot restart a locally stopped series',
        () => {
            assert.equal(series(sid).active, 0);
            assert(rows(sid).every((row) => row.status === 'completed'));
        },
    );
    await repository.reopenTodo(bounded.id);
    await repository.completeTodo(bounded.id);
    check('reopening history of a stopped series never reactivates it', () =>
        assert.equal(rows(sid).length, 2),
    );
    const identical = await repository.createTodo({
        ...defaults,
        subject: 'Updated drops',
    });
    check('unrelated series with the same subject are independent', () =>
        assert.equal(rows(identical.recurrenceSeriesId).length, 4),
    );
    const future = await repository.createTodo({
        ...defaults,
        dueDate: '2035-01-01',
        recurrenceEndDate: null,
        reminderAt: null,
    });
    await repository.deleteTodo(future.id, 'occurrence');
    check(
        'skipping the only occurrence retains the persistent series and its next date',
        () => {
            assert.equal(rows(future.recurrenceSeriesId).length, 1);
            assert.equal(
                rows(future.recurrenceSeriesId)[0].due_date,
                '2035-01-02',
            );
        },
    );
    const completion = await repository.createTodo({
        ...defaults,
        recurrenceBasis: 'completion_date',
        recurrenceEndDate: null,
    });
    await repository.refreshRecurringTodos();
    check('completion-based repeats wait for completion', () =>
        assert.equal(rows(completion.recurrenceSeriesId).length, 1),
    );
    await repository.deleteTodo(completion.id, 'occurrence');
    check(
        'skipping a completion-based occurrence creates its next instance without ending the series',
        () => {
            assert.equal(rows(completion.recurrenceSeriesId).length, 1);
            assert.equal(
                rows(completion.recurrenceSeriesId)[0].due_date,
                day(1),
            );
        },
    );

    const completionNext = rows(completion.recurrenceSeriesId)[0];
    await repository.completeTodo(completionNext.id);
    const completionNextAgain = rows(completion.recurrenceSeriesId).find(
        (row) => row.status === 'open',
    );
    await repository.completeTodo(completionNextAgain.id);
    check(
        'early completion of successive completion-based occurrences keeps a live successor',
        () => {
            const all = rows(completion.recurrenceSeriesId);
            assert.equal(all.filter((row) => row.status === 'open').length, 1);
            assert.equal(
                all.filter((row) => row.status === 'completed').length,
                2,
            );
        },
    );
    const liveCompletion = rows(completion.recurrenceSeriesId).find(
        (row) => row.status === 'open',
    );
    await repository.reopenTodo(completionNext.id);
    await repository.updateTodo(completionNext.id, {
        ...(await repository.getTodoById(completionNext.id)),
        notes: 'Edited history after reopening',
    });
    await repository.completeTodo(completionNext.id);
    await repository.completeTodo(liveCompletion.id);
    check(
        'editing reopened completion history does not displace the live repeat cursor',
        () => {
            assert.equal(
                rows(completion.recurrenceSeriesId).filter(
                    (row) => row.status === 'open',
                ).length,
                1,
            );
        },
    );
    const stableFuture = rows(identical.recurrenceSeriesId).find(
        (row) => row.due_date === day(1),
    );
    await repository.applyTodoReminderAction({
        id: stableFuture.id,
        reminderAt: stableFuture.reminder_at,
        notificationDate: 9001,
        action: 'snooze',
    });
    const snoozed = await repository.getTodoById(stableFuture.id);
    await repository.updateTodo(identical.id, {
        ...defaults,
        subject: 'Updated drops',
        notes: 'Changed notes',
    });
    check(
        'ordinary edits preserve upcoming IDs and their independently snoozed reminder times',
        () => {
            const row = rows(identical.recurrenceSeriesId).find(
                (row) => row.id === stableFuture.id,
            );
            assert.equal(row.reminder_at, snoozed.reminderAt);
            assert.equal(row.notes, 'Changed notes');
        },
    );
    const toggled = await repository.createTodo({
        ...defaults,
        reminderAt: null,
    });
    const initialSeries = toggled.recurrenceSeriesId;
    await repository.updateTodo(toggled.id, {
        ...defaults,
        reminderAt: null,
        recurrenceFrequency: null,
        recurrenceInterval: null,
        recurrenceBasis: null,
    });
    await repository.updateTodo(toggled.id, { ...defaults, reminderAt: null });
    const restarted = await repository.getTodoById(toggled.id);
    check(
        'turning repeat off and on creates a fresh series without reviving the stopped one',
        () => {
            assert.notEqual(restarted.recurrenceSeriesId, initialSeries);
            assert.equal(series(initialSeries).active, 0);
            assert.equal(rows(restarted.recurrenceSeriesId).length, 4);
        },
    );
    const overdueRow = rows(adopted.recurrenceSeriesId).find(
        (row) => row.due_date === day(-1),
    );
    const overdueSnapshot = { ...overdueRow };
    const todayRow = rows(adopted.recurrenceSeriesId).find(
        (row) => row.due_date === day(0),
    );
    await repository.updateTodo(todayRow.id, {
        ...defaults,
        subject: 'New schedule',
        recurrenceEndDate: day(1),
    });
    check(
        'shortening the end date updates upcoming instances and preserves older overdue content',
        () => {
            assert.deepEqual(
                {
                    ...rows(adopted.recurrenceSeriesId).find(
                        (row) => row.id === overdueRow.id,
                    ),
                },
                overdueSnapshot,
            );
            assert.deepEqual(
                rows(adopted.recurrenceSeriesId).map((row) => row.due_date),
                [day(-1), day(0), day(1)],
            );
            assert(
                rows(adopted.recurrenceSeriesId)
                    .filter((row) => row.due_date >= day(0))
                    .every((row) => row.subject === 'New schedule'),
            );
        },
    );
    const atomic = await repository.createTodo({
        ...defaults,
        subject: 'Rollback',
    });
    const atomicRows = rows(atomic.recurrenceSeriesId);
    database.db.exec(
        `CREATE TRIGGER abort_delete BEFORE DELETE ON todos WHEN OLD.id = '${atomic.id}' BEGIN SELECT RAISE(ABORT, 'forced deletion failure'); END;`,
    );
    await assert.rejects(
        () => repository.deleteTodo(atomic.id, 'series'),
        /forced deletion failure/,
    );
    check(
        'failed series deletion rolls back both the stop marker and every removed row',
        () => {
            assert.equal(series(atomic.recurrenceSeriesId).active, 1);
            assert.deepEqual(rows(atomic.recurrenceSeriesId), atomicRows);
        },
    );
    database.db.exec('DROP TRIGGER abort_delete');
    const weekly = await repository.createTodo({
        ...defaults,
        recurrenceFrequency: 'week',
        recurrenceInterval: 2,
        recurrenceEndDate: null,
        reminderAt: null,
    });
    check(
        'weekly intervals keep their schedule rather than creating every calendar day',
        () => {
            assert.deepEqual(
                rows(weekly.recurrenceSeriesId).map((row) => row.due_date),
                [day(0), day(14), day(28)],
            );
        },
    );
    const unbounded = await repository.createTodo({
        ...defaults,
        recurrenceEndDate: null,
    });
    const oldLast = rows(unbounded.recurrenceSeriesId).at(-1).due_date;
    clock += 5 * 86400000;
    scheduledCalls.length = 0;
    await repository.refreshTodoReminders();
    check(
        'resume catches missed days and extends the reminder horizon without completing overdue instances',
        () => {
            const all = rows(unbounded.recurrenceSeriesId);
            assert.equal(all.length, 36);
            assert(all.some((row) => row.due_date > oldLast));
            assert(all.every((row) => row.status === 'open'));
        },
    );
    check('catch-up never replays past reminders as immediate alerts', () => {
        assert(
            scheduledCalls.every(
                (request) => request.trigger.date.getTime() > Date.now(),
            ),
        );
    });
    // Planning through March 2030 must not create years of rows or alarms.
    const planning = await repository.createTodo({
        ...defaults,
        dueDate: day(14),
        recurrenceFrequency: 'week',
        recurrenceEndDate: '2030-03-31',
        reminderAt: new Date(clock + 14 * 86400000 + 3600000).toISOString(),
    });
    const planningSid = planning.recurrenceSeriesId;
    const legacyDate = new Date();
    legacyDate.setDate(legacyDate.getDate() + 14);
    legacyDate.setHours(23, 30, 0, 0);
    await database.runAsync('UPDATE todos SET due_date = ? WHERE id = ?', legacyDate.toISOString(), planning.id);
    const localDayResults = await repository.getOpenTodos({ from: day(14), through: day(14) });
    check('range filtering keeps legacy timestamps on the same local day as the home headings', () => {
        assert(localDayResults.some((todo) => todo.id === planning.id));
    });
    await database.runAsync('UPDATE todos SET due_date = ? WHERE id = ?', planning.dueDate, planning.id);
    const planningBefore = rows(planningSid);
    const cursorBefore = { ...series(planningSid) };
    const alarmsBefore = [...pending.keys()].sort();
    const longRange = { from: day(14), through: '2030-03-31' };
    const expectedPlanningDates = [];
    const weeklyDate = new Date();
    weeklyDate.setDate(weeklyDate.getDate() + 14);
    while (localDateKey(weeklyDate) <= longRange.through) {
        expectedPlanningDates.push(localDateKey(weeklyDate));
        weeklyDate.setDate(weeklyDate.getDate() + 7);
    }
    const plan = (await repository.getOpenTodos(longRange)).filter(
        (todo) => todo.recurrenceSeriesId === planningSid,
    );
    const futureProjections = plan.filter((todo) => todo.isProjected);
    check(
        'a custom range shows every weekly date through March 2030 with no 30-day display cutoff',
        () => {
            assert.deepEqual(
                plan.map((todo) => todo.dueDate),
                expectedPlanningDates,
            );
            assert(futureProjections.length > 100);
            assert.equal(
                new Date(futureProjections[0].reminderAt).getHours(),
                new Date(planning.reminderAt).getHours(),
            );
            assert.deepEqual(rows(planningSid), planningBefore);
            assert.deepEqual({ ...series(planningSid) }, cursorBefore);
            assert.deepEqual([...pending.keys()].sort(), alarmsBefore);
        },
    );
    const inspected = await repository.getTodoById(futureProjections[10].id);
    const editSource = await repository.getSeriesEditingTodoId(futureProjections[10].id);
    check(
        'opening a preview and finding its editable source are read-only',
        () => {
            assert.equal(inspected.isProjected, true);
            assert.equal(editSource, planning.id);
            assert.deepEqual(rows(planningSid), planningBefore);
            assert.deepEqual({ ...series(planningSid) }, cursorBefore);
        },
    );
    await assert.rejects(
        () =>
            repository.updateTodo(futureProjections[10].id, {
                ...planning,
                subject: 'Unsafe far-future edit',
            }),
        /repeating todo/,
    );
    await Promise.all([
        repository.completeTodo(futureProjections[10].id),
        repository.completeTodo(futureProjections[10].id),
    ]);
    const completedPreview = await repository.getTodoById(futureProjections[10].id);
    check(
        'completing a preview persists exactly one UUID occurrence and does not advance the series cursor',
        () => {
            assert.equal(rows(planningSid).length, planningBefore.length + 1);
            assert.equal(completedPreview.status, 'completed');
            assert.notEqual(completedPreview.id, futureProjections[10].id);
            assert.deepEqual({ ...series(planningSid) }, cursorBefore);
            assert(!pending.has(idFor(completedPreview.id)));
        },
    );
    await repository.reopenTodo(completedPreview.id);
    await assert.rejects(
        () =>
            repository.updateTodo(completedPreview.id, {
                ...planning,
                dueDate: completedPreview.dueDate,
            }),
        /repeating todo/,
    );
    await repository.completeTodo(futureProjections[10].id);
    await repository.deleteTodo(futureProjections[11].id, 'occurrence');
    const planAfter = (await repository.getOpenTodos(longRange)).filter(
        (todo) => todo.recurrenceSeriesId === planningSid,
    );
    check(
        'completed and skipped future dates stay absent without duplicates',
        () => {
            assert.deepEqual(
                planAfter.map((todo) => todo.dueDate),
                expectedPlanningDates.filter(
                    (date) =>
                        date !== futureProjections[10].dueDate &&
                        date !== futureProjections[11].dueDate,
                ),
            );
            assert.equal(rows(planningSid).length, planningBefore.length + 1);
            assert.equal(
                new Set(planAfter.map((todo) => todo.id)).size,
                planAfter.length,
            );
        },
    );
    const basisCompletion = await repository.createTodo({
        ...defaults,
        dueDate: day(14),
        recurrenceFrequency: 'week',
        recurrenceBasis: 'completion_date',
        recurrenceEndDate: '2030-03-31',
    });
    const completionPlan = (await repository.getOpenTodos(longRange)).filter(
        (todo) =>
            todo.recurrenceSeriesId === basisCompletion.recurrenceSeriesId,
    );
    check(
        'completion-based repeats are not falsely projected into fixed future dates',
        () => assert.equal(completionPlan.length, 1),
    );
    const cancelled = await repository.createTodo({
        ...defaults,
        dueDate: day(14),
        recurrenceFrequency: 'week',
        recurrenceEndDate: '2030-03-31',
    });
    const cancelledPlan = (await repository.getOpenTodos(longRange)).filter(
        (todo) => todo.recurrenceSeriesId === cancelled.recurrenceSeriesId,
    );
    await repository.deleteTodo(
        cancelledPlan.find((todo) => todo.isProjected).id,
        'series',
    );
    const afterCancel = (await repository.getOpenTodos(longRange)).filter(
        (todo) => todo.recurrenceSeriesId === cancelled.recurrenceSeriesId,
    );
    check(
        'entire-series deletion from a preview stops projections and keeps an unrelated same-subject series',
        () => {
            assert.equal(afterCancel.length, 0);
            assert.equal(series(cancelled.recurrenceSeriesId).active, 0);
            assert(rows(planningSid).length > 0);
        },
    );
    // Round trip all rules, skipped dates and stopped series into a fresh DB.
    const backup = await backups.createBackup();
    const expectedRows = database.db
        .prepare('SELECT * FROM todos ORDER BY id')
        .all()
        .map((row) => ({ ...row }));
    const expectedSeries = database.db
        .prepare('SELECT * FROM todo_recurrence_series ORDER BY id')
        .all()
        .map((row) => ({ ...row }));
    database.db.exec('DELETE FROM todos; DELETE FROM todo_recurrence_series;');
    await backups.restoreBackup(backup);
    check(
        'backup round trip retains series identities, skip dates, stopped state and every occurrence',
        () => {
            assert.deepEqual(
                database.db
                    .prepare('SELECT * FROM todos ORDER BY id')
                    .all()
                    .map((row) => ({ ...row })),
                expectedRows,
            );
            assert.deepEqual(
                database.db
                    .prepare('SELECT * FROM todo_recurrence_series ORDER BY id')
                    .all()
                    .map((row) => ({ ...row })),
                expectedSeries,
            );
        },
    );
    clock = new NativeDate(2030, 0, 31, 10).getTime();
    const monthly = await repository.createTodo({
        ...defaults,
        dueDate: '2030-01-31',
        recurrenceFrequency: 'month',
        recurrenceEndDate: '2030-03-31',
        reminderAt: null,
    });
    await repository.completeTodo(monthly.id);
    clock = new NativeDate(2030, 2, 2, 10).getTime();
    await repository.refreshRecurringTodos();
    check(
        'monthly catch-up retains the 31st anchor after February and includes the end date',
        () => {
            assert.deepEqual(
                rows(monthly.recurrenceSeriesId).map((row) => row.due_date),
                ['2030-01-31', '2030-02-28', '2030-03-31'],
            );
            assert.equal(rows(monthly.recurrenceSeriesId)[1].status, 'open');
        },
    );
    check(
        'later rolling generation does not duplicate a previously completed preview or recreate a skipped date',
        () => {
            const materialized = rows(planningSid);
            assert.equal(
                materialized.filter(
                    (row) => row.due_date === futureProjections[10].dueDate,
                ).length,
                1,
            );
            assert.equal(
                materialized.find((row) => row.due_date === futureProjections[10].dueDate)
                    .status,
                'completed',
            );
            assert.equal(
                materialized.filter(
                    (row) => row.due_date === futureProjections[11].dueDate,
                ).length,
                0,
            );
        },
    );
    console.log(`${checks} scheduled recurrence checks passed.`);
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

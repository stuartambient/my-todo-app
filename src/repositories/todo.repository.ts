import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/database/database';
import { mapTodoRow, type TodoRow } from '@/database/mappers';
import { todoSchema, type TodoFormValues } from '@/schemas/todo.schema';
import type { Todo } from '@/types/todo';
import {
    reconcileTodoReminders,
    reportReminderError,
    requestTodoReminderPermission,
    type ReminderTodo,
} from '@/services/todoReminders';
import { getNextOccurrenceDate, shiftReminder } from '@/utils/recurrence';
import { notifyTodoChanged } from '@/services/todoChanges';
import { maintainDeliveryHistory } from '@/services/reminderDeliveryHistory';
import { SNOOZE_MINUTES } from '@/services/reminderNotificationConstants';

export type CreateTodoInput = TodoFormValues;
export type UpdateTodoInput = CreateTodoInput;

// Serialize repository writes so rapid taps cannot start competing transactions.
let writeQueue: Promise<unknown> = Promise.resolve();

export function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const result = writeQueue.then(operation);
    writeQueue = result.catch(() => undefined);
    return result;
}

export async function synchronizeSavedReminders(
    requestPermission = false,
    rescheduleFuture = false,
): Promise<void> {
    try {
        const database = await getDatabase();
        if (requestPermission) {
            try {
                await requestTodoReminderPermission();
            } catch (error) {
                reportReminderError(error);
            }
        }
        // The JS write queue is local to one runtime. A real SQLite write lock
        // serializes snapshot + native alarm changes across foreground/headless
        // runtimes, and excludes todo mutations until reconciliation finishes.
        await database.withExclusiveTransactionAsync(async (transaction) => {
            await transaction.execAsync('PRAGMA busy_timeout = 5000;');
            await transaction.runAsync(
                'UPDATE todo_notification_sync SET revision = revision + 1 WHERE id = 1',
            );
            const rows = await transaction.getAllAsync<{
                id: string;
                subject: string;
                status: Todo['status'];
                reminder_at: string | null;
            }>('SELECT id, subject, status, reminder_at FROM todos');
            const todos: ReminderTodo[] = rows.map((row) => ({
                id: row.id,
                subject: row.subject,
                status: row.status,
                reminderAt: row.reminder_at,
            }));
            await maintainDeliveryHistory(todos);
            await reconcileTodoReminders(
                todos,
                false,
                Date.now(),
                rescheduleFuture,
            );
        });
    } catch (error) {
        reportReminderError(error);
    }
}

// Startup/resume and user retries use the same queue as mutations, preventing
// an older database snapshot from cancelling a just-saved reminder.
export function refreshTodoReminders(requestPermission = false): Promise<void> {
    // Android can cancel exact alarms when access is revoked, while Expo's
    // saved request store still lists them. Re-arm future alarms on startup,
    // resume and retry instead of treating that store as proof of an active alarm.
    return enqueueWrite(() =>
        synchronizeSavedReminders(requestPermission, true),
    );
}

async function insertTodo(
    database: SQLiteDatabase,
    input: CreateTodoInput,
    now: string,
    anchorDate: string | null,
    sourceId: string | null = null,
): Promise<string> {
    const id = Crypto.randomUUID();
    await database.runAsync(
        `INSERT INTO todos (
            id, type_id, category_id, subject, notes, status, priority,
            due_date, due_time, reminder_at, recurrence_frequency, recurrence_interval,
            recurrence_basis, recurrence_end_date, recurrence_anchor_date, recurrence_source_id,
            created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        id,
        input.typeId,
        input.categoryId,
        input.subject,
        input.notes,
        input.priority === 'high' ? 1 : 0,
        input.dueDate,
        input.dueTime,
        input.reminderAt,
        input.recurrenceFrequency,
        input.recurrenceInterval,
        input.recurrenceBasis,
        input.recurrenceEndDate,
        anchorDate,
        sourceId,
        now,
        now,
    );
    return id;
}

export async function getTodoById(id: string): Promise<Todo | null> {
    const database = await getDatabase();
    const row = await database.getFirstAsync<TodoRow>(
        'SELECT * FROM todos WHERE id = ?',
        id,
    );
    return row ? mapTodoRow(row) : null;
}

export async function getOpenTodos(): Promise<Todo[]> {
    const database = await getDatabase();
    const rows = await database.getAllAsync<TodoRow>(`
        SELECT * FROM todos
        WHERE status = 'open'
        ORDER BY
            CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
            due_date,
            CASE WHEN due_time IS NULL THEN 1 ELSE 0 END,
            due_time, priority DESC, created_at, id
    `);
    return rows.map(mapTodoRow);
}

export async function getCompletedTodos(): Promise<Todo[]> {
    const database = await getDatabase();
    const rows = await database.getAllAsync<TodoRow>(`
        SELECT * FROM todos
        WHERE status = 'completed'
        ORDER BY completed_at DESC
    `);
    return rows.map(mapTodoRow);
}

export function createTodo(input: CreateTodoInput): Promise<Todo> {
    return enqueueWrite(async () => {
        const values = todoSchema.parse(input);
        const database = await getDatabase();
        const id = await insertTodo(
            database,
            values,
            new Date().toISOString(),
            values.recurrenceFrequency ? values.dueDate : null,
        );
        const todo = await getTodoById(id);
        if (!todo) throw new Error('Failed to create todo.');
        await synchronizeSavedReminders(
            Boolean(
                todo.reminderAt && Date.parse(todo.reminderAt) > Date.now(),
            ),
        );
        return todo;
    });
}

export function updateTodo(id: string, input: UpdateTodoInput): Promise<void> {
    return enqueueWrite(async () => {
        const values = todoSchema.parse(input);
        const database = await getDatabase();
        const current = await database.getFirstAsync<TodoRow>(
            'SELECT * FROM todos WHERE id = ?',
            id,
        );
        if (!current) throw new Error('Todo not found.');

        const sameSchedule =
            current.due_date === values.dueDate &&
            current.recurrence_frequency === values.recurrenceFrequency &&
            current.recurrence_interval === values.recurrenceInterval &&
            current.recurrence_basis === values.recurrenceBasis;
        const anchorDate = values.recurrenceFrequency
            ? sameSchedule
                ? (current.recurrence_anchor_date ?? values.dueDate)
                : values.dueDate
            : null;

        await database.runAsync(
            `UPDATE todos SET
                type_id = ?, category_id = ?, subject = ?, notes = ?, priority = ?,
                due_date = ?, due_time = ?, reminder_at = ?, recurrence_frequency = ?,
                recurrence_interval = ?, recurrence_basis = ?, recurrence_end_date = ?,
                recurrence_anchor_date = ?, updated_at = ?
            WHERE id = ?`,
            values.typeId,
            values.categoryId,
            values.subject,
            values.notes,
            values.priority === 'high' ? 1 : 0,
            values.dueDate,
            values.dueTime,
            values.reminderAt,
            values.recurrenceFrequency,
            values.recurrenceInterval,
            values.recurrenceBasis,
            values.recurrenceEndDate,
            anchorDate,
            new Date().toISOString(),
            id,
        );
        await synchronizeSavedReminders(
            Boolean(
                values.reminderAt && Date.parse(values.reminderAt) > Date.now(),
            ),
        );
    });
}

async function completeTodoInTransaction(
    transaction: SQLiteDatabase,
    id: string,
): Promise<void> {
    await transaction.execAsync('PRAGMA busy_timeout = 5000;');
    // Acquire the writer lock before taking a WAL read snapshot.
    await transaction.runAsync(
        'UPDATE todo_notification_sync SET revision = revision + 1 WHERE id = 1',
    );
    const row = await transaction.getFirstAsync<TodoRow>(
        'SELECT * FROM todos WHERE id = ?',
        id,
    );
    if (!row) throw new Error('Todo not found.');
    if (row.status === 'completed') return;

    const completedAt = new Date();
    const now = completedAt.toISOString();
    const todo = mapTodoRow(row);

    const isFinalOccurrence = Boolean(
        todo.recurrenceEndDate &&
        todo.dueDate &&
        todo.dueDate >= todo.recurrenceEndDate,
    );
    if (todo.recurrenceFrequency && !isFinalOccurrence) {
        const successor = await transaction.getFirstAsync<{
            id: string;
        }>('SELECT id FROM todos WHERE recurrence_source_id = ?', id);

        // Reopened occurrences keep their existing successor.
        if (!successor) {
            if (!todo.dueDate) {
                throw new Error(
                    'Choose a due date before completing this repeating todo.',
                );
            }
            if (!todo.recurrenceInterval) {
                throw new Error(
                    'Choose a repeat interval before completing this todo.',
                );
            }

            const basis = todo.recurrenceBasis ?? 'due_date';
            const nextDate = getNextOccurrenceDate({
                dueDate: todo.dueDate,
                frequency: todo.recurrenceFrequency,
                interval: todo.recurrenceInterval,
                basis,
                anchorDate: row.recurrence_anchor_date,
                completedAt,
            });
            // Calendar date comparison is inclusive. Completing a final or
            // overdue occurrence never creates a successor beyond the limit.
            if (!todo.recurrenceEndDate || nextDate <= todo.recurrenceEndDate) {
                const nextValues = todoSchema.parse({
                    ...todo,
                    dueDate: nextDate,
                    reminderAt: shiftReminder(
                        todo.reminderAt,
                        todo.dueDate,
                        nextDate,
                    ),
                    recurrenceBasis: basis,
                });

                await insertTodo(
                    transaction,
                    nextValues,
                    now,
                    basis === 'due_date'
                        ? (row.recurrence_anchor_date ?? todo.dueDate)
                        : nextDate,
                    id,
                );
            }
        }
    }

    await transaction.runAsync(
        `UPDATE todos SET status = 'completed', completed_at = ?, updated_at = ?
         WHERE id = ? AND status = 'open'`,
        now,
        now,
        id,
    );
}

export function completeTodo(id: string): Promise<void> {
    return enqueueWrite(async () => {
        const database = await getDatabase();
        await database.withExclusiveTransactionAsync((transaction) =>
            completeTodoInTransaction(transaction, id),
        );
        await synchronizeSavedReminders();
    });
}

export type ReminderActionInput = {
    id: string;
    reminderAt: string;
    notificationDate: number;
    action: 'complete' | 'snooze';
};

export type ReminderActionResult = 'completed' | 'snoozed' | 'ignored';

/** One transaction protects actions delivered by both UI and headless runtimes. */
export function applyTodoReminderAction(
    input: ReminderActionInput,
): Promise<ReminderActionResult> {
    return enqueueWrite(async () => {
        const database = await getDatabase();
        let result: ReminderActionResult = 'ignored';
        await database.withExclusiveTransactionAsync(async (transaction) => {
            await transaction.execAsync('PRAGMA busy_timeout = 5000;');
            const key = JSON.stringify([
                input.id,
                input.reminderAt,
                input.notificationDate,
            ]);
            const claimed = await transaction.runAsync(
                'INSERT OR IGNORE INTO todo_notification_actions (response_key, processed_at) VALUES (?, ?)',
                key,
                new Date().toISOString(),
            );
            if (claimed.changes === 0) return;
            const row = await transaction.getFirstAsync<TodoRow>(
                'SELECT * FROM todos WHERE id = ?',
                input.id,
            );
            // Old buttons must not complete or postpone a newly edited reminder.
            if (
                !row ||
                row.status !== 'open' ||
                row.reminder_at !== input.reminderAt
            )
                return;
            if (input.action === 'complete') {
                await completeTodoInTransaction(transaction, input.id);
                result = 'completed';
            } else {
                const now = new Date();
                const next = new Date(
                    now.getTime() + SNOOZE_MINUTES * 60_000,
                ).toISOString();
                await transaction.runAsync(
                    'UPDATE todos SET reminder_at = ?, updated_at = ? WHERE id = ?',
                    next,
                    now.toISOString(),
                    input.id,
                );
                result = 'snoozed';
            }
        });
        // Also repairs native scheduling if a duplicate follows a committed save
        // whose notification operation failed. No second completion or snooze.
        await synchronizeSavedReminders();
        // A foreground duplicate can follow a headless write; refresh its UI too.
        notifyTodoChanged(input.id);
        return result;
    });
}

export function reopenTodo(id: string): Promise<void> {
    return enqueueWrite(async () => {
        const database = await getDatabase();
        await database.runAsync(
            `UPDATE todos SET status = 'open', completed_at = NULL, updated_at = ?
             WHERE id = ?`,
            new Date().toISOString(),
            id,
        );
        await synchronizeSavedReminders();
    });
}

export function deleteTodo(id: string): Promise<void> {
    return enqueueWrite(async () => {
        const database = await getDatabase();
        await database.runAsync('DELETE FROM todos WHERE id = ?', id);
        await synchronizeSavedReminders();
    });
}

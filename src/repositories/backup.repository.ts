import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/database/database';
import type { CategoryRow, TodoTypeRow, TodoRow } from '@/database/mappers';
import {
    enqueueWrite,
    synchronizeSavedReminders,
} from '@/repositories/todo.repository';
import { notifyTodoChanged } from '@/services/todoChanges';
import { validateBackup, type TodoBackup } from '@/services/todoBackupFormat';

export function createBackup(): Promise<TodoBackup> {
    return enqueueWrite(async () => {
        const database = await getDatabase();
        let backup!: TodoBackup;
        await database.withExclusiveTransactionAsync(async (transaction) => {
            await lock(transaction);
            backup = validateBackup({
                format: 'todoapp-backup',
                version: 2,
                exportedAt: new Date().toISOString(),
                todoTypes: await transaction.getAllAsync<TodoTypeRow>(
                    'SELECT * FROM todo_types ORDER BY id',
                ),
                categories: await transaction.getAllAsync<CategoryRow>(
                    'SELECT * FROM categories ORDER BY id',
                ),
                todos: await transaction.getAllAsync<TodoRow>(
                    'SELECT * FROM todos ORDER BY id',
                ),
            });
        });
        return backup;
    });
}

async function lock(transaction: SQLiteDatabase) {
    await transaction.execAsync('PRAGMA busy_timeout = 5000;');
    await transaction.runAsync(
        'UPDATE todo_notification_sync SET revision = revision + 1 WHERE id = 1',
    );
}

// Match names on a fresh installation: seeded type IDs are different on each device.
async function restoreNames(
    transaction: SQLiteDatabase,
    table: 'todo_types' | 'categories',
    rows: TodoBackup['todoTypes'] | TodoBackup['categories'],
) {
    const existing = await transaction.getAllAsync<{
        id: string;
        name: string;
    }>(`SELECT id, name FROM ${table}`);
    const byName = new Map(existing.map((row) => [row.name, row.id]));
    const ids = new Set(existing.map((row) => row.id));
    const mapping = new Map<string, string>();
    for (const row of rows) {
        let target = byName.get(row.name);
        if (!target) {
            target = ids.has(row.id) ? Crypto.randomUUID() : row.id;
            const fields = Object.keys(row) as (keyof typeof row)[];
            await transaction.runAsync(
                `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
                ...fields.map((field) =>
                    field === 'id' ? target! : row[field],
                ),
            );
            ids.add(target);
            byName.set(row.name, target);
        }
        mapping.set(row.id, target);
    }
    return mapping;
}

export type RestoreResult = { added: number; skipped: number };

export function restoreBackup(input: TodoBackup): Promise<RestoreResult> {
    // Revalidate here as well as at file selection; no SQL or metadata comes from unchecked input.
    const backup = validateBackup(input);
    return enqueueWrite(async () => {
        const database = await getDatabase();
        const result = { added: 0, skipped: 0 };
        let futureReminderAdded = false;
        await database.withExclusiveTransactionAsync(async (transaction) => {
            await lock(transaction);
            const types = await restoreNames(
                transaction,
                'todo_types',
                backup.todoTypes,
            );
            const categories = await restoreNames(
                transaction,
                'categories',
                backup.categories,
            );
            const existing = await transaction.getAllAsync<{
                id: string;
                recurrence_source_id: string | null;
            }>('SELECT id, recurrence_source_id FROM todos');
            const ids = new Set(existing.map((row) => row.id));
            const sources = new Map(
                existing.flatMap((row) =>
                    row.recurrence_source_id
                        ? [[row.recurrence_source_id, row.id] as const]
                        : [],
                ),
            );
            // If a different successor already exists, skip that imported branch
            // including descendants; otherwise restoring it could fork a series.
            const children = new Map<string, string[]>();
            for (const row of backup.todos) {
                if (row.recurrence_source_id) {
                    const siblings =
                        children.get(row.recurrence_source_id) ?? [];
                    siblings.push(row.id);
                    children.set(row.recurrence_source_id, siblings);
                }
            }
            const blocked = new Set(
                backup.todos
                    .filter(
                        (row) =>
                            !ids.has(row.id) &&
                            row.recurrence_source_id &&
                            sources.has(row.recurrence_source_id),
                    )
                    .map((row) => row.id),
            );
            const queue = [...blocked];
            for (let index = 0; index < queue.length; index += 1) {
                for (const child of children.get(queue[index]) ?? []) {
                    if (!blocked.has(child)) {
                        blocked.add(child);
                        queue.push(child);
                    }
                }
            }
            for (const row of backup.todos) {
                if (ids.has(row.id) || blocked.has(row.id)) {
                    result.skipped += 1;
                    continue;
                }
                const restored = {
                    ...row,
                    type_id: types.get(row.type_id)!,
                    category_id:
                        row.category_id === null
                            ? null
                            : categories.get(row.category_id)!,
                };
                const fields = Object.keys(
                    restored,
                ) as (keyof typeof restored)[];
                await transaction.runAsync(
                    `INSERT INTO todos (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
                    ...fields.map((field) => restored[field]),
                );
                ids.add(row.id);
                if (row.recurrence_source_id)
                    sources.set(row.recurrence_source_id, row.id);
                result.added += 1;
                if (
                    row.status === 'open' &&
                    row.reminder_at &&
                    Date.parse(row.reminder_at) > Date.now()
                )
                    futureReminderAdded = true;
            }
        });
        // Never schedule from a partially imported snapshot or replay old reminders.
        if (result.added > 0) {
            await synchronizeSavedReminders(futureReminderAdded);
            notifyTodoChanged('backup-restored');
        }
        return result;
    });
}

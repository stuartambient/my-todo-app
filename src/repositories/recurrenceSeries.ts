import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

import { mapTodoRow, type TodoRow } from '@/database/mappers';
import { todoSchema, type TodoFormValues } from '@/schemas/todo.schema';
import {
    getNextOccurrenceDate,
    localDateKey,
    shiftReminder,
} from '@/utils/recurrence';

export type SeriesRow = {
    id: string;
    template: string;
    anchor_date: string;
    last_date: string;
    last_todo_id: string;
    active: number;
    excluded_dates: string;
    updated_at: string;
};

export type InsertOccurrence = (
    db: SQLiteDatabase,
    values: TodoFormValues,
    now: string,
    anchor: string | null,
    source: string | null,
    seriesId: string,
) => Promise<string>;

export const LOOKAHEAD_DAYS = 30;

export async function lockSeries(db: SQLiteDatabase) {
    await db.execAsync('PRAGMA busy_timeout = 5000;');
    await db.runAsync(
        'UPDATE todo_notification_sync SET revision = revision + 1 WHERE id = 1',
    );
}

// Upgrade legacy linked occurrences without changing their content or status.
// Persist membership once; deletion must never rely on walking surviving parents.
export async function adoptLegacySeries(db: SQLiteDatabase) {
    const unlinked = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM todos WHERE recurrence_series_id IS NULL AND recurrence_frequency IS NOT NULL LIMIT 1',
    );
    if (!unlinked) return;
    const rows = await db.getAllAsync<TodoRow>('SELECT * FROM todos');
    const byId = new Map(rows.map((row) => [row.id, row]));
    const groups = new Map<string, TodoRow[]>();
    for (const row of rows) {
        if (row.recurrence_series_id || !row.recurrence_frequency) continue;
        let current = row;
        const visited = new Set<string>();
        while (
            current.recurrence_source_id &&
            byId.has(current.recurrence_source_id)
        ) {
            if (visited.has(current.id))
                throw new Error('Invalid repeat ancestry.');
            visited.add(current.id);
            current = byId.get(current.recurrence_source_id)!;
        }
        const root =
            current.recurrence_series_id ??
            current.recurrence_source_id ??
            current.id;
        const group = groups.get(root) ?? [];
        group.push(row);
        groups.set(root, group);
    }
    for (const [id, group] of groups) {
        const parents = new Set(group.map((row) => row.recurrence_source_id));
        const leaves = group.filter((row) => !parents.has(row.id));
        leaves.sort(
            (a, b) =>
                a.created_at.localeCompare(b.created_at) ||
                a.updated_at.localeCompare(b.updated_at),
        );
        const last = leaves[leaves.length - 1] ?? group[group.length - 1];
        const values = todoSchema.parse(mapTodoRow(last));
        if (!values.dueDate)
            throw new Error('Repeating todo needs a due date.');
        await db.runAsync(
            `INSERT OR IGNORE INTO todo_recurrence_series
             (id, template, anchor_date, last_date, last_todo_id, active, excluded_dates, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, '[]', ?)`,
            id,
            JSON.stringify(values),
            last.recurrence_anchor_date ?? values.dueDate,
            values.dueDate,
            last.id,
            group.some((row) => row.status === 'open') ? 1 : 0,
            last.updated_at,
        );
        for (const row of group) {
            await db.runAsync(
                'UPDATE todos SET recurrence_series_id = ? WHERE id = ?',
                id,
                row.id,
            );
        }
    }
}

export async function createSeries(
    db: SQLiteDatabase,
    id: string,
    values: TodoFormValues,
    now: string,
) {
    if (!values.recurrenceFrequency || !values.dueDate) return;
    const seriesId = Crypto.randomUUID();
    await db.runAsync(
        `INSERT INTO todo_recurrence_series
         (id, template, anchor_date, last_date, last_todo_id, active, excluded_dates, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, '[]', ?)`,
        seriesId,
        JSON.stringify(values),
        values.dueDate,
        values.dueDate,
        id,
        now,
    );
    await db.runAsync(
        'UPDATE todos SET recurrence_series_id = ? WHERE id = ?',
        seriesId,
        id,
    );
}

export async function advanceSeries(
    db: SQLiteDatabase,
    series: SeriesRow,
    insert: InsertOccurrence,
    through: string,
    now = new Date(),
    oneOnly = false,
): Promise<number> {
    if (!series.active) return 0;
    const template = todoSchema.parse(JSON.parse(series.template));
    if (
        !template.recurrenceFrequency ||
        !template.recurrenceInterval ||
        !template.dueDate
    )
        return 0;
    const excluded = new Set<string>(JSON.parse(series.excluded_dates));
    let lastDate = series.last_date;
    let lastId = series.last_todo_id;
    let added = 0;
    let steps = 0;
    while (true) {
        if (
            template.recurrenceEndDate &&
            lastDate >= template.recurrenceEndDate
        )
            break;
        if (lastDate === '9999-12-31') break;
        let next: string;
        try {
            next = getNextOccurrenceDate({
                dueDate: lastDate,
                frequency: template.recurrenceFrequency,
                interval: template.recurrenceInterval,
                basis:
                    steps === 0
                        ? (template.recurrenceBasis ?? 'due_date')
                        : 'due_date',
                anchorDate:
                    template.recurrenceBasis === 'completion_date'
                        ? localDateKey(now)
                        : series.anchor_date,
                completedAt: now,
                skipMissed: false,
            });
        } catch (error) {
            if (
                error instanceof Error &&
                error.message.includes('outside the supported date range')
            )
                break;
            throw error;
        }
        if (
            next > through ||
            (template.recurrenceEndDate && next > template.recurrenceEndDate)
        )
            break;
        // Bounded atomic batches avoid holding the writer indefinitely on very
        // old daily series. Callers repeat batches without skipping dates.
        if (++steps > 1000) break;
        if (!excluded.has(next)) {
            const existing =
                template.recurrenceBasis === 'completion_date'
                    ? await db.getFirstAsync<{ id: string }>(
                          'SELECT id FROM todos WHERE recurrence_source_id = ?',
                          lastId,
                      )
                    : await db.getFirstAsync<{ id: string }>(
                          'SELECT id FROM todos WHERE recurrence_series_id = ? AND due_date = ?',
                          series.id,
                          next,
                      );
            if (existing) lastId = existing.id;
            else {
                const values = todoSchema.parse({
                    ...template,
                    dueDate: next,
                    reminderAt: shiftReminder(
                        template.reminderAt,
                        template.dueDate,
                        next,
                    ),
                });
                const child = await db.getFirstAsync<{ id: string }>(
                    'SELECT id FROM todos WHERE recurrence_source_id = ?',
                    lastId,
                );
                lastId = await insert(
                    db,
                    values,
                    now.toISOString(),
                    series.anchor_date,
                    child ? null : lastId,
                    series.id,
                );
                added += 1;
            }
        }
        lastDate = next;
        if (oneOnly && !excluded.has(next)) break;
    }
    if (lastDate !== series.last_date || lastId !== series.last_todo_id) {
        await db.runAsync(
            'UPDATE todo_recurrence_series SET last_date = ?, last_todo_id = ?, updated_at = ? WHERE id = ?',
            lastDate,
            lastId,
            now.toISOString(),
            series.id,
        );
    }
    return added;
}

export function lookaheadDate(now: Date): string {
    const date = new Date(now);
    date.setDate(date.getDate() + LOOKAHEAD_DAYS);
    return localDateKey(date);
}

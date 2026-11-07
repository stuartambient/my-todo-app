import { parseISO } from 'date-fns';

import type { Todo } from '@/types/todo';
import { todoSchema } from '@/schemas/todo.schema';
import {
    getNextOccurrenceDate,
    isCalendarDate,
    shiftReminder,
} from '@/utils/recurrence';
import type { SeriesRow } from './recurrenceSeries';

export type TodoRange = { from: string | null; through: string };
export const MAX_PROJECTED_OCCURRENCES = 10000;
const PREFIX = 'projected:';

export function projectionId(seriesId: string, date: string): string {
    return `${PREFIX}${seriesId}:${date}`;
}

export function projectionIdentity(
    id: string,
): { seriesId: string; date: string } | null {
    if (!id.startsWith(PREFIX)) return null;
    const body = id.slice(PREFIX.length);
    const date = body.slice(-10);
    const seriesId = body.slice(0, -11);
    if (!seriesId || body.at(-11) !== ':' || !isCalendarDate(date)) return null;
    return { seriesId, date };
}

// A bounded read-time projection. Neither rows nor notification requests are
// created here. Completed and explicitly skipped dates never reappear.
export function projectRepeats(
    series: SeriesRow[],
    savedDates: {
        recurrence_series_id: string | null;
        due_date: string | null;
    }[],
    range: TodoRange,
): Todo[] {
    if (
        !isCalendarDate(range.through) ||
        (range.from &&
            (!isCalendarDate(range.from) || range.from > range.through))
    ) {
        throw new Error('Choose a valid date range.');
    }
    const present = new Set(
        savedDates.map((row) =>
            JSON.stringify([row.recurrence_series_id, row.due_date]),
        ),
    );
    const result: Todo[] = [];
    for (const entry of series) {
        if (!entry.active || entry.last_date >= range.through) continue;
        const values = todoSchema.parse(JSON.parse(entry.template));
        if (
            values.recurrenceBasis !== 'due_date' ||
            !values.recurrenceFrequency ||
            !values.recurrenceInterval ||
            !values.dueDate
        )
            continue;
        const excluded = new Set<string>(JSON.parse(entry.excluded_dates));
        let date = entry.last_date;
        let first = true;
        while (true) {
            if (
                date === '9999-12-31' ||
                (values.recurrenceEndDate && date >= values.recurrenceEndDate)
            )
                break;
            const beforeFrom = parseISO(range.from ?? date);
            beforeFrom.setDate(beforeFrom.getDate() - 1);
            let next: string;
            try {
                next = getNextOccurrenceDate({
                    dueDate: date,
                    anchorDate: entry.anchor_date,
                    frequency: values.recurrenceFrequency,
                    interval: values.recurrenceInterval,
                    basis: 'due_date',
                    completedAt: beforeFrom,
                    skipMissed: first && Boolean(range.from),
                });
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message.includes('outside the supported date range')
                )
                    break;
                throw error;
            }
            first = false;
            if (
                next > range.through ||
                (values.recurrenceEndDate && next > values.recurrenceEndDate)
            )
                break;
            date = next;
            if (
                excluded.has(date) ||
                present.has(JSON.stringify([entry.id, date]))
            )
                continue;
            if (result.length >= MAX_PROJECTED_OCCURRENCES) {
                throw new Error(
                    'This range contains more than 10,000 future repeats. Choose a shorter range.',
                );
            }
            result.push({
                ...values,
                id: projectionId(entry.id, date),
                status: 'open',
                dueDate: date,
                reminderAt: shiftReminder(
                    values.reminderAt,
                    values.dueDate,
                    date,
                ),
                recurrenceSeriesId: entry.id,
                isProjected: true,
                createdAt: entry.updated_at,
                updatedAt: entry.updated_at,
                completedAt: null,
            });
        }
    }
    return result;
}

export function sortPlannedTodos(todos: Todo[]): Todo[] {
    return todos.sort(
        (a, b) =>
            (a.dueDate ?? '9999-99-99').localeCompare(
                b.dueDate ?? '9999-99-99',
            ) ||
            (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') ||
            Number(b.priority === 'high') - Number(a.priority === 'high') ||
            a.createdAt.localeCompare(b.createdAt) ||
            a.id.localeCompare(b.id),
    );
}

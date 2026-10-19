import type { RecurrenceBasis, RecurrenceFrequency } from '@/types/todo';

const DAY_MS = 86_400_000;

// Date-only arithmetic uses UTC so daylight-saving changes cannot shift days.
function parseDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error('Due date must use YYYY-MM-DD format.');
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
    ) {
        throw new Error('Due date must be a real calendar date.');
    }
    return date;
}

function formatDate(date: Date): string {
    const year = date.getUTCFullYear();
    if (!Number.isFinite(date.getTime()) || year < 1 || year > 9999) {
        throw new Error(
            'The next occurrence falls outside the supported date range.',
        );
    }
    return date.toISOString().slice(0, 10);
}

export function isCalendarDate(value: string): boolean {
    try {
        return parseDate(value).getUTCFullYear() >= 1;
    } catch {
        return false;
    }
}

export function localDateKey(date: Date): string {
    if (!Number.isFinite(date.getTime())) {
        throw new Error('Completion date must be valid.');
    }
    return `${String(date.getFullYear()).padStart(4, '0')}-${String(
        date.getMonth() + 1,
    ).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addPeriods(
    anchor: string,
    frequency: RecurrenceFrequency,
    amount: number,
): string {
    const date = parseDate(anchor);

    if (frequency === 'day' || frequency === 'week') {
        date.setUTCDate(
            date.getUTCDate() + amount * (frequency === 'week' ? 7 : 1),
        );
        return formatDate(date);
    }

    // Start at day 1 before changing the month/year, then clamp to its last day.
    const preferredDay = date.getUTCDate();
    date.setUTCDate(1);
    if (frequency === 'month') {
        date.setUTCMonth(date.getUTCMonth() + amount);
    } else {
        date.setUTCFullYear(date.getUTCFullYear() + amount);
    }

    const endOfMonth = new Date(date);
    endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1, 0);
    date.setUTCDate(Math.min(preferredDay, endOfMonth.getUTCDate()));
    return formatDate(date);
}

type NextOccurrenceInput = {
    dueDate: string;
    frequency: RecurrenceFrequency;
    interval: number;
    basis: RecurrenceBasis;
    anchorDate?: string | null;
    completedAt?: Date;
};

export function getNextOccurrenceDate({
    dueDate,
    frequency,
    interval,
    basis,
    anchorDate,
    completedAt = new Date(),
}: NextOccurrenceInput): string {
    if (!Number.isSafeInteger(interval) || interval < 1) {
        throw new Error('Repeat interval must be a positive whole number.');
    }

    parseDate(dueDate);
    const today = localDateKey(completedAt);
    if (basis === 'completion_date') {
        return addPeriods(today, frequency, interval);
    }

    const anchor = anchorDate ?? dueDate;
    const start = parseDate(anchor);
    // Always advance past the completed occurrence and past today.
    const threshold = dueDate > today ? dueDate : today;
    const end = parseDate(threshold);

    let elapsed: number;
    if (frequency === 'day' || frequency === 'week') {
        elapsed = (end.getTime() - start.getTime()) / DAY_MS;
        if (frequency === 'week') elapsed /= 7;
    } else if (frequency === 'month') {
        elapsed =
            (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
            end.getUTCMonth() -
            start.getUTCMonth();
    } else {
        elapsed = end.getUTCFullYear() - start.getUTCFullYear();
    }

    let step = Math.max(1, Math.floor(elapsed / interval));
    let candidate = addPeriods(anchor, frequency, step * interval);
    if (candidate <= threshold) {
        step += 1;
        candidate = addPeriods(anchor, frequency, step * interval);
    }
    return candidate;
}

export function shiftReminder(
    reminderAt: string | null,
    previousDueDate: string,
    nextDueDate: string,
): string | null {
    if (!reminderAt) return null;

    const reminder = new Date(reminderAt);
    if (!Number.isFinite(reminder.getTime())) {
        throw new Error('The existing reminder has an invalid date.');
    }

    const dayOffset = Math.round(
        (parseDate(nextDueDate).getTime() -
            parseDate(previousDueDate).getTime()) /
            DAY_MS,
    );
    // Keep the local reminder time and its calendar-day distance from the due date.
    reminder.setDate(reminder.getDate() + dayOffset);
    return reminder.toISOString();
}

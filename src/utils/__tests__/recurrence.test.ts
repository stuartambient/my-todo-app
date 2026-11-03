import { expect, test } from '@jest/globals';
import { getNextOccurrenceDate } from '../recurrence';

test('calendar generation advances one scheduled period even when dates were missed', () => {
    expect(
        getNextOccurrenceDate({
            dueDate: '2026-11-02',
            frequency: 'day',
            interval: 1,
            basis: 'due_date',
            completedAt: new Date(2026, 10, 10),
            skipMissed: false,
        }),
    ).toBe('2026-11-03');
});
test.each([
    ['2028-01-31', '2028-02-29', 'month', 1],
    ['2028-02-29', '2028-03-31', 'month', 1],
    ['2026-11-02', '2026-11-16', 'week', 2],
] as [string, string, 'month' | 'week', number][])(
    'calendar interval from %s is %s',
    (dueDate, next, frequency, interval) => {
        expect(
            getNextOccurrenceDate({
                dueDate,
                frequency,
                interval,
                anchorDate: frequency === 'month' ? '2028-01-31' : dueDate,
                basis: 'due_date',
                completedAt: new Date(2030, 0, 1),
                skipMissed: false,
            }),
        ).toBe(next);
    },
);

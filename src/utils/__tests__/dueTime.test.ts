import { expect, test } from '@jest/globals';

import { getDueTime } from '../dueTime';

test('uses the chosen local due time for the countdown and overdue state', () => {
    expect(
        getDueTime('2030-06-15', '15:00', new Date(2030, 5, 15, 14, 30)),
    ).toEqual({ label: '30m', status: 'soon' });
    expect(
        getDueTime('2030-06-15', '15:00', new Date(2030, 5, 15, 15, 0)),
    ).toEqual({ label: 'Overdue', status: 'overdue' });
});

test('date-only todos remain due through the end of the local day', () => {
    expect(
        getDueTime('2030-06-15', null, new Date(2030, 5, 15, 23, 59))?.status,
    ).toBe('soon');
    expect(getDueTime('2030-06-15', null, new Date(2030, 5, 16))?.status).toBe(
        'overdue',
    );
    expect(getDueTime(null, null)).toBeNull();
});

test('midnight is a real due time, distinct from a date-only todo', () => {
    expect(
        getDueTime('2030-06-15', '00:00', new Date(2030, 5, 15, 0, 1))?.status,
    ).toBe('overdue');
    expect(
        getDueTime('2030-06-15', null, new Date(2030, 5, 15, 0, 1))?.status,
    ).toBe('soon');
});

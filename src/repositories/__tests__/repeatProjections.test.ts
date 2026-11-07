import { expect, test } from '@jest/globals';
import {
    projectRepeats,
    projectionId,
    projectionIdentity,
} from '../repeatProjections';
import type { SeriesRow } from '../recurrenceSeries';

const series: SeriesRow = {
    id: 'series',
    active: 1,
    anchor_date: '2028-01-31',
    last_date: '2028-02-29',
    last_todo_id: 'february',
    excluded_dates: '[]',
    updated_at: '2028-02-01T12:00:00.000Z',
    template: JSON.stringify({
        typeId: 'task',
        categoryId: null,
        subject: 'Monthly',
        notes: null,
        priority: 'normal',
        dueDate: '2028-01-31',
        dueTime: '23:55',
        reminderAt: null,
        recurrenceFrequency: 'month',
        recurrenceInterval: 1,
        recurrenceBasis: 'due_date',
        recurrenceEndDate: '2028-04-30',
    }),
};

test('future monthly previews preserve the original anchor across leap February and include the limit', () => {
    const result = projectRepeats([series], [], {
        from: '2028-03-01',
        through: '2028-12-31',
    });
    expect(result.map((todo) => todo.dueDate)).toEqual([
        '2028-03-31',
        '2028-04-30',
    ]);
    expect(
        result.every((todo) => todo.isProjected && todo.reminderAt === null),
    ).toBe(true);
});

test('saved completions and skipped dates are not projected again', () => {
    expect(
        projectRepeats(
            [{ ...series, excluded_dates: JSON.stringify(['2028-03-31']) }],
            [{ recurrence_series_id: 'series', due_date: '2028-04-30' }],
            { from: null, through: '2028-12-31' },
        ),
    ).toHaveLength(0);
    expect(
        projectRepeats([{ ...series, active: 0 }], [], {
            from: null,
            through: '2028-12-31',
        }),
    ).toHaveLength(0);
});

test('completion-based repeats never masquerade as fixed calendar occurrences', () => {
    const template = {
        ...JSON.parse(series.template),
        recurrenceBasis: 'completion_date',
    };
    expect(
        projectRepeats(
            [{ ...series, template: JSON.stringify(template) }],
            [],
            { from: null, through: '2030-01-01' },
        ),
    ).toHaveLength(0);
});

test('range starts jump directly to distant years and finish safely at the supported date boundary', () => {
    const daily = {
        ...series,
        anchor_date: '2020-01-01',
        last_date: '2020-01-01',
        template: JSON.stringify({
            ...JSON.parse(series.template),
            dueDate: '2020-01-01',
            recurrenceFrequency: 'day',
            recurrenceEndDate: null,
        }),
    };
    const result = projectRepeats([daily], [], {
        from: '9999-12-29',
        through: '9999-12-31',
    });
    expect(result.map((todo) => todo.dueDate)).toEqual([
        '9999-12-29',
        '9999-12-30',
        '9999-12-31',
    ]);
    expect(() =>
        projectRepeats([daily], [], {
            from: '2020-01-01',
            through: '2050-01-01',
        }),
    ).toThrow('shorter range');
});

test('preview identities preserve series IDs containing colons and reject invalid calendar dates', () => {
    expect(
        projectionIdentity(projectionId('series:part', '2030-03-30')),
    ).toEqual({ seriesId: 'series:part', date: '2030-03-30' });
    expect(projectionIdentity('projected:series:2030-02-30')).toBeNull();
});

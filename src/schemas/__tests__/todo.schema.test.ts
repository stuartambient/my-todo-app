import { expect, test } from '@jest/globals';

import { todoSchema } from '../todo.schema';

const values = {
    typeId: 'task',
    categoryId: null,
    subject: 'Appointment',
    notes: null,
    priority: 'normal',
    dueDate: '2030-06-15',
    dueTime: null,
    reminderAt: null,
    recurrenceFrequency: null,
    recurrenceInterval: null,
    recurrenceBasis: null,
    recurrenceEndDate: null,
};

test.each(['00:00', '09:05', '12:00', '23:59'])(
    'accepts local due time %s without requiring a reminder',
    (dueTime) => {
        const result = todoSchema.parse({ ...values, dueTime });
        expect(result.dueTime).toBe(dueTime);
        expect(result.reminderAt).toBeNull();
    },
);

test.each(['24:00', '12:60', '9:05', '09:5', '12:00 PM', '', 'abc'])(
    'rejects malformed due time %s',
    (dueTime) => {
        expect(todoSchema.safeParse({ ...values, dueTime }).success).toBe(
            false,
        );
    },
);

test('a due time requires a date; date-only and undated todos remain valid', () => {
    const invalid = todoSchema.safeParse({
        ...values,
        dueDate: null,
        dueTime: '15:00',
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success)
        expect(invalid.error.issues[0].path).toEqual(['dueTime']);
    expect(todoSchema.parse(values).dueTime).toBeNull();
    expect(todoSchema.parse({ ...values, dueDate: null }).dueTime).toBeNull();
});

test('repeat end date is optional, inclusive and cannot precede the current due date', () => {
    const repeat = {
        ...values,
        recurrenceFrequency: 'day',
        recurrenceInterval: 1,
        recurrenceBasis: 'due_date',
    };
    for (const recurrenceEndDate of [null, '2030-06-15', '2030-06-22']) {
        expect(
            todoSchema.parse({ ...repeat, recurrenceEndDate })
                .recurrenceEndDate,
        ).toBe(recurrenceEndDate);
    }
    for (const recurrenceEndDate of ['2030-06-14', '2030-02-30']) {
        expect(
            todoSchema.safeParse({ ...repeat, recurrenceEndDate }).success,
        ).toBe(false);
    }
    expect(
        todoSchema.parse({ ...values, recurrenceEndDate: '2030-06-22' })
            .recurrenceEndDate,
    ).toBeNull();
});

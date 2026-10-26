import { expect, test } from '@jest/globals';
import { parseBackup, validateBackup } from '../todoBackupFormat';

export const fixture = {
    format: 'todoapp-backup',
    version: 1,
    exportedAt: '2030-01-01T12:00:00.000Z',
    todoTypes: [
        {
            id: 'task',
            name: 'Task',
            icon: null,
            active: 1,
            sort_order: 0,
            created_at: '2030-01-01T12:00:00.000Z',
            updated_at: '2030-01-01T12:00:00.000Z',
        },
    ],
    categories: [],
    todos: [
        {
            id: 'one',
            type_id: 'task',
            category_id: null,
            subject: 'Pay rent',
            notes: 'Keep my notes',
            status: 'open',
            priority: 1,
            due_date: '2030-01-31',
            due_time: '00:00',
            reminder_at: '2030-01-30T12:00:00.000Z',
            recurrence_frequency: 'month',
            recurrence_interval: 1,
            recurrence_basis: 'due_date',
            recurrence_anchor_date: '2030-01-31',
            recurrence_source_id: null,
            created_at: '2030-01-01T12:00:00.000Z',
            updated_at: '2030-01-01T12:00:00.000Z',
            completed_at: null,
        },
    ],
};

test('round trip preserves raw recurrence anchors, midnight and notes including a UTF-8 BOM', () => {
    expect(parseBackup('\uFEFF' + JSON.stringify(fixture))).toEqual(fixture);
});
test('rejects invalid JSON and newer versions clearly', () => {
    expect(() => parseBackup('{')).toThrow('not valid JSON');
    expect(() => validateBackup({ ...fixture, version: 2 })).toThrow(
        'different format version',
    );
});
test.each([
    ['foreign type', { type_id: 'missing' }],
    ['foreign category', { category_id: 'missing' }],
    ['impossible date', { due_date: '2030-02-30' }],
    ['bad time', { due_time: '25:30' }],
    ['time without date', { due_date: null }],
    ['missing recurrence anchor', { recurrence_anchor_date: null }],
    ['bad reminder', { reminder_at: 'yesterday' }],
    ['completed without timestamp', { status: 'completed' }],
    [
        'open with completed timestamp',
        { completed_at: '2030-01-01T12:00:00.000Z' },
    ],
    ['self-referential repeat', { recurrence_source_id: 'one' }],
    ['SQL field injection', { 'unexpected) VALUES () --': 'bad' }],
])('rejects %s before a database write', (_, fields) => {
    expect(() =>
        validateBackup({
            ...fixture,
            todos: [{ ...fixture.todos[0], ...fields }],
        }),
    ).toThrow('not a valid TodoApp backup');
});
test('rejects duplicate IDs, names and recurrence sources', () => {
    expect(() =>
        validateBackup({
            ...fixture,
            todos: [fixture.todos[0], fixture.todos[0]],
        }),
    ).toThrow();
    expect(() =>
        validateBackup({
            ...fixture,
            todoTypes: [
                ...fixture.todoTypes,
                { ...fixture.todoTypes[0], id: 'other' },
            ],
        }),
    ).toThrow();
    expect(() =>
        validateBackup({
            ...fixture,
            todos: [
                { ...fixture.todos[0], recurrence_source_id: 'previous' },
                {
                    ...fixture.todos[0],
                    id: 'two',
                    recurrence_source_id: 'previous',
                },
            ],
        }),
    ).toThrow();
});
test('permits a deleted predecessor and completed history', () => {
    expect(
        validateBackup({
            ...fixture,
            todos: [
                {
                    ...fixture.todos[0],
                    status: 'completed',
                    completed_at: '2030-01-31T12:00:00.000Z',
                    recurrence_source_id: 'deleted',
                },
            ],
        }).todos[0].status,
    ).toBe('completed');
});

test('rejects circular repeat ancestry', () => {
    expect(() =>
        validateBackup({
            ...fixture,
            todos: [
                { ...fixture.todos[0], id: 'one', recurrence_source_id: 'two' },
                { ...fixture.todos[0], id: 'two', recurrence_source_id: 'one' },
            ],
        }),
    ).toThrow('not a valid');
});

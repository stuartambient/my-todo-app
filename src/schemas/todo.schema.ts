import { z } from 'zod';

import { isCalendarDate } from '@/utils/recurrence';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const nullableText = z
    .string()
    .nullable()
    .transform((value) => {
        if (value === null) {
            return null;
        }

        const trimmed = value.trim();

        return trimmed.length === 0 ? null : trimmed;
    });

const nullableDate = z
    .string()
    .nullable()
    .refine(
        (value) =>
            value === null ||
            (datePattern.test(value) && isCalendarDate(value)),
        'Choose a valid date in YYYY-MM-DD format.',
    );

const nullableDateTime = z
    .string()
    .nullable()
    .refine(
        (value) => value === null || !Number.isNaN(Date.parse(value)),
        'Reminder must be a valid date and time.',
    );

export const todoSchema = z
    .object({
        typeId: z.string().min(1, 'A todo type is required.'),

        categoryId: z.string().nullable(),

        subject: z
            .string()
            .trim()
            .min(1, 'Subject is required.')
            .max(80, 'Subject must be 80 characters or fewer.'),

        notes: nullableText,

        priority: z.enum(['normal', 'high']),

        dueDate: nullableDate,
        dueTime: z
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a valid due time.')
            .nullable(),

        reminderAt: nullableDateTime,

        recurrenceFrequency: z
            .enum(['day', 'week', 'month', 'year'])
            .nullable(),

        recurrenceInterval: z.number().int().positive().nullable(),

        recurrenceBasis: z.enum(['due_date', 'completion_date']).nullable(),
        recurrenceEndDate: nullableDate,
    })
    .superRefine((todo, context) => {
        if (
            todo.recurrenceFrequency !== null &&
            todo.recurrenceEndDate !== null &&
            todo.dueDate !== null &&
            todo.recurrenceEndDate < todo.dueDate
        ) {
            context.addIssue({
                code: 'custom',
                path: ['recurrenceEndDate'],
                message: 'Repeat end date must be on or after the due date.',
            });
        }
        if (todo.dueTime !== null && todo.dueDate === null) {
            context.addIssue({
                code: 'custom',
                path: ['dueTime'],
                message: 'Choose a due date before adding a time.',
            });
        }
        if (
            todo.recurrenceFrequency !== null &&
            todo.recurrenceInterval === null
        ) {
            context.addIssue({
                code: 'custom',
                path: ['recurrenceInterval'],
                message: 'A recurrence interval is required.',
            });
        }

        if (
            todo.recurrenceFrequency === null &&
            todo.recurrenceInterval !== null
        ) {
            context.addIssue({
                code: 'custom',
                path: ['recurrenceFrequency'],
                message: 'A recurrence frequency is required.',
            });
        }
        if (todo.recurrenceFrequency !== null && todo.dueDate === null) {
            context.addIssue({
                code: 'custom',
                path: ['dueDate'],
                message: 'Choose an initial due date for a repeating todo.',
            });
        }

        if (
            todo.recurrenceFrequency !== null &&
            todo.recurrenceBasis === null
        ) {
            context.addIssue({
                code: 'custom',
                path: ['recurrenceBasis'],
                message: 'Choose what the repeat is based on.',
            });
        }
    })
    .transform((todo) => ({
        ...todo,
        recurrenceEndDate: todo.recurrenceFrequency
            ? todo.recurrenceEndDate
            : null,
        recurrenceInterval: todo.recurrenceFrequency
            ? todo.recurrenceInterval
            : null,
        recurrenceBasis: todo.recurrenceFrequency ? todo.recurrenceBasis : null,
    }));

export type TodoFormValues = z.infer<typeof todoSchema>;

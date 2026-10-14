import { z } from 'zod';

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
        (value) => value === null || datePattern.test(value),
        'Date must use YYYY-MM-DD format.',
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

        reminderAt: nullableDateTime,

        recurrenceFrequency: z
            .enum(['day', 'week', 'month', 'year'])
            .nullable(),

        recurrenceInterval: z.number().int().positive().nullable(),
    })
    .superRefine((todo, context) => {
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
    });

export type TodoFormValues = z.infer<typeof todoSchema>;

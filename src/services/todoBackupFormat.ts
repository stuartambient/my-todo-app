import { z } from 'zod';

import { mapTodoRow } from '@/database/mappers';
import { todoSchema } from '@/schemas/todo.schema';
import { isCalendarDate } from '@/utils/recurrence';

export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const id = z.string().min(1).max(200);
const timestamp = z.iso.datetime({ offset: true });
const date = z.string().refine(isCalendarDate).nullable();
const namedFields = {
    id,
    name: z.string().min(1).max(200),
    sort_order: z.number().int(),
    active: z.union([z.literal(0), z.literal(1)]),
    created_at: timestamp,
    updated_at: timestamp,
};
const typeSchema = z
    .object({ ...namedFields, icon: z.string().nullable() })
    .strict();
const categorySchema = z.object(namedFields).strict();
const rowSchema = z
    .object({
        id,
        type_id: id,
        category_id: id.nullable(),
        subject: z.string().min(1).max(80),
        notes: z.string().nullable(),
        status: z.enum(['open', 'completed']),
        priority: z.union([z.literal(0), z.literal(1)]),
        due_date: date,
        due_time: z
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
            .nullable(),
        reminder_at: timestamp.nullable(),
        recurrence_frequency: z
            .enum(['day', 'week', 'month', 'year'])
            .nullable(),
        recurrence_interval: z.number().int().positive().nullable(),
        recurrence_basis: z.enum(['due_date', 'completion_date']).nullable(),
        recurrence_anchor_date: date,
        recurrence_source_id: id.nullable(),
        created_at: timestamp,
        updated_at: timestamp,
        completed_at: timestamp.nullable(),
    })
    .strict()
    .superRefine((row, context) => {
        const valid = todoSchema.safeParse(mapTodoRow(row));
        if (
            !valid.success ||
            (row.status === 'completed') !== (row.completed_at !== null) ||
            (row.recurrence_frequency !== null &&
                row.recurrence_anchor_date === null) ||
            row.recurrence_source_id === row.id
        ) {
            context.addIssue({
                code: 'custom',
                message: 'Invalid todo fields.',
            });
        }
    });

export const backupSchema = z
    .object({
        format: z.literal('todoapp-backup'),
        version: z.literal(1),
        exportedAt: timestamp,
        todoTypes: z.array(typeSchema).max(10000),
        categories: z.array(categorySchema).max(10000),
        todos: z.array(rowSchema).max(50000),
    })
    .strict()
    .superRefine((backup, context) => {
        const unique = (values: string[]) =>
            new Set(values).size === values.length;
        const types = new Set(backup.todoTypes.map((row) => row.id));
        const categories = new Set(backup.categories.map((row) => row.id));
        // Check ancestry iteratively so a malformed long chain cannot overflow the stack.
        const parents = new Map(
            backup.todos.map((row) => [row.id, row.recurrence_source_id]),
        );
        const checked = new Set<string>();
        let cycle = false;
        for (const row of backup.todos) {
            const path = new Set<string>();
            let current: string | null | undefined = row.id;
            while (current && parents.has(current) && !checked.has(current)) {
                if (path.has(current)) {
                    cycle = true;
                    break;
                }
                path.add(current);
                current = parents.get(current);
            }
            for (const id of path) checked.add(id);
        }
        if (
            cycle ||
            !unique(backup.todos.map((row) => row.id)) ||
            !unique(backup.todoTypes.map((row) => row.id)) ||
            !unique(backup.todoTypes.map((row) => row.name)) ||
            !unique(backup.categories.map((row) => row.id)) ||
            !unique(backup.categories.map((row) => row.name)) ||
            !unique(
                backup.todos.flatMap((row) =>
                    row.recurrence_source_id ? [row.recurrence_source_id] : [],
                ),
            ) ||
            backup.todos.some(
                (row) =>
                    !types.has(row.type_id) ||
                    (row.category_id !== null &&
                        !categories.has(row.category_id)),
            )
        ) {
            context.addIssue({
                code: 'custom',
                message: 'Duplicate or missing backup references.',
            });
        }
    });

export type TodoBackup = z.infer<typeof backupSchema>;

export function validateBackup(value: unknown): TodoBackup {
    if (
        typeof value === 'object' &&
        value !== null &&
        'format' in value &&
        value.format === 'todoapp-backup' &&
        'version' in value &&
        value.version !== 1
    ) {
        throw new Error(
            'This backup uses a different format version. Update TodoApp before restoring it.',
        );
    }
    const result = backupSchema.safeParse(value);
    if (!result.success)
        throw new Error(
            'This file is not a valid TodoApp backup. Nothing has been changed.',
        );
    return result.data;
}

export function parseBackup(text: string): TodoBackup {
    if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES)
        throw new Error('Choose a TodoApp backup smaller than 20 MB.');
    let value: unknown;
    try {
        value = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch {
        throw new Error(
            'This file is not valid JSON. Choose a TodoApp backup file.',
        );
    }
    return validateBackup(value);
}

import * as Crypto from 'expo-crypto';

import { getDatabase } from '@/database/database';
import { mapTodoRow, type TodoRow } from '@/database/mappers';
import type { RecurrenceFrequency, Todo, TodoPriority } from '@/types/todo';

export type CreateTodoInput = {
    typeId: string;
    categoryId: string | null;

    subject: string;
    notes: string | null;

    priority: TodoPriority;

    dueDate: string | null;

    reminderAt: string | null;

    recurrenceFrequency: RecurrenceFrequency | null;
    recurrenceInterval: number | null;
};

export type UpdateTodoInput = CreateTodoInput;

function priorityToDatabase(priority: TodoPriority): number {
    return priority === 'high' ? 1 : 0;
}

export async function getTodoById(id: string): Promise<Todo | null> {
    const database = await getDatabase();

    const row = await database.getFirstAsync<TodoRow>(
        `
        SELECT *
        FROM todos
        WHERE id = ?
        `,
        id,
    );

    return row ? mapTodoRow(row) : null;
}

export async function getOpenTodos(): Promise<Todo[]> {
    const database = await getDatabase();

    const debugRows = await database.getAllAsync(
        `
        SELECT
            id,
            subject,
            status,
            recurrence_frequency,
            recurrence_interval
        FROM todos
        `,
    );

    console.log('ALL TODOS:', debugRows);

    const rows = await database.getAllAsync<TodoRow>(
        `
        SELECT *
        FROM todos
        WHERE status = 'open'
        ORDER BY
            CASE
                WHEN due_date IS NULL THEN 1
                ELSE 0
            END,
            due_date,
            due_time,
            priority DESC,
            created_at
        `,
    );

    return rows.map(mapTodoRow);
}

export async function getCompletedTodos(): Promise<Todo[]> {
    const database = await getDatabase();

    const rows = await database.getAllAsync<TodoRow>(
        `
        SELECT *
        FROM todos
        WHERE status = 'completed'
        ORDER BY completed_at DESC
        `,
    );

    return rows.map(mapTodoRow);
}

export async function createTodo(input: CreateTodoInput): Promise<Todo> {
    const database = await getDatabase();

    const id = Crypto.randomUUID();
    const now = new Date().toISOString();

    await database.runAsync(
        `
        INSERT INTO todos (
            id,
            type_id,
            category_id,
            subject,
            notes,
            status,
            priority,
            due_date,
            reminder_at,
            recurrence_frequency,
            recurrence_interval,
            created_at,
            updated_at,
            completed_at
        )
        VALUES (
            ?, ?, ?, ?, ?,
            'open',
            ?, ?, ?, ?, ?,
            ?, ?, NULL
        )
        `,
        id,
        input.typeId,
        input.categoryId ?? null,
        input.subject.trim(),
        input.notes ?? null,
        priorityToDatabase(input.priority),
        input.dueDate ?? null,
        input.reminderAt ?? null,
        input.recurrenceFrequency ?? null,
        input.recurrenceInterval ?? null,
        now,
        now,
    );

    const todo = await getTodoById(id);

    if (!todo) {
        throw new Error('Failed to create todo.');
    }

    return todo;
}

export async function updateTodo(
    id: string,
    input: UpdateTodoInput,
): Promise<void> {
    const database = await getDatabase();

    await database.runAsync(
        `
        UPDATE todos
        SET
            type_id = ?,
            category_id = ?,
            subject = ?,
            notes = ?,
            priority = ?,
            due_date = ?,
            reminder_at = ?,
            recurrence_frequency = ?,
            recurrence_interval = ?,
            updated_at = ?
        WHERE id = ?
        `,
        input.typeId,
        input.categoryId ?? null,
        input.subject.trim(),
        input.notes ?? null,
        priorityToDatabase(input.priority),
        input.dueDate ?? null,
        input.reminderAt ?? null,
        input.recurrenceFrequency ?? null,
        input.recurrenceInterval ?? null,
        new Date().toISOString(),
        id,
    );
}

export async function completeTodo(id: string): Promise<void> {
    const database = await getDatabase();

    const now = new Date().toISOString();

    await database.runAsync(
        `
        UPDATE todos
        SET
            status = 'completed',
            completed_at = ?,
            updated_at = ?
        WHERE id = ?
        `,
        now,
        now,
        id,
    );
}

export async function reopenTodo(id: string): Promise<void> {
    const database = await getDatabase();

    await database.runAsync(
        `
        UPDATE todos
        SET
            status = 'open',
            completed_at = NULL,
            updated_at = ?
        WHERE id = ?
        `,
        new Date().toISOString(),
        id,
    );
}

export async function deleteTodo(id: string): Promise<void> {
    const database = await getDatabase();

    await database.runAsync(
        `
        DELETE FROM todos
        WHERE id = ?
        `,
        id,
    );
}

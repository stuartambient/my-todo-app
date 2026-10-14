import * as Crypto from 'expo-crypto';

import { getDatabase } from '@/database/database';
import { mapTodoTypeRow, type TodoTypeRow } from '@/database/mappers';
import type { TodoType } from '@/types/todoType';

export type CreateTodoTypeInput = {
    name: string;
    icon?: string | null;
    sortOrder?: number;
};

export type UpdateTodoTypeInput = {
    name: string;
    icon: string | null;
    sortOrder: number;
};

export async function getActiveTodoTypes(): Promise<TodoType[]> {
    const database = await getDatabase();

    const rows = await database.getAllAsync<TodoTypeRow>(
        `
        SELECT *
        FROM todo_types
        WHERE active = 1
        ORDER BY sort_order, name
        `,
    );

    return rows.map(mapTodoTypeRow);
}

export async function getAllTodoTypes(): Promise<TodoType[]> {
    const database = await getDatabase();

    const rows = await database.getAllAsync<TodoTypeRow>(
        `
        SELECT *
        FROM todo_types
        ORDER BY sort_order, name
        `,
    );

    return rows.map(mapTodoTypeRow);
}

export async function getTodoTypeById(id: string): Promise<TodoType | null> {
    const database = await getDatabase();

    const row = await database.getFirstAsync<TodoTypeRow>(
        `
        SELECT *
        FROM todo_types
        WHERE id = ?
        `,
        id,
    );

    return row ? mapTodoTypeRow(row) : null;
}

export async function createTodoType(
    input: CreateTodoTypeInput,
): Promise<TodoType> {
    const database = await getDatabase();

    const id = Crypto.randomUUID();
    const now = new Date().toISOString();

    await database.runAsync(
        `
        INSERT INTO todo_types (
            id,
            name,
            icon,
            sort_order,
            active,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, 1, ?, ?)
        `,
        id,
        input.name.trim(),
        input.icon ?? null,
        input.sortOrder ?? 0,
        now,
        now,
    );

    const todoType = await getTodoTypeById(id);

    if (!todoType) {
        throw new Error('Failed to create todo type.');
    }

    return todoType;
}

export async function updateTodoType(
    id: string,
    input: UpdateTodoTypeInput,
): Promise<void> {
    const database = await getDatabase();

    await database.runAsync(
        `
        UPDATE todo_types
        SET
            name = ?,
            icon = ?,
            sort_order = ?,
            updated_at = ?
        WHERE id = ?
        `,
        input.name.trim(),
        input.icon,
        input.sortOrder,
        new Date().toISOString(),
        id,
    );
}

export async function deactivateTodoType(id: string): Promise<void> {
    const database = await getDatabase();

    await database.runAsync(
        `
        UPDATE todo_types
        SET
            active = 0,
            updated_at = ?
        WHERE id = ?
        `,
        new Date().toISOString(),
        id,
    );
}

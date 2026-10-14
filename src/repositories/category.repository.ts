import * as Crypto from 'expo-crypto';

import { getDatabase } from '@/database/database';
import { mapCategoryRow, type CategoryRow } from '@/database/mappers';
import type { Category } from '@/types/category';

export type CreateCategoryInput = {
    name: string;
    sortOrder?: number;
};

export type UpdateCategoryInput = {
    name: string;
    sortOrder: number;
};

export async function getActiveCategories(): Promise<Category[]> {
    const database = await getDatabase();

    const rows = await database.getAllAsync<CategoryRow>(
        `
        SELECT *
        FROM categories
        WHERE active = 1
        ORDER BY sort_order, name
        `,
    );

    return rows.map(mapCategoryRow);
}

export async function getAllCategories(): Promise<Category[]> {
    const database = await getDatabase();

    const rows = await database.getAllAsync<CategoryRow>(
        `
        SELECT *
        FROM categories
        ORDER BY sort_order, name
        `,
    );

    return rows.map(mapCategoryRow);
}

export async function getCategoryById(id: string): Promise<Category | null> {
    const database = await getDatabase();

    const row = await database.getFirstAsync<CategoryRow>(
        `
        SELECT *
        FROM categories
        WHERE id = ?
        `,
        id,
    );

    return row ? mapCategoryRow(row) : null;
}

export async function createCategory(
    input: CreateCategoryInput,
): Promise<Category> {
    const database = await getDatabase();

    const id = Crypto.randomUUID();
    const now = new Date().toISOString();

    await database.runAsync(
        `
        INSERT INTO categories (
            id,
            name,
            sort_order,
            active,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, 1, ?, ?)
        `,
        id,
        input.name.trim(),
        input.sortOrder ?? 0,
        now,
        now,
    );

    const category = await getCategoryById(id);

    if (!category) {
        throw new Error('Failed to create category.');
    }

    return category;
}

export async function updateCategory(
    id: string,
    input: UpdateCategoryInput,
): Promise<void> {
    const database = await getDatabase();

    await database.runAsync(
        `
        UPDATE categories
        SET
            name = ?,
            sort_order = ?,
            updated_at = ?
        WHERE id = ?
        `,
        input.name.trim(),
        input.sortOrder,
        new Date().toISOString(),
        id,
    );
}

export async function deactivateCategory(id: string): Promise<void> {
    const database = await getDatabase();

    await database.runAsync(
        `
        UPDATE categories
        SET
            active = 0,
            updated_at = ?
        WHERE id = ?
        `,
        new Date().toISOString(),
        id,
    );
}

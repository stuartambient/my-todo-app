import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

const DEFAULT_TODO_TYPES = [
    { name: 'Task', icon: 'checkmark-circle-outline', sortOrder: 1 },
    { name: 'Call', icon: 'call-outline', sortOrder: 2 },
    { name: 'Appointment', icon: 'calendar-outline', sortOrder: 3 },
    { name: 'Errand', icon: 'car-outline', sortOrder: 4 },
    { name: 'Purchase', icon: 'cart-outline', sortOrder: 5 },
    { name: 'Payment', icon: 'card-outline', sortOrder: 6 },
    { name: 'Follow-up', icon: 'return-up-forward-outline', sortOrder: 7 },
    { name: 'Reminder', icon: 'notifications-outline', sortOrder: 8 },
];

export async function seedDatabase(database: SQLiteDatabase): Promise<void> {
    const now = new Date().toISOString();

    for (const todoType of DEFAULT_TODO_TYPES) {
        await database.runAsync(
            `
            INSERT OR IGNORE INTO todo_types (
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
            Crypto.randomUUID(),
            todoType.name,
            todoType.icon,
            todoType.sortOrder,
            now,
            now,
        );
    }
}

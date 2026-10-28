import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type ReminderDelivery = {
    todoId: string;
    reminderAt: string;
    deliveredAt: number;
};
type NativeHistory = {
    getDeliveredRemindersAsync?: () => Promise<ReminderDelivery[]>;
    retainDeliveredRemindersAsync?: (keys: string[]) => Promise<void>;
};
function nativeHistory() {
    if (Platform.OS !== 'android') return null;
    return requireOptionalNativeModule<NativeHistory>('TodoExactAlarms');
}
export function deliveryKey(todoId: string, reminderAt: string): string {
    return JSON.stringify([todoId, reminderAt]);
}
export async function getDeliveredReminders(
    required = true,
): Promise<ReminderDelivery[]> {
    const native = nativeHistory();
    if (!native?.getDeliveredRemindersAsync) {
        if (required)
            throw new Error(
                'Rebuild TodoApp to enable restoring reminder notifications.',
            );
        return [];
    }
    const rows = await native.getDeliveredRemindersAsync();
    return rows.filter(
        (row) =>
            typeof row.todoId === 'string' &&
            row.todoId.length > 0 &&
            typeof row.reminderAt === 'string' &&
            Number.isFinite(Date.parse(row.reminderAt)) &&
            Number.isFinite(row.deliveredAt) &&
            row.deliveredAt > 0,
    );
}
/** Best effort during ordinary sync: history must never block working reminders. */
export async function maintainDeliveryHistory(
    todos: { id: string; status: string; reminderAt: string | null }[],
): Promise<void> {
    try {
        const native = nativeHistory();
        if (
            !native?.getDeliveredRemindersAsync ||
            !native.retainDeliveredRemindersAsync
        )
            return;
        await native.getDeliveredRemindersAsync(); // Also captures legacy cards still visible.
        await native.retainDeliveredRemindersAsync(
            todos.flatMap((todo) =>
                todo.status === 'open' && todo.reminderAt
                    ? [deliveryKey(todo.id, todo.reminderAt)]
                    : [],
            ),
        );
    } catch (error) {
        console.warn('Unable to update reminder delivery history:', error);
    }
}

import type { Category } from '@/types/category';
import type { RecurrenceFrequency, Todo, TodoStatus } from '@/types/todo';
import type { TodoType } from '@/types/todoType';

export type TodoTypeRow = {
    id: string;
    name: string;
    icon: string | null;
    sort_order: number;
    active: number;
    created_at: string;
    updated_at: string;
};

export type CategoryRow = {
    id: string;
    name: string;
    sort_order: number;
    active: number;
    created_at: string;
    updated_at: string;
};

export type TodoRow = {
    id: string;
    type_id: string;
    category_id: string | null;
    subject: string;
    notes: string | null;
    status: string;
    priority: number;
    due_date: string | null;
    due_time: string | null;
    reminder_at: string | null;
    recurrence_frequency: string | null;
    recurrence_interval: number | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
};

export function mapTodoTypeRow(row: TodoTypeRow): TodoType {
    return {
        id: row.id,
        name: row.name,
        icon: row.icon,
        sortOrder: row.sort_order,
        active: row.active === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function mapCategoryRow(row: CategoryRow): Category {
    return {
        id: row.id,
        name: row.name,
        sortOrder: row.sort_order,
        active: row.active === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function mapTodoRow(row: TodoRow): Todo {
    return {
        id: row.id,
        typeId: row.type_id,
        categoryId: row.category_id,
        subject: row.subject,
        notes: row.notes,
        status: row.status as TodoStatus,
        priority: row.priority === 1 ? 'high' : 'normal',
        dueDate: row.due_date,
        /* dueTime: row.due_time, */
        reminderAt: row.reminder_at,
        recurrenceFrequency:
            row.recurrence_frequency as RecurrenceFrequency | null,
        recurrenceInterval: row.recurrence_interval,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
    };
}

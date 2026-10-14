export type TodoStatus = 'open' | 'completed';

export type TodoPriority = 'normal' | 'high';

export type RecurrenceFrequency = 'day' | 'week' | 'month' | 'year';

export type Todo = {
    id: string;

    typeId: string;
    categoryId: string | null;

    subject: string;
    notes: string | null;

    status: TodoStatus;
    priority: TodoPriority;

    dueDate: string | null;

    reminderAt: string | null;

    recurrenceFrequency: RecurrenceFrequency | null;
    recurrenceInterval: number | null;

    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
};

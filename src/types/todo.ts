export type TodoStatus = 'open' | 'completed';

export type TodoPriority = 'normal' | 'high';

export type RecurrenceFrequency = 'day' | 'week' | 'month' | 'year';

export type RecurrenceBasis = 'due_date' | 'completion_date';

export type Todo = {
    id: string;
    // Read-time occurrence; not a persisted todo or scheduled notification.
    isProjected?: boolean;

    typeId: string;
    categoryId: string | null;

    subject: string;
    notes: string | null;

    status: TodoStatus;
    priority: TodoPriority;

    dueDate: string | null;
    dueTime: string | null;

    reminderAt: string | null;

    recurrenceFrequency: RecurrenceFrequency | null;
    recurrenceInterval: number | null;
    recurrenceBasis: RecurrenceBasis | null;
    recurrenceEndDate: string | null;
    recurrenceSeriesId: string | null;

    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
};

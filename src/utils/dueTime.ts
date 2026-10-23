export type DueTimeStatus = 'normal' | 'soon' | 'overdue';

export type DueTimeResult = {
    label: string;
    status: DueTimeStatus;
};

function getDueDateTime(dueDate: string, dueTime: string | null): Date {
    const [year, month, day] = dueDate.split('-').map(Number);

    if (dueTime) {
        const [hour, minute] = dueTime.split(':').map(Number);
        return new Date(year, month - 1, day, hour, minute, 0, 0);
    }
    return new Date(year, month - 1, day, 23, 59, 59, 999);
}

export function getDueTime(
    dueDate: string | null,
    dueTime: string | null = null,
    now = new Date(),
): DueTimeResult | null {
    if (!dueDate) {
        return null;
    }

    const due = getDueDateTime(dueDate, dueTime);
    const difference = due.getTime() - now.getTime();

    if (difference <= 0) {
        return {
            label: 'Overdue',
            status: 'overdue',
        };
    }

    const totalMinutes = Math.floor(difference / 60_000);

    const days = Math.floor(totalMinutes / 1440);

    const hours = Math.floor((totalMinutes % 1440) / 60);

    const minutes = totalMinutes % 60;

    let label: string;

    if (days > 0) {
        label = `${days}d ${hours}h`;
    } else if (hours > 0) {
        label = `${hours}h ${minutes}m`;
    } else {
        label = `${minutes}m`;
    }

    return {
        label,
        status: difference <= 24 * 60 * 60 * 1000 ? 'soon' : 'normal',
    };
}

// Stored as local HH:mm, independent of the reminder timestamp and timezone.
export function formatDueTime(value: string): string {
    const [hour, minute] = value.split(':').map(Number);
    return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    });
}

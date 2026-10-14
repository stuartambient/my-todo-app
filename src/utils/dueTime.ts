export type DueTimeStatus = 'normal' | 'soon' | 'overdue';

export type DueTimeResult = {
    label: string;
    status: DueTimeStatus;
};

function getEndOfDueDate(dueDate: string): Date {
    const [year, month, day] = dueDate.split('-').map(Number);

    return new Date(year, month - 1, day, 23, 59, 59, 999);
}

export function getDueTime(
    dueDate: string | null,
    now = new Date(),
): DueTimeResult | null {
    if (!dueDate) {
        return null;
    }

    const due = getEndOfDueDate(dueDate);
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

const listeners = new Set<(id: string) => void>();

export function subscribeTodoChanges(
    listener: (id: string) => void,
): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function notifyTodoChanged(id: string): void {
    for (const listener of listeners) listener(id);
}

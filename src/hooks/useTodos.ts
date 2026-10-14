import { useCallback, useEffect, useState } from 'react';

import {
    completeTodo,
    deleteTodo,
    getOpenTodos,
    reopenTodo,
} from '@/repositories/todo.repository';
import type { Todo } from '@/types/todo';

export function useTodos() {
    const [todos, setTodos] = useState<Todo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const result = await getOpenTodos();
            setTodos(result);
        } catch (err) {
            setError(
                err instanceof Error ? err : new Error('Failed to load todos.'),
            );
        } finally {
            setLoading(false);
        }
    }, []);

    const complete = useCallback(
        async (id: string) => {
            await completeTodo(id);
            await refresh();
        },
        [refresh],
    );

    const reopen = useCallback(
        async (id: string) => {
            await reopenTodo(id);
            await refresh();
        },
        [refresh],
    );

    const remove = useCallback(
        async (id: string) => {
            await deleteTodo(id);
            await refresh();
        },
        [refresh],
    );

    useEffect(() => {
        let cancelled = false;

        getOpenTodos()
            .then((result) => {
                if (!cancelled) {
                    setTodos(result);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err
                            : new Error('Failed to load todos.'),
                    );
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return {
        todos,
        loading,
        error,
        refresh,
        complete,
        reopen,
        remove,
    };
}

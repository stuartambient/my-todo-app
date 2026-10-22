import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { subscribeTodoChanges } from '@/services/todoChanges';

import {
    completeTodo,
    deleteTodo,
    getCompletedTodos,
    getOpenTodos,
    reopenTodo,
} from '@/repositories/todo.repository';
import type { Todo, TodoStatus } from '@/types/todo';

export function useTodos(status: TodoStatus = 'open') {
    const [todos, setTodos] = useState<Todo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const requestId = useRef(0);

    const refresh = useCallback(async () => {
        const currentRequest = ++requestId.current;

        setLoading(true);
        setError(null);

        try {
            const result =
                status === 'completed'
                    ? await getCompletedTodos()
                    : await getOpenTodos();

            if (currentRequest === requestId.current) {
                setTodos(result);
            }
        } catch (err) {
            console.error('Failed to load todos:', err);
            if (err instanceof Error) {
                console.error('Todo error stack:', err.stack);
            }
            if (currentRequest === requestId.current) {
                setError(
                    err instanceof Error
                        ? err
                        : new Error('Failed to load todos.'),
                );
            }
        } finally {
            if (currentRequest === requestId.current) {
                setLoading(false);
            }
        }
    }, [status]);

    useEffect(() => {
        const unsubscribe = subscribeTodoChanges(() => void refresh());
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') void refresh();
        });
        return () => {
            unsubscribe();
            subscription.remove();
        };
    }, [refresh]);

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
        const currentRequest = ++requestId.current;

        async function loadTodos() {
            try {
                const result =
                    status === 'completed'
                        ? await getCompletedTodos()
                        : await getOpenTodos();

                if (currentRequest === requestId.current) {
                    setTodos(result);
                    setError(null);
                }
            } catch (err) {
                console.error('Failed to load todos:', err);
                if (err instanceof Error) {
                    console.error('Todo error stack:', err.stack);
                }
                if (currentRequest === requestId.current) {
                    setError(
                        err instanceof Error
                            ? err
                            : new Error('Failed to load todos.'),
                    );
                }
            } finally {
                if (currentRequest === requestId.current) {
                    setLoading(false);
                }
            }
        }

        void loadTodos();

        return () => {
            requestId.current += 1;
        };
    }, [status]);

    return {
        todos: todos.filter((todo) => todo.status === status),
        loading,
        error,
        refresh,
        complete,
        reopen,
        remove,
    };
}

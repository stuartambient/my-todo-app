import { useCallback, useEffect, useState } from 'react';

import { getActiveTodoTypes } from '@/repositories/todoType.repository';
import type { TodoType } from '@/types/todoType';

export function useTodoTypes() {
    const [todoTypes, setTodoTypes] = useState<TodoType[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const result = await getActiveTodoTypes();
            setTodoTypes(result);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err
                    : new Error('Failed to load todo types.'),
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        getActiveTodoTypes()
            .then((result) => {
                if (!cancelled) {
                    setTodoTypes(result);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err
                            : new Error('Failed to load todo types.'),
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
        todoTypes,
        loading,
        error,
        refresh,
    };
}

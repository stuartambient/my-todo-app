import { useCallback, useEffect, useState } from 'react';

import {
    createCategory,
    getActiveCategories,
} from '@/repositories/category.repository';
import type { Category } from '@/types/category';

export function useCategories() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const result = await getActiveCategories();
            setCategories(result);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err
                    : new Error('Failed to load categories.'),
            );
        } finally {
            setLoading(false);
        }
    }, []);

    const addCategory = useCallback(
        async (name: string): Promise<Category> => {
            const category = await createCategory({ name });

            await refresh();

            return category;
        },
        [refresh],
    );

    useEffect(() => {
        let cancelled = false;

        getActiveCategories()
            .then((result) => {
                if (!cancelled) {
                    setCategories(result);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err
                            : new Error('Failed to load categories.'),
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
        categories,
        loading,
        error,
        refresh,
        addCategory,
    };
}

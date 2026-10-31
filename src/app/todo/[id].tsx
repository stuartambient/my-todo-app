import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    AppState,
    Alert,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { TodoForm } from '@/components/TodoForm';
import { subscribeTodoChanges } from '@/services/todoChanges';
import { useCategories } from '@/hooks/useCategories';
import { useTodoTypes } from '@/hooks/useTodoTypes';
import { useUnsavedTodoGuard } from '@/hooks/useUnsavedTodoGuard';
import {
    completeTodo,
    deleteTodo,
    getTodoById,
    reopenTodo,
    updateTodo,
} from '@/repositories/todo.repository';
import type { TodoFormValues } from '@/schemas/todo.schema';
import type { Todo } from '@/types/todo';

export default function EditTodoScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    // A notification can change the selected todo on an existing edit route.
    // Remount its state and form so previous values cannot be saved onto another todo.
    return <TodoEditor key={id} id={id} />;
}

function TodoEditor({ id }: { id: string }) {
    const guard = useUnsavedTodoGuard();
    const { dirtyRef } = guard;
    const [todo, setTodo] = useState<Todo | null>(null);
    const [loadingTodo, setLoadingTodo] = useState(true);
    const [todoError, setTodoError] = useState<Error | null>(null);

    const {
        todoTypes,
        loading: todoTypesLoading,
        error: todoTypesError,
    } = useTodoTypes();

    const {
        /* categories, */
        loading: categoriesLoading,
        error: categoriesError,
    } = useCategories();

    useEffect(() => {
        let cancelled = false;
        let requestVersion = 0;

        async function loadTodo() {
            const version = ++requestVersion;
            try {
                const result = await getTodoById(id);

                if (cancelled || version !== requestVersion) {
                    return;
                }

                // Resuming the app or a background notification must not remount
                // the form over a user's unsaved edits.
                if (dirtyRef.current) return;
                if (!result) {
                    setTodoError(new Error('Todo not found.'));
                    return;
                }

                setTodoError(null);
                setTodo(result);
            } catch (err) {
                if (
                    !cancelled &&
                    version === requestVersion &&
                    !dirtyRef.current
                ) {
                    setTodoError(
                        err instanceof Error
                            ? err
                            : new Error('Failed to load todo.'),
                    );
                }
            } finally {
                if (!cancelled && version === requestVersion) {
                    setLoadingTodo(false);
                }
            }
        }

        void loadTodo();
        const unsubscribe = subscribeTodoChanges((changedId) => {
            if (changedId === id) void loadTodo();
        });
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') void loadTodo();
        });

        return () => {
            cancelled = true;
            unsubscribe();
            subscription.remove();
        };
    }, [id, dirtyRef]);

    async function handleSubmit(values: TodoFormValues) {
        if (!todo) {
            return;
        }

        try {
            await guard.perform(
                () => updateTodo(todo.id, values),
                () => router.back(),
            );
        } catch (err) {
            console.error('Failed to update todo:', err);

            Alert.alert(
                'Unable to update todo',
                'An error occurred while saving the changes.',
            );
        }
    }

    async function handleToggleCompleted() {
        if (!todo) {
            return;
        }

        try {
            await guard.perform(
                () =>
                    todo.status === 'completed'
                        ? reopenTodo(todo.id)
                        : completeTodo(todo.id),
                () => router.back(),
            );
        } catch (err) {
            console.error('Failed to change todo status:', err);

            Alert.alert(
                'Unable to update todo',
                err instanceof Error
                    ? err.message
                    : 'An error occurred while changing the todo status.',
            );
        }
    }

    function handleDelete() {
        if (!todo) {
            return;
        }

        Alert.alert(
            'Delete Todo',
            `Delete "${todo.subject}"?${guard.dirtyRef.current ? ' Your unsaved changes will also be discarded.' : ''}`,
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        void guard
                            .perform(
                                () => deleteTodo(todo.id),
                                () => router.back(),
                            )
                            .catch((err) => {
                                console.error('Failed to delete todo:', err);

                                Alert.alert(
                                    'Unable to delete todo',
                                    'An error occurred while deleting the todo.',
                                );
                            });
                    },
                },
            ],
        );
    }

    const loading = loadingTodo || todoTypesLoading || categoriesLoading;

    const error = todoError ?? todoTypesError ?? categoriesError;

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (error || !todo) {
        return (
            <View style={styles.centered}>
                <Text style={styles.errorText}>
                    {error?.message ?? 'Todo not found.'}
                </Text>
            </View>
        );
    }

    const initialValues: TodoFormValues = {
        typeId: todo.typeId,
        categoryId: null,
        subject: todo.subject,
        notes: todo.notes,
        priority: todo.priority,
        dueDate: todo.dueDate,
        dueTime: todo.dueTime,
        reminderAt: todo.reminderAt,
        recurrenceFrequency: todo.recurrenceFrequency,
        recurrenceInterval: todo.recurrenceInterval,
        recurrenceEndDate: todo.recurrenceEndDate,
        recurrenceBasis: todo.recurrenceFrequency
            ? (todo.recurrenceBasis ?? 'due_date')
            : null,
    };

    return (
        <View style={styles.screen}>
            <View style={styles.formContainer}>
                <TodoForm
                    key={todo.updatedAt}
                    todoTypes={todoTypes}
                    /* categories={categories} */
                    initialValues={initialValues}
                    disabled={guard.busy}
                    onDirtyChange={guard.onDirtyChange}
                    submitLabel="Save Changes"
                    onSubmit={handleSubmit}
                />
            </View>

            <View style={styles.actions}>
                <Pressable
                    style={styles.secondaryButton}
                    disabled={guard.busy}
                    onPress={() =>
                        guard.confirmDiscard(
                            () => void handleToggleCompleted(),
                            `${todo.status === 'completed' ? 'Reopening' : 'Completing'} this todo will discard your unsaved changes.`,
                        )
                    }
                >
                    <Text style={styles.secondaryButtonText}>
                        {todo.status === 'completed'
                            ? 'Reopen Todo'
                            : 'Complete Todo'}
                    </Text>
                </Pressable>

                <Pressable
                    style={styles.deleteButton}
                    disabled={guard.busy}
                    onPress={handleDelete}
                >
                    <Text style={styles.deleteButtonText}>Delete Todo</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },

    formContainer: {
        flex: 1,
    },

    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },

    errorText: {
        color: '#b00020',
        fontSize: 16,
        textAlign: 'center',
    },

    actions: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
        gap: 10,
    },

    secondaryButton: {
        alignItems: 'center',
        paddingVertical: 13,
        borderWidth: 1,
        borderColor: '#555555',
        borderRadius: 8,
    },

    secondaryButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },

    deleteButton: {
        alignItems: 'center',
        paddingVertical: 13,
        borderWidth: 1,
        borderColor: '#b00020',
        borderRadius: 8,
    },

    deleteButtonText: {
        color: '#b00020',
        fontSize: 16,
        fontWeight: '600',
    },
});

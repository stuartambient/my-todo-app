import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    AppState,
    Alert,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { FutureTodoPreview } from '@/components/FutureTodoPreview';
import { TodoForm } from '@/components/TodoForm';
import { subscribeTodoChanges } from '@/services/todoChanges';
import { useCategories } from '@/hooks/useCategories';
import { useTodoTypes } from '@/hooks/useTodoTypes';
import { useUnsavedTodoGuard } from '@/hooks/useUnsavedTodoGuard';
import {
    completeTodo,
    deleteTodo,
    getTodoById,
    getSeriesEditingTodoId,
    reopenTodo,
    updateTodo,
} from '@/repositories/todo.repository';
import type { TodoFormValues } from '@/schemas/todo.schema';
import { homeColors } from '@/theme/homeColors';
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
    const loadedId = useRef(id);
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

                loadedId.current = result.id;
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
            if (changedId === id || changedId === loadedId.current)
                void loadTodo();
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

        const remove = (scope: 'occurrence' | 'series') => {
            void guard
                .perform(
                    () => deleteTodo(todo.id, scope),
                    () => router.back(),
                )
                .catch((err) => {
                    console.error('Failed to delete todo:', err);
                    Alert.alert(
                        'Unable to delete todo',
                        'An error occurred while deleting the todo.',
                    );
                });
        };
        const repeating = Boolean(
            todo.recurrenceFrequency || todo.recurrenceSeriesId,
        );
        Alert.alert(
            repeating ? 'Delete repeating todo' : 'Delete Todo',
            `${
                repeating
                    ? 'Delete just this occurrence, or stop the entire series and remove all its open occurrences? Completed history is kept when deleting the series.'
                    : `Delete "${todo.subject}"?`
            }${guard.dirtyRef.current ? ' Your unsaved changes will also be discarded.' : ''}`,
            repeating
                ? [
                      { text: 'Cancel', style: 'cancel' },
                      {
                          text: 'Delete this occurrence',
                          onPress: () => remove('occurrence'),
                      },
                      {
                          text: 'Delete entire series',
                          style: 'destructive',
                          onPress: () => remove('series'),
                      },
                  ]
                : [
                      { text: 'Cancel', style: 'cancel' },
                      {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => remove('occurrence'),
                      },
                  ],
        );
    }

    const loading = loadingTodo || todoTypesLoading || categoriesLoading;

    const error = todoError ?? todoTypesError ?? categoriesError;

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color={homeColors.accent} />
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

    if (todo.isProjected) {
        return (
            <>
                <Stack.Screen options={{ title: 'Future occurrence' }} />
                <FutureTodoPreview
                    todo={todo}
                    typeName={
                        todoTypes.find((type) => type.id === todo.typeId)
                            ?.name ?? 'Todo'
                    }
                    busy={guard.busy}
                    onComplete={() => void handleToggleCompleted()}
                    onDelete={handleDelete}
                    onEditSeries={() => {
                        void guard
                            .perform(
                                () => getSeriesEditingTodoId(todo.id),
                                (sourceId) =>
                                    router.replace({
                                        pathname: '/todo/[id]',
                                        params: { id: sourceId },
                                    }),
                            )
                            .catch((error) =>
                                Alert.alert(
                                    'Unable to open repeating todo',
                                    error instanceof Error
                                        ? error.message
                                        : 'Please try again.',
                                ),
                            );
                    }}
                />
            </>
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
        <>
            <Stack.Screen options={{ title: 'Edit Todo' }} />
            <TodoForm
                key={todo.updatedAt}
                todoTypes={todoTypes}
                initialValues={initialValues}
                disabled={guard.busy}
                onDirtyChange={guard.onDirtyChange}
                submitLabel="Save Changes"
                onSubmit={handleSubmit}
                secondaryActions={
                    <View style={styles.actions}>
                        <Pressable
                            style={({ pressed }) => [
                                styles.actionButton,
                                styles.secondaryButton,
                                (pressed || guard.busy) && styles.mutedButton,
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: guard.busy }}
                            disabled={guard.busy}
                            onPress={() =>
                                guard.confirmDiscard(
                                    () => void handleToggleCompleted(),
                                    `${todo.status === 'completed' ? 'Reopening' : 'Completing'} this todo will discard your unsaved changes.`,
                                )
                            }
                        >
                            <Text
                                style={[
                                    styles.actionText,
                                    styles.secondaryButtonText,
                                ]}
                            >
                                {todo.status === 'completed'
                                    ? 'Reopen Todo'
                                    : 'Complete Todo'}
                            </Text>
                        </Pressable>

                        <Pressable
                            style={({ pressed }) => [
                                styles.actionButton,
                                styles.deleteButton,
                                (pressed || guard.busy) && styles.mutedButton,
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: guard.busy }}
                            disabled={guard.busy}
                            onPress={handleDelete}
                        >
                            <Text
                                style={[
                                    styles.actionText,
                                    styles.deleteButtonText,
                                ]}
                            >
                                Delete Todo
                            </Text>
                        </Pressable>
                    </View>
                }
            />
        </>
    );
}

const styles = StyleSheet.create({
    centered: {
        flex: 1,
        backgroundColor: homeColors.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },

    errorText: {
        color: homeColors.overdue,
        fontSize: 16,
        textAlign: 'center',
    },

    actions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },

    actionButton: {
        flexGrow: 1,
        flexBasis: 130,
        minHeight: 44,
        paddingHorizontal: 8,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
    },

    actionText: {
        fontSize: 14,
        fontWeight: '700',
        textAlign: 'center',
    },

    secondaryButton: { backgroundColor: homeColors.accentSoft },
    secondaryButtonText: { color: homeColors.accent },
    deleteButton: { backgroundColor: homeColors.overdueSurface },
    deleteButtonText: { color: homeColors.overdue },
    mutedButton: { opacity: 0.55 },
});

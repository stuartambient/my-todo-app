import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { TodoForm } from '@/components/TodoForm';
import { useCategories } from '@/hooks/useCategories';
import { useTodoTypes } from '@/hooks/useTodoTypes';
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

        async function loadTodo() {
            try {
                const result = await getTodoById(id);

                if (cancelled) {
                    return;
                }

                if (!result) {
                    setTodoError(new Error('Todo not found.'));
                    return;
                }

                setTodo(result);
            } catch (err) {
                if (!cancelled) {
                    setTodoError(
                        err instanceof Error
                            ? err
                            : new Error('Failed to load todo.'),
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoadingTodo(false);
                }
            }
        }

        void loadTodo();

        return () => {
            cancelled = true;
        };
    }, [id]);

    async function handleSubmit(values: TodoFormValues) {
        if (!todo) {
            return;
        }

        try {
            await updateTodo(todo.id, values);
            router.back();
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
            if (todo.status === 'completed') {
                await reopenTodo(todo.id);
            } else {
                await completeTodo(todo.id);
            }

            router.back();
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

        Alert.alert('Delete Todo', `Delete "${todo.subject}"?`, [
            {
                text: 'Cancel',
                style: 'cancel',
            },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                    void deleteTodo(todo.id)
                        .then(() => {
                            router.back();
                        })
                        .catch((err) => {
                            console.error('Failed to delete todo:', err);

                            Alert.alert(
                                'Unable to delete todo',
                                'An error occurred while deleting the todo.',
                            );
                        });
                },
            },
        ]);
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
        reminderAt: todo.reminderAt,
        recurrenceFrequency: todo.recurrenceFrequency,
        recurrenceInterval: todo.recurrenceInterval,
        recurrenceBasis: todo.recurrenceFrequency
            ? (todo.recurrenceBasis ?? 'due_date')
            : null,
    };

    return (
        <View style={styles.screen}>
            <Stack.Screen
                options={{
                    title: 'Edit Todo',
                }}
            />

            <View style={styles.formContainer}>
                <TodoForm
                    todoTypes={todoTypes}
                    /* categories={categories} */
                    initialValues={initialValues}
                    submitLabel="Save Changes"
                    onSubmit={handleSubmit}
                />
            </View>

            <View style={styles.actions}>
                <Pressable
                    style={styles.secondaryButton}
                    onPress={() => void handleToggleCompleted()}
                >
                    <Text style={styles.secondaryButtonText}>
                        {todo.status === 'completed'
                            ? 'Reopen Todo'
                            : 'Complete Todo'}
                    </Text>
                </Pressable>

                <Pressable style={styles.deleteButton} onPress={handleDelete}>
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

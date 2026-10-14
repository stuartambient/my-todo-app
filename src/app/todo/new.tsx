import { router, Stack } from 'expo-router';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { TodoForm } from '@/components/TodoForm';
import { useCategories } from '@/hooks/useCategories';
import { useTodoTypes } from '@/hooks/useTodoTypes';
import { createTodo } from '@/repositories/todo.repository';
import type { TodoFormValues } from '@/schemas/todo.schema';

export default function NewTodoScreen() {
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

    const loading = todoTypesLoading || categoriesLoading;
    const error = todoTypesError ?? categoriesError;

    async function handleSubmit(values: TodoFormValues) {
        try {
            await createTodo(values);
            router.back();
        } catch (err) {
            console.error('Failed to create todo:', err);

            Alert.alert(
                'Unable to create todo',
                'An error occurred while saving the todo.',
            );
        }
    }

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.centered}>
                <Text style={styles.errorText}>{error.message}</Text>
            </View>
        );
    }

    return (
        <>
            <Stack.Screen
                options={{
                    title: 'New Todo',
                }}
            />

            <TodoForm
                todoTypes={todoTypes}
                /* categories={categories} */
                submitLabel="Create Todo"
                onSubmit={handleSubmit}
            />
        </>
    );
}

const styles = StyleSheet.create({
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
});

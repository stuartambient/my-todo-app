import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { useTodoTypes } from '@/hooks/useTodoTypes';
import { useTodos } from '@/hooks/useTodos';
import type { Todo, TodoStatus } from '@/types/todo';
import { getDueTime } from '@/utils/dueTime';

export default function HomeScreen() {
    const [status, setStatus] = useState<TodoStatus>('open');

    const { todos, loading, error, refresh, complete } = useTodos(status);
    const { todoTypes } = useTodoTypes();

    const showingCompleted = status === 'completed';

    useFocusEffect(
        useCallback(() => {
            void refresh();
        }, [refresh]),
    );

    const todoTypeNames = useMemo(
        () =>
            new Map(todoTypes.map((todoType) => [todoType.id, todoType.name])),
        [todoTypes],
    );

    async function handleComplete(id: string) {
        try {
            await complete(id);
        } catch (err) {
            Alert.alert(
                'Unable to complete todo',
                err instanceof Error ? err.message : 'Please try again.',
            );
        }
    }

    function renderTodo({ item }: { item: Todo }) {
        const typeName = todoTypeNames.get(item.typeId) ?? 'Todo';
        const isCompleted = item.status === 'completed';

        const dueTime = isCompleted ? null : getDueTime(item.dueDate);

        return (
            <View style={styles.todoRow}>
                {isCompleted ? (
                    <View style={styles.completeButton}>
                        <View
                            style={[styles.checkbox, styles.completedCheckbox]}
                        >
                            <Text style={styles.checkmark}>✓</Text>
                        </View>
                    </View>
                ) : (
                    <Pressable
                        style={styles.completeButton}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Mark ${item.subject} complete`}
                        onPress={() => {
                            void handleComplete(item.id);
                        }}
                    >
                        <View style={styles.checkbox} />
                    </Pressable>
                )}

                <Pressable
                    style={styles.todoContent}
                    onPress={() => router.push(`/todo/${item.id}`)}
                >
                    <View style={styles.subjectRow}>
                        <Text style={styles.subject} numberOfLines={1}>
                            {item.subject}
                        </Text>

                        {item.priority === 'high' && (
                            <Text style={styles.priority}>!</Text>
                        )}
                    </View>

                    <Text style={styles.metadata}>
                        {typeName}
                        {item.dueDate ? ` · ${item.dueDate}` : ''}
                    </Text>

                    {isCompleted && item.completedAt && (
                        <Text style={styles.completedText}>
                            Completed{' '}
                            {new Date(item.completedAt).toLocaleDateString()}
                        </Text>
                    )}

                    {dueTime && (
                        <Text
                            style={[
                                styles.dueTime,
                                dueTime.status === 'soon' && styles.dueTimeSoon,
                                dueTime.status === 'overdue' &&
                                    styles.dueTimeOverdue,
                            ]}
                        >
                            {dueTime.label}
                        </Text>
                    )}
                </Pressable>
            </View>
        );
    }

    return (
        <View style={styles.screen}>
            <Stack.Screen
                options={{
                    title: 'Todos',
                }}
            />

            <View style={styles.filterContainer}>
                <View style={styles.filterBar}>
                    <Pressable
                        style={[
                            styles.filterButton,
                            !showingCompleted && styles.filterButtonActive,
                        ]}
                        accessibilityRole="tab"
                        accessibilityState={{
                            selected: !showingCompleted,
                        }}
                        onPress={() => setStatus('open')}
                    >
                        <Text
                            style={[
                                styles.filterButtonText,
                                !showingCompleted &&
                                    styles.filterButtonTextActive,
                            ]}
                        >
                            Open
                        </Text>
                    </Pressable>

                    <Pressable
                        style={[
                            styles.filterButton,
                            showingCompleted && styles.filterButtonActive,
                        ]}
                        accessibilityRole="tab"
                        accessibilityState={{
                            selected: showingCompleted,
                        }}
                        onPress={() => setStatus('completed')}
                    >
                        <Text
                            style={[
                                styles.filterButtonText,
                                showingCompleted &&
                                    styles.filterButtonTextActive,
                            ]}
                        >
                            Completed
                        </Text>
                    </Pressable>
                </View>
            </View>

            {loading && todos.length === 0 ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" />
                </View>
            ) : error ? (
                <View style={styles.centered}>
                    <Text style={styles.errorText}>{error.message}</Text>

                    <Pressable
                        style={styles.retryButton}
                        onPress={() => void refresh()}
                    >
                        <Text style={styles.retryButtonText}>Retry</Text>
                    </Pressable>
                </View>
            ) : (
                <FlatList
                    data={todos}
                    keyExtractor={(item) => item.id}
                    renderItem={renderTodo}
                    contentContainerStyle={
                        todos.length === 0 ? styles.emptyList : styles.list
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyTitle}>
                                {showingCompleted
                                    ? 'No completed todos'
                                    : 'No open todos'}
                            </Text>

                            <Text style={styles.emptyText}>
                                {showingCompleted
                                    ? 'Todos you complete will appear here.'
                                    : 'Tap + to create a todo.'}
                            </Text>
                        </View>
                    }
                />
            )}

            <Pressable
                style={styles.addButton}
                accessibilityRole="button"
                accessibilityLabel="Create todo"
                onPress={() => router.push('/todo/new')}
            >
                <Text style={styles.addButtonText}>+</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#ffffff',
    },

    filterContainer: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 4,
    },

    filterBar: {
        flexDirection: 'row',
        padding: 4,
        borderRadius: 10,
        backgroundColor: '#eeeeee',
    },

    filterButton: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 7,
    },

    filterButtonActive: {
        backgroundColor: '#222222',
    },

    filterButtonText: {
        color: '#555555',
        fontSize: 15,
        fontWeight: '600',
    },

    filterButtonTextActive: {
        color: '#ffffff',
    },

    list: {
        padding: 16,
        paddingBottom: 100,
    },

    todoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 76,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#cccccc',
    },

    completeButton: {
        paddingRight: 14,
        paddingVertical: 10,
    },

    checkbox: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#555555',
        borderRadius: 12,
    },

    completedCheckbox: {
        borderColor: '#555555',
        backgroundColor: '#555555',
    },

    checkmark: {
        color: '#ffffff',
        fontSize: 15,
        fontWeight: '700',
    },

    todoContent: {
        flex: 1,
    },

    subjectRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    subject: {
        flex: 1,
        fontSize: 17,
        fontWeight: '600',
    },

    priority: {
        marginLeft: 10,
        color: '#b00020',
        fontSize: 20,
        fontWeight: '700',
    },

    metadata: {
        marginTop: 5,
        color: '#666666',
        fontSize: 13,
    },

    completedText: {
        marginTop: 3,
        color: '#666666',
        fontSize: 13,
    },

    dueTime: {
        marginTop: 3,
        color: '#555555',
        fontSize: 13,
        fontWeight: '600',
    },

    dueTimeSoon: {
        color: '#a05a00',
    },

    dueTimeOverdue: {
        color: '#b00020',
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

    retryButton: {
        marginTop: 16,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: '#222222',
    },

    retryButtonText: {
        color: '#ffffff',
        fontWeight: '600',
    },

    emptyList: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
        paddingBottom: 100,
    },

    emptyContainer: {
        alignItems: 'center',
    },

    emptyTitle: {
        fontSize: 20,
        fontWeight: '600',
    },

    emptyText: {
        marginTop: 8,
        color: '#666666',
        fontSize: 15,
        textAlign: 'center',
    },

    addButton: {
        position: 'absolute',
        right: 24,
        bottom: 24,
        width: 58,
        height: 58,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 29,
        backgroundColor: '#222222',
        elevation: 4,
    },

    addButtonText: {
        color: '#ffffff',
        fontSize: 34,
        lineHeight: 38,
        fontWeight: '300',
    },
});

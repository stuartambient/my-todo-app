import {
    router,
    Stack,
    useFocusEffect,
    useLocalSearchParams,
    useIsFocused,
    type Href,
} from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    BackHandler,
    SectionList,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { HomeViewMenu } from '@/components/HomeViewMenu';
import { ReminderNotice } from '@/components/ReminderNotice';
import { useTodoTypes } from '@/hooks/useTodoTypes';
import { useTodos } from '@/hooks/useTodos';
import { useRevealTodo } from '@/hooks/useRevealTodo';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import type { Todo, TodoStatus } from '@/types/todo';
import { formatDueTime, getDueTime } from '@/utils/dueTime';

type TodoSection = {
    key: string;
    title: string | null;
    data: Todo[];
};

function getDateKey(value: string): string {
    // Keep date-only values as local calendar dates.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    // For timestamps, group by the date on the user's device.
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function formatDateHeading(dateKey: string): string {
    const [year, month, day] = dateKey.split('-').map(Number);

    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

export default function HomeScreen() {
    const { createdTodoId } = useLocalSearchParams<{
        createdTodoId?: string;
    }>();
    const isFocused = useIsFocused();
    useMinuteTick(isFocused);
    const handledCreatedTodo = useRef<string | undefined>(undefined);
    const [status, setStatus] = useState<TodoStatus>('open');
    const [search, setSearch] = useState('');
    const openingScreen = useRef(false);

    const { todos, loading, error, refresh, complete } = useTodos(status);
    const { todoTypes, refresh: refreshTypes } = useTodoTypes();

    const showingCompleted = status === 'completed';
    const searchTerm = search.trim().toLowerCase();
    const searching = searchTerm.length > 0;
    const visibleTodos = useMemo(
        () =>
            searching
                ? todos.filter(
                      (todo) =>
                          todo.subject.toLowerCase().includes(searchTerm) ||
                          todo.notes?.toLowerCase().includes(searchTerm),
                  )
                : todos,
        [todos, searching, searchTerm],
    );

    const sections = useMemo<TodoSection[]>(() => {
        // Preserve the existing completed-list order without headings.
        if (showingCompleted) {
            return visibleTodos.length > 0
                ? [{ key: 'completed', title: null, data: visibleTodos }]
                : [];
        }

        const datedGroups = new Map<string, Todo[]>();
        const undatedTodos: Todo[] = [];

        for (const todo of visibleTodos) {
            if (!todo.dueDate) {
                undatedTodos.push(todo);
                continue;
            }

            const dateKey = getDateKey(todo.dueDate);
            const group = datedGroups.get(dateKey);

            if (group) {
                group.push(todo);
            } else {
                datedGroups.set(dateKey, [todo]);
            }
        }

        const result: TodoSection[] = [...datedGroups.entries()]
            .sort(([first], [second]) => first.localeCompare(second))
            .map(([dateKey, data]) => ({
                key: dateKey,
                title: formatDateHeading(dateKey),
                data,
            }));

        if (undatedTodos.length > 0) {
            result.push({
                key: 'undated',
                title: 'No due date',
                data: undatedTodos,
            });
        }

        return result;
    }, [visibleTodos, showingCompleted]);

    const finishReveal = useCallback(() => {
        router.setParams({ createdTodoId: undefined });
    }, []);
    const { list, onViewableItemsChanged, onScrollToIndexFailed } =
        useRevealTodo(
            sections,
            createdTodoId,
            isFocused && !showingCompleted && !searching && !loading && !error,
            finishReveal,
        );

    useFocusEffect(
        useCallback(() => {
            openingScreen.current = false;
            if (createdTodoId && handledCreatedTodo.current !== createdTodoId) {
                handledCreatedTodo.current = createdTodoId;
                setStatus('open');
                setSearch('');
            }
            void refresh();
            void refreshTypes();
        }, [refresh, refreshTypes, createdTodoId]),
    );

    useFocusEffect(
        useCallback(() => {
            if (!showingCompleted) return;
            const subscription = BackHandler.addEventListener(
                'hardwareBackPress',
                () => {
                    setStatus('open');
                    return true;
                },
            );
            return () => subscription.remove();
        }, [showingCompleted]),
    );

    const todoTypeNames = useMemo(
        () =>
            new Map(todoTypes.map((todoType) => [todoType.id, todoType.name])),
        [todoTypes],
    );

    function openScreen(href: Href) {
        // A second press during the transition must not add another edit screen.
        if (openingScreen.current) return;
        openingScreen.current = true;
        router.navigate(href);
    }

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

        const dueTime = isCompleted
            ? null
            : getDueTime(item.dueDate, item.dueTime);

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
                    onPress={() =>
                        openScreen({
                            pathname: '/todo/[id]',
                            params: { id: item.id },
                        })
                    }
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
                        {item.dueDate && item.dueTime
                            ? ` · ${formatDueTime(item.dueTime)}`
                            : ''}
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
                            {dueTime.status === 'overdue'
                                ? dueTime.label
                                : `Due in ${dueTime.label}`}
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
                    title: showingCompleted ? 'Completed' : 'Todos',
                    headerRight: showingCompleted
                        ? undefined
                        : () => (
                              <HomeViewMenu
                                  onViewCompleted={() => setStatus('completed')}
                              />
                          ),
                    headerLeft: showingCompleted
                        ? () => (
                              <Pressable
                                  style={styles.backToOpenButton}
                                  accessibilityRole="button"
                                  accessibilityLabel="Back to open todos"
                                  onPress={() => setStatus('open')}
                              >
                                  <Text style={styles.backToOpenText}>
                                      ‹ Open
                                  </Text>
                              </Pressable>
                          )
                        : undefined,
                }}
            />

            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder={
                        showingCompleted
                            ? 'Search completed todos'
                            : 'Search open todos'
                    }
                    placeholderTextColor="#777777"
                    accessibilityLabel="Search todos"
                    accessibilityHint="Search subjects and notes in the current list"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    underlineColorAndroid="transparent"
                />
                {search.length > 0 && (
                    <Pressable
                        style={styles.clearSearchButton}
                        accessibilityRole="button"
                        accessibilityLabel="Clear search"
                        onPress={() => setSearch('')}
                    >
                        <Text style={styles.clearSearchText}>Clear</Text>
                    </Pressable>
                )}
            </View>

            <View style={styles.reminderNoticeContainer}>
                <ReminderNotice />
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
                <SectionList<Todo, TodoSection>
                    ref={list}
                    onViewableItemsChanged={onViewableItemsChanged}
                    onScrollToIndexFailed={onScrollToIndexFailed}
                    sections={sections}
                    keyExtractor={(item) => item.id}
                    renderItem={renderTodo}
                    renderSectionHeader={({ section }) =>
                        section.title ? (
                            <Text
                                style={styles.dateHeading}
                                accessibilityRole="header"
                            >
                                {section.title}
                            </Text>
                        ) : null
                    }
                    stickySectionHeadersEnabled={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    contentContainerStyle={
                        visibleTodos.length === 0
                            ? styles.emptyList
                            : styles.list
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyTitle}>
                                {searching
                                    ? 'No matching todos'
                                    : showingCompleted
                                      ? 'No completed todos'
                                      : 'No open todos'}
                            </Text>

                            <Text style={styles.emptyText}>
                                {searching
                                    ? `Try different words or clear your search. Searching ${showingCompleted ? 'completed' : 'open'} todos only.`
                                    : showingCompleted
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
                onPress={() => openScreen('/todo/new')}
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

    backToOpenButton: {
        minHeight: 44,
        justifyContent: 'center',
        paddingRight: 16,
    },

    backToOpenText: {
        color: '#333333',
        fontSize: 17,
        fontWeight: '600',
    },

    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#cccccc',
        borderRadius: 10,
        backgroundColor: '#f7f7f7',
    },

    searchInput: {
        flex: 1,
        minWidth: 0,
        minHeight: 48,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: '#222222',
        fontSize: 16,
    },

    clearSearchButton: {
        minHeight: 48,
        justifyContent: 'center',
        paddingHorizontal: 12,
    },

    clearSearchText: {
        color: '#333333',
        fontSize: 14,
        fontWeight: '600',
    },

    reminderNoticeContainer: {
        paddingHorizontal: 16,
    },

    list: {
        paddingHorizontal: 16,
        paddingTop: 4,
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

    dateHeading: {
        marginTop: 20,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#dddddd',
        color: '#222222',
        fontSize: 18,
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

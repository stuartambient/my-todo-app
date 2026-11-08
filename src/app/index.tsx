import { parseISO } from 'date-fns';
import {
    router,
    Stack,
    useFocusEffect,
    useLocalSearchParams,
    useIsFocused,
    type Href,
} from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CustomDateRange, type DateRange } from '@/components/CustomDateRange';
import { HomeIcon } from '@/components/HomeIcon';
import { HomeViewMenu } from '@/components/HomeViewMenu';
import { ReminderNotice } from '@/components/ReminderNotice';
import { useTodoTypes } from '@/hooks/useTodoTypes';
import { useTodos } from '@/hooks/useTodos';
import { useRevealTodo } from '@/hooks/useRevealTodo';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import { homeColors } from '@/theme/homeColors';
import type { Todo, TodoStatus } from '@/types/todo';
import { formatDueTime, getDueTime } from '@/utils/dueTime';
import { localDateKey } from '@/utils/recurrence';
import { getTodoById } from '@/repositories/todo.repository';

const dateRanges = [
    { label: 'Today', daysAhead: 0 },
    { label: 'Next 7 days', daysAhead: 6 },
    { label: 'Next 30 days', daysAhead: 29 },
    { label: 'Custom…', daysAhead: null },
] as const;

type DaysAhead = Exclude<(typeof dateRanges)[number]['daysAhead'], null>;

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
    const { bottom } = useSafeAreaInsets();
    useMinuteTick(isFocused);
    const [status, setStatus] = useState<TodoStatus>('open');
    const [search, setSearch] = useState('');
    const [daysAhead, setDaysAhead] = useState<DaysAhead>(0);
    const [customRange, setCustomRange] = useState<DateRange | null>(null);
    const [editingRange, setEditingRange] = useState(false);
    const openingScreen = useRef(false);

    const { todoTypes, refresh: refreshTypes } = useTodoTypes();

    const showingCompleted = status === 'completed';
    const searchTerm = search.trim().toLowerCase();
    const searching = searchTerm.length > 0;
    const rangeEnd = new Date();
    rangeEnd.setDate(rangeEnd.getDate() + daysAhead);
    const firstVisibleDate =
        !showingCompleted && customRange ? customRange.from : null;
    const lastVisibleDate = showingCompleted
        ? null
        : customRange
          ? customRange.through
          : localDateKey(rangeEnd);

    const { todos, loading, error, refresh, complete } = useTodos(
        status,
        lastVisibleDate
            ? { from: firstVisibleDate, through: lastVisibleDate }
            : null,
    );

    const visibleTodos = useMemo(() => {
        if (!lastVisibleDate && !searching) return todos;

        return todos.filter((todo) => {
            if (lastVisibleDate) {
                if (!todo.dueDate) {
                    // Presets retain the undated section; Custom is date-only.
                    if (firstVisibleDate) return false;
                } else {
                    const due = getDateKey(todo.dueDate);
                    if (
                        due > lastVisibleDate ||
                        (firstVisibleDate && due < firstVisibleDate)
                    ) {
                        return false;
                    }
                }
            }

            return (
                !searching ||
                todo.subject.toLowerCase().includes(searchTerm) ||
                todo.notes?.toLowerCase().includes(searchTerm)
            );
        });
    }, [todos, firstVisibleDate, lastVisibleDate, searching, searchTerm]);

    const sections = useMemo<TodoSection[]>(() => {
        if (showingCompleted) {
            // The repository returns newest completions first. Group by that
            // date, rather than the due date, while retaining its row order.
            const groups = new Map<string, Todo[]>();
            for (const todo of visibleTodos) {
                const date = todo.completedAt
                    ? getDateKey(todo.completedAt)
                    : 'earlier';
                const group = groups.get(date) ?? [];
                group.push(todo);
                groups.set(date, group);
            }
            return Array.from(groups, ([date, data]) => ({
                key: `completed:${date}`,
                title:
                    date === 'earlier'
                        ? 'Earlier completions'
                        : formatDateHeading(date),
                data,
            }));
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

    useEffect(() => {
        if (!createdTodoId) return;
        let cancelled = false;
        // Keep a newly saved future todo visible without an unbounded view.
        void getTodoById(createdTodoId)
            .then((todo) => {
                if (cancelled) return;
                const today = localDateKey(new Date());
                const due = todo?.dueDate ? getDateKey(todo.dueDate) : null;
                setStatus('open');
                setSearch('');
                setDaysAhead(0);
                setEditingRange(false);
                setCustomRange(
                    due && due > today ? { from: today, through: due } : null,
                );
            })
            .catch((error) =>
                console.error('Unable to reveal saved todo:', error),
            );
        return () => {
            cancelled = true;
        };
    }, [createdTodoId]);

    useFocusEffect(
        useCallback(() => {
            openingScreen.current = false;
            void refresh();
            void refreshTypes();
        }, [refresh, refreshTypes]),
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

        const overdue = dueTime?.status === 'overdue';

        return (
            <View
                style={[
                    styles.todoRow,
                    isCompleted && styles.completedRow,
                    overdue && styles.todoRowOverdue,
                ]}
            >
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
                    style={({ pressed }) => [
                        styles.todoContent,
                        pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${isCompleted ? 'Review completed todo' : 'Open todo'}: ${item.subject}`}
                    accessibilityHint={
                        isCompleted
                            ? 'View details or reopen this todo'
                            : undefined
                    }
                    onPress={() =>
                        openScreen({
                            pathname: '/todo/[id]',
                            params: { id: item.id },
                        })
                    }
                >
                    <View style={styles.subjectRow}>
                        <Text
                            style={[
                                styles.subject,
                                isCompleted && styles.completedSubject,
                            ]}
                            numberOfLines={2}
                        >
                            {item.subject}
                        </Text>

                        {isCompleted && (
                            <Text style={styles.reviewLabel}>Review ›</Text>
                        )}
                        {item.priority === 'high' && (
                            <Text
                                style={styles.priority}
                                accessibilityLabel="High priority"
                            >
                                !
                            </Text>
                        )}
                    </View>

                    <View style={styles.detailsRow}>
                        {item.isProjected && (
                            <Text style={styles.plannedLabel}>Planned</Text>
                        )}
                        <Text style={styles.metadata}>
                            {typeName}
                            {item.dueDate ? ` · ${item.dueDate}` : ''}
                            {item.dueDate && item.dueTime
                                ? ` · ${formatDueTime(item.dueTime)}`
                                : ''}
                        </Text>

                        {dueTime && (
                            <Text
                                style={[
                                    styles.dueTime,
                                    dueTime.status === 'soon' &&
                                        styles.dueTimeSoon,
                                    dueTime.status === 'overdue' &&
                                        styles.dueTimeOverdue,
                                ]}
                            >
                                {dueTime.status === 'overdue'
                                    ? dueTime.label
                                    : `Due in ${dueTime.label}`}
                            </Text>
                        )}
                    </View>
                    {isCompleted && item.completedAt && (
                        <Text style={styles.completedText}>
                            Completed{' '}
                            {new Date(item.completedAt).toLocaleDateString()}
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
                    headerStyle: { backgroundColor: homeColors.canvas },
                    headerTintColor: homeColors.text,
                    headerShadowVisible: false,
                    headerRight: showingCompleted
                        ? undefined
                        : () => (
                              <HomeViewMenu
                                  onViewCompleted={() => {
                                      setEditingRange(false);
                                      setStatus('completed');
                                  }}
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
                                  <HomeIcon
                                      name="back"
                                      color={homeColors.accent}
                                  />
                                  <Text style={styles.backToOpenText}>
                                      Todos
                                  </Text>
                              </Pressable>
                          )
                        : undefined,
                }}
            />

            {showingCompleted && (
                <View style={styles.historyIntro}>
                    <Text
                        style={styles.historyTitle}
                        accessibilityRole="header"
                    >
                        Completed history
                    </Text>
                    <Text style={styles.historyDescription}>
                        A record of what you’ve finished. Open a todo to review
                        it or reopen it.
                    </Text>
                </View>
            )}
            <View style={styles.searchContainer}>
                <HomeIcon name="search" color={homeColors.muted} />
                <TextInput
                    style={styles.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder={
                        showingCompleted
                            ? 'Search completed todos'
                            : 'Search open todos'
                    }
                    placeholderTextColor={homeColors.muted}
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

            {!showingCompleted && (
                <View
                    style={styles.dateRanges}
                    accessibilityRole="radiogroup"
                    collapsable={false}
                >
                    {dateRanges.map((range) => {
                        const isCustom = range.daysAhead === null;
                        const selected = isCustom
                            ? Boolean(customRange)
                            : !customRange && daysAhead === range.daysAhead;
                        return (
                            <Pressable
                                key={range.label}
                                style={[
                                    styles.dateRange,
                                    selected && styles.dateRangeSelected,
                                ]}
                                accessibilityRole="radio"
                                accessibilityLabel={range.label}
                                accessibilityState={{
                                    checked: selected,
                                    expanded: isCustom
                                        ? editingRange
                                        : undefined,
                                }}
                                onPress={() => {
                                    if (range.daysAhead === null) {
                                        setEditingRange((editing) => !editing);
                                    } else {
                                        setDaysAhead(range.daysAhead);
                                        setCustomRange(null);
                                        setEditingRange(false);
                                    }
                                }}
                            >
                                <Text
                                    style={[
                                        styles.dateRangeLabel,
                                        selected &&
                                            styles.dateRangeLabelSelected,
                                    ]}
                                >
                                    {range.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            )}

            {!showingCompleted && customRange && !editingRange && (
                <Text style={styles.rangeSummary}>
                    {parseISO(customRange.from).toLocaleDateString()} –{' '}
                    {parseISO(customRange.through).toLocaleDateString()}
                </Text>
            )}

            {!showingCompleted && editingRange && (
                <CustomDateRange
                    initialRange={customRange}
                    onCancel={() => setEditingRange(false)}
                    onApply={(range) => {
                        setCustomRange(range);
                        setEditingRange(false);
                    }}
                />
            )}

            {!showingCompleted && (
                <View style={styles.reminderNoticeContainer}>
                    <ReminderNotice />
                </View>
            )}

            {loading && todos.length === 0 ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={homeColors.accent} />
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
                                style={[
                                    styles.dateHeading,
                                    showingCompleted &&
                                        styles.completedDateHeading,
                                ]}
                                accessibilityRole="header"
                            >
                                {section.title}
                            </Text>
                        ) : null
                    }
                    stickySectionHeadersEnabled={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    contentContainerStyle={[
                        visibleTodos.length === 0
                            ? styles.emptyList
                            : styles.list,
                        {
                            paddingBottom:
                                (showingCompleted ? 24 : 92) + bottom,
                        },
                    ]}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyTitle}>
                                {searching
                                    ? 'No matching todos'
                                    : showingCompleted
                                      ? 'No completed todos'
                                      : lastVisibleDate
                                        ? 'No todos in this range'
                                        : 'No open todos'}
                            </Text>

                            <Text style={styles.emptyText}>
                                {searching
                                    ? lastVisibleDate
                                        ? 'Try different words, clear your search, or choose a wider range.'
                                        : `Try different words or clear your search. Searching ${showingCompleted ? 'completed' : 'open'} todos only.`
                                    : showingCompleted
                                      ? 'Todos you complete will appear here. Open one to review it or reopen it.'
                                      : lastVisibleDate
                                        ? 'Choose another range or use Custom to see other dates.'
                                        : 'Tap + to create a todo.'}
                            </Text>
                        </View>
                    }
                />
            )}

            {!showingCompleted && (
                <Pressable
                    style={({ pressed }) => [
                        styles.addButton,
                        { bottom: 16 + bottom },
                        pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Create todo"
                    onPress={() => openScreen('/todo/new')}
                >
                    <HomeIcon name="add" color={homeColors.surface} />
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: homeColors.canvas,
    },

    backToOpenButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        minHeight: 44,
        justifyContent: 'center',
        paddingRight: 16,
    },

    backToOpenText: {
        color: homeColors.text,
        fontSize: 17,
        fontWeight: '600',
    },

    rangeSummary: {
        marginHorizontal: 16,
        marginTop: 6,
        color: homeColors.muted,
    },
    dateRanges: {
        flexDirection: 'row',
        gap: 6,
        marginHorizontal: 16,
        marginTop: 8,
    },
    dateRange: {
        flex: 1,
        minWidth: 0,
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 4,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: homeColors.border,
        backgroundColor: homeColors.surface,
    },
    dateRangeSelected: {
        backgroundColor: homeColors.accent,
        borderColor: homeColors.accent,
    },
    dateRangeLabel: {
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '600',
        color: homeColors.text,
    },
    dateRangeLabelSelected: {
        color: '#ffffff',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: 8,
        paddingStart: 12,
        borderWidth: 1,
        borderColor: homeColors.border,
        borderRadius: 10,
        backgroundColor: homeColors.surface,
    },

    searchInput: {
        flex: 1,
        minWidth: 0,
        minHeight: 48,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: homeColors.text,
        fontSize: 16,
    },

    clearSearchButton: {
        minHeight: 48,
        justifyContent: 'center',
        paddingHorizontal: 12,
    },

    clearSearchText: {
        color: homeColors.text,
        fontSize: 14,
        fontWeight: '600',
    },

    reminderNoticeContainer: {
        paddingHorizontal: 16,
    },

    list: {
        paddingHorizontal: 16,
        paddingTop: 4,
    },

    todoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 64,
        marginBottom: 4,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: homeColors.border,
        borderStartWidth: 3,
        backgroundColor: homeColors.surface,
    },

    todoRowOverdue: {
        borderStartColor: homeColors.overdueEdge,
        backgroundColor: homeColors.overdueSurface,
    },

    completeButton: {
        width: 46,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },

    checkbox: {
        width: 22,
        height: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: homeColors.muted,
        borderRadius: 11,
    },

    completedCheckbox: {
        borderColor: homeColors.muted,
        backgroundColor: homeColors.muted,
    },
    completedRow: { borderStartWidth: 1 },
    completedSubject: { color: homeColors.muted, fontWeight: '600' },
    reviewLabel: {
        color: homeColors.accent,
        fontSize: 12,
        fontWeight: '600',
        marginStart: 8,
    },
    completedDateHeading: {
        backgroundColor: 'transparent',
        color: homeColors.muted,
        fontSize: 14,
        paddingHorizontal: 2,
        paddingVertical: 4,
    },
    historyIntro: {
        marginHorizontal: 18,
        marginTop: 8,
        marginBottom: 6,
        gap: 6,
    },
    historyTitle: { color: homeColors.text, fontSize: 22, fontWeight: '700' },
    historyDescription: {
        color: homeColors.muted,
        fontSize: 14,
        lineHeight: 21,
    },

    checkmark: {
        color: homeColors.surface,
        fontSize: 14,
        fontWeight: '700',
    },

    dateHeading: {
        marginTop: 14,
        marginBottom: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: homeColors.accentSoft,
        color: homeColors.text,
        fontSize: 16,
        fontWeight: '700',
    },

    todoContent: {
        flex: 1,
        minHeight: 44,
        justifyContent: 'center',
        paddingEnd: 12,
        paddingVertical: 8,
    },

    pressed: { opacity: 0.72 },

    plannedLabel: { color: homeColors.accent, fontSize: 12, fontWeight: '700' },
    detailsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 8,
        rowGap: 3,
        marginTop: 3,
    },

    subjectRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    subject: {
        flex: 1,
        color: homeColors.text,
        fontSize: 16,
        fontWeight: '700',
    },

    priority: {
        marginLeft: 10,
        color: homeColors.overdue,
        fontSize: 20,
        fontWeight: '700',
    },

    metadata: {
        flexShrink: 1,
        color: homeColors.muted,
        fontSize: 13,
    },

    completedText: {
        marginTop: 4,
        flexShrink: 1,
        color: homeColors.muted,
        fontSize: 13,
    },

    dueTime: {
        flexShrink: 1,
        color: homeColors.muted,
        fontSize: 13,
        fontWeight: '600',
    },

    dueTimeSoon: {
        color: homeColors.soon,
    },

    dueTimeOverdue: {
        color: homeColors.overdue,
        backgroundColor: homeColors.overdueBadge,
        borderRadius: 5,
        overflow: 'hidden',
        paddingHorizontal: 6,
        paddingVertical: 2,
        fontWeight: '700',
    },

    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },

    errorText: {
        color: homeColors.overdue,
        fontSize: 16,
        textAlign: 'center',
    },

    retryButton: {
        marginTop: 16,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: homeColors.accent,
    },

    retryButtonText: {
        color: '#ffffff',
        fontWeight: '600',
    },

    emptyList: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
    },

    emptyContainer: {
        alignItems: 'center',
        padding: 24,
        borderWidth: 1,
        borderColor: homeColors.border,
        borderRadius: 14,
        backgroundColor: homeColors.surface,
    },

    emptyTitle: {
        color: homeColors.text,
        textAlign: 'center',
        fontSize: 20,
        fontWeight: '600',
    },

    emptyText: {
        marginTop: 8,
        color: homeColors.muted,
        fontSize: 15,
        textAlign: 'center',
    },

    addButton: {
        position: 'absolute',
        right: 24,
        width: 56,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 18,
        backgroundColor: homeColors.accent,
        elevation: 4,
    },
});

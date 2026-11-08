import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { BackHandler } from 'react-native';
import HomeScreen from '@/app/index';
import { useTodos } from '@/hooks/useTodos';
import type { Todo, TodoStatus } from '@/types/todo';
import { localDateKey } from '@/utils/recurrence';
import { getTodoById } from '@/repositories/todo.repository';

jest.mock('@react-native-community/datetimepicker', () => ({
    DateTimePickerAndroid: { open: jest.fn() },
}));

jest.mock('expo-router', () => ({
    router: { navigate: jest.fn(), setParams: jest.fn(), push: jest.fn() },
    useLocalSearchParams: jest.fn(() => ({})),
    useIsFocused: () => true,
    Stack: {
        Screen: ({
            options,
        }: {
            options: {
                title: string;
                headerLeft?: () => import('react').ReactNode;
                headerRight?: () => import('react').ReactNode;
            };
        }) => {
            const { View, Text } =
                jest.requireActual<typeof import('react-native')>(
                    'react-native',
                );
            return (
                <View>
                    <Text>{options.title}</Text>
                    {options.headerLeft?.()}
                    {options.headerRight?.()}
                </View>
            );
        },
    },
    useFocusEffect: (callback: () => void) => {
        const React = jest.requireActual<typeof import('react')>('react');
        React.useEffect(callback, [callback]);
    },
}));
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}));
jest.mock('@/components/ReminderNotice', () => ({
    ReminderNotice: () => null,
}));
const mockRefreshTypes = jest.fn();
jest.mock('@/hooks/useTodoTypes', () => ({
    useTodoTypes: () => ({ todoTypes: [], refresh: mockRefreshTypes }),
}));
jest.mock('@/hooks/useTodos', () => ({ useTodos: jest.fn() }));
jest.mock('@/repositories/todo.repository', () => ({ getTodoById: jest.fn() }));

const makeTodo = (values: Partial<Todo>): Todo => ({
    id: 'one',
    subject: 'Pay electricity',
    notes: null,
    status: 'open',
    typeId: 'general',
    categoryId: null,
    priority: 'normal',
    dueDate: localDateKey(new Date()),
    dueTime: null,
    reminderAt: null,
    recurrenceFrequency: null,
    recurrenceInterval: null,
    recurrenceBasis: null,
    recurrenceEndDate: null,
    recurrenceSeriesId: null,
    createdAt: '2030-06-01T12:00:00.000Z',
    updatedAt: '2030-06-01T12:00:00.000Z',
    completedAt: null,
    ...values,
});
let todos: Todo[];
const refresh = jest.fn<() => Promise<void>>();
const complete = jest.fn<(id: string) => Promise<void>>();

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useLocalSearchParams).mockReturnValue({});
    todos = [
        makeTodo({}),
        makeTodo({
            id: 'two',
            subject: 'Call bank',
            notes: 'Ask about payment',
        }),
        makeTodo({ id: 'three', subject: 'Buy groceries', dueDate: null }),
        makeTodo({
            id: 'four',
            subject: 'Pay rent',
            status: 'completed',
            completedAt: '2030-06-01T12:00:00.000Z',
        }),
    ];
    jest.mocked(getTodoById).mockImplementation(
        async (id) => todos.find((todo) => todo.id === id) ?? null,
    );
    refresh.mockResolvedValue(undefined);
    complete.mockResolvedValue(undefined);
    jest.mocked(useTodos).mockImplementation((status: TodoStatus = 'open') => ({
        todos: todos.filter((todo) => todo.status === status),
        loading: false,
        error: null,
        refresh,
        complete,
        reopen: jest.fn<() => Promise<void>>(),
        remove: jest.fn<() => Promise<void>>(),
    }));
});

test('searches subjects and notes without case sensitivity, preserving date headings', async () => {
    await render(<HomeScreen />);
    await fireEvent.changeText(
        screen.getByLabelText('Search todos'),
        '  PAY  ',
    );
    expect(screen.getByText('Pay electricity')).toBeTruthy();
    expect(screen.getByText('Call bank')).toBeTruthy();
    expect(screen.queryByText('Buy groceries')).toBeNull();
    expect(screen.queryByText('Pay rent')).toBeNull();
    expect(screen.getByRole('header').props.children).toContain(
        String(new Date().getFullYear()),
    );
    expect(screen.queryByText('No due date')).toBeNull();
    expect(complete).not.toHaveBeenCalled();
});

test('keeps the query when viewing completed and clearing restores the current list', async () => {
    await render(<HomeScreen />);
    await fireEvent.changeText(screen.getByLabelText('Search todos'), 'rent');
    expect(screen.getByText('No matching todos')).toBeTruthy();
    await viewCompleted();
    expect(screen.getByText('Pay rent')).toBeTruthy();
    expect(screen.getByLabelText('Search todos').props.value).toBe('rent');
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('Pay rent')).toBeTruthy();
    expect(screen.queryByText('Pay electricity')).toBeNull();
    expect(screen.getByLabelText('Search todos').props.value).toBe('');
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
});

test('matches literal punctuation and clearing restores undated todos', async () => {
    todos[0].notes = 'Invoice [2029]';
    await render(<HomeScreen />);
    await fireEvent.changeText(screen.getByLabelText('Search todos'), '[2029]');
    expect(screen.getByText('Pay electricity')).toBeTruthy();
    expect(screen.queryByText('Call bank')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('Buy groceries')).toBeTruthy();
    expect(screen.getByText('No due date')).toBeTruthy();
});

test('distinguishes no matches from an empty list and whitespace shows all todos', async () => {
    todos = [];
    await render(<HomeScreen />);
    expect(screen.getByText('No todos in this range')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search todos'), 'rent');
    expect(screen.getByText('No matching todos')).toBeTruthy();
    expect(screen.getByText(/choose a wider range/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search todos'), '   ');
    expect(screen.getByText('No todos in this range')).toBeTruthy();
});

test('returning from creation clears search and selects Open so the saved todo is available', async () => {
    const { rerender } = await render(<HomeScreen />);
    await viewCompleted();
    await fireEvent.changeText(screen.getByLabelText('Search todos'), 'rent');
    expect(screen.getByText('Pay rent')).toBeTruthy();
    jest.mocked(useLocalSearchParams).mockReturnValue({ createdTodoId: 'one' });
    await rerender(<HomeScreen />);
    expect(screen.getByText('Todos')).toBeTruthy();
    expect(
        screen.queryByRole('button', { name: 'Back to open todos' }),
    ).toBeNull();
    expect(screen.getByLabelText('Search todos').props.value).toBe('');
    expect(screen.getByText('Pay electricity')).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
});

test('shows local due times in both Open and Completed while keeping the date heading', async () => {
    todos[0].dueTime = '15:05';
    todos[3].dueTime = '00:00';
    await render(<HomeScreen />);
    const afternoon = new Date(2000, 0, 1, 15, 5).toLocaleTimeString(
        undefined,
        { hour: 'numeric', minute: '2-digit' },
    );
    expect(
        screen.getByText(`Todo · ${todos[0].dueDate} · ${afternoon}`),
    ).toBeTruthy();
    expect(
        screen.getByRole('header', {
            name: new RegExp(String(new Date().getFullYear())),
        }).props.children,
    ).toContain(String(new Date().getFullYear()));
    await viewCompleted();
    const midnight = new Date(2000, 0, 1).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    });
    expect(
        screen.getByText(`Todo · ${todos[3].dueDate} · ${midnight}`),
    ).toBeTruthy();
});

async function viewCompleted() {
    await fireEvent.press(screen.getByRole('button', { name: 'Todo options' }));
    await fireEvent.press(
        screen.getByRole('button', { name: 'View completed' }),
    );
}

afterEach(() => {
    jest.restoreAllMocks();
});

test('Open is the default without tabs, and the menu leads to Completed and back', async () => {
    await render(<HomeScreen />);
    expect(screen.getByText('Todos')).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByText('View completed')).toBeNull();
    expect(screen.getByText('Pay electricity')).toBeTruthy();
    await viewCompleted();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('Pay rent')).toBeTruthy();
    expect(screen.queryByText('Pay electricity')).toBeNull();
    await fireEvent.press(
        screen.getByRole('button', { name: 'Back to open todos' }),
    );
    expect(screen.getByText('Todos')).toBeTruthy();
    expect(screen.getByText('Pay electricity')).toBeTruthy();
});

test('closing the options menu leaves the current list and search unchanged', async () => {
    await render(<HomeScreen />);
    await fireEvent.changeText(
        screen.getByLabelText('Search todos'),
        'electric',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Todo options' }));
    await fireEvent.press(
        screen.getByRole('button', { name: 'Close todo options' }),
    );
    expect(screen.queryByText('View completed')).toBeNull();
    expect(screen.getByLabelText('Search todos').props.value).toBe('electric');
    expect(screen.getByText('Pay electricity')).toBeTruthy();
});

test('Android Back leaves Completed for Open and preserves the search', async () => {
    let goBack: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
    const remove = jest.fn();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(
        (_event, handler) => {
            goBack = handler;
            return { remove };
        },
    );
    await render(<HomeScreen />);
    await fireEvent.changeText(screen.getByLabelText('Search todos'), 'pay');
    await viewCompleted();
    expect(goBack).toBeDefined();
    await act(() => {
        expect(goBack!({} as never)).toBe(true);
    });
    expect(screen.getByText('Todos')).toBeTruthy();
    expect(screen.getByLabelText('Search todos').props.value).toBe('pay');
    expect(remove).toHaveBeenCalled();
});

test('countdowns explain Due in while overdue labels stay unambiguous', async () => {
    todos[1].dueDate = '2010-01-01';
    await render(<HomeScreen />);
    expect(screen.getByText(/^Due in /)).toBeTruthy();
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.queryByText('Due in Overdue')).toBeNull();
});

test('date ranges include overdue and the inclusive cutoff and combine with search', async () => {
    const dateAt = (offset: number) => {
        const date = new Date();
        date.setDate(date.getDate() + offset);
        return localDateKey(date);
    };
    todos = [
        ...[-1, 0, 1, 6, 7, 29, 30].map((offset) =>
            makeTodo({
                id: String(offset),
                subject: `Task at ${offset}`,
                dueDate: dateAt(offset),
            }),
        ),
        makeTodo({ id: 'undated', subject: 'Undated task', dueDate: null }),
    ];

    await render(<HomeScreen />);
    const select = (name: string) =>
        fireEvent.press(screen.getByRole('radio', { name }));
    expect(
        screen.getByRole('radio', { name: 'Today', checked: true }),
    ).toBeTruthy();
    const search = (query: string) =>
        fireEvent.changeText(screen.getByLabelText('Search todos'), query);
    // Search for distant rows so SectionList's initial render window doesn't
    // determine whether the assertions can see them.
    await search('Task at 30');
    expect(screen.getByText('No matching todos')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'All open' })).toBeNull();
    await search('Undated task');
    expect(screen.getByText('Undated task')).toBeTruthy();
    await select('Today');
    expect(screen.getByText('Undated task')).toBeTruthy();
    await search('');
    expect(screen.getByText('Task at -1')).toBeTruthy();
    expect(screen.getByText('Task at 0')).toBeTruthy();
    expect(screen.queryByText('Task at 1')).toBeNull();

    await select('Next 7 days');
    await search('Task at 6');
    expect(screen.getByText('Task at 6')).toBeTruthy();
    await search('Task at 7');
    expect(screen.getByText('No matching todos')).toBeTruthy();

    await select('Next 30 days');
    expect(screen.getByText('Task at 7')).toBeTruthy();
    await search('Task at 29');
    expect(screen.getByText('Task at 29')).toBeTruthy();
    await search('Task at 30');
    expect(screen.getByText('No matching todos')).toBeTruthy();
    await search('Undated task');
    expect(screen.getByText('Undated task')).toBeTruthy();
});

test('Completed ignores the date range and creating an undated todo reveals it in Today', async () => {
    const { rerender } = await render(<HomeScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Today' }));
    expect(screen.getByText('Buy groceries')).toBeTruthy();
    await viewCompleted();
    expect(screen.getByText('Pay rent')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Today' })).toBeNull();
    await fireEvent.press(
        screen.getByRole('button', { name: 'Back to open todos' }),
    );
    expect(
        screen.getByRole('radio', { name: 'Today', checked: true }),
    ).toBeTruthy();
    jest.mocked(useLocalSearchParams).mockReturnValue({
        createdTodoId: 'three',
    });
    await rerender(<HomeScreen />);
    expect(
        screen.getByRole('radio', { name: 'Today', checked: true }),
    ).toBeTruthy();
    expect(screen.getByText('Buy groceries')).toBeTruthy();
});

test('custom dates are inclusive, reject a reversed range, and only apply on confirmation', async () => {
    todos = [
        makeTodo({
            id: 'before',
            subject: 'Before range',
            dueDate: '2020-11-06',
        }),
        makeTodo({ id: 'first', subject: 'First day', dueDate: '2020-11-07' }),
        makeTodo({ id: 'last', subject: 'Last day', dueDate: '2020-11-10' }),
        makeTodo({
            id: 'after',
            subject: 'After range',
            dueDate: '2020-11-11',
        }),
        makeTodo({ id: 'undated', subject: 'Undated', dueDate: null }),
    ];
    await render(<HomeScreen />);
    const press = (name: string) =>
        fireEvent.press(screen.getByRole('button', { name }));
    const openCustom = () =>
        fireEvent.press(screen.getByRole('radio', { name: 'Custom…' }));
    const pick = async (field: string, day: number) => {
        await press(field);
        const picker = jest.mocked(DateTimePickerAndroid.open).mock
            .lastCall![0];
        await act(() =>
            picker.onValueChange!({} as never, new Date(2020, 10, day)),
        );
    };

    await openCustom();
    await pick('From', 7);
    await pick('Through', 6);
    expect(
        screen.getByRole('button', { name: 'Apply range', disabled: true }),
    ).toBeTruthy();
    expect(screen.getByText('Before range')).toBeTruthy();
    await pick('Through', 10);
    await press('Apply range');
    expect(
        screen.getByRole('radio', { name: 'Custom…', checked: true }),
    ).toBeTruthy();
    expect(useTodos).toHaveBeenLastCalledWith('open', {
        from: '2020-11-07',
        through: '2020-11-10',
    });
    expect(screen.getByText('First day')).toBeTruthy();
    expect(screen.getByText('Last day')).toBeTruthy();
    expect(screen.queryByText('Before range')).toBeNull();
    expect(screen.queryByText('After range')).toBeNull();
    expect(screen.queryByText('Undated')).toBeNull();

    await openCustom();
    await pick('From', 10);
    await press('Cancel');
    expect(screen.getByText('First day')).toBeTruthy();
    expect(screen.getByText('Last day')).toBeTruthy();
});

test('creating a future todo opens a bounded Custom range to reveal it', async () => {
    const due = new Date();
    due.setDate(due.getDate() + 45);
    todos.push(
        makeTodo({
            id: 'future',
            subject: 'Future appointment',
            dueDate: localDateKey(due),
        }),
    );
    const { rerender } = await render(<HomeScreen />);
    expect(screen.queryByText('Future appointment')).toBeNull();
    jest.mocked(useLocalSearchParams).mockReturnValue({
        createdTodoId: 'future',
    });
    await rerender(<HomeScreen />);
    expect(
        screen.getByRole('radio', { name: 'Custom…', checked: true }),
    ).toBeTruthy();
    expect(useTodos).toHaveBeenLastCalledWith('open', {
        from: localDateKey(new Date()),
        through: localDateKey(due),
    });
    await fireEvent.changeText(
        screen.getByLabelText('Search todos'),
        'Future appointment',
    );
    expect(screen.getByText('Future appointment')).toBeTruthy();
});

test('completed history groups by completion day and opens a todo for review without completing it again', async () => {
    const latest = new Date(2030, 5, 14, 12);
    const previous = new Date(2030, 5, 13, 12);
    todos = [
        makeTodo({
            id: 'latest',
            subject: 'Finished latest',
            status: 'completed',
            dueDate: '2090-01-01',
            completedAt: latest.toISOString(),
        }),
        makeTodo({
            id: 'previous',
            subject: 'Finished earlier',
            status: 'completed',
            dueDate: '2090-01-01',
            completedAt: previous.toISOString(),
        }),
    ];
    await render(<HomeScreen />);
    await viewCompleted();
    const heading = (date: Date) =>
        date.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
    expect(screen.getByRole('header', { name: heading(latest) })).toBeTruthy();
    expect(
        screen.getByRole('header', { name: heading(previous) }),
    ).toBeTruthy();
    expect(screen.queryByRole('header', { name: /2090/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create todo' })).toBeNull();
    await fireEvent.press(
        screen.getByRole('button', {
            name: 'Review completed todo: Finished latest',
        }),
    );
    expect(router.navigate).toHaveBeenCalledWith({
        pathname: '/todo/[id]',
        params: { id: 'latest' },
    });
    expect(complete).not.toHaveBeenCalled();
});

test('menu tools close the menu and navigate to the existing backup and reminder screens', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Todo options' }));
    expect(screen.getByRole('header', { name: 'Your todos' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Tools' })).toBeTruthy();
    await fireEvent.press(
        screen.getByRole('button', { name: 'Backup & restore' }),
    );
    expect(router.push).toHaveBeenLastCalledWith('/backup');
    expect(
        screen.queryByRole('button', { name: 'Backup & restore' }),
    ).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Todo options' }));
    await fireEvent.press(
        screen.getByRole('button', { name: 'Restore reminder notifications' }),
    );
    expect(router.push).toHaveBeenLastCalledWith('/restore-reminders');
    expect(
        screen.queryByRole('button', {
            name: 'Restore reminder notifications',
        }),
    ).toBeNull();
});

test('Next 30 days selects its range while only Custom opens the date editor', async () => {
    await render(<HomeScreen />);
    const through = new Date();
    through.setDate(through.getDate() + 29);
    await fireEvent.press(screen.getByRole('radio', { name: 'Next 30 days' }));
    expect(
        screen.getByRole('radio', { name: 'Next 30 days', checked: true }),
    ).toBeTruthy();
    expect(useTodos).toHaveBeenLastCalledWith('open', {
        from: null,
        through: localDateKey(through),
    });
    expect(screen.queryByRole('button', { name: 'From' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply range' })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Custom…' }));
    expect(screen.getByRole('button', { name: 'From' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Through' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Custom…' }));
    expect(screen.queryByRole('button', { name: 'From' })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Custom…' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Next 30 days' }));
    expect(screen.queryByRole('button', { name: 'From' })).toBeNull();
    expect(
        screen.getByRole('radio', { name: 'Next 30 days', checked: true }),
    ).toBeTruthy();
});

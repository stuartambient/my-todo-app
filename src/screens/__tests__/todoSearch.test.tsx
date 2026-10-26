import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useLocalSearchParams } from 'expo-router';
import { BackHandler } from 'react-native';
import HomeScreen from '@/app/index';
import { useTodos } from '@/hooks/useTodos';
import type { Todo, TodoStatus } from '@/types/todo';

jest.mock('expo-router', () => ({
    router: { navigate: jest.fn(), setParams: jest.fn() },
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
jest.mock('@/hooks/useTodoTypes', () => ({
    useTodoTypes: () => ({ todoTypes: [] }),
}));
jest.mock('@/hooks/useTodos', () => ({ useTodos: jest.fn() }));

const makeTodo = (values: Partial<Todo>): Todo => ({
    id: 'one',
    subject: 'Pay electricity',
    notes: null,
    status: 'open',
    typeId: 'general',
    categoryId: null,
    priority: 'normal',
    dueDate: '2030-06-15',
    dueTime: null,
    reminderAt: null,
    recurrenceFrequency: null,
    recurrenceInterval: null,
    recurrenceBasis: null,
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
    expect(screen.getByRole('header').props.children).toContain('2030');
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
    expect(screen.getByText('No open todos')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search todos'), 'rent');
    expect(screen.getByText('No matching todos')).toBeTruthy();
    expect(screen.getByText(/Searching open todos only/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search todos'), '   ');
    expect(screen.getByText('No open todos')).toBeTruthy();
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
    expect(screen.getByText(`Todo · 2030-06-15 · ${afternoon}`)).toBeTruthy();
    expect(
        screen.getByRole('header', { name: /2030/ }).props.children,
    ).toContain('2030');
    await viewCompleted();
    const midnight = new Date(2000, 0, 1).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    });
    expect(screen.getByText(`Todo · 2030-06-15 · ${midnight}`)).toBeTruthy();
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

import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { useLocalSearchParams } from 'expo-router';
import HomeScreen from '@/app/index';
import { useTodos } from '@/hooks/useTodos';
import type { Todo, TodoStatus } from '@/types/todo';

jest.mock('expo-router', () => ({
    router: { navigate: jest.fn(), setParams: jest.fn() },
    useLocalSearchParams: jest.fn(() => ({})),
    useIsFocused: () => true,
    Stack: { Screen: () => null },
    useFocusEffect: (callback: () => void) => {
        const React = jest.requireActual<typeof import('react')>('react');
        React.useEffect(callback, [callback]);
    },
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

test('keeps the query when switching tabs and clearing restores the selected list', async () => {
    await render(<HomeScreen />);
    await fireEvent.changeText(screen.getByLabelText('Search todos'), 'rent');
    expect(screen.getByText('No matching todos')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Completed' }));
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
    await fireEvent.press(screen.getByRole('tab', { name: 'Completed' }));
    await fireEvent.changeText(screen.getByLabelText('Search todos'), 'rent');
    expect(screen.getByText('Pay rent')).toBeTruthy();
    jest.mocked(useLocalSearchParams).mockReturnValue({ createdTodoId: 'one' });
    await rerender(<HomeScreen />);
    expect(
        screen.getByRole('tab', { name: 'Open' }).props.accessibilityState
            .selected,
    ).toBe(true);
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
    await fireEvent.press(screen.getByRole('tab', { name: 'Completed' }));
    const midnight = new Date(2000, 0, 1).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    });
    expect(screen.getByText(`Todo · 2030-06-15 · ${midnight}`)).toBeTruthy();
});

import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Alert, AppState } from 'react-native';

import EditTodoScreen from '@/app/todo/[id]';
import {
    completeTodo,
    deleteTodo,
    getTodoById,
    updateTodo,
} from '@/repositories/todo.repository';
import type { Todo } from '@/types/todo';

jest.mock('expo-router', () => ({
    router: { back: jest.fn() },
    useNavigation: jest.fn(),
    useLocalSearchParams: () => ({ id: 'one' }),
}));
jest.mock('expo-router/react-navigation', () => ({
    usePreventRemove: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}));
jest.mock('@react-native-community/datetimepicker', () => ({
    DateTimePickerAndroid: { open: jest.fn() },
}));
jest.mock('@/hooks/useTodoTypes', () => ({
    useTodoTypes: () => ({
        todoTypes: [{ id: 'task', name: 'Task' }],
        loading: false,
        error: null,
    }),
}));
jest.mock('@/hooks/useCategories', () => ({
    useCategories: () => ({ loading: false, error: null }),
}));
jest.mock('@/repositories/todo.repository', () => ({
    getTodoById: jest.fn(),
    updateTodo: jest.fn(),
    completeTodo: jest.fn(),
    deleteTodo: jest.fn(),
    reopenTodo: jest.fn(),
}));
const saved: Todo = {
    id: 'one',
    typeId: 'task',
    categoryId: null,
    subject: 'Original subject',
    notes: null,
    status: 'open',
    priority: 'normal',
    dueDate: '2030-06-15',
    dueTime: '15:00',
    reminderAt: null,
    recurrenceFrequency: null,
    recurrenceInterval: null,
    recurrenceBasis: null,
    recurrenceEndDate: null,
    createdAt: '2030-06-01T12:00:00Z',
    updatedAt: '2030-06-01T12:00:00Z',
    completedAt: null,
};
beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useNavigation).mockReturnValue({
        dispatch: jest.fn(),
    } as never);
    jest.mocked(getTodoById).mockResolvedValue(saved);
    jest.mocked(updateTodo).mockResolvedValue(undefined);
    jest.mocked(completeTodo).mockResolvedValue(undefined);
    jest.mocked(deleteTodo).mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    jest.restoreAllMocks();
});
async function edit() {
    await render(<EditTodoScreen />);
    await waitFor(() =>
        expect(screen.getByLabelText('Subject').props.value).toBe(
            'Original subject',
        ),
    );
    await fireEvent.changeText(
        screen.getByLabelText('Subject'),
        'Unsaved draft',
    );
}
async function pressAlert(label: string) {
    const button = jest
        .mocked(Alert.alert)
        .mock.calls.at(-1)![2]!
        .find((item) => item.text === label)!;
    await act(() => button.onPress?.());
}

test('failed edits preserve their draft and protection; a successful retry exits cleanly', async () => {
    jest.mocked(updateTodo).mockRejectedValueOnce(new Error('Save failed'));
    await edit();
    await fireEvent.press(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.getByLabelText('Subject').props.value).toBe('Unsaved draft');
    expect(jest.mocked(usePreventRemove).mock.calls.at(-1)![0]).toBe(true);
    expect(router.back).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Save Changes' }));
    expect(updateTodo).toHaveBeenLastCalledWith(
        'one',
        expect.objectContaining({ subject: 'Unsaved draft', dueTime: '15:00' }),
    );
    expect(jest.mocked(usePreventRemove).mock.calls.at(-1)![0]).toBe(false);
    expect(router.back).toHaveBeenCalledTimes(1);
});

test('Complete asks before discarding edits and uses only the saved todo after confirmation', async () => {
    await edit();
    await fireEvent.press(screen.getByText('Complete Todo'));
    expect(completeTodo).not.toHaveBeenCalled();
    await pressAlert('Keep editing');
    expect(screen.getByLabelText('Subject').props.value).toBe('Unsaved draft');
    await fireEvent.press(screen.getByText('Complete Todo'));
    await pressAlert('Discard changes');
    expect(completeTodo).toHaveBeenCalledWith('one');
    expect(updateTodo).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalledTimes(1);
});

test('Delete warns about unsaved edits, and failed deletion retains the draft', async () => {
    jest.mocked(deleteTodo).mockRejectedValueOnce(new Error('Delete failed'));
    await edit();
    await fireEvent.press(screen.getByText('Delete Todo'));
    expect(jest.mocked(Alert.alert).mock.calls.at(-1)![1]).toContain(
        'unsaved changes',
    );
    await pressAlert('Delete');
    expect(screen.getByLabelText('Subject').props.value).toBe('Unsaved draft');
    expect(jest.mocked(usePreventRemove).mock.calls.at(-1)![0]).toBe(true);
    expect(router.back).not.toHaveBeenCalled();
});

test('a resume refresh cannot overwrite unsaved input with newer database values', async () => {
    let resume: (state: string) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
        (_event, listener) => {
            resume = listener as (state: string) => void;
            return { remove: jest.fn() };
        },
    );
    await edit();
    jest.mocked(getTodoById).mockResolvedValue({
        ...saved,
        subject: 'External change',
        updatedAt: '2030-06-01T13:00:00Z',
    });
    await act(async () => {
        resume!('active');
        await Promise.resolve();
    });
    expect(getTodoById).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Subject').props.value).toBe('Unsaved draft');
});

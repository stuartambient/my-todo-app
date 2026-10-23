import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert, Keyboard } from 'react-native';

import NewTodoScreen from '@/app/todo/new';
import { createTodo } from '@/repositories/todo.repository';
import type { Todo } from '@/types/todo';

jest.mock('expo-router', () => ({
    router: { dismissTo: jest.fn() },
    Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}));
jest.mock('@react-native-community/datetimepicker', () => ({
    DateTimePickerAndroid: { open: jest.fn() },
}));
jest.mock('@/repositories/todo.repository', () => ({ createTodo: jest.fn() }));
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

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createTodo).mockResolvedValue({ id: 'saved-id' } as Todo);
});

test('saving quick entry dismisses the keyboard and returns home with the saved id', async () => {
    const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss');
    await render(<NewTodoScreen />);
    await fireEvent.changeText(
        screen.getByLabelText('Subject'),
        'Remember milk',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save Todo' }));
    expect(createTodo).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Remember milk', typeId: 'task' }),
    );
    expect(dismissKeyboard).toHaveBeenCalled();
    expect(router.dismissTo).toHaveBeenCalledWith({
        pathname: '/',
        params: { createdTodoId: 'saved-id' },
    });
    dismissKeyboard.mockRestore();
});

test('a failed save keeps the entered subject and allows retrying', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(createTodo).mockRejectedValueOnce(
        new Error('Database unavailable'),
    );
    await render(<NewTodoScreen />);
    await fireEvent.changeText(
        screen.getByLabelText('Subject'),
        'Remember milk',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save Todo' }));
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalled();
    expect(screen.getByLabelText('Subject').props.value).toBe('Remember milk');
    await fireEvent.press(screen.getByRole('button', { name: 'Save Todo' }));
    expect(createTodo).toHaveBeenCalledTimes(2);
    expect(router.dismissTo).toHaveBeenCalledTimes(1);
    alert.mockRestore();
    log.mockRestore();
});

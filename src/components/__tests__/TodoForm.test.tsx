import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

import { TodoForm } from '../TodoForm';
import type { TodoFormValues } from '@/schemas/todo.schema';
import type { TodoType } from '@/types/todoType';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}));
jest.mock('@react-native-community/datetimepicker', () => ({
    DateTimePickerAndroid: { open: jest.fn() },
}));

const types = [
    { id: 'task', name: 'Task' },
    { id: 'payment', name: 'Payment' },
] as TodoType[];
const save = jest.fn<(values: TodoFormValues) => Promise<void>>();

beforeEach(() => {
    jest.clearAllMocks();
    save.mockResolvedValue(undefined);
});

test('quick entry saves a subject with a default type and no optional details', async () => {
    await render(<TodoForm todoTypes={types} quickEntry onSubmit={save} />);
    expect(screen.getByLabelText('Subject').props.autoFocus).toBe(true);
    expect(
        screen.getByRole('radio', { name: 'Task' }).props.accessibilityState
            .checked,
    ).toBe(true);
    expect(screen.queryByText('Due date')).toBeNull();
    await fireEvent.changeText(
        screen.getByLabelText('Subject'),
        '  Buy milk  ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({
        typeId: 'task',
        categoryId: null,
        subject: 'Buy milk',
        notes: null,
        priority: 'normal',
        dueDate: null,
        reminderAt: null,
        recurrenceFrequency: null,
        recurrenceInterval: null,
        recurrenceBasis: null,
    });
});

test('optional details survive collapsing and keep the existing scheduling values', async () => {
    await render(<TodoForm todoTypes={types} quickEntry onSubmit={save} />);
    await fireEvent.changeText(
        screen.getByLabelText('Subject'),
        'Pay electricity',
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Payment' }));
    await fireEvent.press(screen.getByText('Show details'));
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'Keep receipt');
    await fireEvent.press(screen.getByText('High'));
    await fireEvent.press(screen.getByText('Select date'));
    const datePicker = jest
        .mocked(DateTimePickerAndroid.open)
        .mock.calls.at(-1)![0];
    await act(() =>
        datePicker.onValueChange!({} as never, new Date(2030, 5, 15)),
    );
    await fireEvent.press(screen.getByText('Monthly'));
    await fireEvent.changeText(
        screen.getByPlaceholderText('Enter interval'),
        '2',
    );
    await fireEvent.press(screen.getByText('Select reminder'));
    const reminderDatePicker = jest
        .mocked(DateTimePickerAndroid.open)
        .mock.calls.at(-1)![0];
    await act(() =>
        reminderDatePicker.onValueChange!({} as never, new Date(2030, 5, 14)),
    );
    const timePicker = jest
        .mocked(DateTimePickerAndroid.open)
        .mock.calls.at(-1)![0];
    await act(() =>
        timePicker.onValueChange!({} as never, new Date(2030, 5, 14, 9, 30)),
    );
    await fireEvent.press(screen.getByText('Hide details'));
    expect(screen.queryByLabelText('Notes')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(save.mock.calls[0][0]).toMatchObject({
        typeId: 'payment',
        notes: 'Keep receipt',
        priority: 'high',
        dueDate: '2030-06-15',
        reminderAt: new Date(2030, 5, 14, 9, 30).toISOString(),
        recurrenceFrequency: 'month',
        recurrenceInterval: 2,
        recurrenceBasis: 'due_date',
    });
});

test('invalid hidden details reopen instead of silently failing to save', async () => {
    await render(<TodoForm todoTypes={types} quickEntry onSubmit={save} />);
    await fireEvent.changeText(
        screen.getByLabelText('Subject'),
        'Pay electricity',
    );
    await fireEvent.press(screen.getByText('Show details'));
    await fireEvent.press(screen.getByText('Monthly'));
    await fireEvent.press(screen.getByText('Hide details'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(save).not.toHaveBeenCalled();
    expect(
        screen.getByText('Choose an initial due date for a repeating todo.'),
    ).toBeTruthy();
    expect(screen.getByText('Hide details')).toBeTruthy();
});

test('blank subject remains invalid and keeps quick entry compact', async () => {
    await render(<TodoForm todoTypes={types} quickEntry onSubmit={save} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('Subject is required.')).toBeTruthy();
    expect(screen.getByText('Show details')).toBeTruthy();
});

test('repeated saves stay disabled until the first save finishes', async () => {
    let finish!: () => void;
    save.mockImplementation(
        () =>
            new Promise<void>((resolve) => {
                finish = resolve;
            }),
    );
    await render(<TodoForm todoTypes={types} quickEntry onSubmit={save} />);
    await fireEvent.changeText(screen.getByLabelText('Subject'), 'One todo');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Saving...' }));
    expect(save).toHaveBeenCalledTimes(1);
    await act(() => finish());
    expect(
        screen.getByRole('button', { name: 'Save' }).props.accessibilityState
            .disabled,
    ).toBe(false);
});

test('editing opens with all existing values and no automatic keyboard', async () => {
    const initialValues: TodoFormValues = {
        typeId: 'payment',
        categoryId: null,
        subject: 'Rent',
        notes: 'Reference 123',
        priority: 'high',
        dueDate: '2030-06-15',
        reminderAt: null,
        recurrenceFrequency: 'month',
        recurrenceInterval: 1,
        recurrenceBasis: 'due_date',
    };
    await render(
        <TodoForm
            todoTypes={types}
            initialValues={initialValues}
            onSubmit={save}
        />,
    );
    expect(screen.getByLabelText('Subject').props.autoFocus).toBe(false);
    expect(screen.getByLabelText('Notes').props.value).toBe('Reference 123');
    expect(screen.queryByText('Show details')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(save.mock.calls[0][0]).toEqual(initialValues);
});

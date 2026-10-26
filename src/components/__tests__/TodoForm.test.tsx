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
        screen.getByRole('button', { name: 'Todo type' }).props
            .accessibilityValue.text,
    ).toBe('Task');
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
        dueTime: null,
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
    await fireEvent.press(screen.getByRole('button', { name: 'Todo type' }));
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
        dueTime: null,
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
    expect(
        screen.getByRole('button', { name: 'Todo type' }).props
            .accessibilityState.disabled,
    ).toBe(true);
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
        dueTime: '16:30',
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

test('adding a due time saves local hours and minutes without adding a reminder', async () => {
    await render(<TodoForm todoTypes={types} quickEntry onSubmit={save} />);
    await fireEvent.changeText(screen.getByLabelText('Subject'), 'Appointment');
    await fireEvent.press(screen.getByText('Show details'));
    expect(
        screen.getByRole('button', { name: 'Choose due time' }).props
            .accessibilityState.disabled,
    ).toBe(true);
    await fireEvent.press(screen.getByText('Select date'));
    const picker = jest
        .mocked(DateTimePickerAndroid.open)
        .mock.calls.at(-1)![0];
    await act(() => picker.onValueChange!({} as never, new Date(2030, 5, 15)));
    await fireEvent.press(
        screen.getByRole('button', { name: 'Choose due time' }),
    );
    const timePicker = jest
        .mocked(DateTimePickerAndroid.open)
        .mock.calls.at(-1)![0];
    expect(timePicker.mode).toBe('time');
    await act(() =>
        timePicker.onValueChange!({} as never, new Date(2030, 5, 15, 15, 5)),
    );
    await fireEvent.press(screen.getByText('Hide details'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(save.mock.calls[0][0]).toMatchObject({
        dueDate: '2030-06-15',
        dueTime: '15:05',
        reminderAt: null,
    });
});

test.each(['Clear due time', 'Clear due date'])(
    '%s clears the time without changing the reminder',
    async (button) => {
        const initialValues: TodoFormValues = {
            typeId: 'task',
            categoryId: null,
            subject: 'Appointment',
            notes: null,
            priority: 'normal',
            dueDate: '2030-06-15',
            dueTime: '00:00',
            reminderAt: '2030-06-14T15:00:00.000Z',
            recurrenceFrequency: null,
            recurrenceInterval: null,
            recurrenceBasis: null,
        };
        await render(
            <TodoForm
                todoTypes={types}
                initialValues={initialValues}
                onSubmit={save}
            />,
        );
        await fireEvent.press(screen.getByRole('button', { name: button }));
        await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
        expect(save.mock.calls[0][0]).toMatchObject({
            dueDate: button === 'Clear due date' ? null : '2030-06-15',
            dueTime: null,
            reminderAt: initialValues.reminderAt,
        });
    },
);

test('all eight types are available from one compact field and selection saves correctly', async () => {
    const allTypes = [
        'Task',
        'Call',
        'Appointment',
        'Errand',
        'Purchase',
        'Payment',
        'Follow-up',
        'Reminder',
    ].map((name) => ({ id: name.toLowerCase(), name })) as TodoType[];
    await render(<TodoForm todoTypes={allTypes} quickEntry onSubmit={save} />);
    await fireEvent.changeText(screen.getByLabelText('Subject'), 'Pay rent');
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Todo type' }));
    expect(screen.getAllByRole('radio')).toHaveLength(8);
    expect(
        screen.getByRole('radio', { name: 'Task' }).props.accessibilityState
            .checked,
    ).toBe(true);
    await fireEvent.press(screen.getByRole('radio', { name: 'Payment' }));
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(
        screen.getByRole('button', { name: 'Todo type' }).props
            .accessibilityValue.text,
    ).toBe('Payment');
    expect(save).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(save.mock.calls[0][0]).toMatchObject({
        subject: 'Pay rent',
        typeId: 'payment',
    });
});

test.each(['Cancel', 'outside', 'Android Back'])(
    '%s closes type selection without changing the draft',
    async (method) => {
        await render(<TodoForm todoTypes={types} quickEntry onSubmit={save} />);
        await fireEvent.changeText(
            screen.getByLabelText('Subject'),
            'My draft',
        );
        await fireEvent.press(
            screen.getByRole('button', { name: 'Todo type' }),
        );
        if (method === 'Android Back') {
            await fireEvent(
                screen.getByTestId('todo-type-dialog'),
                'requestClose',
            );
        } else {
            await fireEvent.press(
                screen.getByRole('button', {
                    name:
                        method === 'outside'
                            ? 'Cancel type selection'
                            : 'Cancel',
                }),
            );
        }
        expect(screen.queryAllByRole('radio')).toHaveLength(0);
        expect(screen.getByLabelText('Subject').props.value).toBe('My draft');
        expect(
            screen.getByRole('button', { name: 'Todo type' }).props
                .accessibilityValue.text,
        ).toBe('Task');
        expect(save).not.toHaveBeenCalled();
    },
);

test('Task remains the default even if it is not the first available type', async () => {
    await render(
        <TodoForm
            todoTypes={[types[1], types[0]]}
            quickEntry
            onSubmit={save}
        />,
    );
    await fireEvent.changeText(screen.getByLabelText('Subject'), 'A task');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(save.mock.calls[0][0].typeId).toBe('task');
});

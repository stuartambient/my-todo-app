import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { Controller, useForm } from 'react-hook-form';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { todoSchema, type TodoFormValues } from '@/schemas/todo.schema';
import type { TodoType } from '@/types/todoType';

type TodoFormProps = {
    todoTypes: TodoType[];

    initialValues?: TodoFormValues;

    submitLabel?: string;
    disabled?: boolean;

    onSubmit: (values: TodoFormValues) => Promise<void> | void;
};

const DEFAULT_VALUES: TodoFormValues = {
    typeId: '',
    categoryId: null,

    subject: '',
    notes: null,

    priority: 'normal',

    dueDate: null,

    reminderAt: null,

    recurrenceFrequency: null,
    recurrenceInterval: null,
};

function parseStoredDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);

    return new Date(year, month - 1, day);
}

export function TodoForm({
    todoTypes,
    initialValues,
    submitLabel = 'Save',
    disabled = false,
    onSubmit,
}: TodoFormProps) {
    const {
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<TodoFormValues>({
        resolver: zodResolver(todoSchema),
        defaultValues: initialValues ?? DEFAULT_VALUES,
    });

    const submitDisabled = disabled || isSubmitting;

    return (
        <View style={styles.form}>
            <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.container}
                keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.label}>Type</Text>

                <Controller
                    control={control}
                    name="typeId"
                    render={({ field: { value, onChange } }) => (
                        <View style={styles.optionContainer}>
                            {todoTypes.map((todoType) => {
                                const selected = value === todoType.id;

                                return (
                                    <Pressable
                                        key={todoType.id}
                                        style={[
                                            styles.optionButton,
                                            selected &&
                                                styles.optionButtonSelected,
                                        ]}
                                        onPress={() => onChange(todoType.id)}
                                    >
                                        <Text
                                            style={[
                                                styles.optionText,
                                                selected &&
                                                    styles.optionTextSelected,
                                            ]}
                                        >
                                            {todoType.name}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}
                />

                {errors.typeId && (
                    <Text style={styles.errorText}>
                        {errors.typeId.message}
                    </Text>
                )}

                <Text style={styles.label}>Subject</Text>

                <Controller
                    control={control}
                    name="subject"
                    render={({ field: { value, onChange, onBlur } }) => (
                        <TextInput
                            style={styles.input}
                            value={value}
                            onChangeText={onChange}
                            onBlur={onBlur}
                            placeholder="Subject"
                            maxLength={80}
                        />
                    )}
                />

                {errors.subject && (
                    <Text style={styles.errorText}>
                        {errors.subject.message}
                    </Text>
                )}

                <Text style={styles.label}>Priority</Text>

                <Controller
                    control={control}
                    name="priority"
                    render={({ field: { value, onChange } }) => (
                        <View style={styles.optionContainer}>
                            <Pressable
                                style={[
                                    styles.optionButton,
                                    value === 'normal' &&
                                        styles.optionButtonSelected,
                                ]}
                                onPress={() => onChange('normal')}
                            >
                                <Text
                                    style={[
                                        styles.optionText,
                                        value === 'normal' &&
                                            styles.optionTextSelected,
                                    ]}
                                >
                                    Normal
                                </Text>
                            </Pressable>

                            <Pressable
                                style={[
                                    styles.optionButton,
                                    value === 'high' &&
                                        styles.optionButtonSelected,
                                ]}
                                onPress={() => onChange('high')}
                            >
                                <Text
                                    style={[
                                        styles.optionText,
                                        value === 'high' &&
                                            styles.optionTextSelected,
                                    ]}
                                >
                                    High
                                </Text>
                            </Pressable>
                        </View>
                    )}
                />

                <Text style={styles.label}>Due date</Text>

                <Controller
                    control={control}
                    name="dueDate"
                    render={({ field: { value, onChange } }) => {
                        function getPickerDate(): Date {
                            if (!value) {
                                return new Date();
                            }

                            return parseStoredDate(value);
                        }

                        function openDatePicker() {
                            DateTimePickerAndroid.open({
                                value: getPickerDate(),
                                mode: 'date',

                                onValueChange: (_event, selectedDate) => {
                                    onChange(
                                        format(selectedDate, 'yyyy-MM-dd'),
                                    );
                                },
                            });
                        }

                        return (
                            <View style={styles.dateContainer}>
                                <Pressable
                                    style={styles.dateButton}
                                    onPress={openDatePicker}
                                >
                                    <Text
                                        style={
                                            value
                                                ? styles.dateText
                                                : styles.datePlaceholder
                                        }
                                    >
                                        {value
                                            ? format(
                                                  getPickerDate(),
                                                  'MMM d, yyyy',
                                              )
                                            : 'Select date'}
                                    </Text>
                                </Pressable>

                                {value && (
                                    <Pressable
                                        style={styles.clearDateButton}
                                        onPress={() => onChange(null)}
                                    >
                                        <Text style={styles.clearDateText}>
                                            Clear
                                        </Text>
                                    </Pressable>
                                )}
                            </View>
                        );
                    }}
                />

                {errors.dueDate && (
                    <Text style={styles.errorText}>
                        {errors.dueDate.message}
                    </Text>
                )}

                <Text style={styles.label}>Reminder</Text>

                <Controller
                    control={control}
                    name="reminderAt"
                    render={({ field: { value, onChange } }) => {
                        function getReminderDate(): Date {
                            if (!value) {
                                return new Date();
                            }

                            const date = new Date(value);

                            if (Number.isNaN(date.getTime())) {
                                return new Date();
                            }

                            return date;
                        }

                        function openReminderTimePicker(selectedDate: Date) {
                            const currentReminder = getReminderDate();

                            const timeValue = value
                                ? currentReminder
                                : new Date(
                                      selectedDate.getFullYear(),
                                      selectedDate.getMonth(),
                                      selectedDate.getDate(),
                                      9,
                                      0,
                                      0,
                                      0,
                                  );

                            DateTimePickerAndroid.open({
                                value: timeValue,
                                mode: 'time',
                                is24Hour: false,

                                onValueChange: (_event, selectedTime) => {
                                    const combined = new Date(
                                        selectedDate.getFullYear(),
                                        selectedDate.getMonth(),
                                        selectedDate.getDate(),
                                        selectedTime.getHours(),
                                        selectedTime.getMinutes(),
                                        0,
                                        0,
                                    );

                                    onChange(combined.toISOString());
                                },
                            });
                        }

                        function openReminderPicker() {
                            const current = getReminderDate();

                            DateTimePickerAndroid.open({
                                value: current,
                                mode: 'date',

                                onValueChange: (_event, selectedDate) => {
                                    openReminderTimePicker(selectedDate);
                                },
                            });
                        }

                        return (
                            <View style={styles.dateContainer}>
                                <Pressable
                                    style={styles.dateButton}
                                    onPress={openReminderPicker}
                                >
                                    <Text
                                        style={
                                            value
                                                ? styles.dateText
                                                : styles.datePlaceholder
                                        }
                                    >
                                        {value
                                            ? format(
                                                  getReminderDate(),
                                                  'MMM d, yyyy h:mm a',
                                              )
                                            : 'Select reminder'}
                                    </Text>
                                </Pressable>

                                {value && (
                                    <Pressable
                                        style={styles.clearDateButton}
                                        onPress={() => onChange(null)}
                                    >
                                        <Text style={styles.clearDateText}>
                                            Clear
                                        </Text>
                                    </Pressable>
                                )}
                            </View>
                        );
                    }}
                />

                {errors.reminderAt && (
                    <Text style={styles.errorText}>
                        {errors.reminderAt.message}
                    </Text>
                )}

                <Text style={styles.label}>Repeat</Text>

                <Controller
                    control={control}
                    name="recurrenceFrequency"
                    render={({ field: { value, onChange } }) => (
                        <View style={styles.optionContainer}>
                            {[
                                ['None', null],
                                ['Daily', 'day'],
                                ['Weekly', 'week'],
                                ['Monthly', 'month'],
                                ['Yearly', 'year'],
                            ].map(([label, frequency]) => {
                                const selected = value === frequency;

                                return (
                                    <Pressable
                                        key={label}
                                        style={[
                                            styles.optionButton,
                                            selected &&
                                                styles.optionButtonSelected,
                                        ]}
                                        onPress={() => onChange(frequency)}
                                    >
                                        <Text
                                            style={[
                                                styles.optionText,
                                                selected &&
                                                    styles.optionTextSelected,
                                            ]}
                                        >
                                            {label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}
                />

                {errors.recurrenceFrequency && (
                    <Text style={styles.errorText}>
                        {errors.recurrenceFrequency.message}
                    </Text>
                )}

                <Text style={styles.label}>Repeat interval</Text>

                <Controller
                    control={control}
                    name="recurrenceInterval"
                    render={({ field: { value, onChange, onBlur } }) => (
                        <TextInput
                            style={styles.input}
                            value={value === null ? '' : String(value)}
                            onChangeText={(text) => {
                                const trimmed = text.trim();

                                if (trimmed === '') {
                                    onChange(null);
                                    return;
                                }

                                const number = Number(trimmed);

                                onChange(Number.isNaN(number) ? null : number);
                            }}
                            onBlur={onBlur}
                            placeholder="1"
                            keyboardType="number-pad"
                        />
                    )}
                />

                {errors.recurrenceInterval && (
                    <Text style={styles.errorText}>
                        {errors.recurrenceInterval.message}
                    </Text>
                )}

                <Text style={styles.label}>Notes</Text>

                <Controller
                    control={control}
                    name="notes"
                    render={({ field: { value, onChange, onBlur } }) => (
                        <TextInput
                            style={[styles.input, styles.notesInput]}
                            value={value ?? ''}
                            onChangeText={(text) =>
                                onChange(text === '' ? null : text)
                            }
                            onBlur={onBlur}
                            placeholder="Notes"
                            multiline
                            textAlignVertical="top"
                        />
                    )}
                />
            </ScrollView>

            <View style={styles.submitFooter}>
                <Pressable
                    style={[
                        styles.submitButton,
                        submitDisabled && styles.submitButtonDisabled,
                    ]}
                    disabled={submitDisabled}
                    onPress={handleSubmit(onSubmit)}
                >
                    <Text style={styles.submitButtonText}>
                        {isSubmitting ? 'Saving...' : submitLabel}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    form: {
        flex: 1,
    },

    scrollArea: {
        flex: 1,
    },

    container: {
        padding: 20,
        gap: 8,
    },

    submitFooter: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#cccccc',
        backgroundColor: '#ffffff',
    },

    label: {
        marginTop: 12,
        fontSize: 16,
        fontWeight: '600',
    },

    input: {
        minHeight: 48,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: '#b8b8b8',
        borderRadius: 8,
        fontSize: 16,
    },

    notesInput: {
        minHeight: 120,
        paddingTop: 12,
    },

    optionContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },

    optionButton: {
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderWidth: 1,
        borderColor: '#b8b8b8',
        borderRadius: 8,
    },

    optionButtonSelected: {
        backgroundColor: '#222222',
        borderColor: '#222222',
    },

    optionText: {
        fontSize: 14,
    },

    optionTextSelected: {
        color: '#ffffff',
    },

    dateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },

    dateButton: {
        flex: 1,
        minHeight: 48,
        justifyContent: 'center',
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: '#b8b8b8',
        borderRadius: 8,
    },

    dateText: {
        fontSize: 16,
    },

    datePlaceholder: {
        color: '#777777',
        fontSize: 16,
    },

    clearDateButton: {
        paddingHorizontal: 12,
        paddingVertical: 12,
    },

    clearDateText: {
        fontSize: 14,
    },

    errorText: {
        color: '#b00020',
        fontSize: 13,
    },

    submitButton: {
        paddingVertical: 14,
        borderRadius: 8,
        backgroundColor: '#222222',
        alignItems: 'center',
    },

    submitButtonDisabled: {
        opacity: 0.5,
    },

    submitButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
});

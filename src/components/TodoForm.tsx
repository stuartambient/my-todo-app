import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { todoSchema, type TodoFormValues } from '@/schemas/todo.schema';
import type { TodoType } from '@/types/todoType';
import { formatDueTime } from '@/utils/dueTime';

type TodoFormProps = {
    todoTypes: TodoType[];

    initialValues?: TodoFormValues;

    submitLabel?: string;
    disabled?: boolean;
    quickEntry?: boolean;

    onSubmit: (values: TodoFormValues) => Promise<void> | void;
};

const DEFAULT_VALUES: TodoFormValues = {
    typeId: '',
    categoryId: null,

    subject: '',
    notes: null,

    priority: 'normal',

    dueDate: null,
    dueTime: null,

    reminderAt: null,

    recurrenceFrequency: null,
    recurrenceInterval: null,
    recurrenceBasis: null,
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
    quickEntry = false,
    onSubmit,
}: TodoFormProps) {
    const insets = useSafeAreaInsets();
    const [detailsExpanded, setDetailsExpanded] = useState(!quickEntry);
    const submitting = useRef(false);
    const {
        control,
        handleSubmit,
        getValues,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<TodoFormValues>({
        resolver: zodResolver(todoSchema),
        defaultValues: initialValues ?? {
            ...DEFAULT_VALUES,
            typeId: todoTypes[0]?.id ?? '',
        },
    });

    const dueDate = useWatch({ control, name: 'dueDate' });

    const recurrenceFrequency = useWatch({
        control,
        name: 'recurrenceFrequency',
    });
    const recurrenceBasis = useWatch({
        control,
        name: 'recurrenceBasis',
    });

    const submitDisabled = disabled || isSubmitting;

    async function submit() {
        // Lock before validation, so two quick taps cannot create two todos.
        if (disabled || submitting.current) return;
        submitting.current = true;
        try {
            await handleSubmit(onSubmit, (invalid) => {
                if (
                    Object.keys(invalid).some(
                        (field) => field !== 'subject' && field !== 'typeId',
                    )
                ) {
                    setDetailsExpanded(true);
                }
            })();
        } finally {
            submitting.current = false;
        }
    }

    return (
        <KeyboardAvoidingView
            style={styles.form}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.container}
                keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.label}>Subject</Text>

                <Controller
                    control={control}
                    name="subject"
                    render={({ field: { value, onChange, onBlur, ref } }) => (
                        <TextInput
                            ref={ref}
                            accessibilityLabel="Subject"
                            autoFocus={quickEntry}
                            editable={!submitDisabled}
                            returnKeyType="done"
                            onSubmitEditing={
                                quickEntry ? () => void submit() : undefined
                            }
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
                                        accessibilityRole="radio"
                                        accessibilityLabel={todoType.name}
                                        accessibilityState={{
                                            checked: selected,
                                        }}
                                        disabled={submitDisabled}
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

                {quickEntry && (
                    <Pressable
                        style={styles.detailsButton}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: detailsExpanded }}
                        disabled={submitDisabled}
                        onPress={() =>
                            setDetailsExpanded((expanded) => !expanded)
                        }
                    >
                        <Text style={styles.detailsButtonText}>
                            {detailsExpanded ? 'Hide details' : 'Show details'}
                        </Text>
                        <Text style={styles.helperText}>
                            Date, reminder, repeat, priority and notes
                        </Text>
                    </Pressable>
                )}

                {detailsExpanded && (
                    <>
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

                        <View style={styles.scheduleRow}>
                            <View style={styles.dueDateColumn}>
                                <Controller
                                    control={control}
                                    name="dueDate"
                                    render={({
                                        field: { value, onChange },
                                    }) => {
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

                                                onValueChange: (
                                                    _event,
                                                    selectedDate,
                                                ) => {
                                                    onChange(
                                                        format(
                                                            selectedDate,
                                                            'yyyy-MM-dd',
                                                        ),
                                                    );
                                                },
                                            });
                                        }

                                        return (
                                            <View style={styles.scheduleField}>
                                                <Pressable
                                                    style={[
                                                        styles.dateButton,
                                                        styles.scheduleButton,
                                                    ]}
                                                    accessibilityRole="button"
                                                    accessibilityLabel="Choose due date"
                                                    disabled={submitDisabled}
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
                                                        style={
                                                            styles.clearScheduleButton
                                                        }
                                                        accessibilityRole="button"
                                                        accessibilityLabel="Clear due date"
                                                        disabled={
                                                            submitDisabled
                                                        }
                                                        onPress={() => {
                                                            onChange(null);
                                                            setValue(
                                                                'dueTime',
                                                                null,
                                                                {
                                                                    shouldDirty: true,
                                                                    shouldValidate: true,
                                                                },
                                                            );
                                                        }}
                                                    >
                                                        <Text
                                                            style={
                                                                styles.clearDateText
                                                            }
                                                        >
                                                            Clear date
                                                        </Text>
                                                    </Pressable>
                                                )}
                                            </View>
                                        );
                                    }}
                                />
                            </View>
                            <View style={styles.dueTimeColumn}>
                                <Controller
                                    control={control}
                                    name="dueTime"
                                    render={({
                                        field: { value, onChange },
                                    }) => {
                                        function openTimePicker() {
                                            if (!dueDate) return;
                                            const selected =
                                                parseStoredDate(dueDate);
                                            const [hour, minute] = (
                                                value ?? '09:00'
                                            )
                                                .split(':')
                                                .map(Number);
                                            selected.setHours(
                                                hour,
                                                minute,
                                                0,
                                                0,
                                            );
                                            DateTimePickerAndroid.open({
                                                value: selected,
                                                mode: 'time',
                                                is24Hour: false,
                                                onValueChange: (
                                                    _event,
                                                    time,
                                                ) => {
                                                    onChange(
                                                        format(time, 'HH:mm'),
                                                    );
                                                },
                                            });
                                        }

                                        return (
                                            <View style={styles.scheduleField}>
                                                <Pressable
                                                    style={[
                                                        styles.dateButton,
                                                        styles.scheduleButton,
                                                        !dueDate &&
                                                            styles.submitButtonDisabled,
                                                    ]}
                                                    accessibilityRole="button"
                                                    accessibilityLabel="Choose due time"
                                                    accessibilityHint="Optional. Does not set a reminder."
                                                    disabled={
                                                        !dueDate ||
                                                        submitDisabled
                                                    }
                                                    onPress={openTimePicker}
                                                >
                                                    <Text
                                                        style={
                                                            value
                                                                ? styles.dateText
                                                                : styles.datePlaceholder
                                                        }
                                                    >
                                                        {value
                                                            ? formatDueTime(
                                                                  value,
                                                              )
                                                            : 'Add time'}
                                                    </Text>
                                                </Pressable>
                                                {value && (
                                                    <Pressable
                                                        style={
                                                            styles.clearScheduleButton
                                                        }
                                                        accessibilityRole="button"
                                                        accessibilityLabel="Clear due time"
                                                        disabled={
                                                            submitDisabled
                                                        }
                                                        onPress={() =>
                                                            onChange(null)
                                                        }
                                                    >
                                                        <Text
                                                            style={
                                                                styles.clearDateText
                                                            }
                                                        >
                                                            Clear time
                                                        </Text>
                                                    </Pressable>
                                                )}
                                            </View>
                                        );
                                    }}
                                />
                            </View>
                        </View>
                        {errors.dueDate && (
                            <Text style={styles.errorText}>
                                {errors.dueDate.message}
                            </Text>
                        )}

                        <Text style={styles.helperText}>
                            {dueDate
                                ? 'Leave blank for a date-only todo. A due time does not set a reminder.'
                                : 'Choose a due date to add a time.'}
                        </Text>
                        {errors.dueTime && (
                            <Text style={styles.errorText}>
                                {errors.dueTime.message}
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

                                function openReminderTimePicker(
                                    selectedDate: Date,
                                ) {
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

                                        onValueChange: (
                                            _event,
                                            selectedTime,
                                        ) => {
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

                                        onValueChange: (
                                            _event,
                                            selectedDate,
                                        ) => {
                                            openReminderTimePicker(
                                                selectedDate,
                                            );
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
                                                <Text
                                                    style={styles.clearDateText}
                                                >
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
                                                onPress={() => {
                                                    onChange(frequency);

                                                    setValue(
                                                        'recurrenceBasis',
                                                        frequency === null
                                                            ? null
                                                            : (getValues(
                                                                  'recurrenceBasis',
                                                              ) ?? 'due_date'),
                                                        {
                                                            shouldDirty: true,
                                                            shouldValidate: true,
                                                        },
                                                    );

                                                    setValue(
                                                        'recurrenceInterval',
                                                        frequency === null
                                                            ? null
                                                            : (getValues(
                                                                  'recurrenceInterval',
                                                              ) ?? 1),
                                                        {
                                                            shouldDirty: true,
                                                            shouldValidate: true,
                                                        },
                                                    );
                                                }}
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
                            render={({
                                field: { value, onChange, onBlur },
                            }) => (
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

                                        onChange(
                                            Number.isNaN(number)
                                                ? null
                                                : number,
                                        );
                                    }}
                                    onBlur={onBlur}
                                    editable={
                                        recurrenceFrequency !== null &&
                                        !submitDisabled
                                    }
                                    placeholder={
                                        recurrenceFrequency
                                            ? 'Enter interval'
                                            : 'Not repeating'
                                    }
                                    keyboardType="number-pad"
                                />
                            )}
                        />

                        {errors.recurrenceInterval && (
                            <Text style={styles.errorText}>
                                {errors.recurrenceInterval.message}
                            </Text>
                        )}

                        {recurrenceFrequency !== null && (
                            <>
                                <Text style={styles.label}>
                                    Repeat based on
                                </Text>

                                <Controller
                                    control={control}
                                    name="recurrenceBasis"
                                    render={({
                                        field: { value, onChange },
                                    }) => (
                                        <View style={styles.optionContainer}>
                                            {(
                                                [
                                                    ['Due date', 'due_date'],
                                                    [
                                                        'Completion date',
                                                        'completion_date',
                                                    ],
                                                ] as const
                                            ).map(([label, basis]) => {
                                                const selected =
                                                    value === basis;

                                                return (
                                                    <Pressable
                                                        key={basis}
                                                        accessibilityRole="radio"
                                                        accessibilityState={{
                                                            checked: selected,
                                                        }}
                                                        disabled={
                                                            submitDisabled
                                                        }
                                                        style={[
                                                            styles.optionButton,
                                                            selected &&
                                                                styles.optionButtonSelected,
                                                        ]}
                                                        onPress={() =>
                                                            onChange(basis)
                                                        }
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

                                <Text style={styles.helperText}>
                                    {recurrenceBasis === 'completion_date'
                                        ? 'The interval starts on the day you complete this todo.'
                                        : 'Keeps the original schedule. If dates are missed, the next occurrence is in the future.'}
                                </Text>

                                {errors.recurrenceBasis && (
                                    <Text style={styles.errorText}>
                                        {errors.recurrenceBasis.message}
                                    </Text>
                                )}
                            </>
                        )}

                        <Text style={styles.label}>Notes</Text>

                        <Controller
                            control={control}
                            name="notes"
                            render={({
                                field: { value, onChange, onBlur },
                            }) => (
                                <TextInput
                                    style={[styles.input, styles.notesInput]}
                                    value={value ?? ''}
                                    onChangeText={(text) =>
                                        onChange(text === '' ? null : text)
                                    }
                                    onBlur={onBlur}
                                    accessibilityLabel="Notes"
                                    editable={!submitDisabled}
                                    placeholder="Notes"
                                    multiline
                                    textAlignVertical="top"
                                />
                            )}
                        />
                    </>
                )}
            </ScrollView>

            <View
                style={[
                    styles.submitFooter,
                    quickEntry && { paddingBottom: 12 + insets.bottom },
                ]}
            >
                <Pressable
                    style={[
                        styles.submitButton,
                        submitDisabled && styles.submitButtonDisabled,
                    ]}
                    disabled={submitDisabled}
                    accessibilityRole="button"
                    accessibilityState={{
                        disabled: submitDisabled,
                        busy: isSubmitting,
                    }}
                    onPress={() => void submit()}
                >
                    <Text style={styles.submitButtonText}>
                        {isSubmitting ? 'Saving...' : submitLabel}
                    </Text>
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    form: {
        flex: 1,
        backgroundColor: '#ffffff',
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

    detailsButton: {
        marginTop: 16,
        paddingVertical: 12,
        gap: 4,
    },

    detailsButtonText: {
        color: '#222222',
        fontSize: 16,
        fontWeight: '600',
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

    scheduleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },

    dueDateColumn: {
        flex: 1.2,
        minWidth: 0,
    },

    dueTimeColumn: {
        flex: 1,
        minWidth: 0,
    },

    scheduleField: {
        gap: 0,
    },

    scheduleButton: {
        flex: 0,
        paddingVertical: 12,
    },

    clearScheduleButton: {
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
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

    helperText: {
        color: '#666666',
        fontSize: 13,
        lineHeight: 19,
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

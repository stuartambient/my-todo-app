import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { type ReactNode, useEffect, useRef, useState } from 'react';
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
import { homeColors } from '@/theme/homeColors';
import type { TodoType } from '@/types/todoType';
import { TodoTypeSelect } from '@/components/TodoTypeSelect';
import { formatDueTime } from '@/utils/dueTime';

type TodoFormProps = {
    todoTypes: TodoType[];

    initialValues?: TodoFormValues;

    submitLabel?: string;
    disabled?: boolean;
    quickEntry?: boolean;
    secondaryActions?: ReactNode;

    onDirtyChange?: (dirty: boolean) => void;

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
    recurrenceEndDate: null,
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
    secondaryActions,
    onSubmit,
    onDirtyChange,
}: TodoFormProps) {
    const insets = useSafeAreaInsets();
    const [detailsExpanded, setDetailsExpanded] = useState(!quickEntry);
    const submitting = useRef(false);
    const {
        control,
        handleSubmit,
        getValues,
        setValue,
        formState: { errors, isSubmitting, isDirty },
    } = useForm<TodoFormValues>({
        resolver: zodResolver(todoSchema),
        defaultValues: initialValues ?? {
            ...DEFAULT_VALUES,
            typeId:
                (todoTypes.find((type) => type.name === 'Task') ?? todoTypes[0])
                    ?.id ?? '',
        },
    });

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

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
                <View style={styles.section}>
                    <Text style={styles.label}>Subject</Text>

                    <Controller
                        control={control}
                        name="subject"
                        render={({
                            field: { value, onChange, onBlur, ref },
                        }) => (
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
                                placeholderTextColor={homeColors.muted}
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
                        render={({ field: { value, onChange, onBlur } }) => (
                            <TodoTypeSelect
                                todoTypes={todoTypes}
                                value={value}
                                onChange={onChange}
                                onBlur={onBlur}
                                disabled={submitDisabled}
                            />
                        )}
                    />

                    {errors.typeId && (
                        <Text style={styles.errorText}>
                            {errors.typeId.message}
                        </Text>
                    )}
                </View>

                <View style={styles.section}>
                    <Text
                        style={styles.sectionTitle}
                        accessibilityRole="header"
                    >
                        Schedule
                    </Text>
                    <View style={styles.scheduleRow}>
                        <View style={styles.dueDateColumn}>
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
                                                        : 'Add date'}
                                                </Text>
                                            </Pressable>

                                            {value && (
                                                <Pressable
                                                    style={
                                                        styles.clearScheduleButton
                                                    }
                                                    accessibilityRole="button"
                                                    accessibilityLabel="Clear due date"
                                                    disabled={submitDisabled}
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
                            <Text style={styles.label}>Due time</Text>
                            <Controller
                                control={control}
                                name="dueTime"
                                render={({ field: { value, onChange } }) => {
                                    function openTimePicker() {
                                        if (!dueDate) return;
                                        const selected =
                                            parseStoredDate(dueDate);
                                        const [hour, minute] = (
                                            value ?? '09:00'
                                        )
                                            .split(':')
                                            .map(Number);
                                        selected.setHours(hour, minute, 0, 0);
                                        DateTimePickerAndroid.open({
                                            value: selected,
                                            mode: 'time',
                                            is24Hour: false,
                                            onValueChange: (_event, time) => {
                                                onChange(format(time, 'HH:mm'));
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
                                                    !dueDate || submitDisabled
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
                                                        ? formatDueTime(value)
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
                                                    disabled={submitDisabled}
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
                        Date and time are optional.
                    </Text>
                    {errors.dueTime && (
                        <Text style={styles.errorText}>
                            {errors.dueTime.message}
                        </Text>
                    )}
                </View>

                {quickEntry && (
                    <Pressable
                        style={({ pressed }) => [
                            styles.detailsButton,
                            pressed && styles.pressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: detailsExpanded }}
                        disabled={submitDisabled}
                        onPress={() =>
                            setDetailsExpanded((expanded) => !expanded)
                        }
                    >
                        <View style={styles.detailsCopy}>
                            <Text style={styles.detailsButtonText}>
                                {detailsExpanded
                                    ? 'Hide options'
                                    : 'More options'}
                            </Text>
                            {!detailsExpanded && (
                                <Text style={styles.helperText}>
                                    Reminder, repeat, priority and notes
                                </Text>
                            )}
                        </View>
                        <Text
                            style={styles.detailsButtonText}
                            accessible={false}
                            importantForAccessibility="no"
                        >
                            {detailsExpanded ? '−' : '+'}
                        </Text>
                    </Pressable>
                )}

                {detailsExpanded && (
                    <>
                        <View style={styles.section}>
                            <Text
                                style={styles.sectionTitle}
                                accessibilityRole="header"
                            >
                                Reminder
                            </Text>

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
                                        const currentReminder =
                                            getReminderDate();

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

                                                onChange(
                                                    combined.toISOString(),
                                                );
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
                                                accessibilityRole="button"
                                                disabled={submitDisabled}
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
                                                    style={
                                                        styles.clearDateButton
                                                    }
                                                    accessibilityRole="button"
                                                    accessibilityLabel="Clear reminder"
                                                    disabled={submitDisabled}
                                                    onPress={() =>
                                                        onChange(null)
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.clearDateText
                                                        }
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
                        </View>

                        <View style={styles.section}>
                            <Text
                                style={styles.sectionTitle}
                                accessibilityRole="header"
                            >
                                Repeat
                            </Text>

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
                                            const selected =
                                                value === frequency;

                                            return (
                                                <Pressable
                                                    key={label}
                                                    accessibilityRole="button"
                                                    accessibilityState={{
                                                        selected,
                                                    }}
                                                    disabled={submitDisabled}
                                                    style={[
                                                        styles.optionButton,
                                                        selected &&
                                                            styles.optionButtonSelected,
                                                    ]}
                                                    onPress={() => {
                                                        onChange(frequency);

                                                        if (
                                                            frequency === null
                                                        ) {
                                                            setValue(
                                                                'recurrenceEndDate',
                                                                null,
                                                                {
                                                                    shouldDirty: true,
                                                                    shouldValidate: true,
                                                                },
                                                            );
                                                        }

                                                        setValue(
                                                            'recurrenceBasis',
                                                            frequency === null
                                                                ? null
                                                                : (getValues(
                                                                      'recurrenceBasis',
                                                                  ) ??
                                                                      'due_date'),
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

                            {recurrenceFrequency !== null && (
                                <>
                                    <Text style={styles.label}>
                                        Repeat interval
                                    </Text>

                                    <Controller
                                        control={control}
                                        name="recurrenceInterval"
                                        render={({
                                            field: { value, onChange, onBlur },
                                        }) => (
                                            <TextInput
                                                style={styles.input}
                                                value={
                                                    value === null
                                                        ? ''
                                                        : String(value)
                                                }
                                                onChangeText={(text) => {
                                                    const trimmed = text.trim();

                                                    if (trimmed === '') {
                                                        onChange(null);
                                                        return;
                                                    }

                                                    const number =
                                                        Number(trimmed);

                                                    onChange(
                                                        Number.isNaN(number)
                                                            ? null
                                                            : number,
                                                    );
                                                }}
                                                onBlur={onBlur}
                                                accessibilityLabel="Repeat interval"
                                                editable={!submitDisabled}
                                                placeholder="Enter interval"
                                                placeholderTextColor={
                                                    homeColors.muted
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

                                    <Text style={styles.label}>
                                        Repeat based on
                                    </Text>

                                    <Controller
                                        control={control}
                                        name="recurrenceBasis"
                                        render={({
                                            field: { value, onChange },
                                        }) => (
                                            <View
                                                style={styles.optionContainer}
                                            >
                                                {(
                                                    [
                                                        [
                                                            'Due date',
                                                            'due_date',
                                                        ],
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
                                                                checked:
                                                                    selected,
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
                                            : 'Follows the calendar. Each occurrence is created even if earlier ones are unfinished.'}
                                    </Text>

                                    {!quickEntry && (
                                        <Text style={styles.helperText}>
                                            Changes to this open occurrence also
                                            update upcoming occurrences. Earlier
                                            overdue todos and completed history
                                            are kept.
                                        </Text>
                                    )}

                                    <Text style={styles.label}>
                                        Ends on (optional)
                                    </Text>
                                    <Controller
                                        control={control}
                                        name="recurrenceEndDate"
                                        render={({
                                            field: { value, onChange },
                                        }) => (
                                            <View style={styles.dateContainer}>
                                                <Pressable
                                                    style={styles.dateButton}
                                                    accessibilityRole="button"
                                                    accessibilityLabel="Choose repeat end date"
                                                    disabled={submitDisabled}
                                                    onPress={() => {
                                                        DateTimePickerAndroid.open(
                                                            {
                                                                value: parseStoredDate(
                                                                    value ??
                                                                        dueDate ??
                                                                        format(
                                                                            new Date(),
                                                                            'yyyy-MM-dd',
                                                                        ),
                                                                ),
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
                                                            },
                                                        );
                                                    }}
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
                                                                  parseStoredDate(
                                                                      value,
                                                                  ),
                                                                  'MMM d, yyyy',
                                                              )
                                                            : 'Never'}
                                                    </Text>
                                                </Pressable>
                                                {value && (
                                                    <Pressable
                                                        accessibilityRole="button"
                                                        accessibilityLabel="Clear repeat end date"
                                                        disabled={
                                                            submitDisabled
                                                        }
                                                        style={
                                                            styles.clearDateButton
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
                                                            Clear end date
                                                        </Text>
                                                    </Pressable>
                                                )}
                                            </View>
                                        )}
                                    />
                                    <Text style={styles.helperText}>
                                        No new occurrences after the end date.
                                        Unfinished todos stay open.
                                    </Text>
                                    {errors.recurrenceEndDate && (
                                        <Text style={styles.errorText}>
                                            {errors.recurrenceEndDate.message}
                                        </Text>
                                    )}

                                    {errors.recurrenceBasis && (
                                        <Text style={styles.errorText}>
                                            {errors.recurrenceBasis.message}
                                        </Text>
                                    )}
                                </>
                            )}
                        </View>

                        <View style={styles.section}>
                            <Text
                                style={styles.sectionTitle}
                                accessibilityRole="header"
                            >
                                Details
                            </Text>
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
                                            disabled={submitDisabled}
                                            accessibilityRole="button"
                                            accessibilityState={{
                                                selected: value === 'normal',
                                            }}
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
                                            disabled={submitDisabled}
                                            accessibilityRole="button"
                                            accessibilityState={{
                                                selected: value === 'high',
                                            }}
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

                            <Text style={styles.label}>Notes</Text>

                            <Controller
                                control={control}
                                name="notes"
                                render={({
                                    field: { value, onChange, onBlur },
                                }) => (
                                    <TextInput
                                        style={[
                                            styles.input,
                                            styles.notesInput,
                                        ]}
                                        value={value ?? ''}
                                        onChangeText={(text) =>
                                            onChange(text === '' ? null : text)
                                        }
                                        onBlur={onBlur}
                                        accessibilityLabel="Notes"
                                        editable={!submitDisabled}
                                        placeholder="Notes"
                                        placeholderTextColor={homeColors.muted}
                                        multiline
                                        textAlignVertical="top"
                                    />
                                )}
                            />
                        </View>
                    </>
                )}
            </ScrollView>

            <View
                style={[
                    styles.submitFooter,
                    { paddingBottom: 12 + insets.bottom },
                ]}
            >
                <Pressable
                    style={({ pressed }) => [
                        styles.submitButton,
                        pressed && styles.pressed,
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
                {secondaryActions}
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    form: {
        flex: 1,
        backgroundColor: homeColors.canvas,
    },

    scrollArea: {
        flex: 1,
    },

    container: {
        padding: 16,
        gap: 12,
    },

    section: {
        gap: 8,
        padding: 14,
        borderWidth: 1,
        borderColor: homeColors.border,
        borderRadius: 12,
        backgroundColor: homeColors.surface,
    },

    sectionTitle: {
        color: homeColors.accent,
        fontSize: 17,
        fontWeight: '700',
    },

    submitFooter: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: homeColors.border,
        backgroundColor: homeColors.surface,
    },

    label: {
        color: homeColors.text,
        fontSize: 14,
        fontWeight: '700',
    },

    input: {
        minHeight: 48,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: homeColors.border,
        borderRadius: 8,
        paddingVertical: 10,
        backgroundColor: homeColors.canvas,
        color: homeColors.text,
        fontSize: 16,
    },

    detailsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 48,
        padding: 12,
        borderRadius: 10,
        backgroundColor: homeColors.accentSoft,
        gap: 8,
    },

    detailsCopy: { flex: 1, gap: 2 },

    pressed: { opacity: 0.75 },

    detailsButtonText: {
        color: homeColors.accent,
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
        minHeight: 44,
        justifyContent: 'center',
        backgroundColor: homeColors.canvas,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderWidth: 1,
        borderColor: homeColors.border,
        borderRadius: 8,
    },

    optionButtonSelected: {
        backgroundColor: homeColors.accent,
        borderColor: homeColors.accent,
    },

    optionText: {
        color: homeColors.text,
        fontWeight: '600',
        fontSize: 14,
    },

    optionTextSelected: {
        color: homeColors.surface,
    },

    scheduleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },

    dueDateColumn: {
        flex: 1.2,
        minWidth: 0,
        gap: 6,
    },

    dueTimeColumn: {
        flex: 1,
        minWidth: 0,
        gap: 6,
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
        minWidth: 0,
        backgroundColor: homeColors.canvas,
        paddingVertical: 8,
        minHeight: 48,
        justifyContent: 'center',
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: homeColors.border,
        borderRadius: 8,
    },

    dateText: {
        color: homeColors.text,
        fontSize: 16,
    },

    datePlaceholder: {
        color: homeColors.muted,
        fontSize: 16,
    },

    clearDateButton: {
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 8,
        paddingVertical: 6,
    },

    clearDateText: {
        color: homeColors.accent,
        fontWeight: '600',
        fontSize: 14,
    },

    helperText: {
        color: homeColors.muted,
        fontSize: 13,
        lineHeight: 19,
    },

    errorText: {
        color: homeColors.overdue,
        fontSize: 13,
    },

    submitButton: {
        minHeight: 48,
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: homeColors.accent,
        alignItems: 'center',
    },

    submitButtonDisabled: {
        opacity: 0.5,
    },

    submitButtonText: {
        color: homeColors.surface,
        fontSize: 16,
        fontWeight: '600',
    },
});

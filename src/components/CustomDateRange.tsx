import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { parseISO } from 'date-fns';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { homeColors } from '@/theme/homeColors';
import { localDateKey } from '@/utils/recurrence';

export type DateRange = { from: string; through: string };

type Props = {
    initialRange: DateRange | null;
    onCancel: () => void;
    onApply: (range: DateRange) => void;
};

export function CustomDateRange({ initialRange, onCancel, onApply }: Props) {
    const [range, setRange] = useState<DateRange>(() => {
        const today = localDateKey(new Date());
        return initialRange ?? { from: today, through: today };
    });
    const valid = range.from <= range.through;

    function pickDate(field: keyof DateRange) {
        DateTimePickerAndroid.open({
            mode: 'date',
            value: parseISO(range[field]),
            onValueChange: (_event, date) =>
                setRange((current) => ({
                    ...current,
                    [field]: localDateKey(date),
                })),
        });
    }

    return (
        <View style={styles.panel}>
            <View style={styles.row}>
                {(['from', 'through'] as const).map((field) => {
                    const label = field === 'from' ? 'From' : 'Through';
                    const date = parseISO(range[field]).toLocaleDateString();
                    return (
                        <Pressable
                            key={field}
                            style={styles.date}
                            accessibilityRole="button"
                            accessibilityLabel={label}
                            accessibilityValue={{ text: date }}
                            onPress={() => pickDate(field)}
                        >
                            <Text style={styles.label}>{label}</Text>
                            <Text style={styles.text}>{date}</Text>
                        </Pressable>
                    );
                })}
            </View>
            {!valid && (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                    Through date must be on or after From date.
                </Text>
            )}
            <View style={[styles.row, styles.actions]}>
                <Pressable
                    style={styles.action}
                    accessibilityRole="button"
                    onPress={onCancel}
                >
                    <Text style={styles.text}>Cancel</Text>
                </Pressable>
                <Pressable
                    style={[
                        styles.action,
                        styles.apply,
                        !valid && styles.disabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !valid }}
                    disabled={!valid}
                    onPress={() => {
                        if (valid) onApply(range);
                    }}
                >
                    <Text style={styles.applyText}>Apply range</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    panel: {
        marginHorizontal: 16,
        marginTop: 8,
        padding: 10,
        borderRadius: 8,
        backgroundColor: homeColors.accentSoft,
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    date: {
        flex: 1,
        minWidth: 100,
        minHeight: 44,
        padding: 8,
        borderRadius: 6,
        backgroundColor: homeColors.surface,
    },
    label: { color: homeColors.muted, fontSize: 13 },
    text: { color: homeColors.text, fontWeight: '600' },
    error: { marginTop: 6, color: homeColors.overdue },
    actions: { justifyContent: 'flex-end', marginTop: 6 },
    action: {
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 12,
        borderRadius: 6,
    },
    apply: { backgroundColor: homeColors.accent },
    applyText: { color: homeColors.surface, fontWeight: '600' },
    disabled: { opacity: 0.5 },
});

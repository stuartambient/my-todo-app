import { parseISO } from 'date-fns';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Todo } from '@/types/todo';
import { formatDueTime } from '@/utils/dueTime';
import { homeColors } from '@/theme/homeColors';

type Props = {
    todo: Todo;
    typeName: string;
    busy: boolean;
    onEditSeries: () => void;
    onComplete: () => void;
    onDelete: () => void;
};

export function FutureTodoPreview({
    todo,
    typeName,
    busy,
    onEditSeries,
    onComplete,
    onDelete,
}: Props) {
    const { bottom } = useSafeAreaInsets();
    return (
        <View style={styles.screen}>
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.card}>
                    <Text style={styles.eyebrow}>
                        From your repeat schedule
                    </Text>
                    <Text style={styles.subject}>{todo.subject}</Text>
                    <Text style={styles.text}>
                        {typeName}
                        {todo.priority === 'high' ? ' · High priority' : ''}
                    </Text>
                    <Text style={styles.label}>Due date</Text>
                    <Text style={styles.text}>
                        {todo.dueDate
                            ? parseISO(todo.dueDate).toLocaleDateString(
                                  undefined,
                                  {
                                      weekday: 'long',
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric',
                                  },
                              )
                            : ''}
                        {todo.dueTime
                            ? ` · ${formatDueTime(todo.dueTime)}`
                            : ''}
                    </Text>
                    <Text style={styles.label}>Planned reminder</Text>
                    <Text style={styles.text}>
                        {todo.reminderAt
                            ? new Date(todo.reminderAt).toLocaleString()
                            : 'No reminder'}
                    </Text>
                    {todo.notes && (
                        <>
                            <Text style={styles.label}>Notes</Text>
                            <Text style={styles.text}>{todo.notes}</Text>
                        </>
                    )}
                </View>
                <Text style={styles.help}>
                    This future occurrence follows your repeat schedule. Open
                    the repeating todo to change its settings.
                </Text>
            </ScrollView>
            <View style={[styles.footer, { paddingBottom: 12 + bottom }]}>
                <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={onEditSeries}
                    style={[
                        styles.button,
                        styles.primary,
                        busy && styles.disabled,
                    ]}
                >
                    <Text style={styles.primaryText}>Edit repeating todo</Text>
                </Pressable>
                <View style={styles.row}>
                    <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={onComplete}
                        style={[
                            styles.button,
                            styles.secondary,
                            busy && styles.disabled,
                        ]}
                    >
                        <Text style={styles.secondaryText}>Complete Todo</Text>
                    </Pressable>
                    <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={onDelete}
                        style={[
                            styles.button,
                            styles.delete,
                            busy && styles.disabled,
                        ]}
                    >
                        <Text style={styles.deleteText}>Delete Todo</Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: homeColors.canvas },
    content: { padding: 16, gap: 12 },
    card: {
        padding: 16,
        gap: 8,
        borderWidth: 1,
        borderColor: homeColors.border,
        borderRadius: 12,
        backgroundColor: homeColors.surface,
    },
    eyebrow: { color: homeColors.accent, fontSize: 13, fontWeight: '700' },
    subject: { color: homeColors.text, fontSize: 21, fontWeight: '700' },
    label: {
        color: homeColors.text,
        fontSize: 14,
        fontWeight: '700',
        marginTop: 8,
    },
    text: { color: homeColors.text, fontSize: 16 },
    help: { color: homeColors.muted, fontSize: 14, lineHeight: 20 },
    footer: {
        padding: 16,
        gap: 8,
        backgroundColor: homeColors.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: homeColors.border,
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    button: {
        minHeight: 48,
        padding: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
    },
    primary: { backgroundColor: homeColors.accent },
    primaryText: { color: homeColors.surface, fontWeight: '700', fontSize: 16 },
    secondary: {
        flexGrow: 1,
        flexBasis: 130,
        backgroundColor: homeColors.accentSoft,
    },
    secondaryText: { color: homeColors.accent, fontWeight: '700' },
    delete: {
        flexGrow: 1,
        flexBasis: 130,
        backgroundColor: homeColors.overdueSurface,
    },
    deleteText: { color: homeColors.overdue, fontWeight: '700' },
    disabled: { opacity: 0.5 },
});

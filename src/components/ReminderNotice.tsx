import { useState, useSyncExternalStore } from 'react';
import {
    Alert,
    Linking,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { refreshTodoReminders } from '@/repositories/todo.repository';
import {
    getReminderNotice,
    subscribeReminderNotice,
} from '@/services/todoReminders';

export function ReminderNotice() {
    const notice = useSyncExternalStore(
        subscribeReminderNotice,
        getReminderNotice,
        getReminderNotice,
    );
    const [busy, setBusy] = useState(false);

    if (notice.status === 'ready' || notice.status === 'unsupported')
        return null;

    const settings =
        notice.status === 'channel-disabled' ||
        (notice.status === 'permission-denied' && !notice.canAskAgain);
    const message =
        notice.status === 'error'
            ? 'Your todos are saved, but some reminder notifications could not be updated. Tap Retry reminders.'
            : 'Your todos are saved. Allow notifications for TodoApp and its Todo reminders category to receive reminders.';

    async function handlePress() {
        setBusy(true);
        try {
            if (settings) {
                await Linking.openSettings();
            } else {
                await refreshTodoReminders(true);
            }
        } catch (error) {
            Alert.alert(
                'Unable to update reminders',
                error instanceof Error ? error.message : 'Please try again.',
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <View style={styles.container}>
            <Text style={styles.text} accessibilityLiveRegion="polite">
                {message}
            </Text>
            <Pressable
                onPress={() => void handlePress()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy }}
                style={styles.button}
            >
                <Text style={styles.buttonText}>
                    {busy
                        ? 'Checking…'
                        : settings
                          ? 'Open settings'
                          : notice.status === 'error'
                            ? 'Retry reminders'
                            : 'Allow reminders'}
                </Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: 12,
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#fff3d6',
        gap: 8,
    },
    text: { color: '#644100', fontSize: 13, lineHeight: 19 },
    button: {
        alignSelf: 'flex-start',
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: '#805500',
        borderRadius: 6,
    },
    buttonText: { color: '#644100', fontSize: 14, fontWeight: '600' },
});

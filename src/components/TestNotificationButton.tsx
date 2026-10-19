import { useRef, useState } from 'react';
import {
    Alert,
    Linking,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import {
    scheduleTestNotification,
    TEST_NOTIFICATION_DELAY_SECONDS,
} from '@/services/notifications';

export function TestNotificationButton() {
    const scheduling = useRef(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    async function openSettings() {
        try {
            await Linking.openSettings();
        } catch {
            Alert.alert(
                'Unable to open settings',
                'Open Android Settings and allow notifications for this app.',
            );
        }
    }

    async function handlePress() {
        if (scheduling.current) return;
        scheduling.current = true;
        setBusy(true);
        setMessage(null);

        try {
            const result = await scheduleTestNotification();

            if (result.status === 'scheduled') {
                setMessage(
                    `Test scheduled. Watch for a notification in about ${TEST_NOTIFICATION_DELAY_SECONDS} seconds.`,
                );
            } else if (
                result.status === 'permission-denied' ||
                result.status === 'channel-disabled'
            ) {
                Alert.alert(
                    'Notifications are off',
                    result.status === 'channel-disabled'
                        ? 'Allow the Test notifications category in this app’s Android notification settings, then try again.'
                        : 'Allow notifications for this app in Android Settings, then try again. If using Expo Go, open its notification settings.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Open Settings',
                            onPress: () => void openSettings(),
                        },
                    ],
                );
            } else {
                setMessage('This notification test is available on Android.');
            }
        } catch (error) {
            Alert.alert(
                'Unable to schedule test notification',
                error instanceof Error ? error.message : 'Please try again.',
            );
        } finally {
            scheduling.current = false;
            setBusy(false);
        }
    }

    if (Platform.OS !== 'android') return null;

    return (
        <View style={styles.container}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Test notification"
                accessibilityState={{ disabled: busy, busy }}
                disabled={busy}
                onPress={() => void handlePress()}
                style={[styles.button, busy && styles.buttonDisabled]}
            >
                <Text style={styles.buttonText}>
                    {busy ? 'Scheduling…' : 'Test notification'}
                </Text>
            </Pressable>
            {message && (
                <Text style={styles.message} accessibilityLiveRegion="polite">
                    {message}
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { marginTop: 12, gap: 6 },
    button: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#555555',
        borderRadius: 8,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: '#222222', fontSize: 14, fontWeight: '600' },
    message: { color: '#555555', fontSize: 13, lineHeight: 18 },
});

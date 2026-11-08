import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import {
    UtilityButton,
    UtilityCard,
    UtilityNotice,
    UtilityScreen,
    utilityStyles,
} from '@/components/UtilityScreen';
import { homeColors } from '@/theme/homeColors';
import {
    getReminderRestorePreview,
    restoreReminderNotifications,
    type ReminderRestorePreview,
} from '@/repositories/reminderRestore.repository';

export default function RestoreRemindersScreen() {
    const [preview, setPreview] = useState<ReminderRestorePreview | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState('');
    const [partialFailure, setPartialFailure] = useState(false);
    const working = useRef(false);
    const mounted = useRef(true);
    usePreventRemove(busy, () => {});

    useEffect(() => {
        mounted.current = true;
        getReminderRestorePreview()
            .then((value) => {
                if (mounted.current) setPreview(value);
            })
            .catch((failure) => {
                if (mounted.current)
                    setError(
                        failure instanceof Error
                            ? failure.message
                            : 'Unable to check reminders.',
                    );
            });
        return () => {
            mounted.current = false;
        };
    }, []);

    async function run(operation: () => Promise<void>) {
        if (working.current) return;
        working.current = true;
        setBusy(true);
        setError('');
        setResult('');
        setPartialFailure(false);
        try {
            await operation();
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : 'Unable to restore reminders.',
            );
        } finally {
            working.current = false;
            setBusy(false);
        }
    }
    function confirm() {
        if (!preview?.eligible || working.current) return;
        Alert.alert(
            'Restore reminder notifications?',
            `Up to ${preview.eligible} reminder cards will return to the notification shade without sound. This includes cards you may have swiped away.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Restore',
                    onPress: () =>
                        void run(async () => {
                            const restored =
                                await restoreReminderNotifications();
                            setPartialFailure(restored.failed > 0);
                            setResult(
                                `${restored.restored} reminder notification${restored.restored === 1 ? '' : 's'} sent back to the shade.${restored.failed ? ` ${restored.failed} could not be restored. Check notification settings and try again.` : ''}`,
                            );
                            // Immediate Android presentation is asynchronous. The next check
                            // queries the actual shade rather than assuming delivery.
                            setPreview(null);
                        }),
                },
            ],
        );
    }
    return (
        <UtilityScreen
            title="Restore reminders"
            heading="Bring reminders back"
            description="Return previously delivered TodoApp reminders to your notification shade, without sound."
            busy={busy}
        >
            <UtilityCard title="Reminder notifications" icon="reminders">
                {preview && (
                    <>
                        <Text
                            style={{
                                color: homeColors.accent,
                                fontSize: 24,
                                fontWeight: '700',
                            }}
                            accessibilityLiveRegion="polite"
                        >
                            {preview.eligible} eligible to restore
                        </Text>
                        <Text style={utilityStyles.body}>
                            {preview.alreadyVisible} already in the shade ·{' '}
                            {preview.pending} still pending
                        </Text>
                        {preview.eligible === 0 && (
                            <Text style={utilityStyles.body}>
                                No reminder notifications to restore right now.
                            </Text>
                        )}
                        {preview.unverified > 0 && (
                            <Text style={utilityStyles.hint}>
                                {preview.unverified} past reminder
                                {preview.unverified === 1 ? '' : 's'} could not
                                be verified as previously delivered and will be
                                left unchanged.
                            </Text>
                        )}
                    </>
                )}
                {error !== '' && <UtilityNotice error>{error}</UtilityNotice>}
                {result !== '' && (
                    <UtilityNotice error={partialFailure}>
                        {result}
                    </UtilityNotice>
                )}
                {(busy || (!preview && !error && !result)) && (
                    <View style={{ alignItems: 'center', gap: 8 }}>
                        <ActivityIndicator color={homeColors.accent} />
                        <Text style={utilityStyles.hint}>
                            {busy ? 'Working…' : 'Checking reminders…'}
                        </Text>
                    </View>
                )}
                <UtilityButton
                    title="Restore reminder notifications"
                    disabled={busy || !preview?.eligible || error !== ''}
                    onPress={confirm}
                />
                <UtilityButton
                    title="Check again"
                    secondary
                    disabled={busy}
                    onPress={() =>
                        void run(async () => {
                            setPreview(await getReminderRestorePreview());
                        })
                    }
                />
            </UtilityCard>
            <UtilityCard
                title="What gets restored"
                icon="completed"
                description="Only open todos with the same reminder time qualify. Cards already in the shade and reminders still waiting to arrive are skipped."
            >
                <Text style={utilityStyles.body}>
                    Restored cards include Complete and Snooze buttons.
                    Restoring does not change your todos or reminder times.
                </Text>
                <Text style={utilityStyles.hint}>
                    Only verified deliveries can be restored. Older cards
                    cleared before delivery history was available may not be
                    recoverable.
                </Text>
            </UtilityCard>
        </UtilityScreen>
    );
}

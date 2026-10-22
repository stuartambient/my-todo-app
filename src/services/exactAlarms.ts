import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type ExactAlarmAccess = 'exact' | 'approximate' | 'unavailable';

type ExactAlarmsModule = {
    canScheduleExactAlarmsAsync(): Promise<boolean>;
    openSettingsAsync(): Promise<void>;
};

function getNativeModule() {
    return requireOptionalNativeModule<ExactAlarmsModule>('TodoExactAlarms');
}

export async function getExactAlarmAccess(): Promise<ExactAlarmAccess> {
    if (Platform.OS !== 'android' || Number(Platform.Version) < 31)
        return 'exact';
    try {
        const native = getNativeModule();
        if (!native) return 'unavailable';
        return (await native.canScheduleExactAlarmsAsync())
            ? 'exact'
            : 'approximate';
    } catch (error) {
        // A failed capability check must not prevent completion/deletion from
        // cancelling an existing reminder, or disable approximate reminders.
        console.warn('Unable to check precise-reminder access:', error);
        return 'unavailable';
    }
}

export async function openExactAlarmSettings(): Promise<void> {
    if (Platform.OS !== 'android' || Number(Platform.Version) < 31) return;
    const native = getNativeModule();
    if (!native) throw new Error('Update TodoApp to enable precise reminders.');
    // Opening this special-access screen must only follow an explicit user tap.
    await native.openSettingsAsync();
}

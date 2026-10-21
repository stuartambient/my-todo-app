// Keep reminder diagnostics out of release builds and omit todo subjects/notes.
export function reminderDiagnosticsEnabled(): boolean {
    return typeof __DEV__ !== 'undefined' && __DEV__;
}

export function logReminderDiagnostic(
    event: string,
    details: Record<string, unknown>,
): void {
    if (!reminderDiagnosticsEnabled()) return;
    console.info(
        '[Todo reminders]',
        JSON.stringify({ event, at: new Date().toISOString(), ...details }),
    );
}

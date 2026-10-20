import { expect, jest, test } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Resolve Expo's lazy fetch shim before Jest tears down this test environment.
void globalThis.fetch;

test('the Android import graph schedules locally without requiring a remote-topic module', async () => {
    const scheduleNative = jest.fn(async () => 'local-test-id');
    const nativeModules: Record<string, object> = {
        ExpoNotificationPermissionsModule: {
            getPermissionsAsync: jest.fn(async () => ({
                granted: true,
                canAskAgain: true,
            })),
        },
        ExpoNotificationChannelManager: {
            setNotificationChannelAsync: jest.fn(async () => null),
            getNotificationChannelAsync: jest.fn(async () => ({
                importance: 4,
            })),
        },
        ExpoNotificationScheduler: {
            scheduleNotificationAsync: scheduleNative,
            getAllScheduledNotificationsAsync: jest.fn(async () => []),
            cancelScheduledNotificationAsync: jest.fn(async () => null),
        },
        ExpoNotificationsHandlerModule: {},
        ExpoNotificationPresenter: {
            getPresentedNotificationsAsync: jest.fn(async () => []),
            dismissNotificationAsync: jest.fn(async () => null),
        },
    };

    const nativeLookups: string[] = [];
    const core = {
        Platform: { OS: 'android' },
        CodedError: class extends Error {},
        UnavailabilityError: class extends Error {},
        LegacyEventEmitter: class {
            addListener() {
                return { remove() {} };
            }
        },
        requireNativeModule: (name: string) => {
            nativeLookups.push(name);
            if (!(name in nativeModules)) {
                throw new Error(`Cannot find native module '${name}'`);
            }
            return nativeModules[name];
        },
    };

    // Evaluate actual app files and installed package JS with Android resolution.
    // Only the native bridge is replaced, with local native modules available
    // and remote native modules absent, matching the reported Expo Go failure.
    const packageRoot = path.dirname(
        require.resolve('expo-notifications/package.json'),
    );
    const cache = new Map<string, unknown>();
    function loadFile(filename: string): unknown {
        if (cache.has(filename)) return cache.get(filename);
        const module = { exports: {} };
        cache.set(filename, module.exports);
        const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
                esModuleInterop: true,
            },
        }).outputText;
        function loadDependency(request: string): unknown {
            if (request === 'expo-modules-core') return core;
            if (request === 'expo') {
                return {
                    PermissionStatus: {
                        GRANTED: 'granted',
                        DENIED: 'denied',
                        UNDETERMINED: 'undetermined',
                    },
                };
            }
            if (request === 'react-native')
                return { Platform: { OS: 'android' } };
            if (request === 'expo-notifications') {
                throw new Error(
                    "Cannot find native module 'ExpoTopicSubscriptionModule'",
                );
            }
            const base = request.startsWith('expo-notifications/build/')
                ? path.join(
                      packageRoot,
                      request.slice('expo-notifications/'.length),
                  )
                : request.startsWith('.')
                  ? path.resolve(path.dirname(filename), request)
                  : null;
            if (!base) throw new Error(`Unexpected dependency: ${request}`);
            const resolved = [
                '.android.js',
                '.native.js',
                '.js',
                '.android.ts',
                '.native.ts',
                '.ts',
            ]
                .map((extension) => base + extension)
                .find(existsSync);
            if (!resolved) throw new Error(`Cannot resolve ${request}`);
            return loadFile(resolved);
        }
        const evaluate = runInNewContext(
            `(function(require, module, exports) { ${compiled}\n})`,
            { console, Date },
        );
        evaluate(loadDependency, module, module.exports);
        return module.exports;
    }
    const service = loadFile(
        path.resolve(__dirname, '../notifications.ts'),
    ) as typeof import('../notifications');
    expect(() => service.configureNotificationHandler()).not.toThrow();
    const reminders = loadFile(
        path.resolve(__dirname, '../todoReminders.ts'),
    ) as typeof import('../todoReminders');
    const reminderAt = '2050-06-01T12:00:00.000Z';
    await reminders.reconcileTodoReminders([
        { id: 'saved', subject: 'Saved reminder', status: 'open', reminderAt },
    ]);
    expect(reminders.getReminderNotice().status).toBe('ready');
    expect(scheduleNative).toHaveBeenCalledTimes(1);
    expect(scheduleNative).toHaveBeenLastCalledWith(
        'todo-reminder:saved',
        expect.objectContaining({ title: 'Saved reminder' }),
        expect.objectContaining({
            type: 'date',
            timestamp: Date.parse(reminderAt),
        }),
    );
    expect(nativeLookups).not.toContain('ExpoTopicSubscriptionModule');
    const channelManager = nativeModules.ExpoNotificationChannelManager as {
        setNotificationChannelAsync: ReturnType<typeof jest.fn>;
    };
    expect(channelManager.setNotificationChannelAsync).toHaveBeenCalledTimes(1);
    for (const [, options] of channelManager.setNotificationChannelAsync.mock
        .calls) {
        // SDK 57 checks any channel sound string as a custom resource filename.
        expect(options).not.toHaveProperty('sound');
    }
});

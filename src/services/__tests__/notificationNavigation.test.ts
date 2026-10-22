import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { Platform } from 'react-native';

import { getTodoById } from '@/repositories/todo.repository';
import type { Todo } from '@/types/todo';

import * as Notifications from '../localNotifications';
import { observeTodoNotificationTaps } from '../notificationNavigation';

void globalThis.fetch;
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('@/repositories/todo.repository', () => ({ getTodoById: jest.fn() }));
jest.mock('../localNotifications', () => ({
    DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
    addNotificationResponseReceivedListener: jest.fn(),
    getLastNotificationResponse: jest.fn(),
    clearLastNotificationResponse: jest.fn(),
}));

const mocked = jest.mocked(Notifications);
const lookup = jest.mocked(getTodoById);
type Response = Notifications.NotificationResponse;
let last: Response | null;
let listener: (response: Response) => void;
const remove = jest.fn();
const callbacks = {
    openTodo: jest.fn<(id: string) => void>(),
    todoUnavailable: jest.fn(),
    onError: jest.fn(),
};
const response = (id = 'one', date = 1): Response =>
    ({
        actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
        notification: {
            date,
            request: {
                identifier: 'todo-reminder:' + id,
                content: {
                    data: {
                        todoId: id,
                        reminderAt: `2030-06-15T15:0${date}:00.000Z`,
                    },
                },
            },
        },
    }) as unknown as Response;
const row = (id: string) => ({ id }) as Todo;
const emit = (value: Response) => {
    last = value;
    listener(value);
};
const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'info').mockImplementation(() => {});
    Object.assign(Platform, { OS: 'android' });
    last = null;
    lookup.mockImplementation(async (id) => row(id));
    mocked.getLastNotificationResponse.mockImplementation(() => last);
    mocked.clearLastNotificationResponse.mockImplementation(() => {
        last = null;
    });
    mocked.addNotificationResponseReceivedListener.mockImplementation(
        (callback) => {
            listener = callback;
            return { remove };
        },
    );
});
afterEach(() => {
    jest.restoreAllMocks();
});

test('normal startup without a notification never changes the selected screen', async () => {
    const observer = observeTodoNotificationTaps(callbacks);
    observer.navigationReady();
    await settle();
    expect(lookup).not.toHaveBeenCalled();
    expect(callbacks.openTodo).not.toHaveBeenCalled();
    observer.stop();
    expect(remove).toHaveBeenCalledTimes(1);
});

test('a cold-start response waits for navigation readiness and then opens its saved todo', async () => {
    last = response();
    const observer = observeTodoNotificationTaps(callbacks);
    expect(lookup).not.toHaveBeenCalled();
    observer.navigationReady();
    await settle();
    expect(lookup).toHaveBeenCalledWith('one');
    expect(callbacks.openTodo).toHaveBeenCalledWith('one');
    expect(last).toBeNull();
    observer.stop();
});

test('a live background/foreground tap opens its own todo', async () => {
    const observer = observeTodoNotificationTaps(callbacks);
    observer.navigationReady();
    emit(response('two'));
    await settle();
    expect(callbacks.openTodo).toHaveBeenCalledWith('two');
    observer.stop();
});

test('the initial response and duplicate live delivery open only once', async () => {
    last = response();
    const observer = observeTodoNotificationTaps(callbacks);
    emit(response());
    observer.navigationReady();
    emit(response());
    await settle();
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(callbacks.openTodo).toHaveBeenCalledTimes(1);
    observer.stop();
});

test('a later occurrence of the same todo is a new tap, not a duplicate', async () => {
    const observer = observeTodoNotificationTaps(callbacks);
    observer.navigationReady();
    emit(response('one', 1));
    await settle();
    emit(response('one', 2));
    await settle();
    expect(callbacks.openTodo).toHaveBeenCalledTimes(2);
    observer.stop();
});

test('a consumed notification is not replayed after observer remount', async () => {
    last = response();
    const first = observeTodoNotificationTaps(callbacks);
    first.navigationReady();
    await settle();
    first.stop();
    const second = observeTodoNotificationTaps(callbacks);
    second.navigationReady();
    await settle();
    expect(callbacks.openTodo).toHaveBeenCalledTimes(1);
    second.stop();
});

test('a deleted todo returns to the list through the unavailable callback', async () => {
    lookup.mockResolvedValue(null);
    const observer = observeTodoNotificationTaps(callbacks);
    observer.navigationReady();
    emit(response());
    await settle();
    expect(callbacks.todoUnavailable).toHaveBeenCalledTimes(1);
    expect(callbacks.openTodo).not.toHaveBeenCalled();
    expect(last).toBeNull();
    observer.stop();
});

test('completed todos still open their existing details', async () => {
    lookup.mockResolvedValue({ id: 'one', status: 'completed' } as Todo);
    const observer = observeTodoNotificationTaps(callbacks);
    observer.navigationReady();
    emit(response());
    await settle();
    expect(callbacks.openTodo).toHaveBeenCalledWith('one');
    observer.stop();
});

test('unrelated, mismatched, malformed and non-default action responses are ignored', async () => {
    const observer = observeTodoNotificationTaps(callbacks);
    observer.navigationReady();
    const unrelated = response();
    unrelated.notification.request.identifier = 'foreign';
    const mismatch = response();
    mismatch.notification.request.content.data!.todoId = 'other';
    const malformed = response();
    malformed.notification.request.content.data!.todoId = ['one'];
    const action = response();
    action.actionIdentifier = 'snooze';
    [unrelated, mismatch, malformed, action].forEach(emit);
    await settle();
    expect(lookup).not.toHaveBeenCalled();
    expect(mocked.clearLastNotificationResponse).not.toHaveBeenCalled();
    observer.stop();
});

test('a failed database read reports an error and consumes the stale response', async () => {
    const error = new Error('SQLite unavailable');
    lookup.mockRejectedValue(error);
    const observer = observeTodoNotificationTaps(callbacks);
    observer.navigationReady();
    emit(response());
    await settle();
    expect(callbacks.onError).toHaveBeenCalledWith(error);
    expect(callbacks.openTodo).not.toHaveBeenCalled();
    expect(last).toBeNull();
    observer.stop();
});

test('cleanup during a database read neither navigates nor consumes the response', async () => {
    let resolve!: (todo: Todo) => void;
    lookup.mockReturnValue(
        new Promise<Todo>((done) => {
            resolve = done;
        }),
    );
    const observer = observeTodoNotificationTaps(callbacks);
    observer.navigationReady();
    const tap = response();
    emit(tap);
    observer.stop();
    resolve(row('one'));
    await settle();
    expect(callbacks.openTodo).not.toHaveBeenCalled();
    expect(last).toBe(tap);
});

test('the newest tap wins and an older lookup cannot erase it', async () => {
    const resolve = new Map<string, (todo: Todo) => void>();
    lookup.mockImplementation(
        (id) =>
            new Promise<Todo>((done) => {
                resolve.set(id, done);
            }),
    );
    const observer = observeTodoNotificationTaps(callbacks);
    observer.navigationReady();
    emit(response('one'));
    const latest = response('two');
    emit(latest);
    resolve.get('one')!(row('one'));
    await settle();
    expect(last).toBe(latest);
    expect(callbacks.openTodo).not.toHaveBeenCalled();
    resolve.get('two')!(row('two'));
    await settle();
    expect(callbacks.openTodo).toHaveBeenCalledTimes(1);
    expect(callbacks.openTodo).toHaveBeenCalledWith('two');
    observer.stop();
});

test('only the latest queued tap loads once navigation becomes ready', async () => {
    const observer = observeTodoNotificationTaps(callbacks);
    emit(response('one'));
    emit(response('two'));
    observer.navigationReady();
    await settle();
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(callbacks.openTodo).toHaveBeenCalledWith('two');
    observer.stop();
});

test('non-Android platforms do not subscribe to Android notifications', () => {
    Object.assign(Platform, { OS: 'web' });
    const observer = observeTodoNotificationTaps(callbacks);
    observer.navigationReady();
    observer.stop();
    expect(
        mocked.addNotificationResponseReceivedListener,
    ).not.toHaveBeenCalled();
});

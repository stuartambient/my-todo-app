import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Alert } from 'react-native';

import { useUnsavedTodoGuard } from '../useUnsavedTodoGuard';

jest.mock('expo-router', () => ({ useNavigation: jest.fn() }));
jest.mock('expo-router/react-navigation', () => ({
    usePreventRemove: jest.fn(),
}));
const dispatch = jest.fn();
const action = { type: 'GO_BACK', source: 'todo-editor' };
let blocked: Parameters<typeof usePreventRemove>[1];
let preventing: boolean;

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useNavigation).mockReturnValue({ dispatch } as never);
    jest.mocked(usePreventRemove).mockImplementation((value, callback) => {
        preventing = value;
        blocked = callback;
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
    jest.restoreAllMocks();
});
const pressAlert = async (label: string) => {
    const button = jest
        .mocked(Alert.alert)
        .mock.calls.at(-1)![2]!
        .find((item) => item.text === label)!;
    await act(() => button.onPress?.());
};
const back = async () => {
    await act(() => blocked({ data: { action } }));
};

test('untouched and reverted forms are unblocked; dirty forms require explicit discard', async () => {
    const { result } = await renderHook(useUnsavedTodoGuard);
    expect(preventing).toBe(false);
    await act(() => result.current.onDirtyChange(true));
    expect(preventing).toBe(true);
    await back();
    await back();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    await pressAlert('Keep editing');
    expect(dispatch).not.toHaveBeenCalled();
    expect(preventing).toBe(true);
    await back();
    await pressAlert('Discard changes');
    expect(dispatch).toHaveBeenCalledWith(action);
    expect(preventing).toBe(false);
    await act(() => result.current.onDirtyChange(true));
    await act(() => result.current.onDirtyChange(false));
    expect(preventing).toBe(false);
});

test('successful saves allow immediate navigation without a discard prompt', async () => {
    const { result } = await renderHook(useUnsavedTodoGuard);
    await act(() => result.current.onDirtyChange(true));
    const leave = jest.fn(() => blocked({ data: { action } }));
    await act(() => result.current.perform(async () => 'saved', leave));
    expect(leave).toHaveBeenCalledWith('saved');
    expect(dispatch).toHaveBeenCalledWith(action);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(preventing).toBe(false);
});

test('failed saves leave the draft protected and do not navigate', async () => {
    const { result } = await renderHook(useUnsavedTodoGuard);
    await act(() => result.current.onDirtyChange(true));
    const leave = jest.fn();
    await act(async () => {
        await expect(
            result.current.perform(async () => {
                throw new Error('Save failed');
            }, leave),
        ).rejects.toThrow('Save failed');
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.dirty).toBe(true);
    expect(leave).not.toHaveBeenCalled();
    await back();
    expect(Alert.alert).toHaveBeenCalledWith(
        'Discard changes?',
        expect.any(String),
        expect.any(Array),
        expect.any(Object),
    );
});

test('Back and duplicate mutations wait for the in-flight save', async () => {
    let finish!: () => void;
    let saving!: Promise<void>;
    const { result } = await renderHook(useUnsavedTodoGuard);
    const leave = jest.fn();
    await act(() => result.current.onDirtyChange(true));
    await act(() => {
        saving = result.current.perform(
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
            leave,
        );
    });
    expect(result.current.busy).toBe(true);
    expect(preventing).toBe(true);
    await back();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    const duplicate = jest.fn<() => Promise<void>>();
    await act(() => result.current.perform(duplicate, leave));
    expect(duplicate).not.toHaveBeenCalled();
    await act(async () => {
        finish();
        await saving;
    });
    expect(leave).toHaveBeenCalledTimes(1);
    expect(preventing).toBe(false);
});

test('a confirmed destructive action does not drop the draft before that action succeeds', async () => {
    const { result } = await renderHook(useUnsavedTodoGuard);
    await act(() => result.current.onDirtyChange(true));
    const complete = jest.fn();
    await act(() =>
        result.current.confirmDiscard(
            complete,
            'Completing discards the draft.',
        ),
    );
    await pressAlert('Keep editing');
    expect(complete).not.toHaveBeenCalled();
    await act(() => result.current.confirmDiscard(complete));
    await pressAlert('Discard changes');
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.current.dirty).toBe(true);
});

test('a save finishing after unmount does not navigate from another screen', async () => {
    let finish!: () => void;
    let saving!: Promise<void>;
    const { result, unmount } = await renderHook(useUnsavedTodoGuard);
    const leave = jest.fn();
    await act(() => {
        saving = result.current.perform(
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
            leave,
        );
    });
    await unmount();
    await act(async () => {
        finish();
        await saving;
    });
    expect(leave).not.toHaveBeenCalled();
});

test('dismissing a discard alert lets a later Back press ask again', async () => {
    const { result } = await renderHook(useUnsavedTodoGuard);
    await act(() => result.current.onDirtyChange(true));
    await back();
    await act(() =>
        jest.mocked(Alert.alert).mock.calls.at(-1)![3]!.onDismiss?.(),
    );
    await back();
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    expect(dispatch).not.toHaveBeenCalled();
});

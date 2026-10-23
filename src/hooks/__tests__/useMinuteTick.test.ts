import { afterEach, expect, jest, test } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { useMinuteTick } from '../useMinuteTick';

afterEach(() => {
    jest.useRealTimers();
});

test('updates the due display at minute boundaries and stops when unfocused', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2030-06-15T15:00:45Z'));
    let renders = 0;
    const { rerender, unmount } = await renderHook(
        ({ focused }: { focused: boolean }) => {
            useMinuteTick(focused);
            renders += 1;
        },
        { initialProps: { focused: true } },
    );
    const initial = renders;
    await act(() => jest.advanceTimersByTime(14_999));
    expect(renders).toBe(initial);
    await act(() => jest.advanceTimersByTime(1));
    expect(renders).toBe(initial + 1);
    await act(() => jest.advanceTimersByTime(60_000));
    expect(renders).toBe(initial + 2);
    await rerender({ focused: false });
    const paused = renders;
    await act(() => jest.advanceTimersByTime(120_000));
    expect(renders).toBe(paused);
    await unmount();
    await act(() => jest.advanceTimersByTime(60_000));
    expect(renders).toBe(paused);
});

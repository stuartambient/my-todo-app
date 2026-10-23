import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import type { SectionList, ViewToken } from 'react-native';

import { useRevealTodo } from '../useRevealTodo';
import type { Todo } from '@/types/todo';

const sections = [
    { data: [{ id: 'old' } as Todo] },
    { data: [{ id: 'another' } as Todo, { id: 'new' } as Todo] },
];
const finished = jest.fn();
const scrollToLocation = jest.fn();
const scrollTo = jest.fn();
let frame: FrameRequestCallback;

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
        (callback) => {
            frame = callback;
            return 1;
        },
    );
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
});
afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
});

function attachList(list: {
    current: SectionList<Todo, (typeof sections)[number]> | null;
}) {
    list.current = {
        scrollToLocation,
        getScrollResponder: () => ({ scrollTo }),
    } as unknown as SectionList<Todo, (typeof sections)[number]>;
}

test('reveals the saved todo in its date section and finishes only once it is visible', async () => {
    const { result } = await renderHook(() =>
        useRevealTodo(sections, 'new', true, finished),
    );
    attachList(result.current.list);
    await act(() => frame(0));
    expect(scrollToLocation).toHaveBeenCalledWith({
        sectionIndex: 1,
        itemIndex: 2,
        viewPosition: 0.5,
        animated: false,
    });
    expect(finished).not.toHaveBeenCalled();
    const token = { item: { id: 'new' }, isViewable: true } as ViewToken<Todo>;
    await act(() =>
        result.current.onViewableItemsChanged({ viewableItems: [token] }),
    );
    await act(() =>
        result.current.onViewableItemsChanged({ viewableItems: [token] }),
    );
    expect(finished).toHaveBeenCalledTimes(1);
});

test('retries an unmeasured row after moving near it and cancels timers on unmount', async () => {
    const { result, unmount } = await renderHook(() =>
        useRevealTodo(sections, 'new', true, finished),
    );
    attachList(result.current.list);
    await act(() => frame(0));
    await act(() =>
        result.current.onScrollToIndexFailed({
            index: 50,
            averageItemLength: 80,
        }),
    );
    expect(scrollTo).toHaveBeenCalledWith({ y: 4000, animated: false });
    await act(() => jest.advanceTimersByTime(100));
    expect(scrollToLocation).toHaveBeenCalledTimes(2);
    await act(() =>
        result.current.onScrollToIndexFailed({
            index: 50,
            averageItemLength: 80,
        }),
    );
    await unmount();
    await act(() => jest.advanceTimersByTime(100));
    expect(scrollToLocation).toHaveBeenCalledTimes(2);
});

test('waits for filters and loading to clear before revealing a saved todo', async () => {
    const { result, rerender } = await renderHook(
        ({ enabled }: { enabled: boolean }) =>
            useRevealTodo(sections, 'new', enabled, finished),
        { initialProps: { enabled: false } },
    );
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    await rerender({ enabled: true });
    attachList(result.current.list);
    await act(() => frame(0));
    expect(scrollToLocation).toHaveBeenCalledTimes(1);
});

test('an already visible todo needs no jump when its saved id arrives', async () => {
    const { result, rerender } = await renderHook(
        ({ id }: { id: string | undefined }) =>
            useRevealTodo(sections, id, true, finished),
        { initialProps: { id: undefined as string | undefined } },
    );
    await act(() =>
        result.current.onViewableItemsChanged({
            viewableItems: [
                { item: { id: 'new' }, isViewable: true } as ViewToken<Todo>,
            ],
        }),
    );
    await rerender({ id: 'new' });
    expect(finished).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
});

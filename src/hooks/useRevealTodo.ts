import { useCallback, useEffect, useRef } from 'react';
import type { SectionList, ViewToken } from 'react-native';

import type { Todo } from '@/types/todo';

type TodoSection = { data: Todo[] };
type ScrollFailure = { index: number; averageItemLength: number };

// SectionList cannot jump directly to an unmeasured row. Move near it first,
// allow virtualization to measure those rows, then retry the precise location.
export function useRevealTodo<Section extends TodoSection>(
    sections: Section[],
    todoId: string | undefined,
    enabled: boolean,
    onRevealed: () => void,
) {
    const list = useRef<SectionList<Todo, Section>>(null);
    const visibleIds = useRef(new Set<string>());
    const activeReveal = useRef<{ id: string; finish: () => void } | null>(
        null,
    );
    const handleFailure = useRef<((info: ScrollFailure) => void) | null>(null);

    const onViewableItemsChanged = useCallback(
        ({ viewableItems }: { viewableItems: ViewToken<Todo>[] }) => {
            visibleIds.current = new Set(
                viewableItems
                    .filter((token) => token.isViewable && token.item?.id)
                    .map((token) => token.item.id),
            );
            const pending = activeReveal.current;
            if (pending && visibleIds.current.has(pending.id)) {
                activeReveal.current = null;
                pending.finish();
            }
        },
        [],
    );

    const onScrollToIndexFailed = useCallback((info: ScrollFailure) => {
        handleFailure.current?.(info);
    }, []);

    useEffect(() => {
        if (!enabled || !todoId) return;
        const sectionIndex = sections.findIndex((section) =>
            section.data.some((todo) => todo.id === todoId),
        );
        if (sectionIndex < 0) return;
        const itemIndex = sections[sectionIndex].data.findIndex(
            (todo) => todo.id === todoId,
        );
        if (visibleIds.current.has(todoId)) {
            onRevealed();
            return;
        }

        let cancelled = false;
        let attempts = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        activeReveal.current = { id: todoId, finish: onRevealed };

        function scroll() {
            if (cancelled || !activeReveal.current || attempts >= 8) return;
            attempts += 1;
            list.current?.scrollToLocation({
                sectionIndex,
                // RN 0.86 counts the section header as location zero.
                itemIndex: itemIndex + 1,
                viewPosition: 0.5,
                animated: false,
            });
        }

        handleFailure.current = ({ averageItemLength, index }) => {
            list.current?.getScrollResponder()?.scrollTo({
                y: averageItemLength * index,
                animated: false,
            });
            clearTimeout(timer);
            timer = setTimeout(scroll, 100);
        };
        // Wait until the refreshed sections have been laid out.
        const frame = requestAnimationFrame(scroll);
        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
            clearTimeout(timer);
            activeReveal.current = null;
            handleFailure.current = null;
        };
    }, [sections, todoId, enabled, onRevealed]);

    return { list, onViewableItemsChanged, onScrollToIndexFailed };
}

import { useEffect, useReducer } from 'react';

// Refresh due labels at minute boundaries while the list is focused. This is a
// display update only: it never fetches todos or changes notification schedules.
export function useMinuteTick(enabled: boolean) {
    const [, tick] = useReducer((version: number) => version + 1, 0);

    useEffect(() => {
        if (!enabled) return;
        let timer: ReturnType<typeof setTimeout>;
        function schedule() {
            timer = setTimeout(
                () => {
                    tick();
                    schedule();
                },
                60_000 - (Date.now() % 60_000),
            );
        }
        schedule();
        return () => clearTimeout(timer);
    }, [enabled]);
}

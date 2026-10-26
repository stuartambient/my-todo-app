import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

export function useUnsavedTodoGuard() {
    const navigation = useNavigation();
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const dirtyRef = useRef(false);
    const busyRef = useRef(false);
    const allowExit = useRef(false);
    const promptOpen = useRef(false);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const onDirtyChange = useCallback((value: boolean) => {
        dirtyRef.current = value;
        if (value) allowExit.current = false;
        setDirty(value);
    }, []);

    const confirmDiscard = useCallback(
        (
            onDiscard: () => void,
            message = 'Your changes have not been saved. Discard them and leave?',
        ) => {
            if (busyRef.current || !mounted.current || promptOpen.current)
                return;
            if (!dirtyRef.current) {
                onDiscard();
                return;
            }
            promptOpen.current = true;
            Alert.alert(
                'Discard changes?',
                message,
                [
                    {
                        text: 'Keep editing',
                        style: 'cancel',
                        onPress: () => {
                            promptOpen.current = false;
                        },
                    },
                    {
                        text: 'Discard changes',
                        style: 'destructive',
                        onPress: () => {
                            promptOpen.current = false;
                            if (mounted.current) onDiscard();
                        },
                    },
                ],
                {
                    cancelable: true,
                    onDismiss: () => {
                        promptOpen.current = false;
                    },
                },
            );
        },
        [],
    );

    usePreventRemove(dirty || busy, ({ data }) => {
        // Save navigation can be dispatched before React has committed the
        // clean state. Replaying the original action preserves Router's target.
        if (allowExit.current) {
            navigation.dispatch(data.action);
            return;
        }
        confirmDiscard(() => {
            allowExit.current = true;
            dirtyRef.current = false;
            setDirty(false);
            navigation.dispatch(data.action);
        });
    });

    const perform = useCallback(
        async <T>(
            operation: () => Promise<T>,
            leave: (result: T) => void,
        ): Promise<void> => {
            if (busyRef.current || !mounted.current) return;
            busyRef.current = true;
            setBusy(true);
            try {
                const result = await operation();
                if (!mounted.current) return;
                allowExit.current = true;
                dirtyRef.current = false;
                setDirty(false);
                leave(result);
            } finally {
                busyRef.current = false;
                if (mounted.current) setBusy(false);
            }
        },
        [],
    );

    return { dirty, dirtyRef, busy, onDirtyChange, confirmDiscard, perform };
}

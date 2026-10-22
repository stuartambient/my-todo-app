import { router, Stack, useNavigationContainerRef } from 'expo-router';
import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';

import { initializeDatabase } from '@/database/database';
import { refreshTodoReminders } from '@/repositories/todo.repository';
import { configureNotificationHandler } from '@/services/notifications';
import { observeTodoNotificationTaps } from '@/services/notificationNavigation';

configureNotificationHandler();

export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
    const navigation = useNavigationContainerRef();

    useEffect(() => {
        const observer = observeTodoNotificationTaps({
            openTodo: (id) =>
                router.navigate(
                    { pathname: '/todo/[id]', params: { id } },
                    { withAnchor: true },
                ),
            todoUnavailable: () => {
                router.dismissTo('/');
                Alert.alert('Todo unavailable', 'This todo has been deleted.');
            },
            onError: (error) => {
                console.error('Unable to open reminder todo:', error);
                Alert.alert(
                    'Unable to open todo',
                    'Please open the todo from your list and try again.',
                );
            },
        });
        const removeReadyListener = navigation.addListener('ready', () =>
            observer.navigationReady(),
        );
        if (navigation.isReady()) observer.navigationReady();
        return () => {
            removeReadyListener();
            observer.stop();
        };
    }, [navigation]);

    useEffect(() => {
        initializeDatabase()
            .then(() => refreshTodoReminders())
            .catch((error) => {
                console.error('Failed to initialize database:', error);
            });
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') void refreshTodoReminders();
        });
        return () => subscription.remove();
    }, []);

    return (
        <Stack>
            <Stack.Screen name="index" options={{ title: 'Todos' }} />
            <Stack.Screen name="todo/new" options={{ title: 'New Todo' }} />
            <Stack.Screen name="todo/[id]" options={{ title: 'Edit Todo' }} />
        </Stack>
    );
}

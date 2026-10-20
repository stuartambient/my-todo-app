import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { initializeDatabase } from '@/database/database';
import { refreshTodoReminders } from '@/repositories/todo.repository';
import { configureNotificationHandler } from '@/services/notifications';

configureNotificationHandler();

export default function RootLayout() {
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

    return <Stack />;
}

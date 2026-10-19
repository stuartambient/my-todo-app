import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { initializeDatabase } from '@/database/database';
import { configureNotificationHandler } from '@/services/notifications';

configureNotificationHandler();

export default function RootLayout() {
    useEffect(() => {
        initializeDatabase().catch((error) => {
            console.error('Failed to initialize database:', error);
        });
    }, []);

    return <Stack />;
}

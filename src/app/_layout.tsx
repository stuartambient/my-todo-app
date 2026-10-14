import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { initializeDatabase } from '@/database/database';

export default function RootLayout() {
    useEffect(() => {
        initializeDatabase().catch((error) => {
            console.error('Failed to initialize database:', error);
        });
    }, []);

    return <Stack />;
}

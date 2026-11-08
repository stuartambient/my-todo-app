import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeIcon, type HomeIconName } from '@/components/HomeIcon';
import { homeColors } from '@/theme/homeColors';

export function UtilityScreen({
    title,
    heading,
    description,
    busy = false,
    children,
}: {
    title: string;
    heading: string;
    description: string;
    busy?: boolean;
    children: ReactNode;
}) {
    const { bottom } = useSafeAreaInsets();
    return (
        <ScrollView
            style={utilityStyles.screen}
            contentContainerStyle={[
                utilityStyles.content,
                { paddingBottom: bottom + 24 },
            ]}
        >
            <Stack.Screen
                options={{
                    title,
                    gestureEnabled: !busy,
                    headerStyle: { backgroundColor: homeColors.canvas },
                    headerTintColor: homeColors.text,
                    headerShadowVisible: false,
                }}
            />
            <View style={utilityStyles.introduction}>
                <Text style={utilityStyles.heading} accessibilityRole="header">
                    {heading}
                </Text>
                <Text style={utilityStyles.body}>{description}</Text>
            </View>
            {children}
        </ScrollView>
    );
}

export function UtilityCard({
    title,
    description,
    icon,
    children,
}: {
    title: string;
    description?: string;
    icon: HomeIconName;
    children: ReactNode;
}) {
    return (
        <View style={utilityStyles.card}>
            <View style={utilityStyles.cardHeading}>
                <View style={utilityStyles.iconBadge}>
                    <HomeIcon name={icon} color={homeColors.accent} />
                </View>
                <Text
                    style={utilityStyles.cardTitle}
                    accessibilityRole="header"
                >
                    {title}
                </Text>
            </View>
            {description && (
                <Text style={utilityStyles.body}>{description}</Text>
            )}
            {children}
        </View>
    );
}

export function UtilityButton({
    title,
    onPress,
    disabled = false,
    secondary = false,
}: {
    title: string;
    onPress: () => void;
    disabled?: boolean;
    secondary?: boolean;
}) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
                utilityStyles.button,
                secondary && utilityStyles.secondaryButton,
                (disabled || pressed) && utilityStyles.dimmed,
            ]}
        >
            <Text
                style={[
                    utilityStyles.buttonText,
                    secondary && utilityStyles.secondaryText,
                ]}
            >
                {title}
            </Text>
        </Pressable>
    );
}

export function UtilityNotice({
    children,
    error = false,
}: {
    children: ReactNode;
    error?: boolean;
}) {
    return (
        <View
            style={[utilityStyles.notice, error && utilityStyles.errorNotice]}
        >
            <Text
                style={[
                    utilityStyles.noticeText,
                    error && utilityStyles.errorText,
                ]}
                accessibilityLiveRegion="polite"
            >
                {children}
            </Text>
        </View>
    );
}

export const utilityStyles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: homeColors.canvas },
    content: { padding: 16, gap: 16 },
    introduction: { gap: 8, paddingHorizontal: 2 },
    heading: { fontSize: 24, fontWeight: '700', color: homeColors.text },
    body: { fontSize: 15, lineHeight: 23, color: homeColors.muted },
    hint: { fontSize: 13, lineHeight: 20, color: homeColors.muted },
    card: {
        backgroundColor: homeColors.surface,
        borderWidth: 1,
        borderColor: homeColors.border,
        borderRadius: 14,
        padding: 16,
        gap: 12,
    },
    cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconBadge: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: homeColors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: {
        flexShrink: 1,
        fontSize: 18,
        fontWeight: '700',
        color: homeColors.text,
    },
    button: {
        backgroundColor: homeColors.accent,
        borderWidth: 1,
        borderColor: homeColors.accent,
        borderRadius: 10,
        minHeight: 48,
        padding: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        color: homeColors.surface,
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
    secondaryButton: {
        backgroundColor: homeColors.surface,
        borderColor: homeColors.border,
    },
    secondaryText: { color: homeColors.accent },
    dimmed: { opacity: 0.55 },
    notice: {
        gap: 6,
        backgroundColor: homeColors.accentSoft,
        borderRadius: 10,
        padding: 12,
        borderStartWidth: 3,
        borderStartColor: homeColors.accent,
    },
    noticeText: { fontSize: 15, lineHeight: 22, color: homeColors.accent },
    errorNotice: {
        backgroundColor: homeColors.overdueSurface,
        borderStartColor: homeColors.overdueEdge,
    },
    errorText: { color: homeColors.overdue },
});

import { router } from 'expo-router';
import { useState } from 'react';
import {
    Keyboard,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeIcon, type HomeIconName } from '@/components/HomeIcon';
import { homeColors } from '@/theme/homeColors';

type Props = { onViewCompleted: () => void };

export function HomeViewMenu({ onViewCompleted }: Props) {
    const [visible, setVisible] = useState(false);
    const insets = useSafeAreaInsets();
    function close() {
        setVisible(false);
    }
    const items: {
        title: string;
        description: string;
        icon: HomeIconName;
        action: () => void;
    }[] = [
        {
            title: 'View completed',
            description: 'Review or reopen finished todos',
            icon: 'completed',
            action: onViewCompleted,
        },
        {
            title: 'Restore reminder notifications',
            description: 'Bring cleared reminders back to the shade',
            icon: 'reminders',
            action: () => router.push('/restore-reminders'),
        },
        {
            title: 'Backup & restore',
            description: 'Save a copy or restore missing todos',
            icon: 'backup',
            action: () => router.push('/backup'),
        },
    ];
    return (
        <>
            <Pressable
                style={({ pressed }) => [
                    styles.trigger,
                    pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Todo options"
                accessibilityState={{ expanded: visible }}
                onPress={() => {
                    Keyboard.dismiss();
                    setVisible(true);
                }}
            >
                <HomeIcon name="more" color={homeColors.text} />
            </Pressable>
            <Modal
                visible={visible}
                transparent
                statusBarTranslucent
                animationType="fade"
                onRequestClose={close}
            >
                <View
                    style={[
                        styles.overlay,
                        {
                            paddingTop: insets.top + 8,
                            paddingBottom: insets.bottom + 12,
                        },
                    ]}
                    accessibilityViewIsModal
                >
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        accessibilityRole="button"
                        accessibilityLabel="Close todo options"
                        onPress={close}
                    />
                    <View style={styles.menu}>
                        <ScrollView bounces={false}>
                            {items.map((item, index) => (
                                <View key={item.title}>
                                    {(index === 0 || index === 1) && (
                                        <Text
                                            style={[
                                                styles.groupLabel,
                                                index === 1 &&
                                                    styles.toolsGroup,
                                            ]}
                                            accessibilityRole="header"
                                        >
                                            {index === 0
                                                ? 'Your todos'
                                                : 'Tools'}
                                        </Text>
                                    )}
                                    <Pressable
                                        style={({ pressed }) => [
                                            styles.menuItem,
                                            pressed && styles.itemPressed,
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel={item.title}
                                        accessibilityHint={item.description}
                                        onPress={() => {
                                            close();
                                            item.action();
                                        }}
                                    >
                                        <View style={styles.iconBadge}>
                                            <HomeIcon
                                                name={item.icon}
                                                color={homeColors.accent}
                                            />
                                        </View>
                                        <View style={styles.itemCopy}>
                                            <Text style={styles.menuText}>
                                                {item.title}
                                            </Text>
                                            <Text style={styles.description}>
                                                {item.description}
                                            </Text>
                                        </View>
                                        <Text
                                            style={styles.chevron}
                                            importantForAccessibility="no"
                                        >
                                            ›
                                        </Text>
                                    </Pressable>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    trigger: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
    },
    pressed: { opacity: 0.65 },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(24, 44, 44, 0.22)',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
    },
    menu: {
        flexShrink: 1,
        width: 344,
        maxWidth: '100%',
        paddingVertical: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: homeColors.border,
        backgroundColor: homeColors.surface,
        elevation: 8,
        shadowColor: '#000000',
        shadowOpacity: 0.14,
        shadowOffset: { width: 0, height: 3 },
        shadowRadius: 8,
        overflow: 'hidden',
    },
    groupLabel: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
        color: homeColors.muted,
        fontSize: 12,
        fontWeight: '700',
    },
    toolsGroup: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: homeColors.border,
        marginTop: 8,
        paddingTop: 12,
    },
    menuItem: {
        minHeight: 76,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    itemPressed: { backgroundColor: homeColors.accentSoft },
    iconBadge: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: homeColors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemCopy: { flex: 1, gap: 3 },
    menuText: { color: homeColors.text, fontSize: 16, fontWeight: '600' },
    description: { color: homeColors.muted, fontSize: 13, lineHeight: 18 },
    chevron: { color: homeColors.muted, fontSize: 22 },
});

import { useState } from 'react';
import {
    Keyboard,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = { onViewCompleted: () => void };

export function HomeViewMenu({ onViewCompleted }: Props) {
    const [visible, setVisible] = useState(false);
    const insets = useSafeAreaInsets();

    function close() {
        setVisible(false);
    }

    return (
        <>
            <Pressable
                style={styles.trigger}
                accessibilityRole="button"
                accessibilityLabel="Todo options"
                accessibilityState={{ expanded: visible }}
                onPress={() => {
                    Keyboard.dismiss();
                    setVisible(true);
                }}
            >
                <Text style={styles.icon}>⋮</Text>
            </Pressable>
            <Modal
                visible={visible}
                transparent
                statusBarTranslucent
                animationType="fade"
                onRequestClose={close}
            >
                <View style={styles.overlay} accessibilityViewIsModal>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        accessibilityRole="button"
                        accessibilityLabel="Close todo options"
                        onPress={close}
                    />
                    <View style={[styles.menu, { top: insets.top + 8 }]}>
                        <Pressable
                            style={styles.menuItem}
                            accessibilityRole="button"
                            onPress={() => {
                                close();
                                onViewCompleted();
                            }}
                        >
                            <Text style={styles.menuText}>View completed</Text>
                        </Pressable>
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
    },
    icon: {
        color: '#333333',
        fontSize: 28,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.12)',
    },
    menu: {
        position: 'absolute',
        right: 12,
        minWidth: 210,
        maxWidth: '90%',
        paddingVertical: 4,
        borderRadius: 10,
        backgroundColor: '#ffffff',
        elevation: 8,
        shadowColor: '#000000',
        shadowOpacity: 0.18,
        shadowOffset: { width: 0, height: 3 },
        shadowRadius: 8,
    },
    menuItem: {
        minHeight: 52,
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
    },
    menuText: {
        color: '#222222',
        fontSize: 16,
    },
});

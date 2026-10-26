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

import type { TodoType } from '@/types/todoType';

type Props = {
    todoTypes: TodoType[];
    value: string;
    onChange: (id: string) => void;
    onBlur: () => void;
    disabled: boolean;
};

export function TodoTypeSelect({
    todoTypes,
    value,
    onChange,
    onBlur,
    disabled,
}: Props) {
    const [visible, setVisible] = useState(false);
    const insets = useSafeAreaInsets();
    const selectedName =
        todoTypes.find((type) => type.id === value)?.name ??
        (value ? 'Current type' : 'Select type');
    const unavailable = disabled || todoTypes.length === 0;

    function close() {
        setVisible(false);
        onBlur();
    }

    return (
        <>
            <Pressable
                style={[styles.select, unavailable && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel="Todo type"
                accessibilityValue={{ text: selectedName }}
                accessibilityHint="Opens the list of todo types"
                accessibilityState={{
                    disabled: unavailable,
                    expanded: visible,
                }}
                disabled={unavailable}
                onPress={() => {
                    Keyboard.dismiss();
                    setVisible(true);
                }}
            >
                <Text style={styles.selectedName}>{selectedName}</Text>
                <Text style={styles.chevron}>⌄</Text>
            </Pressable>

            <Modal
                testID="todo-type-dialog"
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
                            paddingTop: insets.top + 24,
                            paddingBottom: insets.bottom + 24,
                        },
                    ]}
                    accessibilityViewIsModal
                >
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel type selection"
                        onPress={close}
                    />
                    <View style={styles.dialog}>
                        <Text style={styles.title} accessibilityRole="header">
                            Todo type
                        </Text>
                        <ScrollView
                            style={styles.choices}
                            keyboardShouldPersistTaps="handled"
                        >
                            {todoTypes.map((type) => {
                                const selected = type.id === value;
                                return (
                                    <Pressable
                                        key={type.id}
                                        style={[
                                            styles.choice,
                                            selected && styles.selectedChoice,
                                        ]}
                                        accessibilityRole="radio"
                                        accessibilityLabel={type.name}
                                        accessibilityState={{
                                            checked: selected,
                                            disabled,
                                        }}
                                        disabled={disabled}
                                        onPress={() => {
                                            onChange(type.id);
                                            close();
                                        }}
                                    >
                                        <Text
                                            style={[
                                                styles.choiceName,
                                                selected && styles.checkedName,
                                            ]}
                                        >
                                            {type.name}
                                        </Text>
                                        {selected && (
                                            <Text style={styles.checkmark}>
                                                ✓
                                            </Text>
                                        )}
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                        <Pressable
                            style={styles.cancel}
                            accessibilityRole="button"
                            onPress={close}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    select: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 48,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 12,
        borderWidth: 1,
        borderColor: '#b8b8b8',
        borderRadius: 8,
        backgroundColor: '#ffffff',
    },
    disabled: { opacity: 0.5 },
    selectedName: { flex: 1, color: '#222222', fontSize: 16 },
    chevron: { color: '#555555', fontSize: 22 },
    overlay: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    dialog: {
        width: '100%',
        maxWidth: 420,
        maxHeight: '100%',
        alignSelf: 'center',
        borderRadius: 16,
        backgroundColor: '#ffffff',
        overflow: 'hidden',
    },
    title: { padding: 20, color: '#222222', fontSize: 20, fontWeight: '600' },
    choices: { flexGrow: 0, flexShrink: 1 },
    choice: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 52,
        paddingVertical: 12,
        paddingHorizontal: 20,
        gap: 12,
    },
    selectedChoice: { backgroundColor: '#eeeeee' },
    choiceName: { flex: 1, color: '#222222', fontSize: 16 },
    checkedName: { fontWeight: '600' },
    checkmark: { color: '#222222', fontSize: 18 },
    cancel: {
        minHeight: 52,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#cccccc',
    },
    cancelText: { color: '#333333', fontSize: 16, fontWeight: '600' },
});

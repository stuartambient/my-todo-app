import { StyleSheet, View } from 'react-native';

type Props = {
    name: 'search' | 'add' | 'more';
    color: string;
};

export function HomeIcon({ name, color }: Props) {
    const fill = { backgroundColor: color };

    return (
        <View
            style={styles.icon}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
        >
            {name === 'search' ? (
                <>
                    <View style={[styles.lens, { borderColor: color }]} />
                    <View style={[styles.handle, fill]} />
                </>
            ) : name === 'add' ? (
                <>
                    <View style={[styles.horizontal, fill]} />
                    <View style={[styles.vertical, fill]} />
                </>
            ) : (
                <>
                    <View style={[styles.dot, fill]} />
                    <View style={[styles.dot, fill]} />
                    <View style={[styles.dot, fill]} />
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    icon: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
    },
    lens: {
        position: 'absolute',
        top: 3,
        left: 3,
        width: 13,
        height: 13,
        borderWidth: 2,
        borderRadius: 7,
    },
    handle: {
        position: 'absolute',
        top: 16,
        left: 13,
        width: 8,
        height: 2,
        borderRadius: 1,
        transform: [{ rotate: '45deg' }],
    },
    horizontal: { position: 'absolute', width: 18, height: 2, borderRadius: 1 },
    vertical: { position: 'absolute', width: 2, height: 18, borderRadius: 1 },
    dot: { width: 3, height: 3, borderRadius: 2 },
});

import { StyleSheet, View } from 'react-native';

export type HomeIconName =
    | 'search'
    | 'add'
    | 'more'
    | 'completed'
    | 'backup'
    | 'restore'
    | 'reminders'
    | 'back';

type Props = {
    name: HomeIconName;
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
            ) : name === 'completed' ? (
                <View style={[styles.completedRing, { borderColor: color }]}>
                    <View style={[styles.tick, { borderColor: color }]} />
                </View>
            ) : name === 'backup' || name === 'restore' ? (
                <>
                    <View style={[styles.tray, { borderColor: color }]} />
                    <View style={[styles.arrowStem, fill]} />
                    <View
                        style={[
                            styles.arrowHead,
                            name === 'restore' && styles.restoreArrow,
                            { borderColor: color },
                        ]}
                    />
                </>
            ) : name === 'reminders' ? (
                <>
                    <View style={[styles.bell, { borderColor: color }]} />
                    <View style={[styles.bellBase, fill]} />
                    <View style={[styles.bellDot, fill]} />
                </>
            ) : name === 'back' ? (
                <View style={[styles.back, { borderColor: color }]} />
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
    completedRing: {
        width: 20,
        height: 20,
        borderWidth: 2,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tick: {
        width: 9,
        height: 5,
        borderStartWidth: 2,
        borderBottomWidth: 2,
        transform: [{ rotate: '-45deg' }],
        marginTop: -2,
    },
    tray: {
        position: 'absolute',
        bottom: 3,
        width: 20,
        height: 8,
        borderWidth: 2,
        borderTopWidth: 0,
        borderRadius: 2,
    },
    arrowStem: { position: 'absolute', top: 3, width: 2, height: 12 },
    arrowHead: {
        position: 'absolute',
        top: 9,
        width: 8,
        height: 8,
        borderEndWidth: 2,
        borderBottomWidth: 2,
        transform: [{ rotate: '45deg' }],
    },
    restoreArrow: { top: 3, transform: [{ rotate: '225deg' }] },
    bell: {
        position: 'absolute',
        top: 3,
        width: 14,
        height: 14,
        borderWidth: 2,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
    },
    bellBase: {
        position: 'absolute',
        top: 16,
        width: 20,
        height: 2,
        borderRadius: 1,
    },
    bellDot: {
        position: 'absolute',
        top: 20,
        width: 4,
        height: 2,
        borderRadius: 2,
    },
    back: {
        width: 10,
        height: 10,
        borderStartWidth: 2,
        borderBottomWidth: 2,
        transform: [{ rotate: '45deg' }],
        marginStart: 5,
    },
});

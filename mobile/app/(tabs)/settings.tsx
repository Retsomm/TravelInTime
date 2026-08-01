import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';

const SettingsScreen = () => {
  const { darkMode, toggleDarkMode, colors } = useTheme();

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: colors.paperBg }]}>
      <Text style={[styles.title, { color: colors.ink }]}>設定</Text>
      <View style={[styles.toggleRow, { borderColor: colors.borderColor, backgroundColor: colors.paperBg2 }]}>
        <Text style={[styles.toggleLabel, { color: colors.ink }]}>深色模式</Text>
        <Pressable
          onPress={toggleDarkMode}
          accessibilityRole="switch"
          accessibilityState={{ checked: darkMode }}
          accessibilityLabel="切換深色模式"
          hitSlop={8}
          style={[
            styles.switchTrack,
            {
              backgroundColor: darkMode ? colors.progressFill : colors.borderColor,
              alignItems: darkMode ? 'flex-end' : 'flex-start',
            },
          ]}
        >
          <View style={styles.switchThumb} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    paddingHorizontal: 16,
    height: 44,
    lineHeight: 44,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  toggleLabel: {
    fontSize: 15,
  },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
});

export default SettingsScreen;

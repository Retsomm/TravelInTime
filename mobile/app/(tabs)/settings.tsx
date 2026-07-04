import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';

const SettingsScreen = () => {
  const { darkMode, toggleDarkMode, colors } = useTheme();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.paperBg }}>
      <Text style={{ fontSize: 20, fontWeight: '600', color: colors.ink, paddingHorizontal: 16, height: 44, lineHeight: 44 }}>
        設定
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginHorizontal: 16,
          marginTop: 8,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.borderColor,
          backgroundColor: colors.paperBg2,
        }}
      >
        <Text style={{ fontSize: 15, color: colors.ink }}>深色模式</Text>
        <Pressable
          onPress={toggleDarkMode}
          accessibilityRole="switch"
          accessibilityState={{ checked: darkMode }}
          accessibilityLabel="切換深色模式"
          hitSlop={8}
          style={{
            width: 48,
            height: 28,
            borderRadius: 14,
            padding: 2,
            backgroundColor: darkMode ? colors.progressFill : colors.borderColor,
            justifyContent: 'center',
            alignItems: darkMode ? 'flex-end' : 'flex-start',
          }}
        >
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' }} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

export default SettingsScreen;

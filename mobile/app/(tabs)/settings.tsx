import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SettingsScreen = () => {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>設定頁面（骨架）</Text>
      </View>
    </SafeAreaView>
  );
};

export default SettingsScreen;

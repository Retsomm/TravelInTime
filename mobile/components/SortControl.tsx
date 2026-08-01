import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../lib/theme';

export type SortKey = 'recent' | 'title' | 'progress';

const LABELS: Record<SortKey, string> = {
  recent: '最近閱讀',
  title: '書名',
  progress: '進度',
};

interface Props {
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
}

// 比照 renderer/src/components/Library/SortControl.tsx 的分段控制項設計語言。
const SortControl = ({ sort, onSortChange }: Props) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.paperBg2, borderColor: colors.borderColor }]}>
      {(Object.keys(LABELS) as SortKey[]).map((key) => {
        const active = sort === key;
        return (
          <Pressable
            key={key}
            onPress={() => onSortChange(key)}
            style={[styles.button, { backgroundColor: active ? colors.paperBg : 'transparent' }]}
          >
            <Text style={[styles.label, { color: active ? colors.ink : colors.ink3, fontWeight: active ? '600' : '400' }]}>
              {LABELS[key]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  button: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
  },
});

export default SortControl;

import { Pressable, Text, View } from 'react-native';
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
    <View
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        backgroundColor: colors.paperBg2,
        borderWidth: 1,
        borderColor: colors.borderColor,
        borderRadius: 8,
        padding: 2,
        gap: 2,
      }}
    >
      {(Object.keys(LABELS) as SortKey[]).map((key) => {
        const active = sort === key;
        return (
          <Pressable
            key={key}
            onPress={() => onSortChange(key)}
            style={{
              height: 26,
              paddingHorizontal: 10,
              borderRadius: 6,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? colors.paperBg : 'transparent',
            }}
          >
            <Text style={{ fontSize: 12, color: active ? colors.ink : colors.ink3, fontWeight: active ? '600' : '400' }}>
              {LABELS[key]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

export default SortControl;

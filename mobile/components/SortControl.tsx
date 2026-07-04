import { Pressable, Text, View } from 'react-native';

export type SortKey = 'recent' | 'title' | 'progress';

const LABELS: Record<SortKey, string> = {
  recent: '最近閱讀',
  title: '書名',
  progress: '進度',
};

const PAPER_BG = '#f9f7f2';
const PAPER_BG2 = '#f1ede4';
const BORDER_COLOR = '#e4ddd0';
const INK_COLOR = '#2a2420';
const INK3_COLOR = '#9a8f80';

interface Props {
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
}

// 比照 renderer/src/components/Library/SortControl.tsx 的分段控制項設計語言。
const SortControl = ({ sort, onSortChange }: Props) => (
  <View
    style={{
      flexDirection: 'row',
      alignSelf: 'flex-start',
      backgroundColor: PAPER_BG2,
      borderWidth: 1,
      borderColor: BORDER_COLOR,
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
            backgroundColor: active ? PAPER_BG : 'transparent',
          }}
        >
          <Text style={{ fontSize: 12, color: active ? INK_COLOR : INK3_COLOR, fontWeight: active ? '600' : '400' }}>
            {LABELS[key]}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

export default SortControl;

import { Image, Pressable, Text, View } from 'react-native';
import type { BookRecord } from '../lib/library';
import { coverStyleFor, PROGRESS_FILL_COLOR, PROGRESS_TRACK_COLOR } from '../lib/coverStyles';

interface Props {
  record: BookRecord;
  width: number;
  onPress: () => void;
  onDelete: () => void;
}

// 封面用固定像素寬高（而非 flex:1 + aspectRatio），因為卡片寬度依賴 FlatList numColumns
// 產生的欄寬去算，若 numColumns 沒套用成功（例如 Fast Refresh 沒有完整重新掛載），
// flex:1 會讓卡片撐滿整列寬度變得超大；改成呼叫端算好固定寬度傳進來，就不會受這個影響。
const BookCard = ({ record, width, onPress, onDelete }: Props) => {
  const pct = Math.round((record.progress ?? 0) * 100);
  const style = coverStyleFor(record.id);
  const coverHeight = Math.round(width * 1.5);

  return (
    <View style={{ width }}>
      <Pressable
        onPress={onPress}
        onLongPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={record.author ? `開啟《${record.title}》，作者 ${record.author}` : `開啟《${record.title}》`}
      >
        <View
          style={{
            width,
            height: coverHeight,
            borderRadius: 6,
            overflow: 'hidden',
            backgroundColor: style.bg,
          }}
        >
          {record.coverUri ? (
            <Image source={{ uri: record.coverUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <View style={{ flex: 1, justifyContent: 'space-between', padding: 14 }}>
              <View>
                <View style={{ width: 20, height: 2, backgroundColor: style.rule, marginBottom: 8 }} />
                <Text numberOfLines={4} style={{ color: style.ink, fontSize: 13, fontWeight: '600', lineHeight: 17 }}>
                  {record.title}
                </Text>
              </View>
              {record.author ? (
                <Text
                  numberOfLines={1}
                  style={{ color: style.ink, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.75 }}
                >
                  {record.author}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </Pressable>

      {/* 刪除按鈕：比照 renderer/src/components/Library/BookCard.tsx 的右上角圓形 ✕ 按鈕，
          取代原本只能長按刪除（手機上不夠明顯）的做法；長按仍保留當備援手勢。 */}
      <Pressable
        onPress={onDelete}
        hitSlop={8}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: 'rgba(0,0,0,0.55)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        accessibilityRole="button"
        accessibilityLabel="移除書籍"
      >
        <Text style={{ color: '#fff', fontSize: 12, lineHeight: 14 }}>✕</Text>
      </Pressable>

      <View style={{ marginTop: 8 }}>
        <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: '500', color: '#2a2420', lineHeight: 17 }}>
          {record.title}
        </Text>
        {record.author ? (
          <Text numberOfLines={1} style={{ fontSize: 11, color: '#9a8f80', marginTop: 3 }}>
            {record.author}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 }}>
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: PROGRESS_TRACK_COLOR, overflow: 'hidden' }}>
            <View style={{ width: `${pct}%`, height: '100%', backgroundColor: PROGRESS_FILL_COLOR }} />
          </View>
          <Text style={{ fontSize: 10, color: '#9a8f80' }}>{pct === 100 ? '讀畢' : `${pct}%`}</Text>
        </View>
      </View>
    </View>
  );
};

export default BookCard;

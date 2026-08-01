import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { getCoverUri, type BookRecord } from '../lib/library';
import { coverStyleFor } from '../lib/coverStyles';
import { useTheme } from '../lib/theme';

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
  const { colors } = useTheme();
  const pct = Math.round((record.progress ?? 0) * 100);
  const style = coverStyleFor(record.id);
  const coverHeight = Math.round(width * 1.5);
  const coverUri = useMemo(() => getCoverUri(record), [record.coverFilename, record.coverUri]);

  return (
    <View style={{ width }}>
      <Pressable
        onPress={onPress}
        onLongPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={record.author ? `開啟《${record.title}》，作者 ${record.author}` : `開啟《${record.title}》`}
      >
        <View style={[styles.cover, { width, height: coverHeight, backgroundColor: style.bg }]}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <View>
                <View style={[styles.ruleLine, { backgroundColor: style.rule }]} />
                <Text numberOfLines={4} style={[styles.placeholderTitle, { color: style.ink }]}>
                  {record.title}
                </Text>
              </View>
              {record.author ? (
                <Text numberOfLines={1} style={[styles.placeholderAuthor, { color: style.ink }]}>
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
        style={styles.deleteButton}
        accessibilityRole="button"
        accessibilityLabel="移除書籍"
      >
        <Text style={styles.deleteButtonText}>✕</Text>
      </Pressable>

      <View style={styles.infoContainer}>
        <Text numberOfLines={2} style={[styles.title, { color: colors.ink }]}>
          {record.title}
        </Text>
        {record.author ? (
          <Text numberOfLines={1} style={[styles.author, { color: colors.ink3 }]}>
            {record.author}
          </Text>
        ) : null}
        <View style={styles.progressRow}>
          <View style={[styles.progressTrack, { backgroundColor: colors.progressTrack }]}>
            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.progressFill }]} />
          </View>
          <Text style={[styles.progressLabel, { color: colors.ink3 }]}>{pct === 100 ? '讀畢' : `${pct}%`}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cover: {
    borderRadius: 6,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 14,
  },
  ruleLine: {
    width: 20,
    height: 2,
    marginBottom: 8,
  },
  placeholderTitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  placeholderAuthor: {
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    opacity: 0.75,
  },
  deleteButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 14,
  },
  infoContainer: {
    marginTop: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 17,
  },
  author: {
    fontSize: 11,
    marginTop: 3,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  progressLabel: {
    fontSize: 10,
  },
});

export default BookCard;

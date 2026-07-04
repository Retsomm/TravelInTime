import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addBook, type BookRecord, listBooks, removeBook } from '../../lib/library';

const LibraryScreen = () => {
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setBooks(await listBooks());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleAddBook = async () => {
    try {
      const record = await addBook();
      if (record) refresh();
    } catch {
      Alert.alert('加入書籍失敗', '請稍後再試一次');
    }
  };

  const handleDeleteBook = (record: BookRecord) => {
    Alert.alert('刪除書籍', `確定要刪除「${record.title}」嗎？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeBook(record.id);
            refresh();
          } catch {
            Alert.alert('刪除失敗', '請稍後再試一次');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44, paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '600' }}>書櫃</Text>
        <Pressable onPress={handleAddBook} hitSlop={12}>
          <Text style={{ fontSize: 16, color: '#2563eb' }}>+ 加入書籍</Text>
        </Pressable>
      </View>

      {!loading && books.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text>尚未加入任何書籍</Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/reader/${item.id}`)}
              onLongPress={() => handleDeleteBook(item)}
              style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5e5e5' }}
            >
              <Text style={{ fontSize: 16 }}>{item.title}</Text>
              {item.progress ? (
                <Text style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{Math.round(item.progress * 100)}%</Text>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
};

export default LibraryScreen;

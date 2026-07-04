import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import BookCard from '../../components/BookCard';
import SortControl, { type SortKey } from '../../components/SortControl';
import {
  addBook,
  type BookRecord,
  getBookBase64,
  listBooks,
  removeBook,
  saveCoverImage,
  updateBookMeta,
} from '../../lib/library';
import { READER_HTML } from '../../lib/readerHtml.generated';
import type { OutboundMessage } from '../../lib/readerMessages';

const PAPER_BG = '#f9f7f2';
const GRID_GAP = 16;
const H_PADDING = 16;
const COLUMNS = 2;

const META_EXTRACT_TIMEOUT_MS = 10_000;

const LibraryScreen = () => {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = (windowWidth - H_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('recent');
  const extractorRef = useRef<WebView>(null);
  const extractorReadyRef = useRef(false);
  const pendingExtractionRef = useRef<{
    id: string;
    resolve: () => void;
  } | null>(null);

  const refresh = useCallback(async () => {
    setBooks(await listBooks());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // 書名/作者/封面擷取借用閱讀器同一份 epub.js WebView bundle（見 reader-web/index.ts 的
  // extractMeta 訊息），但不顯示在畫面上，只用來跑一次性的 metadata 解析。
  const extractMetaFor = useCallback((record: BookRecord) => {
    return new Promise<void>((resolve) => {
      let settled = false;
      let waitTimer: ReturnType<typeof setInterval> | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (waitTimer) clearInterval(waitTimer);
        pendingExtractionRef.current = null;
        resolve();
      };
      const timer = setTimeout(finish, META_EXTRACT_TIMEOUT_MS);
      pendingExtractionRef.current = {
        id: record.id,
        resolve: () => {
          clearTimeout(timer);
          finish();
        },
      };

      const send = async () => {
        const base64 = await getBookBase64(record);
        if (__DEV__) console.log('[library] sending extractMeta', { id: record.id, base64Length: base64.length });
        extractorRef.current?.postMessage(JSON.stringify({ type: 'extractMeta', base64 }));
      };
      if (extractorReadyRef.current) {
        send();
      } else {
        // WebView 尚未載入完成時，等 onLoadEnd 之後的 'ready' 訊息再送出。
        waitTimer = setInterval(() => {
          if (extractorReadyRef.current) {
            if (waitTimer) clearInterval(waitTimer);
            send();
          }
        }, 100);
      }
    });
  }, []);

  const handleExtractorMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      let msg: OutboundMessage;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === 'ready') {
        if (__DEV__) console.log('[library] extractor webview ready');
        extractorReadyRef.current = true;
        return;
      }
      const pending = pendingExtractionRef.current;
      if (!pending) return;

      if (msg.type === 'metaExtracted') {
        if (__DEV__) {
          console.log('[library] metaExtracted', {
            id: pending.id,
            title: msg.title,
            author: msg.author,
            hasCover: Boolean(msg.coverBase64),
          });
        }
        const patch: Partial<Pick<BookRecord, 'title' | 'author' | 'coverUri'>> = {};
        if (msg.title) patch.title = msg.title;
        if (msg.author) patch.author = msg.author;
        // 封面寫檔失敗（例如解碼異常）不應該連帶丟掉已經擷取到的書名/作者，兩者分開處理。
        if (msg.coverBase64) {
          try {
            patch.coverUri = saveCoverImage(pending.id, msg.coverBase64, msg.coverMediaType);
          } catch (err) {
            console.warn('[library] saveCoverImage failed', err);
          }
        }
        if (Object.keys(patch).length > 0) {
          updateBookMeta(pending.id, patch).then(refresh);
        }
        pending.resolve();
      } else if (msg.type === 'metaError') {
        if (__DEV__) console.warn('[library] metaError', msg.message);
        pending.resolve();
      }
    },
    [refresh]
  );

  const handleAddBook = async () => {
    try {
      const record = await addBook();
      if (!record) return;
      refresh();
      await extractMetaFor(record);
      refresh();
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

  const shown = useMemo(() => {
    const list = [...books];
    if (sort === 'recent') list.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));
    if (sort === 'progress') list.sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0));
    return list;
  }, [books, sort]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: PAPER_BG }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44, paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '600', color: '#2a2420' }}>
          書櫃 <Text style={{ fontSize: 13, fontWeight: '400', color: '#9a8f80' }}>{books.length} 本</Text>
        </Text>
        <Pressable onPress={handleAddBook} hitSlop={12}>
          <Text style={{ fontSize: 16, color: '#2563eb' }}>+ 加入書籍</Text>
        </Pressable>
      </View>

      {books.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <SortControl sort={sort} onSortChange={setSort} />
        </View>
      )}

      {!loading && books.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#9a8f80' }}>尚未加入任何書籍</Text>
        </View>
      ) : (
        <FlatList
          key={`library-grid-${COLUMNS}col`}
          data={shown}
          keyExtractor={(item) => item.id}
          numColumns={COLUMNS}
          contentContainerStyle={{ padding: H_PADDING, gap: GRID_GAP }}
          columnWrapperStyle={{ gap: GRID_GAP }}
          renderItem={({ item }) => (
            <BookCard
              record={item}
              width={cardWidth}
              onPress={() => router.push(`/reader/${item.id}`)}
              onDelete={() => handleDeleteBook(item)}
            />
          )}
        />
      )}

      <WebView
        ref={extractorRef}
        originWhitelist={['*']}
        source={{ html: READER_HTML }}
        onMessage={handleExtractorMessage}
        onError={(e) => __DEV__ && console.warn('[library] extractor webview onError', e.nativeEvent)}
        onHttpError={(e) => __DEV__ && console.warn('[library] extractor webview onHttpError', e.nativeEvent)}
        javaScriptEnabled
        // 用 1x1 近乎歸零的尺寸隱藏這個 WebView 時，WKWebView（iOS）有可能不會確實跑內容的 JS
        // （近似 headless/離屏極小視圖被系統節流），改用較合理的尺寸（100x100）搬到畫面外，
        // 只用 opacity:0 隱藏，避免這個因素導致整個 extractMeta 流程收不到任何回應。
        style={{ position: 'absolute', width: 100, height: 100, opacity: 0, top: -1000, left: 0 }}
        pointerEvents="none"
      />
    </SafeAreaView>
  );
};

export default LibraryScreen;

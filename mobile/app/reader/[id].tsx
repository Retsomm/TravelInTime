import { useLocalSearchParams, router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import {
  type BookRecord,
  getBookBase64,
  listBooks,
  loadReadingCfi,
  saveReadingCfi,
  touchBook,
  updateProgress,
} from '../../lib/library';
import { READER_HTML } from '../../lib/readerHtml.generated';
import type { OutboundMessage } from '../../lib/readerMessages';
import { useFocusEffect } from 'expo-router';

const ReaderScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const webviewRef = useRef<WebView>(null);
  const [record, setRecord] = useState<BookRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      touchBook(id);
    }, [id])
  );

  const handleWebViewReady = useCallback(async () => {
    if (!id) return;
    const books = await listBooks();
    const found = books.find((b) => b.id === id) ?? null;
    setRecord(found);
    if (!found) {
      setErrorMessage('找不到這本書');
      setLoading(false);
      return;
    }
    try {
      const [base64, cfi] = await Promise.all([getBookBase64(found), loadReadingCfi(id)]);
      webviewRef.current?.postMessage(JSON.stringify({ type: 'load', base64, cfi }));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, [id]);

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      let msg: OutboundMessage;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === 'ready') {
        handleWebViewReady();
        return;
      }
      if (msg.type === 'relocated') {
        setLoading(false);
        if (!id) return;
        saveReadingCfi(id, msg.cfi);
        if (msg.total > 0) updateProgress(id, msg.page / msg.total);
        return;
      }
      if (msg.type === 'error') {
        setErrorMessage(msg.message);
        setLoading(false);
        return;
      }
      if (msg.type === 'debug') {
        console.log(`[reader-web debug][${Platform.OS}]`, msg.message);
      }
    },
    [handleWebViewReady, id]
  );

  const handleShouldStartLoadWithRequest = useCallback((request: { url: string }) => {
    const { url } = request;
    if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) return true;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      Linking.openURL(url);
      return false;
    }
    return true;
  }, []);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 12 }}>
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="返回書櫃"
        >
          <Text style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, marginRight: 24 }} numberOfLines={1}>
          {record?.title ?? '閱讀中'}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <WebView
          ref={webviewRef}
          originWhitelist={['*']}
          source={{ html: READER_HTML }}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          javaScriptEnabled
          webviewDebuggingEnabled={__DEV__}
          bounces={false}
          overScrollMode="never"
          style={{ flex: 1, opacity: loading ? 0 : 1 }}
        />
        {loading && !errorMessage ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" />
          </View>
        ) : null}
        {errorMessage ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ textAlign: 'center' }}>載入失敗：{errorMessage}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
};

export default ReaderScreen;

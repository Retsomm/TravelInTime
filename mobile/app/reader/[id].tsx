import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { IconBack, IconBookmarkFill, IconBookmarkOutline, IconChapters, IconNotes, IconPause, IconPlay, IconReset, IconSettings, IconSleepTimer } from '../../components/icons';
import ListPanel from '../../components/ListPanel';
import SelectionBar from '../../components/SelectionBar';
import SettingsPanel from '../../components/SettingsPanel';
import { useAnnotations } from '../../hooks/reader/useAnnotations';
import { useBookmarks } from '../../hooks/reader/useBookmarks';
import { useReaderEngine } from '../../hooks/reader/useReaderEngine';
import { useTTSReading } from '../../hooks/reader/useTTSReading';
import { READER_HTML } from '../../lib/readerHtml.generated';
import { formatPageProgress, shouldOpenExternally } from '../../lib/reader/calculations';
import { useTheme } from '../../lib/theme';

const ReaderScreen = () => {
  const { darkMode, colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [listPanelTab, setListPanelTab] = useState<'bookmarks' | 'chapters' | 'bookinfo' | 'notes' | null>(null);
  const [annotationMode, setAnnotationMode] = useState(false);

  const ttsResetRef = useRef<() => void>(() => {});
  const engine = useReaderEngine(id, darkMode, { onBookChange: () => ttsResetRef.current() });
  const bookmarks = useBookmarks(id, engine.currentCfi, engine.currentChapterTitle);
  const annotations = useAnnotations({
    id,
    annotations: engine.annotations,
    setAnnotations: engine.setAnnotations,
    currentChapterTitle: engine.currentChapterTitle,
    selection: engine.selection,
    setSelection: engine.setSelection,
    setEditingAnnotationId: engine.setEditingAnnotationId,
    postToWebView: engine.postToWebView,
  });
  const ttsReading = useTTSReading({
    postToWebView: engine.postToWebView,
    currentHrefRef: engine.currentHrefRef,
    atEndRef: engine.atEndRef,
    requestChapterText: engine.requestChapterText,
    waitForRelocated: engine.waitForRelocated,
  });
  ttsResetRef.current = ttsReading.resetForNewBook;
  const tts = ttsReading.tts;

  const handleShouldStartLoadWithRequest = (request: { url: string }) => {
    if (shouldOpenExternally(request.url)) {
      Linking.openURL(request.url);
      return false;
    }
    return true;
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handleResetTypography = () => {
    engine.setTypography((prev) => ({ ...prev, fontSize: 16, lineHeight: 1.8, letterSpacing: 0 }));
  };

  const handleCopySelection = () => {
    if (!engine.selection) return;
    Clipboard.setStringAsync(engine.selection.text);
  };

  const handleSearchSelection = () => {
    if (!engine.selection) return;
    Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(engine.selection.text)}`);
  };

  // 設定面板／清單面板共用同一個畫面區域，一次只會顯示其中一個：開啟其中一個時
  // 要順便關掉另一個，否則兩個 overlay 疊在一起，關掉上層那個又會露出底下還開著的另一個。
  // 兩顆按鈕都是開關型：再按一次目前開著的那顆就直接關閉，不需要額外的關閉鈕/麵包屑列。
  const toggleSettings = () => {
    setListPanelTab(null);
    engine.clearSelectionState();
    setSettingsVisible((prev) => !prev);
  };

  const toggleListPanel = () => {
    setSettingsVisible(false);
    engine.clearSelectionState();
    setListPanelTab((prev) => (prev ? null : 'bookmarks'));
  };

  // 劃線模式：使用者實測回報「畫面中間三分之一窄帶長按選字沒有反應」，log 顯示觸控確實有
  // 送到內容 iframe，但長按手勢常常在按住/微調時位移滑出那條窄帶、掃進左右兩側的翻頁點擊區
  // 而被中斷。開啟這個模式時通知 WebView 把左右兩側的翻頁點擊區關掉 pointer-events，讓整個
  // 畫面寬度都能長按選字（代價是這段期間點擊畫面兩側不會翻頁，需使用者自己切回一般模式）。
  const toggleAnnotationMode = () => {
    setSettingsVisible(false);
    setListPanelTab(null);
    engine.clearSelectionState();
    setAnnotationMode((prev) => {
      const next = !prev;
      engine.postToWebView({ type: 'setAnnotationMode', enabled: next });
      return next;
    });
  };

  const handleNavigateBookmark = (cfi: string) => {
    engine.navigateTo(cfi);
    setListPanelTab(null);
  };

  const handleNavigateChapter = (target: string) => {
    engine.navigateTo(target);
    setListPanelTab(null);
  };

  const handleNavigateAnnotation = (cfi: string) => {
    engine.navigateTo(cfi);
    setListPanelTab(null);
  };

  const pageProgress = formatPageProgress(engine.pageInfo);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safeArea, { backgroundColor: colors.paperBg }]}>
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="返回書櫃"
        >
          <IconBack color={colors.ink} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.ink }]} numberOfLines={1}>
          {engine.record?.title ?? '閱讀中'}
        </Text>
        <View style={styles.headerIcons}>
          <Pressable
            onPress={bookmarks.handleToggleBookmark}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={bookmarks.isBookmarked ? '移除書籤' : '加入書籤'}
          >
            {bookmarks.isBookmarked ? <IconBookmarkFill color={colors.progressFill} /> : <IconBookmarkOutline color={colors.ink} />}
          </Pressable>
          <Pressable
            onPress={toggleAnnotationMode}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={annotationMode ? '結束劃線模式' : '進入劃線模式'}
            accessibilityState={{ selected: annotationMode }}
            style={[styles.headerIconButton, { backgroundColor: annotationMode ? colors.paperBg2 : 'transparent' }]}
          >
            <IconNotes color={annotationMode ? colors.progressFill : colors.ink} />
          </Pressable>
          <Pressable
            onPress={toggleListPanel}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="書籤／目錄／資訊"
            accessibilityState={{ selected: listPanelTab !== null }}
            style={[styles.headerIconButton, { backgroundColor: listPanelTab !== null ? colors.paperBg2 : 'transparent' }]}
          >
            <IconChapters color={listPanelTab !== null ? colors.progressFill : colors.ink} />
          </Pressable>
          <Pressable
            onPress={toggleSettings}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="排版與語音設定"
            accessibilityState={{ selected: settingsVisible }}
            style={[styles.headerIconButton, { backgroundColor: settingsVisible ? colors.paperBg2 : 'transparent' }]}
          >
            <IconSettings color={settingsVisible ? colors.progressFill : colors.ink} />
          </Pressable>
        </View>
      </View>
      <View style={styles.webviewContainer}>
        <WebView
          ref={engine.webviewRef}
          originWhitelist={['*']}
          source={{ html: READER_HTML }}
          onMessage={engine.handleMessage}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          javaScriptEnabled
          webviewDebuggingEnabled={__DEV__}
          bounces={false}
          overScrollMode="never"
          style={[styles.webview, { opacity: engine.loading ? 0 : 1 }]}
        />
        {annotationMode && (
          <View
            pointerEvents="none"
            style={[styles.annotationBanner, { backgroundColor: colors.progressFill }]}
          >
            <Text style={styles.annotationBannerText}>劃線模式中：長按文字選取即可標記，點擊畫面翻頁已暫停</Text>
          </View>
        )}
        {engine.loading && !engine.errorMessage ? (
          <View style={styles.centerOverlay}>
            <ActivityIndicator size="large" />
          </View>
        ) : null}
        {engine.errorMessage ? (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorText}>載入失敗：{engine.errorMessage}</Text>
          </View>
        ) : null}
        {settingsVisible && (
          <SettingsPanel
            fontSize={engine.typography.fontSize}
            onFontSizeChange={(v) => engine.setTypography((prev) => ({ ...prev, fontSize: v }))}
            fontFamily={engine.typography.fontFamily}
            onFontFamilyChange={(v) => engine.setTypography((prev) => ({ ...prev, fontFamily: v }))}
            script={engine.typography.script}
            onScriptChange={(v) => engine.setTypography((prev) => ({ ...prev, script: v }))}
            readingDirection={engine.typography.readingDirection}
            onReadingDirectionChange={(v) => engine.setTypography((prev) => ({ ...prev, readingDirection: v }))}
            lineHeight={engine.typography.lineHeight}
            onLineHeightChange={(v) => engine.setTypography((prev) => ({ ...prev, lineHeight: v }))}
            letterSpacing={engine.typography.letterSpacing}
            onLetterSpacingChange={(v) => engine.setTypography((prev) => ({ ...prev, letterSpacing: v }))}
            onReset={handleResetTypography}
            ttsPlaying={tts.playing}
            ttsPaused={tts.paused}
            onTTSPlay={ttsReading.handleTTSPlay}
            onTTSPause={ttsReading.handleTTSPause}
            onTTSReset={ttsReading.handleTTSReset}
            ttsVoices={tts.voices}
            ttsSelectedVoice={tts.selectedVoice}
            onTTSVoiceChange={tts.setSelectedVoice}
            ttsRate={tts.rate}
            onTTSRateChange={tts.setRate}
            ttsSleepMinutes={tts.sleepMinutes}
            onTTSSleepChange={tts.onSleepChange}
            ttsSleepRemaining={tts.sleepRemaining}
          />
        )}
        {listPanelTab && (
          <ListPanel
            initialTab={listPanelTab}
            bookmarks={bookmarks.bookmarks}
            onNavigateBookmark={(bm) => handleNavigateBookmark(bm.cfi)}
            onDeleteBookmark={bookmarks.handleDeleteBookmark}
            toc={engine.toc}
            currentHref={engine.currentHref}
            onNavigateChapter={handleNavigateChapter}
            record={engine.record}
            annotations={engine.annotations}
            onNavigateAnnotation={handleNavigateAnnotation}
            onChangeAnnotationColor={annotations.handleChangeAnnotationColor}
            onDeleteAnnotation={annotations.handleDeleteAnnotation}
            onUpdateAnnotationNote={annotations.handleUpdateAnnotationNote}
          />
        )}
        {engine.selection && (
          <SelectionBar
            mode="selection"
            text={engine.selection.text}
            onHighlight={annotations.handleCreateAnnotation}
            onCopy={handleCopySelection}
            onSearch={handleSearchSelection}
          />
        )}
        {engine.editingAnnotationId && (
          <SelectionBar
            mode="edit"
            onChangeColor={(color) => annotations.handleChangeAnnotationColor(engine.editingAnnotationId as string, color)}
            onDelete={() => annotations.handleDeleteAnnotation(engine.editingAnnotationId as string)}
          />
        )}
        {/* 朗讀控制列：跟下面的頁碼列一樣固定高度、一律渲染（不論是否正在朗讀），放在內容
            與底部頁碼列之間，屬於一般排版流（不是蓋在 WebView 上的 overlay），才不會遮到
            正在閱讀的文字；也因為高度固定不隨播放狀態變動，不會觸發 WebView resize 讓
            epub.js 重新分頁（見下面頁碼列註解，同一個理由）。 */}
        <View style={[styles.ttsBar, { borderTopColor: colors.borderColor }]}>
          <Pressable
            onPress={ttsReading.handleTTSReset}
            disabled={!tts.playing && !tts.paused}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="重置朗讀進度"
            style={[
              styles.circleButton34,
              {
                backgroundColor: colors.paperBg2,
                borderColor: colors.borderColor,
                opacity: (!tts.playing && !tts.paused) ? 0.4 : 1,
              },
            ]}
          >
            <IconReset color={colors.ink2} />
          </Pressable>
          <Pressable
            onPress={tts.playing ? ttsReading.handleTTSPause : ttsReading.handleTTSPlay}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={tts.playing ? '暫停朗讀' : '開始朗讀'}
            style={[styles.playButton, { backgroundColor: tts.playing ? colors.progressFill : colors.ink }]}
          >
            {tts.playing ? <IconPause color={colors.paperBg} /> : <IconPlay color={colors.paperBg} />}
          </Pressable>
          <View style={styles.sleepWrapper}>
            <Pressable
              onPress={ttsReading.handleCycleSleep}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={
                tts.sleepMinutes === 0
                  ? '設定睡眠計時'
                  : tts.sleepRemaining !== null
                    ? `睡眠計時倒數 ${Math.floor(tts.sleepRemaining / 60)}分${tts.sleepRemaining % 60}秒`
                    : `睡眠計時 ${tts.sleepMinutes} 分鐘`
              }
              style={[
                styles.circleButton34,
                {
                  backgroundColor: tts.sleepMinutes > 0 ? colors.paperBg2 : 'transparent',
                  borderColor: colors.borderColor,
                },
              ]}
            >
              <IconSleepTimer color={tts.sleepMinutes > 0 ? colors.progressFill : colors.ink2} />
            </Pressable>
            {tts.sleepMinutes > 0 && (
              <Text style={[styles.sleepCountdownText, { color: colors.ink3 }]}>
                {tts.sleepRemaining !== null
                  ? `${String(Math.floor(tts.sleepRemaining / 60)).padStart(2, '0')}:${String(tts.sleepRemaining % 60).padStart(2, '0')}`
                  : `${tts.sleepMinutes}分`}
              </Text>
            )}
          </View>
        </View>
        {/* 固定高度、一律渲染（即使 pageInfo 還是 null 也只是內容留白）：避免 pageInfo 從
            null 變有值時這塊區域才冒出來，導致 WebView 版面高度跟著變動——epub.js 的分頁是
            依照初次拿到的 viewer 尺寸算的，事後才緊縮 WebView 高度容易讓已渲染好的那一頁內容
            被裁切，需要等 resize 事件跑完才會重新分頁，中間會有一段畫面被蓋住的空窗期。 */}
        <View style={styles.pageBar}>
          {pageProgress && (
            <>
              <Text style={[styles.pageText, { color: colors.ink3 }]}>
                第 {pageProgress.page} 頁
              </Text>
              <View style={[styles.pageProgressTrack, { backgroundColor: colors.progressTrack }]}>
                <View
                  style={[
                    styles.pageProgressFill,
                    { width: `${pageProgress.percent}%`, backgroundColor: colors.progressFill },
                  ]}
                />
              </View>
              <Text style={[styles.pageText, { color: colors.ink3 }]}>
                / {pageProgress.total} · {pageProgress.percent}%
              </Text>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 12,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerIconButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webviewContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  annotationBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 6,
    alignItems: 'center',
  },
  annotationBannerText: {
    fontSize: 11,
    color: '#fff',
  },
  centerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    textAlign: 'center',
  },
  ttsBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    borderTopWidth: 1,
  },
  circleButton34: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sleepWrapper: {
    width: 34,
    alignItems: 'center',
  },
  sleepCountdownText: {
    fontSize: 9,
    marginTop: 2,
  },
  pageBar: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  pageText: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  pageProgressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  pageProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
});

export default ReaderScreen;

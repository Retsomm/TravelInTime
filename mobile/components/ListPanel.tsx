import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { IconCopy } from './icons';
import { getCoverUri, type BookRecord, type Bookmark } from '../lib/library';
import type { TocItem } from '../lib/readerMessages';
import { coverStyleFor } from '../lib/coverStyles';
import { useTheme } from '../lib/theme';

type Tab = 'bookmarks' | 'chapters' | 'bookinfo' | 'notes';

const TABS: { key: Tab; label: string }[] = [
  { key: 'bookmarks', label: '書籤' },
  { key: 'chapters', label: '目錄' },
  { key: 'bookinfo', label: '資訊' },
  { key: 'notes', label: '註記' },
];

const formatDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const findActiveHref = (items: TocItem[], file: string): string | null => {
  for (const item of items) {
    if (item.href.split('#')[0] === file) return item.href;
    if (item.subitems?.length) {
      const sub = findActiveHref(item.subitems, file);
      if (sub) return sub;
    }
  }
  return null;
};

interface Props {
  initialTab: Tab;
  bookmarks: Bookmark[];
  onNavigateBookmark: (bookmark: Bookmark) => void;
  onDeleteBookmark: (id: string) => void;
  toc: TocItem[];
  currentHref: string;
  onNavigateChapter: (href: string) => void;
  record: BookRecord | null;
}

const ListPanel = ({
  initialTab,
  bookmarks, onNavigateBookmark, onDeleteBookmark,
  toc, currentHref, onNavigateChapter,
  record,
}: Props) => {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const activeHref = findActiveHref(toc, currentHref.split('#')[0]);

  const renderTocItem = (item: TocItem, depth: number) => (
    <View key={item.id || item.href}>
      <Pressable
        onPress={() => onNavigateChapter(item.href)}
        accessibilityRole="button"
        accessibilityLabel={`前往章節：${item.label}`}
        style={{
          paddingVertical: 10,
          paddingLeft: 16 + depth * 14,
          paddingRight: 16,
          backgroundColor: item.href === activeHref ? colors.paperBg2 : 'transparent',
        }}
      >
        <Text style={{ fontSize: 14, color: item.href === activeHref ? colors.ink : colors.ink2 }} numberOfLines={1}>
          {item.label}
        </Text>
      </Pressable>
      {item.subitems?.map((sub) => renderTocItem(sub, depth + 1))}
    </View>
  );

  const cs = record ? coverStyleFor(record.id) : null;
  const pct = record?.progress != null ? Math.round(record.progress * 100) : null;
  const coverUri = record ? getCoverUri(record) : null;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.paperBg, zIndex: 20 }}>
      <View style={{ flexDirection: 'row', backgroundColor: colors.paperBg2, borderRadius: 8, padding: 2, gap: 2, margin: 12, marginTop: 20 }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: active }}
              style={{ flex: 1, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.paperBg : 'transparent' }}
            >
              <Text style={{ fontSize: 13, color: active ? colors.ink : colors.ink3 }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'bookmarks' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {bookmarks.length === 0 ? (
            <Text style={{ textAlign: 'center', fontSize: 12, color: colors.ink3, padding: 32 }}>尚無書籤</Text>
          ) : (
            [...bookmarks].sort((a, b) => a.addedAt - b.addedAt).map((bm) => (
              <View key={bm.id} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.borderColor, gap: 6 }}>
                <Pressable onPress={() => onNavigateBookmark(bm)} accessibilityRole="button" accessibilityLabel={`跳至書籤：${bm.label}`}>
                  <Text style={{ fontSize: 13, color: colors.ink }}>{bm.label}</Text>
                </Pressable>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 10, color: colors.ink3 }}>{formatDate(bm.addedAt)}</Text>
                  <Pressable
                    onPress={() => setPendingDeleteId(pendingDeleteId === bm.id ? null : bm.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="移除書籤"
                  >
                    <Text style={{ fontSize: 11, color: pendingDeleteId === bm.id ? '#ef4444' : colors.ink3 }}>移除</Text>
                  </Pressable>
                </View>
                {pendingDeleteId === bm.id && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 11, color: '#ef4444' }}>確定移除？</Text>
                    <Pressable onPress={() => setPendingDeleteId(null)} style={{ paddingHorizontal: 8, height: 22, borderRadius: 5, backgroundColor: colors.paperBg2, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, color: colors.ink3 }}>取消</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { onDeleteBookmark(bm.id); setPendingDeleteId(null); }}
                      style={{ paddingHorizontal: 8, height: 22, borderRadius: 5, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ fontSize: 11, color: '#fff' }}>移除</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {tab === 'chapters' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {toc.length === 0 ? (
            <Text style={{ textAlign: 'center', fontSize: 12, color: colors.ink3, padding: 32 }}>此書籍無目錄資料</Text>
          ) : (
            toc.map((item) => renderTocItem(item, 0))
          )}
        </ScrollView>
      )}

      {tab === 'bookinfo' && record && (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={{ aspectRatio: 2 / 3, width: 140, borderRadius: 4, overflow: 'hidden', alignSelf: 'center' }}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : cs ? (
              <View style={{ flex: 1, backgroundColor: cs.bg, justifyContent: 'flex-end', padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: cs.ink }} numberOfLines={3}>{record.title}</Text>
                {record.author ? <Text style={{ fontSize: 10, color: cs.rule, marginTop: 4 }}>{record.author}</Text> : null}
              </View>
            ) : null}
          </View>
          <View>
            <Text style={{ fontSize: 16, fontWeight: '500', color: colors.ink }}>{record.title}</Text>
            {record.author ? <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 4 }}>{record.author}</Text> : null}
          </View>
          {pct !== null && (
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 10, color: colors.ink3 }}>閱讀進度</Text>
                <Text style={{ fontSize: 10, color: colors.progressFill }}>{pct}%</Text>
              </View>
              <View style={{ height: 3, backgroundColor: colors.borderColor, borderRadius: 2 }}>
                <View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.progressFill, borderRadius: 2 }} />
              </View>
            </View>
          )}
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 10, color: colors.ink3 }}>匯入時間</Text>
              <Text style={{ fontSize: 11, color: colors.ink2 }}>{formatDate(record.addedAt)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 10, color: colors.ink3 }}>最後閱讀</Text>
              <Text style={{ fontSize: 11, color: colors.ink2 }}>{record.lastOpenedAt ? formatDate(record.lastOpenedAt) : '尚未記錄'}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => Clipboard.setStringAsync(record.title)}
            accessibilityRole="button"
            accessibilityLabel="複製書名"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8,
              backgroundColor: colors.paperBg2, borderWidth: 1, borderColor: colors.borderColor,
            }}
          >
            <IconCopy color={colors.ink2} />
            <Text style={{ fontSize: 13, color: colors.ink2 }}>複製書名</Text>
          </Pressable>
        </ScrollView>
      )}

      {tab === 'notes' && (
        <View style={{ padding: 32, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: colors.ink3, textAlign: 'center' }}>註記功能尚未支援</Text>
        </View>
      )}
    </View>
  );
};

export default ListPanel;

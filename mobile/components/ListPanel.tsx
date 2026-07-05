import * as Clipboard from 'expo-clipboard';
import { useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { IconCopy } from './icons';
import { HIGHLIGHT_COLORS } from '../lib/annotationColors';
import { getCoverUri, type Annotation, type BookRecord, type Bookmark } from '../lib/library';
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
  annotations: Annotation[];
  onNavigateAnnotation: (cfi: string) => void;
  onChangeAnnotationColor: (id: string, color: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onUpdateAnnotationNote: (id: string, note: string) => void;
}

const ListPanel = ({
  initialTab,
  bookmarks, onNavigateBookmark, onDeleteBookmark,
  toc, currentHref, onNavigateChapter,
  record,
  annotations, onNavigateAnnotation, onChangeAnnotationColor, onDeleteAnnotation, onUpdateAnnotationNote,
}: Props) => {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const activeHref = findActiveHref(toc, currentHref.split('#')[0]);

  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [pendingDeleteAnnId, setPendingDeleteAnnId] = useState<string | null>(null);
  const [selectedAnnIds, setSelectedAnnIds] = useState<Set<string>>(new Set());
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const noteInputRef = useRef<TextInput>(null);

  const startEditNote = (a: Annotation) => {
    setColorPickerId(null);
    setPendingDeleteAnnId(null);
    setEditingNoteId(a.id);
    setEditingNoteText(a.note ?? '');
    setTimeout(() => noteInputRef.current?.focus(), 50);
  };
  const saveNote = (id: string) => { onUpdateAnnotationNote(id, editingNoteText); setEditingNoteId(null); };
  const cancelNote = () => setEditingNoteId(null);
  const deleteNote = (id: string) => { onUpdateAnnotationNote(id, ''); setEditingNoteId(null); };

  const allAnnSelected = annotations.length > 0 && selectedAnnIds.size === annotations.length;
  const toggleSelectAllAnn = () => setSelectedAnnIds(allAnnSelected ? new Set() : new Set(annotations.map((a) => a.id)));
  const toggleSelectAnn = (id: string) =>
    setSelectedAnnIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // 比照網頁版 annotationExport.ts 的匯出格式（依章節分組），輸出用 RN 內建的 Share API
  // 讓使用者選擇分享到訊息／筆記／檔案等目的地，而不是額外裝 expo-sharing 寫入檔案下載
  // ——mobile 沒有「下載資料夾」這個概念，Share 更貼近手機使用情境。
  const handleExportAnnotations = () => {
    const selected = annotations.filter((a) => selectedAnnIds.has(a.id));
    if (!selected.length) return;
    const sorted = [...selected].sort((a, b) => a.createdAt - b.createdAt);
    const grouped = new Map<string, Annotation[]>();
    sorted.forEach((a) => {
      const ch = a.chapter || '未分類';
      if (!grouped.has(ch)) grouped.set(ch, []);
      grouped.get(ch)!.push(a);
    });
    const lines: string[] = ['我的閱讀註記', `匯出時間：${new Date().toLocaleString('zh-TW')}`, `共 ${selected.length} 筆`, ''];
    grouped.forEach((anns, chapter) => {
      lines.push(chapter);
      anns.forEach((a) => {
        lines.push(`• ${a.text}`);
        if (a.note) lines.push(`  筆記：${a.note}`);
        lines.push('');
      });
    });
    Share.share({ message: lines.join('\n'), title: record?.title ? `${record.title}的閱讀註記` : '閱讀註記' });
  };

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
  const coverUri = useMemo(() => (record ? getCoverUri(record) : null), [record?.coverFilename, record?.coverUri]);

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
        <View style={{ flex: 1 }}>
          {annotations.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 }}>
              <Pressable onPress={toggleSelectAllAnn} accessibilityRole="button" accessibilityLabel="全選">
                <Text style={{ fontSize: 12, color: colors.ink3 }}>{allAnnSelected ? '取消全選' : '全選'}</Text>
              </Pressable>
              <Pressable
                onPress={handleExportAnnotations}
                disabled={selectedAnnIds.size === 0}
                accessibilityRole="button"
                accessibilityLabel="匯出選取的註記"
                style={{
                  height: 26, paddingHorizontal: 10, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: selectedAnnIds.size > 0 ? colors.progressFill : 'transparent',
                  opacity: selectedAnnIds.size > 0 ? 1 : 0.5,
                }}
              >
                <Text style={{ fontSize: 12, color: selectedAnnIds.size > 0 ? '#fff' : colors.ink3 }}>
                  匯出{selectedAnnIds.size > 0 ? ` (${selectedAnnIds.size})` : ''}
                </Text>
              </Pressable>
            </View>
          )}
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            {annotations.length === 0 ? (
              <View style={{ padding: 32 }}>
                <Text style={{ fontSize: 13, color: colors.ink2, marginBottom: 6, textAlign: 'center' }}>尚無註記</Text>
                <Text style={{ fontSize: 12, color: colors.ink3, textAlign: 'center', lineHeight: 18 }}>
                  在書本內文選取文字，即可劃線、加註感想。
                </Text>
              </View>
            ) : (
              annotations.map((a) => (
                <View key={a.id} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.borderColor, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <Pressable
                      onPress={() => toggleSelectAnn(a.id)}
                      hitSlop={8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selectedAnnIds.has(a.id) }}
                      style={{
                        width: 18, height: 18, borderRadius: 4, marginTop: 3, alignItems: 'center', justifyContent: 'center',
                        borderWidth: 1.5, borderColor: selectedAnnIds.has(a.id) ? colors.progressFill : colors.borderColor,
                        backgroundColor: selectedAnnIds.has(a.id) ? colors.progressFill : 'transparent',
                      }}
                    >
                      {selectedAnnIds.has(a.id) && <Text style={{ fontSize: 11, color: '#fff' }}>✓</Text>}
                    </Pressable>

                    <Pressable style={{ flex: 1 }} onPress={() => onNavigateAnnotation(a.cfi)} accessibilityRole="button" accessibilityLabel="跳至此註記">
                      <Text
                        style={{ fontSize: 13, color: colors.ink, lineHeight: 20, borderLeftWidth: 3, borderColor: a.color, paddingLeft: 10 }}
                        numberOfLines={4}
                      >
                        {a.text}
                      </Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                        <Text style={{ fontSize: 10, color: colors.ink3 }} numberOfLines={1}>{a.chapter || ''}</Text>
                        <Text style={{ fontSize: 10, color: colors.ink3 }}>{formatDate(a.createdAt)}</Text>
                      </View>
                    </Pressable>

                    <Pressable
                      onPress={() => { setPendingDeleteAnnId(null); setColorPickerId(colorPickerId === a.id ? null : a.id); }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="更換顏色"
                      style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: a.color, marginTop: 3 }}
                    />
                    <Pressable
                      onPress={() => { setColorPickerId(null); setPendingDeleteAnnId(pendingDeleteAnnId === a.id ? null : a.id); }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="刪除此註記"
                    >
                      <Text style={{ fontSize: 12, color: pendingDeleteAnnId === a.id ? '#ef4444' : colors.ink3 }}>✕</Text>
                    </Pressable>
                  </View>

                  {colorPickerId === a.id && (
                    <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 28 }}>
                      {HIGHLIGHT_COLORS.map((c) => (
                        <Pressable
                          key={c.value}
                          onPress={() => { onChangeAnnotationColor(a.id, c.value); setColorPickerId(null); }}
                          accessibilityRole="button"
                          accessibilityLabel={`${c.label}色`}
                          style={{
                            width: 22, height: 22, borderRadius: 11, backgroundColor: c.value,
                            borderWidth: 2, borderColor: a.color === c.value ? colors.ink : 'transparent',
                          }}
                        />
                      ))}
                    </View>
                  )}

                  {pendingDeleteAnnId === a.id && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 28 }}>
                      <Text style={{ fontSize: 11, color: '#ef4444' }}>確定刪除？</Text>
                      <Pressable onPress={() => setPendingDeleteAnnId(null)} style={{ paddingHorizontal: 8, height: 22, borderRadius: 5, backgroundColor: colors.paperBg2, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 11, color: colors.ink3 }}>取消</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => { onDeleteAnnotation(a.id); setSelectedAnnIds((prev) => { const n = new Set(prev); n.delete(a.id); return n; }); setPendingDeleteAnnId(null); }}
                        style={{ paddingHorizontal: 8, height: 22, borderRadius: 5, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: 11, color: '#fff' }}>刪除</Text>
                      </Pressable>
                    </View>
                  )}

                  <View style={{ paddingLeft: 28 }}>
                    {editingNoteId === a.id ? (
                      <View>
                        <TextInput
                          ref={noteInputRef}
                          value={editingNoteText}
                          onChangeText={setEditingNoteText}
                          placeholder="寫下你的感想…"
                          placeholderTextColor={colors.ink3}
                          multiline
                          style={{
                            minHeight: 60, borderRadius: 7, borderWidth: 1, borderColor: colors.progressFill,
                            backgroundColor: colors.paperBg2, color: colors.ink, fontSize: 13, lineHeight: 20,
                            padding: 8, textAlignVertical: 'top',
                          }}
                        />
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                          <Pressable onPress={() => saveNote(a.id)} style={{ height: 24, paddingHorizontal: 10, borderRadius: 5, backgroundColor: colors.progressFill, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 11, color: '#fff' }}>儲存</Text>
                          </Pressable>
                          <Pressable onPress={cancelNote} style={{ height: 24, paddingHorizontal: 10, borderRadius: 5, backgroundColor: colors.paperBg2, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 11, color: colors.ink3 }}>取消</Text>
                          </Pressable>
                          {a.note && (
                            <Pressable onPress={() => deleteNote(a.id)} style={{ height: 24, paddingHorizontal: 10, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 11, color: '#ef4444' }}>刪除筆記</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    ) : a.note ? (
                      <Pressable onPress={() => startEditNote(a)} accessibilityRole="button" accessibilityLabel="編輯筆記">
                        <View style={{
                          backgroundColor: colors.paperBg2, borderRadius: 7, padding: 8,
                          borderLeftWidth: 3, borderColor: colors.borderColor,
                        }}>
                          <Text style={{ fontSize: 12, color: colors.ink2, lineHeight: 18 }}>{a.note}</Text>
                        </View>
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => startEditNote(a)} accessibilityRole="button" accessibilityLabel="新增感想">
                        <Text style={{ fontSize: 11, color: colors.ink3 }}>＋ 新增感想</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

export default ListPanel;

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconCopy } from './icons';
import { HIGHLIGHT_COLORS } from '../lib/annotationColors';
import { useTheme } from '../lib/theme';

// 比照網頁版 HighlightPopup.tsx 的「選取中／編輯既有註記」兩種模式，但改成畫面底部固定的
// 操作列，不是浮在選取文字旁邊的懸浮泡泡——網頁版靠滑鼠選取，浮動泡泡可以準確算出滑鼠位置；
// mobile 這裡的選取來自 epub.js 內容 iframe 裡的原生觸控選字，這個 iframe 在 WKWebView
// 上的內部座標系統已經證實不可靠（見 reader-web/index.ts 的 registerTapZone 說明，同一類問題
// 這幾輪已經踩過好幾次），改成固定底部列可以完全不需要計算選取文字的螢幕座標，两个平台都穩定。
interface SelectionProps {
  mode: 'selection';
  text: string;
  onHighlight: (color: string) => void;
  onCopy: () => void;
  onSearch: () => void;
}

interface EditProps {
  mode: 'edit';
  onChangeColor: (color: string) => void;
  onDelete: () => void;
}

type Props = SelectionProps | EditProps;

const SelectionBar = (props: Props) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.paperBg, borderColor: colors.borderColor }]}>
      {props.mode === 'selection' && (
        <Text numberOfLines={2} style={[styles.selectionText, { color: colors.ink2 }]}>
          {props.text}
        </Text>
      )}
      <View style={styles.row}>
        {HIGHLIGHT_COLORS.map((c) => (
          <Pressable
            key={c.value}
            onPress={() => (props.mode === 'edit' ? props.onChangeColor(c.value) : props.onHighlight(c.value))}
            accessibilityRole="button"
            accessibilityLabel={`${c.label}色${props.mode === 'edit' ? '' : '標記'}`}
            style={[styles.colorSwatch, { backgroundColor: c.value, borderColor: colors.paperBg }]}
          />
        ))}
        <View style={styles.spacer} />
        {props.mode === 'selection' ? (
          <>
            <Pressable
              onPress={props.onSearch}
              accessibilityRole="button"
              accessibilityLabel="使用 Google 搜尋選取文字"
              style={[styles.circleIconButton, { backgroundColor: colors.paperBg2 }]}
            >
              <Text style={[styles.googleButtonText, { color: colors.ink2 }]}>G</Text>
            </Pressable>
            <Pressable
              onPress={props.onCopy}
              accessibilityRole="button"
              accessibilityLabel="複製選取文字"
              style={[styles.circleIconButton, { backgroundColor: colors.paperBg2 }]}
            >
              <IconCopy color={colors.ink2} />
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={props.onDelete}
            accessibilityRole="button"
            accessibilityLabel="刪除此註記"
            style={[styles.circleIconButton, { backgroundColor: colors.paperBg2 }]}
          >
            <Text style={styles.deleteIconText}>✕</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    padding: 12,
    gap: 10,
    zIndex: 30,
  },
  selectionText: {
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  spacer: {
    flex: 1,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
  },
  circleIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  deleteIconText: {
    fontSize: 13,
    color: '#ef4444',
  },
});

export default SelectionBar;

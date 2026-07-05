import { Pressable, ScrollView, Text, View } from 'react-native';
import { IconPause, IconPlay, IconReset } from './icons';
import { FONT_OPTIONS, type ReadingDirection, type Script } from '../lib/readerSettings';
import { useTheme } from '../lib/theme';
import type { TTSVoice } from '../lib/tts';

interface Props {
  fontSize: number;
  onFontSizeChange: (v: number) => void;
  fontFamily: string;
  onFontFamilyChange: (v: string) => void;
  script: Script;
  onScriptChange: (v: Script) => void;
  readingDirection: ReadingDirection;
  onReadingDirectionChange: (v: ReadingDirection) => void;
  lineHeight: number;
  onLineHeightChange: (v: number) => void;
  letterSpacing: number;
  onLetterSpacingChange: (v: number) => void;
  onReset: () => void;
  ttsPlaying: boolean;
  ttsPaused: boolean;
  onTTSPlay: () => void;
  onTTSPause: () => void;
  onTTSReset: () => void;
  ttsVoices: TTSVoice[];
  ttsSelectedVoice: TTSVoice | null;
  onTTSVoiceChange: (voice: TTSVoice) => void;
  ttsRate: number;
  onTTSRateChange: (rate: number) => void;
  ttsSleepMinutes: number;
  onTTSSleepChange: (minutes: number) => void;
  ttsSleepRemaining: number | null;
}

const SECT_TITLE_STYLE = { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 10 };

const SettingsPanel = ({
  fontSize, onFontSizeChange, fontFamily, onFontFamilyChange,
  script, onScriptChange, readingDirection, onReadingDirectionChange,
  lineHeight, onLineHeightChange, letterSpacing, onLetterSpacingChange, onReset,
  ttsPlaying, ttsPaused, onTTSPlay, onTTSPause, onTTSReset,
  ttsVoices, ttsSelectedVoice, onTTSVoiceChange, ttsRate, onTTSRateChange,
  ttsSleepMinutes, onTTSSleepChange, ttsSleepRemaining,
}: Props) => {
  const { colors } = useTheme();

  const segWrap = { flexDirection: 'row' as const, backgroundColor: colors.paperBg2, borderRadius: 8, padding: 2, gap: 2 };
  const segBtn = (active: boolean) => ({
    flex: 1, height: 28, borderRadius: 6, alignItems: 'center' as const, justifyContent: 'center' as const,
    backgroundColor: active ? colors.paperBg : 'transparent',
  });
  const segLabel = (active: boolean) => ({ fontSize: 12, color: active ? colors.ink : colors.ink3 });

  const stepper = (value: string, onDec: () => void, onInc: () => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 32, borderWidth: 1, borderColor: colors.borderColor, borderRadius: 8, overflow: 'hidden' }}>
      <Pressable onPress={onDec} hitSlop={8} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.ink3, fontSize: 16 }}>−</Text>
      </Pressable>
      <View style={{ minWidth: 60, height: 32, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.borderColor }}>
        <Text style={{ color: colors.ink, fontSize: 13 }}>{value}</Text>
      </View>
      <Pressable onPress={onInc} hitSlop={8} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.ink3, fontSize: 16 }}>＋</Text>
      </Pressable>
    </View>
  );

  const voiceLabel = (v: TTSVoice) => v.name.replace(/^(Google|Microsoft|Apple)\s*/i, '');

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.paperBg, zIndex: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 20, borderBottomWidth: 1, borderColor: colors.borderColor }}>
        <Text style={{ fontSize: 16, fontWeight: '500', color: colors.ink }}>排版與語音</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }}>
        {/* 字體 */}
        <View>
          <Text style={[SECT_TITLE_STYLE, { color: colors.ink3 }]}>字體</Text>

          <View style={{ borderWidth: 1, borderColor: colors.borderColor, borderRadius: 10, padding: 4, gap: 2, marginBottom: 12 }}>
            {FONT_OPTIONS.map((f) => {
              const active = fontFamily === f.value;
              return (
                <Pressable
                  key={f.value}
                  onPress={() => onFontFamilyChange(f.value)}
                  accessibilityRole="radio"
                  accessibilityLabel={`字體：${f.label}`}
                  accessibilityState={{ selected: active }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8,
                    backgroundColor: active ? colors.paperBg2 : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 14, color: active ? colors.ink : colors.ink2 }}>{f.label}</Text>
                  {active && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.progressFill }} />}
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <View style={[segWrap, { flex: 1 }]}>
              <Pressable
                style={segBtn(script === 'tc')}
                onPress={() => onScriptChange('tc')}
                accessibilityRole="radio"
                accessibilityLabel="顯示繁體"
                accessibilityState={{ selected: script === 'tc' }}
              >
                <Text style={segLabel(script === 'tc')}>繁體</Text>
              </Pressable>
              <Pressable
                style={segBtn(script === 'sc')}
                onPress={() => onScriptChange('sc')}
                accessibilityRole="radio"
                accessibilityLabel="顯示簡體"
                accessibilityState={{ selected: script === 'sc' }}
              >
                <Text style={segLabel(script === 'sc')}>簡體</Text>
              </Pressable>
            </View>
            <View style={[segWrap, { flex: 1 }]}>
              <Pressable
                style={segBtn(readingDirection === 'ltr')}
                onPress={() => onReadingDirectionChange('ltr')}
                accessibilityRole="radio"
                accessibilityLabel="由左向右閱讀"
                accessibilityState={{ selected: readingDirection === 'ltr' }}
              >
                <Text style={segLabel(readingDirection === 'ltr')}>左→右</Text>
              </Pressable>
              <Pressable
                style={segBtn(readingDirection === 'rtl')}
                onPress={() => onReadingDirectionChange('rtl')}
                accessibilityRole="radio"
                accessibilityLabel="由右向左閱讀"
                accessibilityState={{ selected: readingDirection === 'rtl' }}
              >
                <Text style={segLabel(readingDirection === 'rtl')}>右→左</Text>
              </Pressable>
            </View>
          </View>

          <View style={{ gap: 12, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.ink2 }}>字體大小</Text>
              {stepper(`${fontSize}px`, () => onFontSizeChange(Math.max(12, fontSize - 1)), () => onFontSizeChange(Math.min(32, fontSize + 1)))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.ink2 }}>行距</Text>
              {stepper(lineHeight.toFixed(1), () => onLineHeightChange(parseFloat(Math.max(1.0, lineHeight - 0.1).toFixed(1))), () => onLineHeightChange(parseFloat(Math.min(3.0, lineHeight + 0.1).toFixed(1))))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: colors.ink2 }}>字距</Text>
              {stepper(`${letterSpacing.toFixed(2)}em`, () => onLetterSpacingChange(parseFloat(Math.max(0, letterSpacing - 0.05).toFixed(2))), () => onLetterSpacingChange(parseFloat(Math.min(0.5, letterSpacing + 0.05).toFixed(2))))}
            </View>
          </View>

          <Pressable onPress={onReset} style={{ height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, color: colors.ink3 }}>重設預設值</Text>
          </Pressable>
        </View>

        <View style={{ borderTopWidth: 1, borderColor: colors.borderColor }} />

        {/* 語音朗讀 */}
        <View>
          <Text style={[SECT_TITLE_STYLE, { color: colors.ink3 }]}>語音朗讀</Text>

          {ttsVoices.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
              {ttsVoices.map((v) => {
                const active = ttsSelectedVoice?.identifier === v.identifier;
                return (
                  <Pressable
                    key={v.identifier}
                    onPress={() => onTTSVoiceChange(v)}
                    accessibilityRole="radio"
                    accessibilityLabel={`語音：${voiceLabel(v)}`}
                    accessibilityState={{ selected: active }}
                    style={{
                      paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
                      borderWidth: 1, borderColor: colors.borderColor,
                      backgroundColor: active ? colors.paperBg2 : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 13, color: active ? colors.ink : colors.ink3 }}>{voiceLabel(v)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={{ borderWidth: 1, borderColor: colors.borderColor, borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 15, color: colors.ink }}>{ttsPlaying ? '正在朗讀' : ttsPaused ? '已暫停' : '準備朗讀'}</Text>
                <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
                  {(ttsSelectedVoice ? voiceLabel(ttsSelectedVoice) : '系統語音')} · {ttsRate.toFixed(1)}×
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable
                  onPress={onTTSReset}
                  disabled={!ttsPlaying && !ttsPaused}
                  style={{
                    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: colors.paperBg2, borderWidth: 1, borderColor: colors.borderColor,
                    opacity: (!ttsPlaying && !ttsPaused) ? 0.45 : 1,
                  }}
                  accessibilityLabel="重置朗讀進度"
                >
                  <IconReset color={colors.ink2} />
                </Pressable>
                <Pressable
                  onPress={ttsPlaying ? onTTSPause : onTTSPlay}
                  style={{
                    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: ttsPlaying ? colors.progressFill : colors.ink,
                  }}
                  accessibilityLabel={ttsPlaying ? '暫停朗讀' : '開始朗讀'}
                >
                  {ttsPlaying ? <IconPause color={colors.paperBg} /> : <IconPlay color={colors.paperBg} />}
                </Pressable>
              </View>
            </View>

            <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: colors.ink3 }}>語速</Text>
              {stepper(`${ttsRate.toFixed(1)}×`, () => onTTSRateChange(parseFloat(Math.max(0.5, ttsRate - 0.1).toFixed(1))), () => onTTSRateChange(parseFloat(Math.min(2, ttsRate + 0.1).toFixed(1))))}
            </View>
          </View>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: colors.ink3 }}>睡眠計時</Text>
              {ttsSleepRemaining !== null && (
                <Text style={{ fontSize: 11, color: colors.progressFill }}>
                  {String(Math.floor(ttsSleepRemaining / 60)).padStart(2, '0')}:{String(ttsSleepRemaining % 60).padStart(2, '0')}
                </Text>
              )}
            </View>
            <View style={[segWrap, { justifyContent: 'space-between' }]}>
              {([0, 15, 30, 45, 60] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[segBtn(ttsSleepMinutes === m), { flex: 1 }]}
                  onPress={() => onTTSSleepChange(m)}
                  accessibilityRole="radio"
                  accessibilityLabel={m === 0 ? '睡眠計時：關閉' : `睡眠計時：${m} 分鐘`}
                  accessibilityState={{ selected: ttsSleepMinutes === m }}
                >
                  <Text style={segLabel(ttsSleepMinutes === m)}>{m === 0 ? '關' : String(m)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default SettingsPanel;

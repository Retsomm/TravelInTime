import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

const SettingsPanel = ({
  fontSize, onFontSizeChange, fontFamily, onFontFamilyChange,
  script, onScriptChange, readingDirection, onReadingDirectionChange,
  lineHeight, onLineHeightChange, letterSpacing, onLetterSpacingChange, onReset,
  ttsPlaying, ttsPaused, onTTSPlay, onTTSPause, onTTSReset,
  ttsVoices, ttsSelectedVoice, onTTSVoiceChange, ttsRate, onTTSRateChange,
  ttsSleepMinutes, onTTSSleepChange, ttsSleepRemaining,
}: Props) => {
  const { colors } = useTheme();

  const segBtn = (active: boolean) => [styles.segBtn, { backgroundColor: active ? colors.paperBg : 'transparent' }];
  const segLabel = (active: boolean) => [styles.segLabel, { color: active ? colors.ink : colors.ink3 }];

  const stepper = (value: string, onDec: () => void, onInc: () => void) => (
    <View style={[styles.stepperWrap, { borderColor: colors.borderColor }]}>
      <Pressable onPress={onDec} hitSlop={8} style={styles.stepperButton}>
        <Text style={[styles.stepperButtonText, { color: colors.ink3 }]}>−</Text>
      </Pressable>
      <View style={[styles.stepperValue, { borderColor: colors.borderColor }]}>
        <Text style={[styles.stepperValueText, { color: colors.ink }]}>{value}</Text>
      </View>
      <Pressable onPress={onInc} hitSlop={8} style={styles.stepperButton}>
        <Text style={[styles.stepperButtonText, { color: colors.ink3 }]}>＋</Text>
      </Pressable>
    </View>
  );

  const voiceLabel = (v: TTSVoice) => v.name.replace(/^(Google|Microsoft|Apple)\s*/i, '');

  return (
    <View style={[styles.root, { backgroundColor: colors.paperBg }]}>
      <View style={[styles.header, { borderColor: colors.borderColor }]}>
        <Text style={[styles.headerTitle, { color: colors.ink }]}>排版與語音</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 字體 */}
        <View>
          <Text style={[styles.sectionTitle, { color: colors.ink3 }]}>字體</Text>

          <View style={[styles.fontListWrap, { borderColor: colors.borderColor }]}>
            {FONT_OPTIONS.map((f) => {
              const active = fontFamily === f.value;
              return (
                <Pressable
                  key={f.value}
                  onPress={() => onFontFamilyChange(f.value)}
                  accessibilityRole="radio"
                  accessibilityLabel={`字體：${f.label}`}
                  accessibilityState={{ selected: active }}
                  style={[styles.fontOptionButton, { backgroundColor: active ? colors.paperBg2 : 'transparent' }]}
                >
                  <Text style={[styles.fontOptionText, { color: active ? colors.ink : colors.ink2 }]}>{f.label}</Text>
                  {active && <View style={[styles.activeDot, { backgroundColor: colors.progressFill }]} />}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.segmentedRow}>
            <View style={[styles.segWrap, { backgroundColor: colors.paperBg2, flex: 1 }]}>
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
            <View style={[styles.segWrap, { backgroundColor: colors.paperBg2, flex: 1 }]}>
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

          <View style={styles.typographyControls}>
            <View style={styles.controlRow}>
              <Text style={[styles.controlLabel, { color: colors.ink2 }]}>字體大小</Text>
              {stepper(`${fontSize}px`, () => onFontSizeChange(Math.max(12, fontSize - 1)), () => onFontSizeChange(Math.min(32, fontSize + 1)))}
            </View>
            <View style={styles.controlRow}>
              <Text style={[styles.controlLabel, { color: colors.ink2 }]}>行距</Text>
              {stepper(lineHeight.toFixed(1), () => onLineHeightChange(parseFloat(Math.max(1.0, lineHeight - 0.1).toFixed(1))), () => onLineHeightChange(parseFloat(Math.min(3.0, lineHeight + 0.1).toFixed(1))))}
            </View>
            <View style={styles.controlRow}>
              <Text style={[styles.controlLabel, { color: colors.ink2 }]}>字距</Text>
              {stepper(`${letterSpacing.toFixed(2)}em`, () => onLetterSpacingChange(parseFloat(Math.max(0, letterSpacing - 0.05).toFixed(2))), () => onLetterSpacingChange(parseFloat(Math.min(0.5, letterSpacing + 0.05).toFixed(2))))}
            </View>
          </View>

          <Pressable onPress={onReset} style={styles.resetButton}>
            <Text style={[styles.smallMuted12, { color: colors.ink3 }]}>重設預設值</Text>
          </Pressable>
        </View>

        <View style={[styles.divider, { borderColor: colors.borderColor }]} />

        {/* 語音朗讀 */}
        <View>
          <Text style={[styles.sectionTitle, { color: colors.ink3 }]}>語音朗讀</Text>

          {ttsVoices.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.voiceScrollContent}>
              {ttsVoices.map((v) => {
                const active = ttsSelectedVoice?.identifier === v.identifier;
                return (
                  <Pressable
                    key={v.identifier}
                    onPress={() => onTTSVoiceChange(v)}
                    accessibilityRole="radio"
                    accessibilityLabel={`語音：${voiceLabel(v)}`}
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.voiceButton,
                      { borderColor: colors.borderColor, backgroundColor: active ? colors.paperBg2 : 'transparent' },
                    ]}
                  >
                    <Text style={[styles.voiceButtonText, { color: active ? colors.ink : colors.ink3 }]}>{voiceLabel(v)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={[styles.ttsCard, { borderColor: colors.borderColor }]}>
            <View style={styles.controlRow}>
              <View>
                <Text style={[styles.statusText, { color: colors.ink }]}>{ttsPlaying ? '正在朗讀' : ttsPaused ? '已暫停' : '準備朗讀'}</Text>
                <Text style={[styles.subStatusText, { color: colors.ink3 }]}>
                  {(ttsSelectedVoice ? voiceLabel(ttsSelectedVoice) : '系統語音')} · {ttsRate.toFixed(1)}×
                </Text>
              </View>
              <View style={styles.ttsButtonsRow}>
                <Pressable
                  onPress={onTTSReset}
                  disabled={!ttsPlaying && !ttsPaused}
                  style={[
                    styles.ttsResetButton,
                    {
                      backgroundColor: colors.paperBg2,
                      borderColor: colors.borderColor,
                      opacity: (!ttsPlaying && !ttsPaused) ? 0.45 : 1,
                    },
                  ]}
                  accessibilityLabel="重置朗讀進度"
                >
                  <IconReset color={colors.ink2} />
                </Pressable>
                <Pressable
                  onPress={ttsPlaying ? onTTSPause : onTTSPlay}
                  style={[styles.ttsPlayButton, { backgroundColor: ttsPlaying ? colors.progressFill : colors.ink }]}
                  accessibilityLabel={ttsPlaying ? '暫停朗讀' : '開始朗讀'}
                >
                  {ttsPlaying ? <IconPause color={colors.paperBg} /> : <IconPlay color={colors.paperBg} />}
                </Pressable>
              </View>
            </View>

            <View style={styles.rateRow}>
              <Text style={[styles.smallMuted12, { color: colors.ink3 }]}>語速</Text>
              {stepper(`${ttsRate.toFixed(1)}×`, () => onTTSRateChange(parseFloat(Math.max(0.5, ttsRate - 0.1).toFixed(1))), () => onTTSRateChange(parseFloat(Math.min(2, ttsRate + 0.1).toFixed(1))))}
            </View>
          </View>

          <View>
            <View style={styles.sleepHeaderRow}>
              <Text style={[styles.smallMuted12, { color: colors.ink3 }]}>睡眠計時</Text>
              {ttsSleepRemaining !== null && (
                <Text style={[styles.sleepRemainingText, { color: colors.progressFill }]}>
                  {String(Math.floor(ttsSleepRemaining / 60)).padStart(2, '0')}:{String(ttsSleepRemaining % 60).padStart(2, '0')}
                </Text>
              )}
            </View>
            <View style={[styles.segWrap, { backgroundColor: colors.paperBg2, justifyContent: 'space-between' }]}>
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

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  scrollContent: {
    padding: 20,
    gap: 24,
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  fontListWrap: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 4,
    gap: 2,
    marginBottom: 12,
  },
  fontOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  fontOptionText: {
    fontSize: 14,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  segWrap: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  segBtn: {
    flex: 1,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segLabel: {
    fontSize: 12,
  },
  typographyControls: {
    gap: 12,
    marginBottom: 12,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlLabel: {
    fontSize: 13,
  },
  resetButton: {
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallMuted12: {
    fontSize: 12,
  },
  divider: {
    borderTopWidth: 1,
  },
  voiceScrollContent: {
    gap: 8,
    marginBottom: 14,
  },
  voiceButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  voiceButtonText: {
    fontSize: 13,
  },
  ttsCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  statusText: {
    fontSize: 15,
  },
  subStatusText: {
    fontSize: 11,
    marginTop: 2,
  },
  ttsButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ttsResetButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  ttsPlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sleepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sleepRemainingText: {
    fontSize: 11,
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  stepperButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    fontSize: 16,
  },
  stepperValue: {
    minWidth: 60,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  stepperValueText: {
    fontSize: 13,
  },
});

export default SettingsPanel;

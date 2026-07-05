import type { ReactNode } from 'react';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect, type SvgProps } from 'react-native-svg';

// 比照網頁版 renderer/src/components/Toolbar.tsx／SettingsPanel/icons.tsx 的簡約線條圖示，
// 照抄同一組 SVG path，維持跟網頁版一致的視覺風格（RN 端沒有內建 SVG，用 react-native-svg 畫）。

interface IconProps {
  size?: number;
  color?: string;
}

const IconSvg = ({
  size,
  children,
  ...svgProps
}: { size: number; children: ReactNode } & SvgProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
    {children}
  </Svg>
);

const strokeIconProps = (color: string, strokeWidth = 1.8) => ({
  fill: 'none' as const,
  stroke: color,
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const IconBack = ({ size = 18, color = '#000' }: IconProps) => (
  <IconSvg size={size} {...strokeIconProps(color)}>
    <Polyline points="15 18 9 12 15 6" />
  </IconSvg>
);

export const IconClose = ({ size = 14, color = '#000' }: IconProps) => (
  <IconSvg size={size} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
    <Line x1="18" y1="6" x2="6" y2="18" />
    <Line x1="6" y1="6" x2="18" y2="18" />
  </IconSvg>
);

export const IconSettings = ({ size = 18, color = '#000' }: IconProps) => (
  <IconSvg size={size} {...strokeIconProps(color)}>
    <Circle cx={12} cy={12} r={3} />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </IconSvg>
);

export const IconChapters = ({ size = 18, color = '#000' }: IconProps) => (
  <IconSvg size={size} {...strokeIconProps(color)}>
    <Line x1="8" y1="6" x2="21" y2="6" />
    <Line x1="8" y1="12" x2="21" y2="12" />
    <Line x1="8" y1="18" x2="21" y2="18" />
    <Line x1="3" y1="6" x2="3.01" y2="6" />
    <Line x1="3" y1="12" x2="3.01" y2="12" />
    <Line x1="3" y1="18" x2="3.01" y2="18" />
  </IconSvg>
);

export const IconNotes = ({ size = 18, color = '#000' }: IconProps) => (
  <IconSvg size={size} {...strokeIconProps(color)}>
    <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <Polyline points="14 2 14 8 20 8" />
    <Line x1="16" y1="13" x2="8" y2="13" />
    <Line x1="16" y1="17" x2="8" y2="17" />
    <Line x1="10" y1="9" x2="8" y2="9" />
  </IconSvg>
);

export const IconBook = ({ size = 18, color = '#000' }: IconProps) => (
  <IconSvg size={size} {...strokeIconProps(color)}>
    <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </IconSvg>
);

export const IconBookmarkOutline = ({ size = 18, color = '#000' }: IconProps) => (
  <IconSvg size={size} {...strokeIconProps(color)}>
    <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </IconSvg>
);

export const IconBookmarkFill = ({ size = 18, color = '#000' }: IconProps) => (
  <IconSvg size={size} {...strokeIconProps(color)} fill={color}>
    <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </IconSvg>
);

export const IconBookmarkList = ({ size = 18, color = '#000' }: IconProps) => (
  <IconSvg size={size} {...strokeIconProps(color)}>
    <Path d="M13 21l-5-4-5 4V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16z" />
    <Line x1="17" y1="7" x2="21" y2="7" />
    <Line x1="17" y1="11" x2="21" y2="11" />
    <Line x1="17" y1="15" x2="21" y2="15" />
  </IconSvg>
);

export const IconPlay = ({ size = 16, color = '#000' }: IconProps) => (
  <IconSvg size={size} fill={color} stroke="none">
    <Polygon points="6 4 20 12 6 20 6 4" />
  </IconSvg>
);

export const IconPause = ({ size = 16, color = '#000' }: IconProps) => (
  <IconSvg size={size} fill={color} stroke="none">
    <Rect x={6} y={5} width={4} height={14} rx={1} />
    <Rect x={14} y={5} width={4} height={14} rx={1} />
  </IconSvg>
);

export const IconReset = ({ size = 15, color = '#000' }: IconProps) => (
  <IconSvg size={size} {...strokeIconProps(color, 2)}>
    <Path d="M3 12a9 9 0 1 0 3-6.7" />
    <Path d="M3 4v7h7" />
  </IconSvg>
);

export const IconCopy = ({ size = 14, color = '#000' }: IconProps) => (
  <IconSvg size={size} {...strokeIconProps(color)}>
    <Rect x={9} y={9} width={13} height={13} rx={2} />
    <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </IconSvg>
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext } from 'react';

export interface ThemeColors {
  paperBg: string;
  paperBg2: string;
  borderColor: string;
  ink: string;
  ink3: string;
  progressTrack: string;
  progressFill: string;
}

// 比照 renderer/src/page/Library.tsx 的 darkMode 色票（oklch 換成 RN 認得的 hex）。
export const LIGHT_THEME: ThemeColors = {
  paperBg: '#f9f7f2',
  paperBg2: '#f1ede4',
  borderColor: '#e4ddd0',
  ink: '#2a2420',
  ink3: '#9a8f80',
  progressTrack: '#e4ddd0',
  progressFill: '#c17a4a',
};

export const DARK_THEME: ThemeColors = {
  paperBg: '#1a1816',
  paperBg2: '#231f1c',
  borderColor: '#3a3430',
  ink: '#e8e0d4',
  ink3: '#8a7f74',
  progressTrack: '#3a3430',
  progressFill: '#c17a4a',
};

export const DARK_MODE_STORAGE_KEY = 'settings:darkMode';

export const loadDarkModePreference = async (): Promise<boolean> => {
  const raw = await AsyncStorage.getItem(DARK_MODE_STORAGE_KEY);
  return raw === 'true';
};

export const saveDarkModePreference = (darkMode: boolean) =>
  AsyncStorage.setItem(DARK_MODE_STORAGE_KEY, darkMode ? 'true' : 'false');

export interface ThemeContextValue {
  darkMode: boolean;
  toggleDarkMode: () => void;
  colors: ThemeColors;
}

export const ThemeContext = createContext<ThemeContextValue>({
  darkMode: false,
  toggleDarkMode: () => {},
  colors: LIGHT_THEME,
});

export const useTheme = () => useContext(ThemeContext);

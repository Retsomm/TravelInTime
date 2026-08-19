// Service 層：書本排版偏好的本機（AsyncStorage）CRUD，不 import React。
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BookSettings {
  fontSize: number;
  fontFamily: string;
  script: 'tc' | 'sc';
  lineHeight: number;
  letterSpacing: number;
  readingDirection: 'ltr' | 'rtl';
}

const settingsKey = (bookId: string) => `tit:settings:${bookId}`;

const local = {
  load: async (bookId: string): Promise<BookSettings | null> => {
    try {
      const raw = await AsyncStorage.getItem(settingsKey(bookId));
      return raw ? (JSON.parse(raw) as BookSettings) : null;
    } catch {
      return null;
    }
  },
  save: (bookId: string, settings: BookSettings) =>
    AsyncStorage.setItem(settingsKey(bookId), JSON.stringify(settings)),
  clear: (bookId: string) => AsyncStorage.removeItem(settingsKey(bookId)),
};

export const settingsService = { local };

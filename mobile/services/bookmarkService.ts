// Service 層：書籤的本機（AsyncStorage）CRUD，不 import React。
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Bookmark {
  id: string;
  cfi: string;
  label: string;
  addedAt: number;
}

const bookmarksKey = (bookId: string) => `tit:bookmarks:${bookId}`;

const local = {
  load: async (bookId: string): Promise<Bookmark[]> => {
    try {
      const raw = await AsyncStorage.getItem(bookmarksKey(bookId));
      return raw ? (JSON.parse(raw) as Bookmark[]) : [];
    } catch {
      return [];
    }
  },
  save: (bookId: string, bookmarks: Bookmark[]) =>
    AsyncStorage.setItem(bookmarksKey(bookId), JSON.stringify(bookmarks)),
  clear: (bookId: string) => AsyncStorage.removeItem(bookmarksKey(bookId)),
};

export const bookmarkService = { local };

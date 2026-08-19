// Service 層：純函式，本機閱讀進度存取（AsyncStorage），不 import React。
import AsyncStorage from '@react-native-async-storage/async-storage';

const progressKey = (bookId: string) => `tit:progress:${bookId}`;

const local = {
  load: (bookId: string): Promise<string | null> => AsyncStorage.getItem(progressKey(bookId)),
  save: (bookId: string, cfi: string) => AsyncStorage.setItem(progressKey(bookId), cfi),
  clear: (bookId: string) => AsyncStorage.removeItem(progressKey(bookId)),
};

export const progressService = { local };

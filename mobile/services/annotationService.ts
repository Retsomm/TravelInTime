// Service 層：註記（劃線＋筆記）的本機（AsyncStorage）CRUD，不 import React。
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Annotation {
  id: string;
  cfi: string;
  text: string;
  color: string;
  chapter: string;
  createdAt: number;
  note?: string;
}

const annotationsKey = (bookId: string) => `tit:annotations:${bookId}`;

const local = {
  load: async (bookId: string): Promise<Annotation[]> => {
    try {
      const raw = await AsyncStorage.getItem(annotationsKey(bookId));
      return raw ? (JSON.parse(raw) as Annotation[]) : [];
    } catch {
      return [];
    }
  },
  save: (bookId: string, annotations: Annotation[]) =>
    AsyncStorage.setItem(annotationsKey(bookId), JSON.stringify(annotations)),
  clear: (bookId: string) => AsyncStorage.removeItem(annotationsKey(bookId)),
};

export const annotationService = { local };

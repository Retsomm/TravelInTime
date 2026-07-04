import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  filename: string;
  addedAt: number;
  lastOpenedAt: number;
  progress?: number;
}

export interface Bookmark {
  id: string;
  cfi: string;
  label: string;
  addedAt: number;
}

export interface BookSettings {
  fontSize: number;
  fontFamily: string;
  script: 'tc' | 'sc';
  lineHeight: number;
  letterSpacing: number;
  readingDirection: 'ltr' | 'rtl';
}

const META_KEY = 'tit:library:meta';
const progressKey = (id: string) => `tit:progress:${id}`;
const settingsKey = (id: string) => `tit:settings:${id}`;
const bookmarksKey = (id: string) => `tit:bookmarks:${id}`;

const booksDir = () => new Directory(Paths.document, 'books');

const generateId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const loadMeta = async (): Promise<BookRecord[]> => {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as BookRecord[]) : [];
  } catch {
    return [];
  }
};

const saveMeta = (records: BookRecord[]) => AsyncStorage.setItem(META_KEY, JSON.stringify(records));

export const listBooks = (): Promise<BookRecord[]> => loadMeta();

export const addBook = async (): Promise<BookRecord | null> => {
  const result = await File.pickFileAsync({ mimeTypes: ['application/epub+zip'] });
  if (result.canceled || !result.result) return null;
  const picked = result.result as File;

  const dir = booksDir();
  if (!dir.exists) dir.create({ intermediates: true });

  const id = generateId();
  const filename = `${id}.epub`;
  const destination = new File(dir, filename);
  picked.copy(destination);

  const record: BookRecord = {
    id,
    title: picked.name.replace(/\.epub$/i, ''),
    author: '',
    filename,
    addedAt: Date.now(),
    lastOpenedAt: Date.now(),
  };

  const records = await loadMeta();
  const next = [record, ...records];
  await saveMeta(next);
  return record;
};

export const getBookFileUri = (record: BookRecord): string => new File(booksDir(), record.filename).uri;

export const getBookBase64 = (record: BookRecord): Promise<string> =>
  new File(booksDir(), record.filename).base64();

export const removeBook = async (id: string) => {
  const records = await loadMeta();
  const record = records.find((r) => r.id === id);
  if (record) {
    const file = new File(booksDir(), record.filename);
    if (file.exists) file.delete();
  }
  await AsyncStorage.multiRemove([progressKey(id), settingsKey(id), bookmarksKey(id)]);
  await saveMeta(records.filter((r) => r.id !== id));
};

export const touchBook = async (id: string) => {
  const records = await loadMeta();
  await saveMeta(records.map((r) => (r.id === id ? { ...r, lastOpenedAt: Date.now() } : r)));
};

export const updateProgress = async (id: string, pct: number) => {
  const records = await loadMeta();
  await saveMeta(records.map((r) => (r.id === id ? { ...r, progress: Math.max(0, Math.min(1, pct)) } : r)));
};

export const saveReadingCfi = (id: string, cfi: string) => AsyncStorage.setItem(progressKey(id), cfi);

export const loadReadingCfi = (id: string): Promise<string | null> => AsyncStorage.getItem(progressKey(id));

export const saveBookSettings = (id: string, settings: BookSettings) =>
  AsyncStorage.setItem(settingsKey(id), JSON.stringify(settings));

export const loadBookSettings = async (id: string): Promise<BookSettings | null> => {
  try {
    const raw = await AsyncStorage.getItem(settingsKey(id));
    return raw ? (JSON.parse(raw) as BookSettings) : null;
  } catch {
    return null;
  }
};

export const loadBookmarks = async (id: string): Promise<Bookmark[]> => {
  try {
    const raw = await AsyncStorage.getItem(bookmarksKey(id));
    return raw ? (JSON.parse(raw) as Bookmark[]) : [];
  } catch {
    return [];
  }
};

export const saveBookmarks = (id: string, bookmarks: Bookmark[]) =>
  AsyncStorage.setItem(bookmarksKey(id), JSON.stringify(bookmarks));

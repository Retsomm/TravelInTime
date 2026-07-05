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
  /** @deprecated 舊版直接存完整 file:// 路徑，App 重新安裝／原生重新編譯後 sandbox 容器路徑改變就會失效；改用 coverFilename 現算。僅為相容舊資料保留讀取。 */
  coverUri?: string;
  coverFilename?: string;
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
const coversDir = () => new Directory(Paths.document, 'covers');

export const generateId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const coverExtension = (mediaType: string | null): string => {
  if (mediaType?.includes('png')) return 'png';
  if (mediaType?.includes('gif')) return 'gif';
  if (mediaType?.includes('webp')) return 'webp';
  return 'jpg';
};

const base64ToBytes = (base64: string): Uint8Array => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byteIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = chars.indexOf(clean[i]);
    const e2 = chars.indexOf(clean[i + 1]);
    const e3 = chars.indexOf(clean[i + 2]);
    const e4 = chars.indexOf(clean[i + 3]);
    bytes[byteIndex++] = (e1 << 2) | (e2 >> 4);
    if (e3 !== -1) bytes[byteIndex++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (e4 !== -1) bytes[byteIndex++] = ((e3 & 3) << 6) | e4;
  }
  return bytes.slice(0, byteIndex);
};

const loadMeta = async (): Promise<BookRecord[]> => {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as BookRecord[]) : [];
  } catch {
    return [];
  }
};

const saveMeta = (records: BookRecord[]) => AsyncStorage.setItem(META_KEY, JSON.stringify(records));

let metaQueue = Promise.resolve();

const updateMeta = <T>(fn: (records: BookRecord[]) => [BookRecord[], T]): Promise<T> => {
  const result = metaQueue.then(async () => {
    const records = await loadMeta();
    const [next, value] = fn(records);
    await saveMeta(next);
    return value;
  });
  metaQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
};

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
  await picked.copy(destination);

  const record: BookRecord = {
    id,
    title: picked.name.replace(/\.epub$/i, ''),
    author: '',
    filename,
    addedAt: Date.now(),
    lastOpenedAt: Date.now(),
  };

  return updateMeta((records) => [[record, ...records], record]);
};

export const getBookFileUri = (record: BookRecord): string => new File(booksDir(), record.filename).uri;

export const getBookBase64 = (record: BookRecord): Promise<string> =>
  new File(booksDir(), record.filename).base64();

export const removeBook = (id: string) =>
  updateMeta((records) => {
    const record = records.find((r) => r.id === id);
    if (record) {
      const file = new File(booksDir(), record.filename);
      if (file.exists) file.delete();
      const coverFilename = record.coverFilename ?? record.coverUri?.split('/').pop();
      if (coverFilename) {
        const cover = new File(coversDir(), coverFilename);
        if (cover.exists) cover.delete();
      }
    }
    AsyncStorage.multiRemove([progressKey(id), settingsKey(id), bookmarksKey(id)]);
    return [records.filter((r) => r.id !== id), undefined];
  });

export const updateBookMeta = (
  id: string,
  patch: Partial<Pick<BookRecord, 'title' | 'author' | 'coverFilename'>>
) =>
  updateMeta((records) => [
    records.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    undefined,
  ]);

// 封面圖檔存進沙盒目錄，AsyncStorage 只存檔名（圖片轉 base64 存 AsyncStorage 太肥）。
// 回傳檔名而不是完整 file:// 路徑：完整路徑開頭是當次 App 安裝的 sandbox 容器 UUID，
// 重新安裝／原生重新編譯後容器路徑會變，存死的完整路徑就會失效（見 getCoverUri 現算路徑）。
export const saveCoverImage = (id: string, base64: string, mediaType: string | null): string => {
  const dir = coversDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, `${id}.${coverExtension(mediaType)}`);
  if (file.exists) file.delete();
  file.create();
  file.write(base64ToBytes(base64));
  return file.name;
};

// 比照 getBookFileUri 的做法：每次都用目前這次執行的 coversDir() 現算完整路徑，
// 不依賴存死的絕對路徑。若只有舊版留下的 coverUri（完整路徑），退而求其次取檔名部分
// 拼回目前的 coversDir()，讓舊資料在 App 重新安裝後也有機會恢復顯示。
export const getCoverUri = (record: BookRecord): string | null => {
  const filename = record.coverFilename ?? record.coverUri?.split('/').pop();
  if (!filename) return null;
  const file = new File(coversDir(), filename);
  return file.exists ? file.uri : null;
};

export const touchBook = (id: string) =>
  updateMeta((records) => [records.map((r) => (r.id === id ? { ...r, lastOpenedAt: Date.now() } : r)), undefined]);

export const updateProgress = (id: string, pct: number) =>
  updateMeta((records) => [
    records.map((r) => (r.id === id ? { ...r, progress: Math.max(0, Math.min(1, pct)) } : r)),
    undefined,
  ]);

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

import { useEffect, useState } from 'react';
import { type Bookmark, generateId, loadBookmarks, saveBookmarks } from '../../lib/library';
import { isBookmarked, removeBookmarkList, toggleBookmarkList } from '../../lib/reader/calculations';

export const useBookmarks = (id: string | undefined, currentCfi: string, currentChapterTitle: string) => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    loadBookmarks(id).then((saved) => {
      if (!cancelled) setBookmarks(saved);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleToggleBookmark = () => {
    if (!id || !currentCfi) return;
    const newBookmark: Bookmark = {
      id: generateId(),
      cfi: currentCfi,
      label: currentChapterTitle || '書籤',
      addedAt: Date.now(),
    };
    let next: Bookmark[] = [];
    setBookmarks((prev) => {
      next = toggleBookmarkList(prev, currentCfi, newBookmark);
      return next;
    });
    saveBookmarks(id, next).catch((err) => console.error('[reader] saveBookmarks 失敗', err));
  };

  const handleDeleteBookmark = (bookmarkId: string) => {
    if (!id) return;
    let next: Bookmark[] = [];
    setBookmarks((prev) => {
      next = removeBookmarkList(prev, bookmarkId);
      return next;
    });
    saveBookmarks(id, next).catch((err) => console.error('[reader] saveBookmarks 失敗', err));
  };

  return {
    bookmarks,
    isBookmarked: isBookmarked(bookmarks, currentCfi),
    handleToggleBookmark,
    handleDeleteBookmark,
  };
};

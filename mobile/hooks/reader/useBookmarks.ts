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
    setBookmarks((prev) => {
      const next = toggleBookmarkList(prev, currentCfi, newBookmark);
      saveBookmarks(id, next);
      return next;
    });
  };

  const handleDeleteBookmark = (bookmarkId: string) => {
    if (!id) return;
    setBookmarks((prev) => {
      const next = removeBookmarkList(prev, bookmarkId);
      saveBookmarks(id, next);
      return next;
    });
  };

  return {
    bookmarks,
    isBookmarked: isBookmarked(bookmarks, currentCfi),
    handleToggleBookmark,
    handleDeleteBookmark,
  };
};

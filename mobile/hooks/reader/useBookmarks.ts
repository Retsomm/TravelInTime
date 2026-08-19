import { useEffect, useRef, useState } from 'react';
import { generateId } from '../../services/bookService';
import { bookmarkService, type Bookmark } from '../../services/bookmarkService';
import { isBookmarked, removeBookmarkList, toggleBookmarkList } from '../../lib/reader/calculations';

export const useBookmarks = (id: string | undefined, currentCfi: string, currentChapterTitle: string) => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    loadedRef.current = false;
    bookmarkService.local.load(id).then((saved) => {
      if (!cancelled) {
        setBookmarks(saved);
        loadedRef.current = true;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // 存檔改成跟著已提交的 bookmarks state 走，而不是在 handler 裡用當下算出的
  // next 立即存檔：這樣連續呼叫（例如清單裡連點兩個刪除）會依序疊加在最新 state
  // 上，不會有兩次呼叫都基於同一份舊 snapshot 而互相蓋掉對方的問題。
  useEffect(() => {
    if (!id || !loadedRef.current) return;
    bookmarkService.local.save(id, bookmarks).catch((err) => console.error('[reader] saveBookmarks 失敗', err));
  }, [id, bookmarks]);

  const handleToggleBookmark = () => {
    if (!id || !currentCfi) return;
    const newBookmark: Bookmark = {
      id: generateId(),
      cfi: currentCfi,
      label: currentChapterTitle || '書籤',
      addedAt: Date.now(),
    };
    setBookmarks((prev) => toggleBookmarkList(prev, currentCfi, newBookmark));
  };

  const handleDeleteBookmark = (bookmarkId: string) => {
    setBookmarks((prev) => removeBookmarkList(prev, bookmarkId));
  };

  return {
    bookmarks,
    isBookmarked: isBookmarked(bookmarks, currentCfi),
    handleToggleBookmark,
    handleDeleteBookmark,
  };
};

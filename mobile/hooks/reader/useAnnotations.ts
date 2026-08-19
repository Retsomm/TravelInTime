import { generateId } from '../../services/bookService';
import { annotationService, type Annotation } from '../../services/annotationService';
import type { InboundMessage } from '../../lib/readerMessages';
import {
  addAnnotationList,
  removeAnnotationList,
  updateAnnotationColorList,
  updateAnnotationNoteList,
} from '../../lib/reader/calculations';

interface UseAnnotationsParams {
  id: string | undefined;
  annotations: Annotation[];
  setAnnotations: (next: Annotation[]) => void;
  currentChapterTitle: string;
  selection: { cfi: string; text: string } | null;
  setSelection: (next: { cfi: string; text: string } | null) => void;
  setEditingAnnotationId: (next: string | null) => void;
  postToWebView: (msg: InboundMessage) => void;
}

export const useAnnotations = ({
  id,
  annotations,
  setAnnotations,
  currentChapterTitle,
  selection,
  setSelection,
  setEditingAnnotationId,
  postToWebView,
}: UseAnnotationsParams) => {
  // WebView 端只負責「畫出目前這份清單長什麼樣子」，annotations 陣列本身以 RN 端／
  // AsyncStorage 為唯一資料來源；每次新增/改色/刪除都整批送一次目前完整清單，
  // 讓 reader-web 的 applyAnnotations() 自己比對差異決定要新增/移除哪些標記。
  const syncAnnotationsToWebView = (next: Annotation[]) => {
    postToWebView({ type: 'setAnnotations', annotations: next.map((a) => ({ id: a.id, cfi: a.cfi, color: a.color })) });
  };

  const handleCreateAnnotation = (color: string) => {
    if (!id || !selection) return;
    const ann: Annotation = {
      id: generateId(),
      cfi: selection.cfi,
      text: selection.text,
      color,
      chapter: currentChapterTitle,
      createdAt: Date.now(),
    };
    const next = addAnnotationList(annotations, ann);
    setAnnotations(next);
    annotationService.local.save(id, next).catch((err) => console.error('[reader] saveAnnotations 失敗', err));
    syncAnnotationsToWebView(next);
    setSelection(null);
    postToWebView({ type: 'clearSelection' });
  };

  const handleChangeAnnotationColor = (annotationId: string, color: string) => {
    if (!id) return;
    const next = updateAnnotationColorList(annotations, annotationId, color);
    setAnnotations(next);
    annotationService.local.save(id, next).catch((err) => console.error('[reader] saveAnnotations 失敗', err));
    syncAnnotationsToWebView(next);
  };

  const handleDeleteAnnotation = (annotationId: string) => {
    if (!id) return;
    const next = removeAnnotationList(annotations, annotationId);
    setAnnotations(next);
    annotationService.local.save(id, next).catch((err) => console.error('[reader] saveAnnotations 失敗', err));
    syncAnnotationsToWebView(next);
    setEditingAnnotationId(null);
  };

  const handleUpdateAnnotationNote = (annotationId: string, note: string) => {
    if (!id) return;
    const next = updateAnnotationNoteList(annotations, annotationId, note);
    setAnnotations(next);
    annotationService.local.save(id, next).catch((err) => console.error('[reader] saveAnnotations 失敗', err));
  };

  return {
    handleCreateAnnotation,
    handleChangeAnnotationColor,
    handleDeleteAnnotation,
    handleUpdateAnnotationNote,
  };
};

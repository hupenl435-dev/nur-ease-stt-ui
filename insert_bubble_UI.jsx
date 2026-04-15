import React, { useRef, useState } from 'react';
import {
  Mic,
  RotateCcw,
  Users,
  ClipboardList,
  Pill,
  Check,
  PlusCircle,
  Sparkles,
  FileText,
  Settings,
} from 'lucide-react';

const TOUCH_DRAG_THRESHOLD = 8;
const FLOW_END_MARKER = '\u200B';

const isInlineChip = (part) => part?.type === 'bubble' || part?.type === 'placeholder';

const normalizeParts = (parts) => {
  const normalized = [];

  parts.forEach((part) => {
    if (part.type === 'text') {
      if (!part.value) return;

      const previousPart = normalized[normalized.length - 1];
      if (previousPart?.type === 'text') {
        previousPart.value += part.value;
      } else {
        normalized.push({ type: 'text', value: part.value });
      }
      return;
    }

    normalized.push(part);
  });

  return normalized;
};

const getRangeOffsetWithinTarget = (target, range) => {
  const measurementRange = range.cloneRange();
  measurementRange.selectNodeContents(target);
  measurementRange.setEnd(range.startContainer, range.startOffset);
  return measurementRange.toString().length;
};

const getCaretRangeFromPoint = (x, y) => {
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    if (!position) return null;

    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }

  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(x, y);
  }

  return null;
};

const getNearestWordBoundary = (text, offset) => {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const boundaries = new Set([0, text.length]);

  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('zh-Hant', { granularity: 'word' });
    for (const segment of segmenter.segment(text)) {
      boundaries.add(segment.index);
      boundaries.add(segment.index + segment.segment.length);
    }
  } else {
    const matcher = /\s+|[.,;:!?()[\]{}\-\/]+/g;
    let match;
    while ((match = matcher.exec(text)) !== null) {
      boundaries.add(match.index);
      boundaries.add(match.index + match[0].length);
    }
  }

  return [...boundaries].sort((a, b) => Math.abs(a - safeOffset) - Math.abs(b - safeOffset))[0];
};

const surnamePool = ['王', '李', '陳', '林', '張', '黃', '吳', '劉', '蔡', '楊', '鄭', '謝'];
const givenNamePool = [
  '品妤',
  '冠廷',
  '怡安',
  '柏翰',
  '宥辰',
  '語彤',
  '承恩',
  '佳穎',
  '子涵',
  '詠晴',
  '嘉宏',
  '思妤',
  '品睿',
  '雅筑',
  '昱廷',
  '芷瑄',
];

const createRandomStaffNames = (count, suffix, usedBaseNames) => {
  const names = [];

  while (names.length < count) {
    const baseName = `${surnamePool[Math.floor(Math.random() * surnamePool.length)]}${
      givenNamePool[Math.floor(Math.random() * givenNamePool.length)]
    }`;

    if (usedBaseNames.has(baseName)) continue;

    usedBaseNames.add(baseName);
    names.push(`${baseName}${suffix}`);
  }

  return names;
};

const createItemsData = () => {
  const usedBaseNames = new Set();

  return {
    physician: createRandomStaffNames(8, '醫師', usedBaseNames),
    nursePractitioner: createRandomStaffNames(8, '專科護理師', usedBaseNames),
    medication: [
      'Acetaminophen',
      'Morphine',
      'Aspirin',
      'Normal Saline',
      'Insulin',
      'Ketorolac',
      'Ampicillin',
      'Metformin',
      'Lasix',
      'Plavix',
    ],
  };
};

const App = () => {
  const [contentParts, setContentParts] = useState([
    { type: 'text', value: '病人目前使用 ' },
    { type: 'placeholder', value: '藥物名稱', category: 'medication' },
    { type: 'text', value: ' 500mg，由 ' },
    { type: 'placeholder', value: '醫師', category: 'physician' },
    { type: 'text', value: ' 記錄於護理紀錄中。' },
  ]);

  const [activeCategory, setActiveCategory] = useState(null);
  const [selectionTarget, setSelectionTarget] = useState(null);
  const [replaceTargetIndex, setReplaceTargetIndex] = useState(null);
  const [dragPayload, setDragPayload] = useState(null);
  const [dragMode, setDragMode] = useState(null);
  const [isDraggingOverEditor, setIsDraggingOverEditor] = useState(false);
  const [caretIndicator, setCaretIndicator] = useState(null);
  const [touchPreview, setTouchPreview] = useState(null);
  const [activeShortcut, setActiveShortcut] = useState('record');
  const [itemsData] = useState(() => createItemsData());

  const editorRef = useRef(null);
  const flowRef = useRef(null);
  const flowEndRef = useRef(null);
  const touchDragRef = useRef(null);

  const categories = [
    { id: 'physician', label: '醫師', icon: <Users size={16} /> },
    { id: 'nursePractitioner', label: '專科護理師', icon: <ClipboardList size={16} /> },
    { id: 'medication', label: '用藥', icon: <Pill size={16} /> },
  ];

  const getCurrentSelectionTarget = (parts = contentParts, target = selectionTarget) =>
    target ?? { type: 'between', index: parts.length };

  const clearVisualIndicator = () => {
    setCaretIndicator(null);
  };

  const clearDragState = () => {
    setDragPayload(null);
    setDragMode(null);
    setIsDraggingOverEditor(false);
    setTouchPreview(null);
    clearVisualIndicator();
  };

  const updateIndicatorFromRange = (range) => {
    if (!editorRef.current || !range) return;

    const editorRect = editorRef.current.getBoundingClientRect();
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0)) return;

    setCaretIndicator({
      left: rect.left - editorRect.left + editorRef.current.scrollLeft,
      top: rect.top - editorRect.top + editorRef.current.scrollTop,
      height: Math.max(rect.height, 28),
    });
  };

  const updateIndicatorFromElementEdge = (element, placeAfter) => {
    if (!editorRef.current || !element) return;

    const editorRect = editorRef.current.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    setCaretIndicator({
      left: (placeAfter ? rect.right : rect.left) - editorRect.left + editorRef.current.scrollLeft,
      top: rect.top - editorRect.top + editorRef.current.scrollTop,
      height: Math.max(rect.height, 28),
    });
  };

  const updateIndicatorAtFlowEnd = () => {
    if (flowEndRef.current) {
      updateIndicatorFromElementEdge(flowEndRef.current, false);
      return;
    }

    if (!flowRef.current) return;

    const range = document.createRange();
    range.selectNodeContents(flowRef.current);
    range.collapse(false);
    updateIndicatorFromRange(range);
  };

  const setBetweenSelection = (index) => {
    setSelectionTarget({ type: 'between', index });
    setReplaceTargetIndex(null);
  };

  const setTextSelection = (index, offset) => {
    setSelectionTarget({ type: 'text', index, offset });
    setReplaceTargetIndex(null);
  };

  const focusFlowEndAnchor = () => {
    const anchor = flowEndRef.current;
    const selection = window.getSelection();
    if (!selection) return;

    if (!anchor) {
      setBetweenSelection(contentParts.length);
      updateIndicatorAtFlowEnd();
      return;
    }

    anchor.focus();
    const range = document.createRange();
    range.selectNodeContents(anchor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    setBetweenSelection(contentParts.length);
    updateIndicatorAtFlowEnd();
  };

  const setDOMCaretAtOffset = (target, offset) => {
    const selection = window.getSelection();
    if (!selection) return;

    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    let remainingOffset = offset;
    let currentNode = walker.nextNode();

    while (currentNode) {
      const nodeLength = currentNode.textContent?.length ?? 0;
      if (remainingOffset <= nodeLength) {
        const range = document.createRange();
        range.setStart(currentNode, remainingOffset);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        updateIndicatorFromRange(range);
        return;
      }

      remainingOffset -= nodeLength;
      currentNode = walker.nextNode();
    }

    const fallbackRange = document.createRange();
    fallbackRange.selectNodeContents(target);
    fallbackRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(fallbackRange);
    updateIndicatorFromRange(fallbackRange);
  };

  const syncTextSelectionFromDOM = (target, index) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !target.contains(selection.anchorNode)) {
      return;
    }

    const range = selection.getRangeAt(0);
    setTextSelection(index, getRangeOffsetWithinTarget(target, range));
  };

  const setCaretFromPoint = (target, index, x, y) => {
    const range = getCaretRangeFromPoint(x, y);
    if (!range || !target.contains(range.startContainer)) {
      const snappedOffset = getNearestWordBoundary(target.innerText, target.innerText.length);
      setDOMCaretAtOffset(target, snappedOffset);
      setTextSelection(index, snappedOffset);
      return { type: 'text', index, offset: snappedOffset };
    }

    const rawOffset = getRangeOffsetWithinTarget(target, range);
    const snappedOffset = getNearestWordBoundary(target.innerText, rawOffset);
    setDOMCaretAtOffset(target, snappedOffset);
    setTextSelection(index, snappedOffset);
    return { type: 'text', index, offset: snappedOffset };
  };

  const updateContentParts = (nextParts, nextSelection = null) => {
    const normalizedParts = normalizeParts(nextParts);
    setContentParts(normalizedParts);
    setSelectionTarget(nextSelection);
    setReplaceTargetIndex(null);
    setActiveCategory(null);
    clearDragState();
  };

  const insertBubbleIntoParts = (parts, bubblePart, target) => {
    if (target?.type === 'text') {
      const textPart = parts[target.index];
      if (textPart?.type === 'text') {
        const safeOffset = Math.max(0, Math.min(target.offset, textPart.value.length));
        const beforeText = textPart.value.slice(0, safeOffset);
        const afterText = textPart.value.slice(safeOffset);
        const replacementParts = [];

        if (beforeText) replacementParts.push({ type: 'text', value: beforeText });
        replacementParts.push(bubblePart);
        if (afterText) replacementParts.push({ type: 'text', value: afterText });

        parts.splice(target.index, 1, ...replacementParts);
        return target.index + (beforeText ? 1 : 0);
      }
    }

    const insertIndex = Math.max(0, Math.min(target?.index ?? parts.length, parts.length));
    parts.splice(insertIndex, 0, bubblePart);
    return insertIndex;
  };

  const adjustTargetAfterBubbleMove = (target, sourceIndex) => {
    if (!target) return { type: 'between', index: contentParts.length };

    if (target.type === 'text') {
      if (target.index > sourceIndex) {
        return { ...target, index: target.index - 1 };
      }
      return target;
    }

    if (target.index > sourceIndex) {
      return { ...target, index: target.index - 1 };
    }

    return target;
  };

  const removePartAtIndex = (targetIndex, nextSelection = null) => {
    const nextParts = contentParts.filter((_, index) => index !== targetIndex);
    updateContentParts(
      nextParts,
      nextSelection ?? { type: 'between', index: Math.max(0, targetIndex - 1) },
    );
  };

  const insertValueAtSelection = (
    value,
    forcedCategory = activeCategory,
    forcedReplaceIndex = replaceTargetIndex,
    forcedSelectionTarget = selectionTarget,
  ) => {
    const nextParts = [...contentParts];
    const replaceIndex = forcedReplaceIndex;
    const selection = getCurrentSelectionTarget(nextParts, forcedSelectionTarget);
    const replacePart = replaceIndex !== null ? nextParts[replaceIndex] : null;
    const bubbleCategory = forcedCategory || replacePart?.category || null;
    const newBubblePart = { type: 'bubble', value, category: bubbleCategory, isNew: true };

    let insertedIndex;
    if (replaceIndex !== null && replacePart && (replacePart.type === 'placeholder' || replacePart.type === 'bubble')) {
      nextParts[replaceIndex] = newBubblePart;
      insertedIndex = replaceIndex;
    } else {
      insertedIndex = insertBubbleIntoParts(nextParts, newBubblePart, selection);
    }

    updateContentParts(nextParts, { type: 'between', index: insertedIndex + 1 });
  };

  const moveBubbleToSelection = (sourceIndex, forcedSelectionTarget = selectionTarget) => {
    const sourcePart = contentParts[sourceIndex];
    if (!sourcePart || sourcePart.type !== 'bubble') return;

    const nextParts = [...contentParts];
    const [movedBubble] = nextParts.splice(sourceIndex, 1);
    const adjustedTarget = adjustTargetAfterBubbleMove(
      getCurrentSelectionTarget(nextParts, forcedSelectionTarget),
      sourceIndex,
    );
    const insertedIndex = insertBubbleIntoParts(nextParts, { ...movedBubble, isNew: true }, adjustedTarget);

    updateContentParts(nextParts, { type: 'between', index: insertedIndex + 1 });
  };

  const handleInsertValue = (value) => {
    insertValueAtSelection(value);
  };

  const handleTextEdit = (index, newValue) => {
    const nextParts = [...contentParts];
    if (!nextParts[index] || nextParts[index].type !== 'text') return;

    nextParts[index] = { type: 'text', value: newValue };
    setContentParts(normalizeParts(nextParts));
  };

  const handleTextKeyDown = (e, index) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !e.currentTarget.contains(selection.anchorNode)) {
      return;
    }

    const caretOffset = getRangeOffsetWithinTarget(e.currentTarget, selection.getRangeAt(0));
    const currentValueLength = e.currentTarget.innerText.length;
    const previousPart = contentParts[index - 1];
    const nextPart = contentParts[index + 1];

    if (e.key === 'Backspace' && caretOffset === 0 && isInlineChip(previousPart)) {
      e.preventDefault();
      removePartAtIndex(index - 1);
      return;
    }

    if (e.key === 'Delete' && caretOffset === currentValueLength && isInlineChip(nextPart)) {
      e.preventDefault();
      removePartAtIndex(index + 1);
      return;
    }

    setReplaceTargetIndex(null);
  };

  const handleBubbleKeyDown = (e, index) => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;

    e.preventDefault();
    removePartAtIndex(index);
  };

  const handleFlowEndKeyDown = (e) => {
    if (e.key === 'Backspace' && isInlineChip(contentParts[contentParts.length - 1])) {
      e.preventDefault();
      removePartAtIndex(contentParts.length - 1, {
        type: 'between',
        index: Math.max(contentParts.length - 1, 0),
      });
      return;
    }

    if (e.key === 'Delete') {
      e.preventDefault();
      return;
    }

    if (
      !['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)
      && !e.metaKey
      && !e.ctrlKey
      && !e.altKey
    ) {
      e.preventDefault();
    }
  };

  const syncFlowEndSelection = () => {
    setBetweenSelection(contentParts.length);
    updateIndicatorAtFlowEnd();
  };

  const updateDropTargetFromPoint = (clientX, clientY, payloadType) => {
    const element = document.elementFromPoint(clientX, clientY);
    if (!element) {
      setIsDraggingOverEditor(false);
      setReplaceTargetIndex(null);
      clearVisualIndicator();
      return {
        isOverEditor: false,
        selectionTarget: null,
        replaceTargetIndex: null,
      };
    }

    const textTarget = element.closest('[data-drop-kind="text"]');
    if (textTarget) {
      const index = Number(textTarget.dataset.textIndex);
      const nextSelectionTarget = setCaretFromPoint(textTarget, index, clientX, clientY);
      setIsDraggingOverEditor(true);
      return {
        isOverEditor: true,
        selectionTarget: nextSelectionTarget,
        replaceTargetIndex: null,
      };
    }

    const boundaryTarget = element.closest('[data-drop-kind="boundary"]');
    if (boundaryTarget) {
      const index = Number(boundaryTarget.dataset.partIndex);
      const rect = boundaryTarget.getBoundingClientRect();
      const shouldInsertAfter = clientX > rect.left + rect.width / 2;
      const boundaryIndex = index + (shouldInsertAfter ? 1 : 0);
      const canReplace = boundaryTarget.dataset.replaceable === 'true' && payloadType !== 'bubble';
      const nextSelectionTarget = { type: 'between', index: boundaryIndex };
      const nextReplaceTargetIndex = canReplace ? index : null;

      setSelectionTarget(nextSelectionTarget);
      setReplaceTargetIndex(nextReplaceTargetIndex);
      updateIndicatorFromElementEdge(boundaryTarget, shouldInsertAfter);
      setIsDraggingOverEditor(true);
      return {
        isOverEditor: true,
        selectionTarget: nextSelectionTarget,
        replaceTargetIndex: nextReplaceTargetIndex,
      };
    }

    if (editorRef.current?.contains(element)) {
      setBetweenSelection(contentParts.length);
      updateIndicatorAtFlowEnd();
      setIsDraggingOverEditor(true);
      return {
        isOverEditor: true,
        selectionTarget: { type: 'between', index: contentParts.length },
        replaceTargetIndex: null,
      };
    }

    setIsDraggingOverEditor(false);
    setReplaceTargetIndex(null);
    clearVisualIndicator();
    return {
      isOverEditor: false,
      selectionTarget: null,
      replaceTargetIndex: null,
    };
  };

  const handleListItemDragStart = (e, item) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', item);
    setDragMode('pointer');
    setDragPayload({ type: 'library-item', value: item, category: activeCategory });
  };

  const handleBubbleDragStart = (e, index, part) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', part.value);
    setDragMode('pointer');
    setDragPayload({ type: 'bubble', value: part.value, index, category: part.category });
  };

  const handleDragEnd = () => {
    clearDragState();
  };

  const handleEditorDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragPayload?.type === 'bubble' ? 'move' : 'copy';
    setBetweenSelection(contentParts.length);
    updateIndicatorAtFlowEnd();
    setIsDraggingOverEditor(true);
  };

  const handleTextDragOver = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = dragPayload?.type === 'bubble' ? 'move' : 'copy';
    setCaretFromPoint(e.currentTarget, index, e.clientX, e.clientY);
    setIsDraggingOverEditor(true);
  };

  const handleInlineBoundaryDragOver = (e, index, replaceable = false) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = dragPayload?.type === 'bubble' ? 'move' : 'copy';

    const rect = e.currentTarget.getBoundingClientRect();
    const shouldInsertAfter = e.clientX > rect.left + rect.width / 2;
    const boundaryIndex = index + (shouldInsertAfter ? 1 : 0);

    setSelectionTarget({ type: 'between', index: boundaryIndex });
    setReplaceTargetIndex(replaceable && dragPayload?.type !== 'bubble' ? index : null);
    updateIndicatorFromElementEdge(e.currentTarget, shouldInsertAfter);
    setIsDraggingOverEditor(true);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (dragPayload?.type === 'bubble') {
      moveBubbleToSelection(dragPayload.index);
      return;
    }

    const droppedValue = e.dataTransfer.getData('text/plain') || dragPayload?.value;
    if (!droppedValue) return;

    insertValueAtSelection(droppedValue, dragPayload?.category ?? activeCategory);
  };

  const startTouchDrag = (payload, touch) => {
    touchDragRef.current = {
      payload,
      startX: touch.clientX,
      startY: touch.clientY,
      active: false,
      isOverEditor: false,
      dropTarget: null,
    };
  };

  const handleTouchMove = (e) => {
    const session = touchDragRef.current;
    if (!session) return;

    const touch = e.touches[0];
    if (!touch) return;

    const distance = Math.hypot(touch.clientX - session.startX, touch.clientY - session.startY);
    if (!session.active && distance < TOUCH_DRAG_THRESHOLD) return;

    session.active = true;
    e.preventDefault();

    if (!dragPayload) {
      setDragMode('touch');
      setDragPayload(session.payload);
    }
    setTouchPreview({
      x: touch.clientX,
      y: touch.clientY,
      category: session.payload.category,
      value: session.payload.value,
    });
    session.dropTarget = updateDropTargetFromPoint(touch.clientX, touch.clientY, session.payload.type);
    session.isOverEditor = session.dropTarget.isOverEditor;
  };

  const handleTouchEnd = (e) => {
    const session = touchDragRef.current;
    if (!session) return;

    const touch = e.changedTouches[0];
    if (touch) {
      session.dropTarget = updateDropTargetFromPoint(
        touch.clientX,
        touch.clientY,
        session.payload.type,
      );
      session.isOverEditor = session.dropTarget.isOverEditor;
    }

    if (session.active && session.dropTarget?.isOverEditor) {
      e.preventDefault();

      if (session.payload.type === 'bubble') {
        moveBubbleToSelection(session.payload.index, session.dropTarget.selectionTarget);
      } else {
        insertValueAtSelection(
          session.payload.value,
          session.payload.category ?? activeCategory,
          session.dropTarget.replaceTargetIndex,
          session.dropTarget.selectionTarget,
        );
      }
    }

    touchDragRef.current = null;
    clearDragState();
  };

  const handleTouchCancel = () => {
    touchDragRef.current = null;
    clearDragState();
  };

  const handleEditorDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDraggingOverEditor(false);
    clearVisualIndicator();
  };

  const isTouchDraggingBubble = (index) =>
    dragMode === 'touch' && dragPayload?.type === 'bubble' && dragPayload.index === index;

  const isTouchDraggingListItem = (item) =>
    dragMode === 'touch' && dragPayload?.type === 'library-item' && dragPayload.value === item;

  const showFlowEndAnchor =
    contentParts.length === 0 || isInlineChip(contentParts[contentParts.length - 1]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans max-w-md mx-auto border-x shadow-2xl overflow-hidden relative text-slate-800">
      <header className="px-5 py-4 flex justify-between items-center bg-white border-b z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-md">
            <Sparkles size={18} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 leading-none tracking-tight">護理語音助手</h1>
            <p className="text-[10px] text-blue-500 font-bold uppercase mt-1 tracking-widest">AI Speech Assistant</p>
          </div>
        </div>
        <button
          type="button"
          className="w-11 h-11 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 shadow-sm transition-all hover:bg-slate-900 hover:text-white"
        >
          <Settings size={18} className="mx-auto" />
        </button>
      </header>

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        <div
          ref={editorRef}
          className={`flex-1 bg-white rounded-[2rem] p-6 shadow-sm border flex flex-col relative overflow-y-auto transition-colors ${
            isDraggingOverEditor ? 'border-blue-400 bg-blue-50/40' : 'border-slate-200'
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              focusFlowEndAnchor();
            }
          }}
          onDragOver={handleEditorDragOver}
          onDragLeave={handleEditorDragLeave}
          onDrop={handleDrop}
        >
          {caretIndicator && (
            <div
              className={`pointer-events-none absolute z-20 rounded-full bg-blue-500 ${
                dragMode === 'touch'
                  ? 'w-[5px] shadow-[0_0_0_5px_rgba(59,130,246,0.22)]'
                  : 'w-[3px] shadow-[0_0_0_3px_rgba(59,130,246,0.18)]'
              }`}
              style={{
                left: `${caretIndicator.left - (dragMode === 'touch' ? 2.5 : 1.5)}px`,
                top: `${caretIndicator.top - 2}px`,
                height: `${caretIndicator.height + (dragMode === 'touch' ? 8 : 4)}px`,
              }}
            />
          )}

          <div
            ref={flowRef}
            className="leading-[2.2] text-lg font-medium text-slate-700 whitespace-pre-wrap break-words"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                focusFlowEndAnchor();
              }
            }}
          >
            {contentParts.map((part, index) => (
              <React.Fragment key={index}>
                {part.type === 'text' ? (
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    data-drop-kind="text"
                    data-text-index={index}
                    onFocus={(e) => syncTextSelectionFromDOM(e.currentTarget, index)}
                    onClick={(e) => syncTextSelectionFromDOM(e.currentTarget, index)}
                    onKeyUp={(e) => syncTextSelectionFromDOM(e.currentTarget, index)}
                    onMouseUp={(e) => syncTextSelectionFromDOM(e.currentTarget, index)}
                    onBlur={(e) => handleTextEdit(index, e.currentTarget.innerText)}
                    onKeyDown={(e) => handleTextKeyDown(e, index)}
                    onDragOver={(e) => handleTextDragOver(e, index)}
                    onDrop={handleDrop}
                    className="inline rounded px-0.5 outline-none focus:bg-slate-100"
                  >
                    {part.value}
                  </span>
                ) : part.type === 'bubble' ? (
                  <button
                    type="button"
                    draggable
                    data-drop-kind="boundary"
                    data-part-index={index}
                    data-replaceable="false"
                    onClick={() => {
                      setReplaceTargetIndex(index);
                      setSelectionTarget({ type: 'between', index });
                      setActiveCategory(part.category);
                    }}
                    onFocus={() => {
                      setReplaceTargetIndex(index);
                      setSelectionTarget({ type: 'between', index });
                    }}
                    onDragStart={(e) => handleBubbleDragStart(e, index, part)}
                    onDragEnd={handleDragEnd}
                    onTouchStart={(e) => startTouchDrag({ type: 'bubble', value: part.value, index, category: part.category }, e.touches[0])}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchCancel}
                    onKeyDown={(e) => handleBubbleKeyDown(e, index)}
                    onDragOver={(e) => handleInlineBoundaryDragOver(e, index)}
                    onDrop={handleDrop}
                    className={`drag-chip mx-1 inline-flex align-baseline rounded-full border items-center justify-center transition-all duration-150 ease-out shadow-sm overflow-hidden ${
                      isTouchDraggingBubble(index)
                        ? 'h-10 w-2.5 px-0 py-0 opacity-85 border-0 bg-blue-400 shadow-none'
                        : replaceTargetIndex === index
                        ? 'border-blue-500 bg-blue-600 text-white scale-105'
                        : 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400 hover:bg-blue-100'
                    } ${part.isNew ? 'bubble-pop' : ''}`}
                  >
                    <span className={`font-bold ${isTouchDraggingBubble(index) ? 'text-[0px]' : 'text-sm'}`}>
                      {part.value}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    data-drop-kind="boundary"
                    data-part-index={index}
                    data-replaceable="true"
                    onClick={() => {
                      setReplaceTargetIndex(index);
                      setSelectionTarget({ type: 'between', index });
                      setActiveCategory(part.category);
                    }}
                    onDragOver={(e) => handleInlineBoundaryDragOver(e, index, true)}
                    onDrop={handleDrop}
                    className={`drag-chip mx-1 inline-flex align-baseline px-3 py-0.5 rounded-full border-2 border-dashed items-center gap-1 transition-all ${
                      replaceTargetIndex === index
                        ? 'border-blue-500 bg-blue-50 text-blue-600 scale-105 shadow-sm'
                        : 'border-slate-300 bg-slate-50 text-slate-500 animate-pulse'
                    }`}
                  >
                    <PlusCircle size={14} />
                    <span className="text-sm font-bold">{part.value}</span>
                  </button>
                )}
              </React.Fragment>
            ))}
            {showFlowEndAnchor && (
              <span
                ref={flowEndRef}
                contentEditable
                suppressContentEditableWarning
                spellCheck={false}
                onFocus={syncFlowEndSelection}
                onClick={syncFlowEndSelection}
                onMouseUp={syncFlowEndSelection}
                onKeyUp={syncFlowEndSelection}
                onKeyDown={handleFlowEndKeyDown}
                onBlur={(e) => {
                  e.currentTarget.textContent = FLOW_END_MARKER;
                }}
                className="inline-block min-w-[0.7rem] align-baseline rounded outline-none text-transparent"
                style={{ caretColor: '#2563eb' }}
              >
                {FLOW_END_MARKER}
              </span>
            )}
          </div>

          <div className="mt-auto pt-6 flex justify-between items-center text-slate-300 pointer-events-none">
            <span className="text-[10px] font-bold tracking-widest uppercase">
              可直接拖曳或點選下方項目，插入到目前游標位置
            </span>
            <button onClick={() => window.location.reload()} className="pointer-events-auto hover:text-slate-500">
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl whitespace-nowrap transition-all font-bold text-sm shadow-sm ${
                activeCategory === cat.id
                  ? 'bg-slate-900 text-white scale-105'
                  : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {cat.icon}
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all"
          >
            儲存
          </button>
        </div>

        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${activeCategory ? 'h-72 opacity-100' : 'h-0 opacity-0'}`}>
          <div className="bg-slate-100/80 backdrop-blur-sm rounded-[2.5rem] p-5 h-full overflow-y-auto border border-slate-200 shadow-inner">
            {activeCategory && (
              <p className="mb-3 text-xs font-bold tracking-wide text-slate-500">
                點選可直接插入，拖曳可放到文本中的指定位置
              </p>
            )}
            {dragMode === 'touch' && dragPayload && (
              <p className="mb-3 text-xs font-bold tracking-wide text-blue-500">
                拖曳到文字上方時，會自動吸附到最近的詞界線
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 pb-4">
              {activeCategory &&
                itemsData[activeCategory].map((item, index) => (
                  <button
                    key={index}
                    type="button"
                    draggable
                    onClick={() => handleInsertValue(item)}
                    onDragStart={(e) => handleListItemDragStart(e, item)}
                    onDragEnd={handleDragEnd}
                    onTouchStart={(e) => startTouchDrag({ type: 'library-item', value: item, category: activeCategory }, e.touches[0])}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchCancel}
                    className={`drag-chip flex items-center justify-between bg-white hover:border-blue-500 hover:text-blue-600 rounded-2xl border border-transparent hover:shadow-md transition-all duration-150 ease-out group active:scale-95 shadow-sm cursor-grab active:cursor-grabbing overflow-hidden p-4 ${
                      isTouchDraggingListItem(item)
                        ? 'border-blue-200 bg-blue-50/80 opacity-45 scale-[0.98]'
                        : ''
                    }`}
                  >
                    <span className="font-bold text-sm text-slate-700 group-hover:text-blue-600 truncate">
                      {item}
                    </span>
                    <div className={`rounded-full bg-slate-50 flex items-center justify-center transition-colors ${
                      isTouchDraggingListItem(item)
                        ? 'w-6 h-6 opacity-0'
                        : 'w-6 h-6 group-hover:bg-blue-600 group-hover:text-white'
                    }`}>
                      <Check size={12} className="opacity-0 group-hover:opacity-100" />
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </main>

      {touchPreview && dragMode === 'touch' && (
        <div
          className="pointer-events-none fixed z-30 h-12 w-2.5 rounded-full bg-blue-500/90 shadow-[0_10px_30px_rgba(37,99,235,0.28)]"
          style={{
            left: `${touchPreview.x}px`,
            top: `${touchPreview.y - 6}px`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}

      <div className="h-24 bg-white border-t flex items-center justify-center gap-12 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] z-10">
        <button
          type="button"
          onClick={() => setActiveShortcut('record')}
          className={`flex flex-col items-center gap-1 transition-opacity ${
            activeShortcut === 'record' ? 'opacity-100 text-orange-500' : 'opacity-40 text-slate-500'
          }`}
        >
          <FileText size={20} />
          <span className="text-[9px] font-bold">護理紀錄</span>
        </button>

        <button className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white shadow-xl active:scale-90 transition-transform -mt-10 border-[6px] border-slate-50 relative group">
          <div className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-0 group-active:opacity-100" />
          <Mic size={28} className="relative z-10" />
        </button>

        <button
          type="button"
          onClick={() => setActiveShortcut('plan')}
          className={`flex flex-col items-center gap-1 transition-opacity ${
            activeShortcut === 'plan' ? 'opacity-100 text-blue-500' : 'opacity-40 text-slate-500'
          }`}
        >
          <ClipboardList size={20} />
          <span className="text-[9px] font-bold">護理計畫</span>
        </button>
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        [contenteditable]:empty:before {
          content: "\\FEFF";
        }
        .drag-chip {
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
          touch-action: none;
          -webkit-user-drag: element;
        }
        .bubble-pop {
          animation: bubble-expand 180ms ease-out;
          transform-origin: center;
        }
        @keyframes bubble-expand {
          0% {
            opacity: 0.55;
            transform: scaleX(0.2) scaleY(0.18);
          }
          100% {
            opacity: 1;
            transform: scaleX(1) scaleY(1);
          }
        }
      `}</style>
    </div>
  );
};

export default App;

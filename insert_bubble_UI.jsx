import React, { useState } from 'react';
import {
  Mic,
  RotateCcw,
  Users,
  ClipboardList,
  Activity,
  Pill,
  Check,
  PlusCircle,
  Sparkles,
} from 'lucide-react';

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
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
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

const App = () => {
  const [contentParts, setContentParts] = useState([
    { type: 'text', value: 'Patient is taking ' },
    { type: 'placeholder', value: 'medication', category: 'medication' },
    { type: 'text', value: ' 500mg, documented by ' },
    { type: 'placeholder', value: 'nurse', category: 'personnel' },
    { type: 'text', value: ' in the nursing note.' },
  ]);

  const [activeCategory, setActiveCategory] = useState(null);
  const [selectionTarget, setSelectionTarget] = useState(null);
  const [replaceTargetIndex, setReplaceTargetIndex] = useState(null);
  const [dragPayload, setDragPayload] = useState(null);
  const [isDraggingOverEditor, setIsDraggingOverEditor] = useState(false);

  const categories = [
    { id: 'personnel', label: 'Personnel', icon: <Users size={16} />, color: 'blue' },
    { id: 'medication', label: 'Medication', icon: <Pill size={16} />, color: 'emerald' },
    { id: 'terms', label: 'Terms', icon: <Activity size={16} />, color: 'purple' },
    { id: 'templates', label: 'Templates', icon: <ClipboardList size={16} />, color: 'orange' },
  ];

  const itemsData = {
    personnel: ['Wang RN', 'Chen RN', 'Lin RN', 'Chang RN', 'Lee RN'],
    medication: ['Acetaminophen', 'Morphine', 'Aspirin', 'Normal Saline', 'Insulin', 'Ketorolac'],
    terms: ['NPO', 'Foley', 'EKG', 'Vital Signs', 'Hyperglycemia', 'S/P'],
    templates: ['Shift Note', 'Medication Note', 'Pain Assessment', 'Nursing Summary', 'Vital Signs'],
  };

  const getCurrentSelectionTarget = (parts = contentParts) =>
    selectionTarget ?? { type: 'between', index: parts.length };

  const clearDragState = () => {
    setDragPayload(null);
    setIsDraggingOverEditor(false);
  };

  const setBetweenSelection = (index) => {
    setSelectionTarget({ type: 'between', index });
    setReplaceTargetIndex(null);
  };

  const setTextSelection = (index, offset) => {
    setSelectionTarget({ type: 'text', index, offset });
    setReplaceTargetIndex(null);
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
      return;
    }

    const rawOffset = getRangeOffsetWithinTarget(target, range);
    const snappedOffset = getNearestWordBoundary(target.innerText, rawOffset);
    setDOMCaretAtOffset(target, snappedOffset);
    setTextSelection(index, snappedOffset);
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

  const removePartAtIndex = (targetIndex) => {
    const nextParts = contentParts.filter((_, index) => index !== targetIndex);
    updateContentParts(nextParts, { type: 'between', index: Math.max(0, targetIndex - 1) });
  };

  const insertValueAtSelection = (
    value,
    forcedCategory = activeCategory,
    forcedReplaceIndex = replaceTargetIndex,
  ) => {
    const nextParts = [...contentParts];
    const replaceIndex = forcedReplaceIndex;
    const selection = getCurrentSelectionTarget(nextParts);
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

  const moveBubbleToSelection = (sourceIndex) => {
    const sourcePart = contentParts[sourceIndex];
    if (!sourcePart || sourcePart.type !== 'bubble') return;

    const nextParts = [...contentParts];
    const [movedBubble] = nextParts.splice(sourceIndex, 1);
    const adjustedTarget = adjustTargetAfterBubbleMove(getCurrentSelectionTarget(nextParts), sourceIndex);
    const insertedIndex = insertBubbleIntoParts(nextParts, { ...movedBubble, isNew: false }, adjustedTarget);

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

    if (e.key === 'Backspace' && caretOffset === 0 && previousPart?.type === 'bubble') {
      e.preventDefault();
      removePartAtIndex(index - 1);
      return;
    }

    if (e.key === 'Delete' && caretOffset === currentValueLength && nextPart?.type === 'bubble') {
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

  const handleListItemDragStart = (e, item) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', item);
    setDragPayload({ type: 'library-item', value: item });
  };

  const handleBubbleDragStart = (e, index, part) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', part.value);
    setDragPayload({ type: 'bubble', value: part.value, index, category: part.category });
  };

  const handleDragEnd = () => {
    clearDragState();
  };

  const handleEditorDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragPayload?.type === 'bubble' ? 'move' : 'copy';
    setSelectionTarget({ type: 'between', index: contentParts.length });
    setReplaceTargetIndex(null);
    setIsDraggingOverEditor(true);
  };

  const handleTextDragOver = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = dragPayload?.type === 'bubble' ? 'move' : 'copy';
    setCaretFromPoint(e.currentTarget, index, e.clientX, e.clientY);
    setIsDraggingOverEditor(true);
  };

  const handleInlineBoundaryDragOver = (e, index, allowReplace = false) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = dragPayload?.type === 'bubble' ? 'move' : 'copy';

    const rect = e.currentTarget.getBoundingClientRect();
    const shouldInsertAfter = e.clientX > rect.left + rect.width / 2;
    const boundaryIndex = index + (shouldInsertAfter ? 1 : 0);

    setSelectionTarget({ type: 'between', index: boundaryIndex });
    setReplaceTargetIndex(allowReplace && dragPayload?.type !== 'bubble' ? index : null);
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

    insertValueAtSelection(droppedValue);
  };

  const handleEditorDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDraggingOverEditor(false);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans max-w-md mx-auto border-x shadow-2xl overflow-hidden relative text-slate-800">
      <header className="px-5 py-4 flex justify-between items-center bg-white border-b z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-md">
            <Sparkles size={18} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 leading-none tracking-tight">Nursing Speech Assistant</h1>
            <p className="text-[10px] text-blue-500 font-bold uppercase mt-1 tracking-widest">AI Speech Assistant</p>
          </div>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all">
          Save
        </button>
      </header>

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        <div
          className={`flex-1 bg-white rounded-[2rem] p-6 shadow-sm border flex flex-col relative overflow-y-auto transition-colors ${
            isDraggingOverEditor ? 'border-blue-400 bg-blue-50/40' : 'border-slate-200'
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setBetweenSelection(contentParts.length);
            }
          }}
          onDragOver={handleEditorDragOver}
          onDragLeave={handleEditorDragLeave}
          onDrop={handleDrop}
        >
          <div className="leading-[2.2] text-lg font-medium text-slate-700 whitespace-pre-wrap break-words">
            {contentParts.map((part, index) => (
              <React.Fragment key={index}>
                {part.type === 'text' ? (
                  <span
                    contentEditable
                    suppressContentEditableWarning
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
                    onKeyDown={(e) => handleBubbleKeyDown(e, index)}
                    onDragOver={(e) => handleInlineBoundaryDragOver(e, index)}
                    onDrop={handleDrop}
                    className={`mx-1 inline-flex align-baseline px-3 py-0.5 rounded-full border items-center transition-all shadow-sm ${
                      replaceTargetIndex === index
                        ? 'border-blue-500 bg-blue-600 text-white scale-105'
                        : 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400 hover:bg-blue-100'
                    }`}
                  >
                    <span className="text-sm font-bold">{part.value}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setReplaceTargetIndex(index);
                      setSelectionTarget({ type: 'between', index });
                      setActiveCategory(part.category);
                    }}
                    onDragOver={(e) => handleInlineBoundaryDragOver(e, index, true)}
                    onDrop={handleDrop}
                    className={`mx-1 inline-flex align-baseline px-3 py-0.5 rounded-full border-2 border-dashed items-center gap-1 transition-all ${
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
          </div>

          <div className="mt-auto pt-6 flex justify-between items-center text-slate-300 pointer-events-none">
            <span className="text-[10px] font-bold tracking-widest uppercase">
              Drag or click an item to insert it at the current caret position
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

        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${activeCategory ? 'h-64 opacity-100' : 'h-0 opacity-0'}`}>
          <div className="bg-slate-100/80 backdrop-blur-sm rounded-[2.5rem] p-5 h-full overflow-y-auto border border-slate-200 shadow-inner">
            {dragPayload && (
              <p className="mb-3 text-xs font-bold tracking-wide text-blue-500">
                Dragging over text will snap the caret to the nearest word boundary
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 pb-4">
              {activeCategory &&
                itemsData[activeCategory].map((item, index) => (
                  <button
                    key={index}
                    onClick={() => handleInsertValue(item)}
                    draggable
                    onDragStart={(e) => handleListItemDragStart(e, item)}
                    onDragEnd={handleDragEnd}
                    className="flex items-center justify-between bg-white hover:border-blue-500 hover:text-blue-600 p-4 rounded-2xl border border-transparent hover:shadow-md transition-all group active:scale-95 shadow-sm"
                  >
                    <span className="text-sm font-bold text-slate-700 group-hover:text-blue-600 truncate">{item}</span>
                    <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <Check size={12} className="opacity-0 group-hover:opacity-100" />
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </main>

      <div className="h-24 bg-white border-t flex items-center justify-center gap-12 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] z-10">
        <button
          onClick={() => setActiveCategory('templates')}
          className={`flex flex-col items-center gap-1 transition-opacity ${activeCategory === 'templates' ? 'opacity-100 text-orange-500' : 'opacity-40 text-slate-500'}`}
        >
          <ClipboardList size={20} />
          <span className="text-[9px] font-bold uppercase">Templates</span>
        </button>

        <button className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white shadow-xl active:scale-90 transition-transform -mt-10 border-[6px] border-slate-50 relative group">
          <div className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-0 group-active:opacity-100" />
          <Mic size={28} className="relative z-10" />
        </button>

        <button
          onClick={() => setActiveCategory('personnel')}
          className={`flex flex-col items-center gap-1 transition-opacity ${activeCategory === 'personnel' ? 'opacity-100 text-blue-500' : 'opacity-40 text-slate-500'}`}
        >
          <Users size={20} />
          <span className="text-[9px] font-bold uppercase">Staff</span>
        </button>
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        [contenteditable]:empty:before {
          content: "\\FEFF";
        }
      `}</style>
    </div>
  );
};

export default App;

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

const App = () => {
  const [contentParts, setContentParts] = useState([
    { type: 'text', value: '請給予 ' },
    { type: 'placeholder', value: '藥物名稱', category: 'medication' },
    { type: 'text', value: ' 500mg，並通知 ' },
    { type: 'placeholder', value: '護理人員', category: 'personnel' },
    { type: 'text', value: ' 持續追蹤病況。' },
  ]);

  const [activeCategory, setActiveCategory] = useState(null);
  const [insertionIndex, setInsertionIndex] = useState(null);
  const [replaceTargetIndex, setReplaceTargetIndex] = useState(null);
  const [dragPayload, setDragPayload] = useState(null);
  const [dropTargetIndex, setDropTargetIndex] = useState(null);
  const [isDraggingOverEditor, setIsDraggingOverEditor] = useState(false);

  const categories = [
    { id: 'personnel', label: '人員', icon: <Users size={16} />, color: 'blue' },
    { id: 'medication', label: '藥物', icon: <Pill size={16} />, color: 'emerald' },
    { id: 'terms', label: '醫療術語', icon: <Activity size={16} />, color: 'purple' },
    { id: 'templates', label: '常用模板', icon: <ClipboardList size={16} />, color: 'orange' },
  ];

  const itemsData = {
    personnel: ['王小明護理師', '陳怡君護理師', '值班醫師', '張主任', '藥師'],
    medication: ['Acetaminophen', 'Morphine', 'Aspirin', 'Normal Saline', 'Insulin', 'Ketorolac'],
    terms: ['NPO', 'Foley', 'EKG', 'Vital Signs', 'Hyperglycemia', 'S/P'],
    templates: ['給藥提醒', '疼痛評估', '交班紀錄', '生命徵象追蹤', '異常事件通報'],
  };

  const removePartAtIndex = (targetIndex) => {
    setContentParts((currentParts) => currentParts.filter((_, index) => index !== targetIndex));
    setActiveCategory(null);
    setInsertionIndex(Math.max(0, targetIndex - 1));
    setReplaceTargetIndex(null);
    setDropTargetIndex(null);
    setIsDraggingOverEditor(false);
  };

  const moveBubbleToIndex = (sourceIndex, targetSlot) => {
    const sourcePart = contentParts[sourceIndex];
    if (!sourcePart || sourcePart.type !== 'bubble') return;

    const newParts = [...contentParts];
    const [movedBubble] = newParts.splice(sourceIndex, 1);
    const adjustedTargetSlot = sourceIndex < targetSlot ? targetSlot - 1 : targetSlot;
    const safeTargetSlot = Math.max(0, Math.min(adjustedTargetSlot, newParts.length));

    newParts.splice(safeTargetSlot, 0, { ...movedBubble, isNew: false });
    setContentParts(newParts);
    setInsertionIndex(safeTargetSlot);
    setReplaceTargetIndex(null);
    setActiveCategory(null);
    setDropTargetIndex(null);
    setIsDraggingOverEditor(false);
    setDragPayload(null);
  };

  const insertValueAtIndex = (
    value,
    preferredIndex = insertionIndex,
    forcedCategory = activeCategory,
    forcedReplaceIndex = replaceTargetIndex,
  ) => {
    let targetSlot = preferredIndex !== null ? preferredIndex : contentParts.length;
    if (targetSlot < 0) targetSlot = 0;

    const newParts = [...contentParts];
    const replaceIndex = forcedReplaceIndex;
    const targetPart = replaceIndex !== null ? newParts[replaceIndex] : newParts[targetSlot];
    const bubbleCategory = forcedCategory || targetPart?.category || null;
    let insertedIndex = targetSlot;
    const newBubblePart = { type: 'bubble', value, category: bubbleCategory, isNew: true };

    if (replaceIndex !== null && targetPart && (targetPart.type === 'placeholder' || targetPart.type === 'bubble')) {
      newParts[replaceIndex] = { ...newBubblePart, category: bubbleCategory };
      insertedIndex = replaceIndex;
    } else if (targetSlot >= newParts.length) {
      newParts.push(newBubblePart);
      insertedIndex = newParts.length - 1;
    } else {
      newParts.splice(targetSlot, 0, { ...newBubblePart, category: bubbleCategory });
      insertedIndex = targetSlot;
    }

    setContentParts(newParts);
    setActiveCategory(null);
    setInsertionIndex(insertedIndex);
    setReplaceTargetIndex(null);
    setDragPayload(null);
    setDropTargetIndex(null);
    setIsDraggingOverEditor(false);
  };

  const handleInsertValue = (value) => {
    insertValueAtIndex(value);
  };

  const handleTextEdit = (index, newValue) => {
    const newParts = [...contentParts];
    newParts[index].value = newValue;
    setContentParts(newParts);
  };

  const handleCaretFocus = (slotIndex) => {
    setInsertionIndex(slotIndex);
    setReplaceTargetIndex(null);
  };

  const getCaretOffset = (target) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !target.contains(selection.anchorNode)) {
      return null;
    }

    return selection.getRangeAt(0).startOffset;
  };

  const handleTextKeyDown = (e, index) => {
    const caretOffset = getCaretOffset(e.currentTarget);
    if (caretOffset === null) return;

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
    }
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
    setDragPayload(null);
    setDropTargetIndex(null);
    setIsDraggingOverEditor(false);
  };

  const handleDragOverTarget = (e, targetIndex) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setInsertionIndex(targetIndex);
    setReplaceTargetIndex(null);
    setDropTargetIndex(targetIndex);
    setIsDraggingOverEditor(true);
  };

  const handleDrop = (e, targetIndex = contentParts.length, replaceIndex = null) => {
    e.preventDefault();
    e.stopPropagation();

    if (dragPayload?.type === 'bubble') {
      moveBubbleToIndex(dragPayload.index, targetIndex);
      return;
    }

    const droppedValue = e.dataTransfer.getData('text/plain') || dragPayload?.value;
    if (!droppedValue) return;

    insertValueAtIndex(droppedValue, targetIndex, activeCategory, replaceIndex);
  };

  const handleEditorDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDraggingOverEditor(false);
    setDropTargetIndex(null);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans max-w-md mx-auto border-x shadow-2xl overflow-hidden relative text-slate-800">
      <header className="px-5 py-4 flex justify-between items-center bg-white border-b z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-md">
            <Sparkles size={18} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 leading-none tracking-tight">護理記錄助手</h1>
            <p className="text-[10px] text-blue-500 font-bold uppercase mt-1 tracking-widest">AI Speech Assistant</p>
          </div>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all">
          送出
        </button>
      </header>

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        <div
          className={`flex-1 bg-white rounded-[2rem] p-6 shadow-sm border flex flex-col relative overflow-y-auto transition-colors ${
            isDraggingOverEditor ? 'border-blue-400 bg-blue-50/40' : 'border-slate-200'
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setInsertionIndex(contentParts.length);
            }
          }}
          onDragOver={(e) => handleDragOverTarget(e, contentParts.length)}
          onDragLeave={handleEditorDragLeave}
          onDrop={(e) => handleDrop(e)}
        >
          <div className="leading-[2.2] text-lg font-medium text-slate-700 whitespace-pre-wrap break-words">
            <span
              contentEditable
              suppressContentEditableWarning
              onFocus={() => handleCaretFocus(0)}
              onMouseDown={() => handleCaretFocus(0)}
              onDragOver={(e) => handleDragOverTarget(e, 0)}
              onDrop={(e) => handleDrop(e, 0)}
              className={`inline-block w-[2px] align-baseline outline-none ${
                insertionIndex === 0 && replaceTargetIndex === null ? 'bg-blue-400' : 'bg-transparent'
              }`}
            >
              {'\u200b'}
            </span>
            {contentParts.map((part, index) => (
              <React.Fragment key={index}>
                {part.type === 'text' ? (
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onFocus={() => {
                      setInsertionIndex(index);
                      setReplaceTargetIndex(null);
                    }}
                    onBlur={(e) => handleTextEdit(index, e.target.innerText)}
                    onKeyDown={(e) => handleTextKeyDown(e, index)}
                    onDragOver={(e) => handleDragOverTarget(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    className={`outline-none transition-all rounded px-0.5 min-w-[4px] inline
                      ${part.isNew ? 'text-blue-600 font-bold bg-blue-50' : 'focus:bg-slate-100'}
                      ${insertionIndex === index && !part.isNew ? 'ring-2 ring-blue-100 bg-slate-50' : ''}
                      ${dropTargetIndex === index ? 'ring-2 ring-blue-300 bg-blue-50' : ''}
                    `}
                  >
                    {part.value}
                  </span>
                ) : part.type === 'bubble' ? (
                  <>
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onFocus={() => handleCaretFocus(index)}
                      onMouseDown={() => handleCaretFocus(index)}
                      onDragOver={(e) => handleDragOverTarget(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      className={`inline-block w-[2px] align-baseline outline-none ${
                        insertionIndex === index && replaceTargetIndex === null ? 'bg-blue-400' : 'bg-transparent'
                      }`}
                    >
                      {'\u200b'}
                    </span>
                    <button
                      type="button"
                      draggable
                      onClick={() => {
                        setInsertionIndex(index);
                        setReplaceTargetIndex(index);
                        setActiveCategory(part.category);
                      }}
                      onFocus={() => {
                        setInsertionIndex(index);
                        setReplaceTargetIndex(index);
                      }}
                      onDragStart={(e) => handleBubbleDragStart(e, index, part)}
                      onDragEnd={handleDragEnd}
                      onKeyDown={(e) => handleBubbleKeyDown(e, index)}
                      onDragOver={(e) => handleDragOverTarget(e, index)}
                      onDrop={(e) => handleDrop(e, index, index)}
                      className={`mx-1 inline-flex align-baseline px-3 py-0.5 rounded-full border items-center gap-1 transition-all shadow-sm ${
                        dropTargetIndex === index
                          ? 'border-blue-600 bg-blue-100 text-blue-700 scale-105'
                          : replaceTargetIndex === index
                          ? 'border-blue-500 bg-blue-600 text-white scale-105'
                          : 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400 hover:bg-blue-100'
                      }`}
                    >
                      <span className="text-sm font-bold">{part.value}</span>
                    </button>
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onFocus={() => handleCaretFocus(index + 1)}
                      onMouseDown={() => handleCaretFocus(index + 1)}
                      onDragOver={(e) => handleDragOverTarget(e, index + 1)}
                      onDrop={(e) => handleDrop(e, index + 1)}
                      className={`inline-block w-[2px] align-baseline outline-none ${
                        insertionIndex === index + 1 && replaceTargetIndex === null ? 'bg-blue-400' : 'bg-transparent'
                      }`}
                    >
                      {'\u200b'}
                    </span>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setInsertionIndex(index);
                      setReplaceTargetIndex(index);
                      setActiveCategory(part.category);
                    }}
                    onDragOver={(e) => handleDragOverTarget(e, index)}
                    onDrop={(e) => handleDrop(e, index, index)}
                    className={`mx-1 inline-flex align-baseline px-3 py-0.5 rounded-full border-2 border-dashed items-center gap-1 transition-all ${
                      dropTargetIndex === index
                        ? 'border-blue-600 bg-blue-100 text-blue-700 scale-105 shadow-sm'
                        : replaceTargetIndex === index
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
            <span
              contentEditable
              suppressContentEditableWarning
              onFocus={() => handleCaretFocus(contentParts.length)}
              onMouseDown={() => handleCaretFocus(contentParts.length)}
              onDragOver={(e) => handleDragOverTarget(e, contentParts.length)}
              onDrop={(e) => handleDrop(e, contentParts.length)}
              className={`inline-block w-[2px] align-baseline outline-none ${
                insertionIndex === contentParts.length && replaceTargetIndex === null ? 'bg-blue-400' : 'bg-transparent'
              }`}
            >
              {'\u200b'}
            </span>
          </div>

          <div className="mt-auto pt-6 flex justify-between items-center text-slate-300 pointer-events-none">
            <span className="text-[10px] font-bold tracking-widest uppercase">
              點選欄位或下方分類，快速插入常用內容
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
                拖曳項目到上方文字區即可插入
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
          <span className="text-[9px] font-bold uppercase">模板</span>
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
          <span className="text-[9px] font-bold uppercase">人員</span>
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

import React, { useRef, useState } from 'react';
import {
  Mic,
  RotateCcw,
  Users,
  ClipboardList,
  Pill,
  Check,
  X,
  PlusCircle,
  Sparkles,
  FileText,
  User,
  ArrowRightLeft,
  Settings,
  BookText,
  ChevronDown,
  ChevronUp,
  Search,
  Upload,
  Undo2,
} from 'lucide-react';

const TOUCH_DRAG_THRESHOLD = 8;
const isInlineChip = (part) => part?.type === 'bubble' || part?.type === 'placeholder';
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const getPartLinearLength = (part) => (part?.type === 'text' ? part.value.length : 1);

const createDropLocation = (selectionTarget, replaceTargetIndex = null) => ({
  selectionTarget,
  replaceTargetIndex,
});

const serializeDropLocation = (location) => JSON.stringify(location);

const parseDropLocation = (value) => {
  if (!value) {
    return createDropLocation(null, null);
  }

  try {
    const parsed = JSON.parse(value);
    return createDropLocation(
      parsed?.selectionTarget ?? null,
      parsed?.replaceTargetIndex ?? null,
    );
  } catch {
    return createDropLocation(null, null);
  }
};

const withSerializedDropLocations = (part, dropBefore, dropAfter) => ({
  ...part,
  dropBefore,
  dropAfter,
  dropBeforeAttr: serializeDropLocation(dropBefore),
  dropAfterAttr: serializeDropLocation(dropAfter),
});

const createRenderablePart = (part, index) => {
  const replaceTargetIndex = part.type === 'placeholder' ? index : null;
  const dropBefore = createDropLocation({ type: 'between', index }, replaceTargetIndex);
  const dropAfter = createDropLocation({ type: 'between', index: index + 1 }, replaceTargetIndex);

  return withSerializedDropLocations(
    {
      ...part,
      isPreview: false,
      key: `part-${index}`,
      sourceIndex: index,
      textBaseOffset: 0,
      fullTextValue: part.type === 'text' ? part.value : null,
    },
    dropBefore,
    dropAfter,
  );
};

const adjustTargetAfterPartRemoval = (target, sourceIndex, fallbackLength) => {
  if (!target) return { type: 'between', index: fallbackLength };

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

const insertPreviewBubbleIntoRenderableParts = (parts, bubblePart, target) => {
  const previewDropLocation = createDropLocation(
    bubblePart.previewSelectionTarget,
    bubblePart.previewReplaceTargetIndex,
  );
  const previewBubble = withSerializedDropLocations(bubblePart, previewDropLocation, previewDropLocation);

  if (target?.type === 'text') {
    const textPart = parts[target.index];
    if (textPart?.type === 'text') {
      const fullTextValue = textPart.fullTextValue ?? textPart.value;
      const safeOffset = clamp(target.offset, 0, fullTextValue.length);
      const beforeText = fullTextValue.slice(0, safeOffset);
      const afterText = fullTextValue.slice(safeOffset);
      const replacementParts = [];

      if (beforeText) {
        replacementParts.push({
          ...textPart,
          key: `${textPart.key}-before-${safeOffset}`,
          value: beforeText,
          textBaseOffset: 0,
          fullTextValue,
        });
      }

      replacementParts.push(previewBubble);

      if (afterText) {
        replacementParts.push({
          ...textPart,
          key: `${textPart.key}-after-${safeOffset}`,
          value: afterText,
          textBaseOffset: safeOffset,
          fullTextValue,
        });
      }

      parts.splice(target.index, 1, ...replacementParts);
      return;
    }
  }

  const insertIndex = clamp(target?.index ?? parts.length, 0, parts.length);
  parts.splice(insertIndex, 0, previewBubble);
};

const buildRenderableParts = (parts, preview = null) => {
  const renderableParts = parts.map((part, index) => createRenderablePart(part, index));
  if (!preview?.payload) return renderableParts;

  let visualTarget = preview.selectionTarget ?? { type: 'between', index: parts.length };
  if (preview.payload.type === 'bubble') {
    const sourceIndex = renderableParts.findIndex((part) => part.sourceIndex === preview.payload.index);
    if (sourceIndex === -1) return renderableParts;

    renderableParts.splice(sourceIndex, 1);
    visualTarget = adjustTargetAfterPartRemoval(visualTarget, preview.payload.index, parts.length);
  }

  const previewBubbleBase = {
    type: 'bubble',
    value: preview.payload.value,
    category: preview.payload.category ?? null,
    isNew: false,
    isPreview: true,
    key: `preview-${preview.payload.type}-${preview.payload.index ?? preview.payload.value}`,
    sourceIndex: preview.payload.type === 'bubble' ? preview.payload.index : null,
    previewSelectionTarget: preview.selectionTarget,
    previewReplaceTargetIndex: preview.replaceTargetIndex,
  };

  if (preview.replaceTargetIndex !== null && preview.payload.type !== 'bubble') {
    const replaceIndex = renderableParts.findIndex(
      (part) => part.sourceIndex === preview.replaceTargetIndex,
    );

    if (replaceIndex !== -1) {
      const previewDropLocation = createDropLocation(
        preview.selectionTarget,
        preview.replaceTargetIndex,
      );

      renderableParts.splice(
        replaceIndex,
        1,
        withSerializedDropLocations(previewBubbleBase, previewDropLocation, previewDropLocation),
      );
      return renderableParts;
    }
  }

  insertPreviewBubbleIntoRenderableParts(renderableParts, previewBubbleBase, visualTarget);
  return renderableParts;
};

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

const nursingTemplates = [
  {
    id: 'admission-care',
    title: '入院與評估',
    items: [
      {
        id: 'admission-initial',
        title: '入院初評',
        content:
          '個案意識清楚，生命徵象穩定。已完成入院環境介紹與設備說明，提醒床欄使用及呼叫鈴位置，並進行跌倒風險與皮膚完整性評估。',
      },
      {
        id: 'admission-pain',
        title: '疼痛評估',
        content:
          '個案主訴疼痛指數四分，部位位於術後傷口周圍，已協助採舒適臥位並依醫囑處置，後續持續追蹤疼痛變化與緩解情形。',
      },
    ],
  },
  {
    id: 'shift-handoff',
    title: '交班與觀察',
    items: [
      {
        id: 'shift-routine',
        title: '一般交班',
        content:
          '本班觀察個案呼吸平順，膚色無明顯發紺，主訴不適已處理並持續追蹤。管路固定完整、引流量已紀錄，後續請持續監測生命徵象與症狀變化。',
      },
      {
        id: 'shift-sleep',
        title: '夜班睡眠觀察',
        content:
          '夜班期間個案可間歇入睡，呼吸規則，未訴明顯不適。已協助維持病室安靜與舒適環境，持續觀察夜間休息品質。',
      },
    ],
  },
  {
    id: 'medication-education',
    title: '給藥與衛教',
    items: [
      {
        id: 'medication-admin',
        title: '給藥紀錄',
        content:
          '依醫囑給予藥物，給藥前完成病人身分與藥物核對，給藥後未訴立即不適，已衛教藥物作用與可能副作用，請持續觀察反應。',
      },
      {
        id: 'medication-teach',
        title: '用藥衛教',
        content:
          '已向個案說明藥物服用時間、可能副作用及注意事項，個案可口述重點內容，表示理解並願意配合治療計畫。',
      },
    ],
  },
  {
    id: 'discharge-planning',
    title: '出院準備',
    items: [
      {
        id: 'discharge-teach',
        title: '出院衛教',
        content:
          '已向個案及家屬說明返家後用藥方式、飲食注意事項、傷口照護與異常警訊，並提醒依約返診；個案及家屬表示了解。',
      },
      {
        id: 'discharge-followup',
        title: '返家追蹤提醒',
        content:
          '已提醒個案依門診時間返診，若出現發燒、傷口紅腫滲液或症狀加劇應儘速就醫，並鼓勵家屬共同協助觀察。',
      },
    ],
  },
];

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
  const [activeShortcut, setActiveShortcut] = useState('record');
  const [isTemplatePanelOpen, setIsTemplatePanelOpen] = useState(false);
  const [isQuickInsertPanelOpen, setIsQuickInsertPanelOpen] = useState(false);
  const [footerPanelMode, setFooterPanelMode] = useState('templates');
  const [expandedTemplateGroupId, setExpandedTemplateGroupId] = useState(null);
  const [expandedTemplateId, setExpandedTemplateId] = useState(null);
  const [templateSearchTerm, setTemplateSearchTerm] = useState('');
  const [itemsData] = useState(() => createItemsData());

  const editorRef = useRef(null);
  const flowRef = useRef(null);
  const flowEndRef = useRef(null);
  const touchDragRef = useRef(null);
  const transparentDragImageRef = useRef(null);
  const suppressClickAfterSelectionRef = useRef(false);

  const getTotalLinearLength = (parts = contentParts) =>
    parts.reduce((total, part) => total + getPartLinearLength(part), 0);

  const getPartLinearStart = (index, parts = contentParts) => {
    let total = 0;
    for (let currentIndex = 0; currentIndex < index; currentIndex += 1) {
      total += getPartLinearLength(parts[currentIndex]);
    }
    return total;
  };

  const getSelectionTargetFromLinearOffset = (parts, offset) => {
    const clampedOffset = clamp(offset, 0, getTotalLinearLength(parts));
    let currentOffset = 0;

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const partLength = getPartLinearLength(part);
      const partStart = currentOffset;
      const partEnd = partStart + partLength;

      if (part.type === 'text' && clampedOffset >= partStart && clampedOffset <= partEnd) {
        return { type: 'text', index, offset: clampedOffset - partStart };
      }

      if (clampedOffset === partStart) {
        return { type: 'between', index };
      }

      currentOffset = partEnd;
    }

    return { type: 'between', index: parts.length };
  };

  const hasExpandedDOMSelection = () => {
    const selection = window.getSelection();
    return Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed);
  };

  const getNodeLinearLength = (node) => {
    if (!node) return 0;

    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.length ?? 0;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return 0;
    }

    const partIndex = Number(node.dataset.partIndex);
    const partType = node.dataset.partType;

    if (Number.isNaN(partIndex) || !partType) {
      return node.textContent?.length ?? 0;
    }

    if (partType === 'text') {
      return node.textContent?.length ?? 0;
    }

    return 1;
  };

  const getLinearOffsetFromDOMPosition = (container, offset, boundaryType = 'start') => {
    const flow = flowRef.current;
    if (!flow || !container) return null;

    if (container === flow) {
      let linearOffset = 0;
      for (let childIndex = 0; childIndex < offset; childIndex += 1) {
        linearOffset += getNodeLinearLength(flow.childNodes[childIndex]);
      }
      return linearOffset;
    }

    const element =
      container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
    const partElement = element?.closest?.('[data-part-index]');

    if (!partElement || !flow.contains(partElement)) {
      return null;
    }

    const index = Number(partElement.dataset.partIndex);
    const partType = partElement.dataset.partType;
    const partStart = getPartLinearStart(index);

    if (partType === 'text') {
      const measurementRange = document.createRange();
      measurementRange.selectNodeContents(partElement);
      measurementRange.setEnd(container, offset);

      return clamp(
        partStart + measurementRange.toString().length,
        partStart,
        partStart + (partElement.textContent?.length ?? 0),
      );
    }

    return boundaryType === 'start'
      ? partStart
      : partStart + getPartLinearLength(contentParts[index]);
  };

  const deleteRangeFromParts = (parts, startOffset, endOffset) => {
    const rangeStart = clamp(Math.min(startOffset, endOffset), 0, getTotalLinearLength(parts));
    const rangeEnd = clamp(Math.max(startOffset, endOffset), 0, getTotalLinearLength(parts));

    if (rangeStart === rangeEnd) {
      return {
        nextParts: parts,
        nextSelection: getSelectionTargetFromLinearOffset(parts, rangeStart),
      };
    }

    let currentOffset = 0;
    const nextParts = [];

    parts.forEach((part) => {
      const partLength = getPartLinearLength(part);
      const partStart = currentOffset;
      const partEnd = partStart + partLength;

      if (rangeEnd <= partStart || rangeStart >= partEnd) {
        nextParts.push(part);
      } else if (part.type === 'text') {
        const localStart = clamp(rangeStart - partStart, 0, part.value.length);
        const localEnd = clamp(rangeEnd - partStart, 0, part.value.length);
        const nextValue = `${part.value.slice(0, localStart)}${part.value.slice(localEnd)}`;

        if (nextValue) {
          nextParts.push({ ...part, value: nextValue });
        }
      }

      currentOffset = partEnd;
    });

    const normalizedParts = normalizeParts(nextParts);
    return {
      nextParts: normalizedParts,
      nextSelection: getSelectionTargetFromLinearOffset(normalizedParts, rangeStart),
    };
  };

  const serializeRangeToPlainText = (parts, startOffset, endOffset) => {
    const rangeStart = clamp(Math.min(startOffset, endOffset), 0, getTotalLinearLength(parts));
    const rangeEnd = clamp(Math.max(startOffset, endOffset), 0, getTotalLinearLength(parts));

    let currentOffset = 0;
    let result = '';

    parts.forEach((part) => {
      const partLength = getPartLinearLength(part);
      const partStart = currentOffset;
      const partEnd = partStart + partLength;

      if (rangeEnd <= partStart || rangeStart >= partEnd) {
        currentOffset = partEnd;
        return;
      }

      if (part.type === 'text') {
        const localStart = clamp(rangeStart - partStart, 0, part.value.length);
        const localEnd = clamp(rangeEnd - partStart, 0, part.value.length);
        result += part.value.slice(localStart, localEnd);
      } else {
        result += part.value;
      }

      currentOffset = partEnd;
    });

    return result;
  };

  const insertTextIntoParts = (parts, text, target) => {
    if (!text) return;

    if (target?.type === 'text') {
      const textPart = parts[target.index];
      if (textPart?.type === 'text') {
        const safeOffset = clamp(target.offset, 0, textPart.value.length);
        const beforeText = textPart.value.slice(0, safeOffset);
        const afterText = textPart.value.slice(safeOffset);
        const replacementParts = [];

        if (beforeText) replacementParts.push({ type: 'text', value: beforeText });
        replacementParts.push({ type: 'text', value: text });
        if (afterText) replacementParts.push({ type: 'text', value: afterText });

        parts.splice(target.index, 1, ...replacementParts);
        return;
      }
    }

    const insertIndex = clamp(target?.index ?? parts.length, 0, parts.length);
    parts.splice(insertIndex, 0, { type: 'text', value: text });
  };

  const getLinearRangeFromSelection = (selection) => {
    const flow = flowRef.current;
    if (!flow || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }

    const range = selection.getRangeAt(0);
    if (!flow.contains(range.commonAncestorContainer)) {
      return null;
    }

    const start = getLinearOffsetFromDOMPosition(
      range.startContainer,
      range.startOffset,
      'start',
    );
    const end = getLinearOffsetFromDOMPosition(range.endContainer, range.endOffset, 'end');

    if (start === null || end === null || start === end) {
      return null;
    }

    return { start: Math.min(start, end), end: Math.max(start, end) };
  };

  const categories = [
    { id: 'physician', label: '醫師', icon: <Users size={16} /> },
    { id: 'nursePractitioner', label: '專科護理師', icon: <ClipboardList size={16} /> },
    { id: 'medication', label: '用藥', icon: <Pill size={16} /> },
  ];

  const filteredTemplates = nursingTemplates
    .map((group) => {
      const keyword = templateSearchTerm.trim().toLowerCase();
      if (!keyword) return group;

      const matchedItems = group.items.filter(
        (item) =>
          item.title.toLowerCase().includes(keyword)
          || item.content.toLowerCase().includes(keyword),
      );

      if (group.title.toLowerCase().includes(keyword)) {
        return group;
      }

      if (matchedItems.length === 0) {
        return null;
      }

      return {
        ...group,
        items: matchedItems,
      };
    })
    .filter(Boolean);

  const openFooterPanel = (mode) => {
    setFooterPanelMode(mode);
    setIsTemplatePanelOpen(true);

    if (mode === 'quickInsert' && !activeCategory) {
      setActiveCategory('physician');
    }
  };

  const getTransparentDragImage = () => {
    if (transparentDragImageRef.current) return transparentDragImageRef.current;

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    transparentDragImageRef.current = canvas;
    return canvas;
  };

  const getCurrentSelectionTarget = (parts = contentParts, target = selectionTarget) =>
    target ?? { type: 'between', index: parts.length };

  const clearVisualIndicator = () => {
    setCaretIndicator(null);
  };

  const clearDragState = () => {
    setDragPayload(null);
    setDragMode(null);
    setIsDraggingOverEditor(false);
    clearVisualIndicator();
  };

  const suppressPostSelectionClick = () => {
    suppressClickAfterSelectionRef.current = true;
    window.setTimeout(() => {
      suppressClickAfterSelectionRef.current = false;
    }, 0);
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
    const flow = flowRef.current;
    const selection = window.getSelection();
    if (!selection) return;

    if (!anchor) {
      if (flow) {
        flow.focus();
        const range = document.createRange();
        range.selectNodeContents(flow);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
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

  const setCaretFromPoint = (target, index, x, y, options = {}) => {
    const baseOffset = options.baseOffset ?? 0;
    const fullTextValue = options.fullTextValue ?? target.innerText;
    const range = getCaretRangeFromPoint(x, y);

    if (!range || !target.contains(range.startContainer)) {
      const resolvedOffset = clamp(
        baseOffset + target.innerText.length,
        0,
        fullTextValue.length,
      );
      const localOffset = clamp(resolvedOffset - baseOffset, 0, target.innerText.length);
      setDOMCaretAtOffset(target, localOffset);
      setTextSelection(index, resolvedOffset);
      return { type: 'text', index, offset: resolvedOffset };
    }

    const resolvedOffset = clamp(
      baseOffset + getRangeOffsetWithinTarget(target, range),
      0,
      fullTextValue.length,
    );
    const localOffset = clamp(resolvedOffset - baseOffset, 0, target.innerText.length);
    setDOMCaretAtOffset(target, localOffset);
    setTextSelection(index, resolvedOffset);
    return { type: 'text', index, offset: resolvedOffset };
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
    return adjustTargetAfterPartRemoval(target, sourceIndex, contentParts.length);
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
    setIsQuickInsertPanelOpen(false);
  };

  const selectBubbleForReplacement = (index, category) => {
    setReplaceTargetIndex(index);
    setSelectionTarget({ type: 'between', index });
    setActiveCategory(category ?? null);
    editorRef.current?.focus({ preventScroll: true });
  };

  const handleBubbleKeyDown = (e, index) => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;

    e.preventDefault();
    removePartAtIndex(index);
  };

  const parseContentPartsFromDOM = () => {
    const flow = flowRef.current;
    if (!flow) return contentParts;

    const nextParts = [];
    const pushTextPart = (value) => {
      if (!value) return;

      const previousPart = nextParts[nextParts.length - 1];
      if (previousPart?.type === 'text') {
        previousPart.value += value;
      } else {
        nextParts.push({ type: 'text', value });
      }
    };

    flow.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        pushTextPart(node.textContent ?? '');
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const partType = node.dataset.partType;
      if (partType === 'bubble' || partType === 'placeholder') {
        nextParts.push({
          type: partType,
          value: node.dataset.partValue ?? '',
          category: node.dataset.partCategory || null,
        });
        return;
      }

      pushTextPart(node.textContent ?? '');
    });

    return normalizeParts(nextParts);
  };

  const syncEditorSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !flowRef.current) {
      clearVisualIndicator();
      return;
    }

    const range = selection.getRangeAt(0);
    if (!selection.isCollapsed) {
      clearVisualIndicator();
      setReplaceTargetIndex(null);
      return;
    }

    if (!flowRef.current.contains(range.startContainer)) {
      clearVisualIndicator();
      return;
    }

    const linearOffset = getLinearOffsetFromDOMPosition(
      range.startContainer,
      range.startOffset,
      'start',
    );

    if (linearOffset === null) {
      clearVisualIndicator();
      return;
    }

    setSelectionTarget(getSelectionTargetFromLinearOffset(contentParts, linearOffset));
    setReplaceTargetIndex(null);
    clearVisualIndicator();
  };

  const handleFlowMouseUp = () => {
    if (hasExpandedDOMSelection()) {
      suppressPostSelectionClick();
      clearVisualIndicator();
      return;
    }

    syncEditorSelection();
  };

  const getCollapsedSelectionState = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed || !flowRef.current) {
      return null;
    }

    if (!flowRef.current.contains(selection.anchorNode)) {
      return null;
    }

    const linearOffset = getLinearOffsetFromDOMPosition(
      selection.anchorNode,
      selection.anchorOffset,
      'start',
    );

    if (linearOffset === null) {
      return null;
    }

    return {
      linearOffset,
      target: getSelectionTargetFromLinearOffset(contentParts, linearOffset),
    };
  };

  const handleFlowInput = () => {
    const selection = window.getSelection();
    const linearOffset =
      selection && selection.rangeCount > 0 && selection.isCollapsed
        ? getLinearOffsetFromDOMPosition(selection.anchorNode, selection.anchorOffset, 'start')
        : null;

    const nextParts = parseContentPartsFromDOM();
    setContentParts(nextParts);
    setReplaceTargetIndex(null);

    if (linearOffset !== null) {
      setSelectionTarget(getSelectionTargetFromLinearOffset(nextParts, linearOffset));
    }
  };

  const replaceCurrentSelectionWithText = (text) => {
    if (!text) return;

    const selection = window.getSelection();
    const selectedRange = getLinearRangeFromSelection(selection);
    const insertionOffset = selectedRange
      ? selectedRange.start
      : selection && selection.rangeCount > 0
      ? getLinearOffsetFromDOMPosition(selection.anchorNode, selection.anchorOffset, 'start')
      : getTotalLinearLength();

    const safeInsertionOffset = insertionOffset ?? getTotalLinearLength();
    const baseParts = selectedRange
      ? deleteRangeFromParts(contentParts, selectedRange.start, selectedRange.end).nextParts
      : contentParts;
    const nextParts = [...baseParts];
    const target = getSelectionTargetFromLinearOffset(nextParts, safeInsertionOffset);

    insertTextIntoParts(nextParts, text, target);

    const normalizedParts = normalizeParts(nextParts);
    updateContentParts(
      normalizedParts,
      getSelectionTargetFromLinearOffset(normalizedParts, safeInsertionOffset + text.length),
    );
  };

  const replaceEditorContentWithText = (text) => {
    if (!text) return;

    updateContentParts([{ type: 'text', value: text }], {
      type: 'text',
      index: 0,
      offset: text.length,
    });
  };

  const deleteSelectedRange = (range) => {
    if (!range) return false;

    const selection = window.getSelection();
    selection?.removeAllRanges();
    clearVisualIndicator();

    const { nextParts, nextSelection } = deleteRangeFromParts(
      contentParts,
      range.start,
      range.end,
    );

    updateContentParts(nextParts, nextSelection);
    return true;
  };

  const handleFlowCopy = (e) => {
    const selectedRange = getLinearRangeFromSelection(window.getSelection());
    if (!selectedRange) return;

    e.preventDefault();
    const copiedText = serializeRangeToPlainText(
      contentParts,
      selectedRange.start,
      selectedRange.end,
    );
    e.clipboardData.setData('text/plain', copiedText);
  };

  const handleFlowCut = (e) => {
    const selectedRange = getLinearRangeFromSelection(window.getSelection());
    if (!selectedRange) return;

    e.preventDefault();
    const copiedText = serializeRangeToPlainText(
      contentParts,
      selectedRange.start,
      selectedRange.end,
    );
    e.clipboardData.setData('text/plain', copiedText);
    deleteSelectedRange(selectedRange);
  };

  const handleFlowPaste = (e) => {
    const pastedText = e.clipboardData.getData('text/plain');
    if (!pastedText) return;

    e.preventDefault();
    replaceCurrentSelectionWithText(pastedText);
  };

  const handleEditorKeyDownCapture = (e) => {
    const interactiveTarget = e.target;
    if (
      interactiveTarget instanceof HTMLElement
      && interactiveTarget.closest('input, textarea, select')
    ) {
      return;
    }

    if (e.key !== 'Backspace' && e.key !== 'Delete') {
      return;
    }

    const selectedRange = getLinearRangeFromSelection(window.getSelection());
    if (selectedRange && selectedRange.start !== selectedRange.end) {
      e.preventDefault();
      e.stopPropagation();
      deleteSelectedRange(selectedRange);
      return;
    }

    if (replaceTargetIndex === null || !isInlineChip(contentParts[replaceTargetIndex])) {
      const collapsedSelection = getCollapsedSelectionState();
      if (!collapsedSelection) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const { target } = collapsedSelection;

      if (target.type === 'text') {
        const currentPart = contentParts[target.index];
        const previousPart = contentParts[target.index - 1];
        const nextPart = contentParts[target.index + 1];

        if (e.key === 'Backspace' && target.offset === 0 && isInlineChip(previousPart)) {
          e.preventDefault();
          e.stopPropagation();
          removePartAtIndex(target.index - 1, {
            type: 'text',
            index: Math.max(target.index - 1, 0),
            offset: 0,
          });
          return;
        }

        if (
          e.key === 'Delete'
          && currentPart?.type === 'text'
          && target.offset === currentPart.value.length
          && isInlineChip(nextPart)
        ) {
          e.preventDefault();
          e.stopPropagation();
          removePartAtIndex(target.index + 1, {
            type: 'text',
            index: target.index,
            offset: currentPart.value.length,
          });
          return;
        }

        return;
      }

      const previousPart = contentParts[target.index - 1];
      const nextPart = contentParts[target.index];

      if (e.key === 'Backspace' && isInlineChip(previousPart)) {
        e.preventDefault();
        e.stopPropagation();
        removePartAtIndex(target.index - 1, {
          type: 'between',
          index: Math.max(target.index - 1, 0),
        });
        return;
      }

      if (e.key === 'Delete' && isInlineChip(nextPart)) {
        e.preventDefault();
        e.stopPropagation();
        removePartAtIndex(target.index, {
          type: 'between',
          index: target.index,
        });
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    removePartAtIndex(replaceTargetIndex, {
      type: 'between',
      index: replaceTargetIndex,
    });
  };

  const applyBoundaryDropLocation = (element, clientX, beforeDrop, afterDrop, payloadType) => {
    const rect = element.getBoundingClientRect();
    const shouldInsertAfter = clientX > rect.left + rect.width / 2;
    const activeDrop = shouldInsertAfter ? afterDrop : beforeDrop;
    const nextSelectionTarget = activeDrop.selectionTarget;
    const nextReplaceTargetIndex =
      payloadType !== 'bubble' ? activeDrop.replaceTargetIndex ?? null : null;

    setSelectionTarget(nextSelectionTarget);
    setReplaceTargetIndex(nextReplaceTargetIndex);
    updateIndicatorFromElementEdge(element, shouldInsertAfter);
    setIsDraggingOverEditor(true);

    return {
      isOverEditor: true,
      selectionTarget: nextSelectionTarget,
      replaceTargetIndex: nextReplaceTargetIndex,
    };
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
      const baseOffset = Number(textTarget.dataset.textBaseOffset ?? 0);
      const fullTextValue = textTarget.dataset.textFullValue ?? textTarget.innerText;
      const nextSelectionTarget = setCaretFromPoint(textTarget, index, clientX, clientY, {
        baseOffset,
        fullTextValue,
      });
      setIsDraggingOverEditor(true);
      return {
        isOverEditor: true,
        selectionTarget: nextSelectionTarget,
        replaceTargetIndex: null,
      };
    }

    const boundaryTarget = element.closest('[data-drop-kind="boundary"]');
    if (boundaryTarget) {
      const beforeDrop = parseDropLocation(boundaryTarget.dataset.dropBefore);
      const afterDrop = parseDropLocation(boundaryTarget.dataset.dropAfter);
      return applyBoundaryDropLocation(
        boundaryTarget,
        clientX,
        beforeDrop,
        afterDrop,
        payloadType,
      );
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
    e.dataTransfer.setDragImage(getTransparentDragImage(), 0, 0);
    setDragMode('pointer');
    setDragPayload({ type: 'library-item', value: item, category: activeCategory });
  };

  const handleBubbleDragStart = (e, index, part) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', part.value);
    e.dataTransfer.setDragImage(getTransparentDragImage(), 0, 0);
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

  const handleTextDragOver = (e, index, baseOffset = 0, fullTextValue = e.currentTarget.innerText) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = dragPayload?.type === 'bubble' ? 'move' : 'copy';
    setCaretFromPoint(e.currentTarget, index, e.clientX, e.clientY, {
      baseOffset,
      fullTextValue,
    });
    setIsDraggingOverEditor(true);
  };

  const handleInlineBoundaryDragOver = (e, beforeDrop, afterDrop) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = dragPayload?.type === 'bubble' ? 'move' : 'copy';

    applyBoundaryDropLocation(
      e.currentTarget,
      e.clientX,
      beforeDrop,
      afterDrop,
      dragPayload?.type,
    );
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
    setIsQuickInsertPanelOpen(false);
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
        setIsQuickInsertPanelOpen(false);
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

  const isTouchDraggingListItem = (item) =>
    dragMode === 'touch' && dragPayload?.type === 'library-item' && dragPayload.value === item;

  const previewState =
    dragPayload && isDraggingOverEditor
      ? {
          payload: dragPayload,
          selectionTarget: getCurrentSelectionTarget(),
          replaceTargetIndex,
        }
      : null;

  const isPreviewActive = Boolean(previewState);
  const renderParts = buildRenderableParts(contentParts, previewState);

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans max-w-md mx-auto border-x shadow-2xl overflow-hidden relative text-slate-800">
      
      {/* 新的病人資訊卡頂部 Header */}
      <header className="px-4 py-3 flex justify-between items-center bg-white border-b z-10 shadow-sm shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="bg-blue-600 text-white px-2 py-1.5 rounded-xl flex flex-col items-center justify-center min-w-[3.5rem] shrink-0 shadow-md shadow-blue-200">
            <span className="text-[9px] text-blue-100 font-bold leading-none mb-1 tracking-widest">床號</span>
            <span className="text-sm font-black leading-none tracking-wide">10A-05</span>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-baseline gap-2 truncate">
              <h1 className="text-base font-bold text-slate-800 leading-tight truncate">王大明</h1>
              <span className="text-[11px] text-slate-500 font-medium shrink-0">男 · 65歲</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-medium flex items-center gap-1 truncate">
              <User size={10} className="shrink-0" />
              <span className="truncate">主治: 林建國 醫師</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {/* 切換按鈕 */}
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
          >
            <ArrowRightLeft size={14} />
            <span className="text-xs font-bold hidden sm:inline-block">切換</span>
          </button>

          {/* 設定按鈕 (新加回來的) */}
          <button
            type="button"
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 shadow-sm transition-all hover:bg-slate-900 hover:text-white active:scale-95"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        <div
          ref={editorRef}
          tabIndex={-1}
          className={`flex-1 bg-white rounded-[2rem] p-6 shadow-sm border flex flex-col relative overflow-y-auto transition-colors ${
            isDraggingOverEditor ? 'border-blue-400 bg-blue-50/40' : 'border-slate-200'
          } outline-none`}
          onKeyDownCapture={handleEditorKeyDownCapture}
          onClick={(e) => {
            if (hasExpandedDOMSelection() || suppressClickAfterSelectionRef.current) {
              return;
            }

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
            contentEditable={!isPreviewActive}
            suppressContentEditableWarning
            spellCheck={false}
            className="leading-[2.2] text-lg font-medium text-slate-700 whitespace-pre-wrap break-words outline-none"
            onInput={!isPreviewActive ? handleFlowInput : undefined}
            onCopy={!isPreviewActive ? handleFlowCopy : undefined}
            onCut={!isPreviewActive ? handleFlowCut : undefined}
            onPaste={!isPreviewActive ? handleFlowPaste : undefined}
            onFocus={!isPreviewActive ? syncEditorSelection : undefined}
            onKeyUp={!isPreviewActive ? syncEditorSelection : undefined}
            onMouseUp={!isPreviewActive ? handleFlowMouseUp : undefined}
            onClick={(e) => {
              if (hasExpandedDOMSelection() || suppressClickAfterSelectionRef.current) {
                return;
              }

              if (e.target === e.currentTarget) {
                focusFlowEndAnchor();
                return;
              }

              if (!isPreviewActive) {
                syncEditorSelection();
              }
            }}
          >
            {renderParts.map((part) => {
              const beforeDrop = part.dropBefore ?? createDropLocation({ type: 'between', index: 0 });
              const afterDrop = part.dropAfter ?? createDropLocation({ type: 'between', index: 0 });

              return (
                <React.Fragment key={part.key}>
                  {part.type === 'text' ? (
                    <span
                      data-drop-kind="text"
                      data-part-index={part.sourceIndex}
                      data-part-type="text"
                      data-text-index={part.sourceIndex}
                      data-text-base-offset={part.textBaseOffset ?? 0}
                      data-text-full-value={part.fullTextValue ?? part.value}
                      onDragOver={(e) =>
                        handleTextDragOver(
                          e,
                          part.sourceIndex,
                          part.textBaseOffset ?? 0,
                          part.fullTextValue ?? part.value,
                        )
                      }
                      onDrop={handleDrop}
                      className={`inline rounded px-0.5 outline-none ${isPreviewActive ? 'select-none' : ''}`}
                    >
                      {part.value}
                    </span>
                  ) : part.type === 'bubble' ? (
                    <span
                      contentEditable={false}
                      data-part-index={part.sourceIndex}
                      data-part-type="bubble"
                      data-part-value={part.value}
                      data-part-category={part.category ?? ''}
                      className="relative mx-1 inline-flex align-baseline"
                      >
                      <span
                        draggable={!part.isPreview}
                        data-drop-kind="boundary"
                        data-drop-before={part.dropBeforeAttr}
                        data-drop-after={part.dropAfterAttr}
                        onMouseDown={
                          part.isPreview
                            ? undefined
                            : (e) => {
                                e.stopPropagation();
                              }
                        }
                        onClick={
                          part.isPreview
                            ? undefined
                            : (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (hasExpandedDOMSelection() || suppressClickAfterSelectionRef.current) return;
                                selectBubbleForReplacement(part.sourceIndex, part.category);
                              }
                        }
                        onDragStart={
                          part.isPreview
                            ? undefined
                            : (e) => handleBubbleDragStart(e, part.sourceIndex, part)
                        }
                        onDragEnd={part.isPreview ? undefined : handleDragEnd}
                        onTouchStart={
                          part.isPreview
                            ? undefined
                            : (e) =>
                                startTouchDrag(
                                  {
                                    type: 'bubble',
                                    value: part.value,
                                    index: part.sourceIndex,
                                    category: part.category,
                                  },
                                  e.touches[0],
                                )
                        }
                        onTouchMove={part.isPreview ? undefined : handleTouchMove}
                        onTouchEnd={part.isPreview ? undefined : handleTouchEnd}
                        onTouchCancel={part.isPreview ? undefined : handleTouchCancel}
                        onKeyDown={part.isPreview ? undefined : (e) => handleBubbleKeyDown(e, part.sourceIndex)}
                        onDragOver={(e) => handleInlineBoundaryDragOver(e, beforeDrop, afterDrop)}
                        onDrop={handleDrop}
                        className={`drag-chip editor-chip inline-flex cursor-grab active:cursor-grabbing align-baseline rounded-full border items-center justify-center px-3.5 py-0.5 transition-all duration-150 ease-out shadow-sm overflow-hidden ${
                          part.isPreview
                            ? 'border-blue-300 bg-blue-100/80 text-blue-700 opacity-60 scale-[0.98] shadow-[0_10px_24px_rgba(59,130,246,0.14)]'
                            : replaceTargetIndex === part.sourceIndex
                            ? 'border-blue-500 bg-blue-600 text-white scale-105'
                            : 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400 hover:bg-blue-100'
                        } ${part.isNew ? 'bubble-pop' : ''}`}
                      >
                        <span className="font-bold text-sm">{part.value}</span>
                      </span>
                      {!part.isPreview && (
                        <button
                          type="button"
                          aria-label={`刪除 ${part.value}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removePartAtIndex(part.sourceIndex, {
                              type: 'between',
                              index: part.sourceIndex,
                            });
                          }}
                          className="absolute -right-2.5 -top-2.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:border-red-200 hover:text-red-500 active:scale-95"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </span>
                  ) : (
                    <span
                      contentEditable={false}
                      data-part-index={part.sourceIndex}
                      data-part-type="placeholder"
                      data-part-value={part.value}
                      data-part-category={part.category ?? ''}
                      data-drop-kind="boundary"
                      data-drop-before={part.dropBeforeAttr}
                      data-drop-after={part.dropAfterAttr}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (hasExpandedDOMSelection() || suppressClickAfterSelectionRef.current) return;
                        selectBubbleForReplacement(part.sourceIndex, part.category);
                      }}
                      onDragOver={(e) => handleInlineBoundaryDragOver(e, beforeDrop, afterDrop)}
                      onDrop={handleDrop}
                      className={`drag-chip editor-chip mx-1 inline-flex align-baseline px-3 py-0.5 rounded-full border-2 border-dashed items-center gap-1 transition-all ${
                        replaceTargetIndex === part.sourceIndex
                          ? 'border-blue-500 bg-blue-50 text-blue-600 scale-105 shadow-sm'
                          : 'border-slate-300 bg-slate-50 text-slate-500 animate-pulse'
                      }`}
                    >
                      <PlusCircle size={14} />
                      <span className="text-sm font-bold">{part.value}</span>
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div className="hidden">
            <div
              className={`overflow-hidden rounded-[1.75rem] bg-slate-50/90 transition-all duration-300 ease-out ${
                isTemplatePanelOpen
                  ? 'max-h-[26rem] translate-y-0 border border-slate-200 opacity-100'
                  : 'max-h-0 translate-y-4 border border-transparent opacity-0'
              }`}
            >
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 rounded-2xl bg-white p-1 ring-1 ring-slate-200">
                  <button
                    type="button"
                    onClick={() => setFooterPanelMode('templates')}
                    className={`flex-1 rounded-[1rem] px-3 py-2 text-xs font-bold transition-colors ${
                      footerPanelMode === 'templates'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Templates
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFooterPanelMode('quickInsert');
                      if (!activeCategory) setActiveCategory('physician');
                    }}
                    className={`flex-1 rounded-[1rem] px-3 py-2 text-xs font-bold transition-colors ${
                      footerPanelMode === 'quickInsert'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Quick Insert
                  </button>
                </div>
              </div>

              <div className="max-h-[19rem] overflow-y-auto px-4 py-3">
                {footerPanelMode === 'templates' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      <Search size={14} className="shrink-0 text-slate-400" />
                      <input
                        type="text"
                        value={templateSearchTerm}
                        onChange={(e) => setTemplateSearchTerm(e.target.value)}
                        placeholder="Search templates"
                        className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                      />
                    </div>

                    {filteredTemplates.length > 0 ? (
                      filteredTemplates.map((group) => {
                        const isGroupExpanded = expandedTemplateGroupId === group.id;

                        return (
                          <div
                            key={group.id}
                            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedTemplateGroupId((prev) => (prev === group.id ? null : group.id));
                                setExpandedTemplateId(null);
                              }}
                              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                              aria-expanded={isGroupExpanded}
                            >
                              <span className="truncate text-sm font-bold text-slate-700">{group.title}</span>
                              {isGroupExpanded ? (
                                <ChevronUp size={16} className="shrink-0 text-slate-400" />
                              ) : (
                                <ChevronDown size={16} className="shrink-0 text-slate-400" />
                              )}
                            </button>

                            {isGroupExpanded && (
                              <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2">
                                <div className="space-y-2">
                                  {group.items.map((template) => {
                                    const isItemExpanded = expandedTemplateId === template.id;

                                    return (
                                      <div
                                        key={template.id}
                                        className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                                      >
                                        <div className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-slate-50">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setExpandedTemplateId((prev) =>
                                                prev === template.id ? null : template.id,
                                              )
                                            }
                                            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                                            aria-expanded={isItemExpanded}
                                          >
                                            <span className="truncate text-sm font-medium text-slate-700">
                                              {template.title}
                                            </span>
                                            {isItemExpanded ? (
                                              <ChevronUp size={15} className="shrink-0 text-slate-400" />
                                            ) : (
                                              <ChevronDown size={15} className="shrink-0 text-slate-400" />
                                            )}
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => replaceEditorContentWithText(template.content)}
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                                            aria-label={`Insert ${template.title}`}
                                            title="Insert template"
                                          >
                                            <Upload size={14} />
                                          </button>
                                        </div>

                                        {isItemExpanded && (
                                          <div className="border-t border-slate-100 px-3 py-3">
                                            <p className="text-xs leading-6 text-slate-600">
                                              {template.content}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
                        No matching templates
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setActiveCategory(cat.id)}
                          className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 whitespace-nowrap text-sm font-bold transition-all shadow-sm ${
                            activeCategory === cat.id
                              ? 'bg-slate-900 text-white'
                              : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          {cat.icon}
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {activeCategory &&
                        itemsData[activeCategory].map((item, index) => (
                          <button
                            key={index}
                            type="button"
                            draggable
                            onClick={() => handleInsertValue(item)}
                            onDragStart={(e) => handleListItemDragStart(e, item)}
                            onDragEnd={handleDragEnd}
                            onTouchStart={(e) =>
                              startTouchDrag(
                                { type: 'library-item', value: item, category: activeCategory },
                                e.touches[0],
                              )
                            }
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            onTouchCancel={handleTouchCancel}
                            className={`drag-chip flex items-center justify-between rounded-2xl border border-transparent bg-white p-4 shadow-sm transition-all duration-150 ease-out hover:border-blue-500 hover:text-blue-600 hover:shadow-md active:scale-95 group cursor-grab active:cursor-grabbing overflow-hidden ${
                              isTouchDraggingListItem(item) ? 'pointer-events-none opacity-0' : ''
                            }`}
                          >
                            <span className="truncate text-sm font-bold text-slate-700 group-hover:text-blue-600">
                              {item}
                            </span>
                            <div
                              className={`flex items-center justify-center rounded-full transition-colors ${
                                isTouchDraggingListItem(item)
                                  ? 'h-6 w-6 opacity-0'
                                  : 'h-6 w-6 bg-slate-50 group-hover:bg-blue-600 group-hover:text-white'
                              }`}
                            >
                              <Check size={12} className="opacity-0 group-hover:opacity-100" />
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              className={`overflow-hidden rounded-[1.75rem] bg-slate-50/90 ${
                isQuickInsertPanelOpen
                  ? 'max-h-[26rem] translate-y-0 border border-slate-200 opacity-100'
                  : 'max-h-0 translate-y-4 border border-transparent opacity-0'
              }`}
            >
              <div className="max-h-[19rem] overflow-y-auto px-4 py-3">
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategory(cat.id)}
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

                <div className="mt-3 grid grid-cols-2 gap-2 pb-1">
                  {activeCategory &&
                    itemsData[activeCategory].map((item, index) => (
                      <button
                        key={index}
                        type="button"
                        draggable
                        onClick={() => handleInsertValue(item)}
                        onDragStart={(e) => handleListItemDragStart(e, item)}
                        onDragEnd={handleDragEnd}
                        onTouchStart={(e) =>
                          startTouchDrag(
                            { type: 'library-item', value: item, category: activeCategory },
                            e.touches[0],
                          )
                        }
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onTouchCancel={handleTouchCancel}
                        className={`drag-chip flex items-center justify-between bg-white hover:border-blue-500 hover:text-blue-600 rounded-2xl border border-transparent hover:shadow-md transition-all duration-150 ease-out group active:scale-95 shadow-sm cursor-grab active:cursor-grabbing overflow-hidden p-4 ${
                          isTouchDraggingListItem(item) ? 'pointer-events-none opacity-0' : ''
                        }`}
                      >
                        <span className="font-bold text-sm text-slate-700 group-hover:text-blue-600 truncate">
                          {item}
                        </span>
                        <div
                          className={`rounded-full bg-slate-50 flex items-center justify-center transition-colors ${
                            isTouchDraggingListItem(item)
                              ? 'w-6 h-6 opacity-0'
                              : 'w-6 h-6 group-hover:bg-blue-600 group-hover:text-white'
                          }`}
                        >
                          <Check size={12} className="opacity-0 group-hover:opacity-100" />
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-[1.75rem] border border-slate-200 bg-slate-50/95 px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openFooterPanel('templates')}
                  className={`flex h-11 min-w-[4.25rem] items-center justify-center gap-2 rounded-2xl border px-3 shadow-sm transition-all active:scale-95 ${
                    isTemplatePanelOpen && footerPanelMode === 'templates'
                      ? 'border-blue-200 bg-blue-50 text-blue-600'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                  aria-label="Templates"
                  title="Templates"
                >
                  <BookText size={16} />
                  {isTemplatePanelOpen && footerPanelMode === 'templates' ? (
                    <ChevronDown size={15} />
                  ) : (
                    <ChevronUp size={15} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => openFooterPanel('quickInsert')}
                  className={`flex h-11 min-w-[4.25rem] items-center justify-center gap-2 rounded-2xl border px-3 shadow-sm transition-all active:scale-95 ${
                    isTemplatePanelOpen && footerPanelMode === 'quickInsert'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                  aria-label="Quick insert"
                  title="Quick insert"
                >
                  <PlusCircle size={16} />
                  {isTemplatePanelOpen && footerPanelMode === 'quickInsert' ? (
                    <ChevronDown size={15} />
                  ) : (
                    <ChevronUp size={15} />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:bg-slate-100 hover:text-slate-700 active:scale-95"
                  aria-label="Undo"
                  title="Undo"
                >
                  <Undo2 size={14} />
                </button>
                
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-600 shadow-sm transition-all hover:bg-indigo-100 hover:text-indigo-700 active:scale-95"
                  aria-label="AI assist"
                  title="AI assist"
                >
                  <Sparkles size={14} />
                </button>

                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-sm transition-all hover:bg-emerald-100 hover:text-emerald-700 active:scale-95"
                  aria-label="Save and upload"
                  title="Save and upload"
                >
                  <Upload size={15} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6 flex flex-col gap-3 pointer-events-auto">
            <div
              className={`overflow-hidden rounded-[1.75rem] bg-slate-50/90 transition-all duration-300 ease-out ${
                isTemplatePanelOpen
                  ? 'max-h-[26rem] translate-y-0 border border-slate-200 opacity-100'
                  : 'max-h-0 translate-y-4 border border-transparent opacity-0'
              }`}
            >
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                  <Search size={14} className="shrink-0 text-slate-400" />
                  <input
                    type="text"
                    value={templateSearchTerm}
                    onChange={(e) => setTemplateSearchTerm(e.target.value)}
                    placeholder="搜尋模板"
                    className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="max-h-[19rem] space-y-2 overflow-y-auto px-4 py-3">
                {filteredTemplates.length > 0 ? (
                  filteredTemplates.map((group) => {
                    const isGroupExpanded = expandedTemplateGroupId === group.id;

                    return (
                      <div
                        key={group.id}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedTemplateGroupId((prev) => (prev === group.id ? null : group.id));
                            setExpandedTemplateId(null);
                          }}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                          aria-expanded={isGroupExpanded}
                        >
                          <span className="truncate text-sm font-bold text-slate-700">{group.title}</span>
                          {isGroupExpanded ? (
                            <ChevronUp size={16} className="shrink-0 text-slate-400" />
                          ) : (
                            <ChevronDown size={16} className="shrink-0 text-slate-400" />
                          )}
                        </button>

                        {isGroupExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2">
                            <div className="space-y-2">
                              {group.items.map((template) => {
                                const isItemExpanded = expandedTemplateId === template.id;

                                return (
                                  <div
                                    key={template.id}
                                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                                  >
                                    <div className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-slate-50">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedTemplateId((prev) =>
                                            prev === template.id ? null : template.id,
                                          )
                                        }
                                        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                                        aria-expanded={isItemExpanded}
                                      >
                                        <span className="truncate text-sm font-medium text-slate-700">
                                          {template.title}
                                        </span>
                                        {isItemExpanded ? (
                                          <ChevronUp size={15} className="shrink-0 text-slate-400" />
                                        ) : (
                                          <ChevronDown size={15} className="shrink-0 text-slate-400" />
                                        )}
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => replaceEditorContentWithText(template.content)}
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                                        aria-label={`帶入${template.title}`}
                                        title="帶入輸入框"
                                      >
                                        <Upload size={14} />
                                      </button>
                                    </div>

                                    {isItemExpanded && (
                                      <div className="border-t border-slate-100 px-3 py-3">
                                        <p className="text-xs leading-6 text-slate-600">
                                          {template.content}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="relative rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-transparent">
                    <span className="absolute inset-0 flex items-center justify-center text-slate-400">
                      No matching templates
                    </span>
                    找不到符合的模板
                  </div>
                )}
              </div>
            </div>

            <div
              className={`overflow-hidden rounded-[1.75rem] bg-slate-50/90 ${
                isQuickInsertPanelOpen
                  ? 'max-h-[26rem] translate-y-0 border border-slate-200 opacity-100'
                  : 'max-h-0 translate-y-4 border border-transparent opacity-0'
              }`}
            >
              <div className="max-h-[19rem] overflow-y-auto px-4 py-3">
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategory(cat.id)}
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

                <div className="mt-3 grid grid-cols-2 gap-2 pb-1">
                  {activeCategory &&
                    itemsData[activeCategory].map((item, index) => (
                      <button
                        key={index}
                        type="button"
                        draggable
                        onClick={() => handleInsertValue(item)}
                        onDragStart={(e) => handleListItemDragStart(e, item)}
                        onDragEnd={handleDragEnd}
                        onTouchStart={(e) =>
                          startTouchDrag(
                            { type: 'library-item', value: item, category: activeCategory },
                            e.touches[0],
                          )
                        }
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onTouchCancel={handleTouchCancel}
                        className={`drag-chip flex items-center justify-between bg-white hover:border-blue-500 hover:text-blue-600 rounded-2xl border border-transparent hover:shadow-md transition-all duration-150 ease-out group active:scale-95 shadow-sm cursor-grab active:cursor-grabbing overflow-hidden p-4 ${
                          isTouchDraggingListItem(item) ? 'pointer-events-none opacity-0' : ''
                        }`}
                      >
                        <span className="font-bold text-sm text-slate-700 group-hover:text-blue-600 truncate">
                          {item}
                        </span>
                        <div
                          className={`rounded-full bg-slate-50 flex items-center justify-center transition-colors ${
                            isTouchDraggingListItem(item)
                              ? 'w-6 h-6 opacity-0'
                              : 'w-6 h-6 group-hover:bg-blue-600 group-hover:text-white'
                          }`}
                        >
                          <Check size={12} className="opacity-0 group-hover:opacity-100" />
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-[1.75rem] border border-slate-200 bg-slate-50/95 px-4 py-3 shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setIsQuickInsertPanelOpen(false);
                  setIsTemplatePanelOpen((prev) => !prev);
                }}
                className="flex h-11 min-w-[4.25rem] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-slate-500 shadow-sm transition-all hover:bg-slate-100 hover:text-slate-700 active:scale-95"
                aria-expanded={isTemplatePanelOpen}
                aria-label="Toggle nursing templates"
                title="護理模板"
              >
                <BookText size={16} className={isTemplatePanelOpen ? 'text-blue-600' : ''} />
                {isTemplatePanelOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsTemplatePanelOpen(false);
                  setIsQuickInsertPanelOpen((prev) => !prev);
                  if (!activeCategory) {
                    setActiveCategory(categories[0]?.id ?? null);
                  }
                }}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:bg-slate-100 hover:text-slate-700 active:scale-95"
                aria-expanded={isQuickInsertPanelOpen}
                aria-label="Toggle quick insert"
                title="Quick insert"
              >
                <PlusCircle size={16} className={isQuickInsertPanelOpen ? 'text-blue-600' : ''} />
              </button>

              <div className="ml-auto flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:bg-slate-100 hover:text-slate-700 active:scale-95"
                  aria-label="返回上一步"
                  title="返回上一步"
                >
                  <Undo2 size={14} />
                </button>
                
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-600 shadow-sm transition-all hover:bg-indigo-100 hover:text-indigo-700 active:scale-95"
                  aria-label="AI 優化"
                  title="AI 優化"
                >
                  <Sparkles size={14} />
                </button>

                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-sm transition-all hover:bg-emerald-100 hover:text-emerald-700 active:scale-95"
                  aria-label="儲存並上傳"
                  title="儲存並上傳"
                >
                  <Upload size={15} />
                </button>
              </div>
            </div>

            <div className="hidden">
              <button
                type="button"
                onClick={() => setIsTemplatePanelOpen((prev) => !prev)}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left text-slate-600 transition-colors hover:text-slate-900"
                aria-expanded={isTemplatePanelOpen}
                aria-label="切換護理紀錄模板"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200">
                    <BookText size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-700">護理模板</span>
                    <span className="block truncate text-[11px] text-slate-400">快速展開常用護理紀錄稿</span>
                  </span>
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-400 ring-1 ring-slate-200">
                  {isTemplatePanelOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </span>
              </button>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all"
                >
                  ?脣?
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-lg shadow-violet-200/50 active:scale-95 transition-all"
                >
                  <Sparkles size={14} />
                  AI ?芸?
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="flex items-center justify-center h-[32px] w-[32px] text-slate-400 hover:text-slate-600 transition-colors bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 active:scale-95"
                  title="?儔"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="hidden">
            <div className="pointer-events-auto relative shrink-0">
              {isTemplatePanelOpen && (
                <div className="absolute bottom-full left-0 mb-3 w-[min(24rem,calc(100vw-5rem))] rounded-[1.5rem] border border-slate-200 bg-white/95 p-3 shadow-[0_20px_60px_rgba(15,23,42,0.16)] backdrop-blur">
                  <div className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <Search size={14} className="shrink-0 text-slate-400" />
                    <input
                      type="text"
                      value={templateSearchTerm}
                      onChange={(e) => setTemplateSearchTerm(e.target.value)}
                      placeholder="搜尋模板"
                      className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </div>

                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {filteredTemplates.length > 0 ? (
                      filteredTemplates.map((group) => {
                        const isGroupExpanded = expandedTemplateGroupId === group.id;

                        return (
                          <div
                            key={group.id}
                            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedTemplateGroupId((prev) => (prev === group.id ? null : group.id));
                                setExpandedTemplateId(null);
                              }}
                              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                              aria-expanded={isGroupExpanded}
                            >
                              <span className="truncate text-sm font-bold text-slate-700">{group.title}</span>
                              {isGroupExpanded ? (
                                <ChevronUp size={16} className="shrink-0 text-slate-400" />
                              ) : (
                                <ChevronDown size={16} className="shrink-0 text-slate-400" />
                              )}
                            </button>

                            {isGroupExpanded && (
                              <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2">
                                <div className="space-y-2">
                                  {group.items.map((template) => {
                                    const isItemExpanded = expandedTemplateId === template.id;

                                    return (
                                      <div
                                        key={template.id}
                                        className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                                      >
                                        <div className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-slate-50">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setExpandedTemplateId((prev) =>
                                                prev === template.id ? null : template.id,
                                              )
                                            }
                                            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                                            aria-expanded={isItemExpanded}
                                          >
                                            <span className="truncate text-sm font-medium text-slate-700">
                                              {template.title}
                                            </span>
                                            {isItemExpanded ? (
                                              <ChevronUp size={15} className="shrink-0 text-slate-400" />
                                            ) : (
                                              <ChevronDown size={15} className="shrink-0 text-slate-400" />
                                            )}
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => replaceEditorContentWithText(template.content)}
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                                            aria-label={`帶入${template.title}`}
                                            title="帶入輸入框"
                                          >
                                            <Upload size={14} />
                                          </button>
                                        </div>

                                        {isItemExpanded && (
                                          <div className="border-t border-slate-100 px-3 py-3">
                                            <p className="text-xs leading-6 text-slate-600">
                                              {template.content}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-400">
                        找不到符合的模板
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsTemplatePanelOpen((prev) => !prev)}
                className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold shadow-sm transition-all active:scale-95 ${
                  isTemplatePanelOpen
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                aria-expanded={isTemplatePanelOpen}
                aria-label="切換護理紀錄模板"
              >
                <BookText size={15} />
                <span>護理模板</span>
                {isTemplatePanelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* 儲存按鈕 */}
              <button
                type="button"
                className="pointer-events-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-blue-200 active:scale-95 transition-all"
              >
                儲存
              </button>
              
              {/* AI 優化按鈕 */}
              <button
                type="button"
                className="pointer-events-auto flex items-center gap-1.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-lg shadow-violet-200/50 active:scale-95 transition-all"
              >
                <Sparkles size={14} />
                AI 優化
              </button>

              {/* 回復按鈕 */}
              <button 
                onClick={() => window.location.reload()} 
                className="pointer-events-auto flex items-center justify-center h-[32px] w-[32px] text-slate-400 hover:text-slate-600 transition-colors bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 active:scale-95"
                title="回復"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="hidden">
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

        <div className="hidden">
          <div className="bg-slate-100/80 backdrop-blur-sm rounded-[2.5rem] p-5 h-full overflow-y-auto border border-slate-200 shadow-inner">
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
                        ? 'pointer-events-none opacity-0'
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

      <div className="h-24 bg-white border-t flex items-center justify-center gap-12 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] z-10 shrink-0">
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
        .editor-chip {
          -webkit-user-select: text;
          user-select: text;
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

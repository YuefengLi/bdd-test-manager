// frontend/src/hooks/useDragCopyMode.js
import { useRef, useState } from 'react';

/**
 * Tracks Ctrl/Cmd during drag to switch between Move and Copy.
 * Manages the copy cursor and returns DnD handlers.
 */
export function useDragCopyMode() {
  const copyModeRef = useRef(false);
  const draggingRef = useRef(false);
  const [copyMode, setCopyMode] = useState(false);

  const applyCursor = () => {
    const isCopyNow = copyModeRef.current;
    setCopyMode(isCopyNow);
    try { document.body.style.cursor = isCopyNow ? 'copy' : ''; } catch {}
  };

  const onDragStart = (event) => {
    const ae = event?.activatorEvent;
    const isCopy = !!(ae && (ae.ctrlKey || ae.metaKey));
    copyModeRef.current = isCopy;
    draggingRef.current = true;
    applyCursor();

    const onKeyChange = () => {
      if (!draggingRef.current) return;
      const next = !!(window.event?.ctrlKey || window.event?.metaKey);
      if (copyModeRef.current !== next) {
        copyModeRef.current = next;
        applyCursor();
      }
    };
    const onKeyDown = () => onKeyChange();
    const onKeyUp = () => onKeyChange();
    const onBlur = () => {
      if (!draggingRef.current) return;
      copyModeRef.current = false;
      applyCursor();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    onDragStart._cleanup = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  };

  const cleanup = () => {
    copyModeRef.current = false;
    draggingRef.current = false;
    setCopyMode(false);
    try { document.body.style.cursor = ''; } catch {}
    if (typeof onDragStart._cleanup === 'function') {
      try { onDragStart._cleanup(); } catch {}
      onDragStart._cleanup = null;
    }
  };

  const onDragCancel = () => {
    cleanup();
  };

  const onDragEnd = (event, { onCopy, onMove }) => {
    const { active, over } = event;
    const isCopy = copyModeRef.current;
    cleanup();
    if (!over || active.id === over.id) return;
    if (isCopy) {
      onCopy?.({ active, over });
    } else {
      onMove?.({ active, over });
    }
  };

  return { copyMode, onDragStart, onDragEnd, onDragCancel };
}

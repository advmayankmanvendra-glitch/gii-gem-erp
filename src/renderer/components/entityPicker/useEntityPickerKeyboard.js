import { useState, useCallback, useRef, useEffect } from "react";

export function useEntityPickerKeyboard({ results, onSelect, onClose, onQuickCreate, loading }) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef(null);

  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

  const scrollIntoView = useCallback((index) => {
    const container = listRef.current;
    if (!container) return;
    const item = container.children[index];
    if (item) item.scrollIntoView({ block: "nearest" });
  }, []);

  const handleKeyDown = useCallback((event) => {
    const key = event.key;
    const hasResults = results.length > 0;

    if (key === "ArrowDown") {
      event.preventDefault();
      if (!hasResults) return;
      setActiveIndex((prev) => {
        const next = prev < results.length - 1 ? prev + 1 : 0;
        scrollIntoView(next);
        return next;
      });
      return;
    }

    if (key === "ArrowUp") {
      event.preventDefault();
      if (!hasResults) return;
      setActiveIndex((prev) => {
        const next = prev > 0 ? prev - 1 : results.length - 1;
        scrollIntoView(next);
        return next;
      });
      return;
    }

    if (key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0 && activeIndex < results.length) {
        onSelect(results[activeIndex]);
      }
      return;
    }

    if (key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (key === "PageDown") {
      event.preventDefault();
      if (!hasResults) return;
      setActiveIndex((prev) => {
        const next = Math.min(prev + 10, results.length - 1);
        scrollIntoView(next);
        return next;
      });
      return;
    }

    if (key === "PageUp") {
      event.preventDefault();
      if (!hasResults) return;
      setActiveIndex((prev) => {
        const next = Math.max(prev - 10, 0);
        scrollIntoView(next);
        return next;
      });
      return;
    }

    if (key === "Home") {
      event.preventDefault();
      if (!hasResults) return;
      setActiveIndex(0);
      scrollIntoView(0);
      return;
    }

    if (key === "End") {
      event.preventDefault();
      if (!hasResults) return;
      setActiveIndex(results.length - 1);
      scrollIntoView(results.length - 1);
      return;
    }

    if ((key === "F10" || (key === "Insert" && event.altKey)) && onQuickCreate) {
      event.preventDefault();
      onQuickCreate();
      return;
    }
  }, [results, activeIndex, onSelect, onClose, onQuickCreate, scrollIntoView]);

  return { activeIndex, setActiveIndex, listRef, handleKeyDown };
}

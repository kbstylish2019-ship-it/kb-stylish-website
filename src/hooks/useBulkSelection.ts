import { useState, useCallback } from 'react';

/**
 * Custom hook for managing bulk selection of items
 * 
 * @param items - Array of items that can be selected
 * @returns Object with selection state and helper functions
 * 
 * @example
 * const { selected, isSelected, toggle, selectAll, clearSelection } = 
 *   useBulkSelection(bookings);
 */
export function useBulkSelection<T extends { id: string }>(items: T[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const isSelected = useCallback(
    (id: string) => selected.has(id),
    [selected]
  );

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(items.map((item) => item.id)));
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const selectedItems = items.filter((item) => selected.has(item.id));

  return {
    selected,
    selectedItems,
    selectedCount: selected.size,
    isSelected,
    toggle,
    selectAll,
    clearSelection,
    hasSelection: selected.size > 0,
    isAllSelected: selected.size === items.length && items.length > 0
  };
}

import { useEffect } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  action: () => void;
  description?: string;
}

/**
 * Custom hook for registering keyboard shortcuts
 * 
 * @param shortcuts - Array of keyboard shortcut definitions
 * @param enabled - Whether shortcuts are enabled (default: true)
 * 
 * @example
 * useKeyboardShortcuts([
 *   { key: 'j', action: () => selectNext(), description: 'Next item' },
 *   { key: 'k', action: () => selectPrevious(), description: 'Previous item' },
 *   { key: 's', ctrlKey: true, action: () => save(), description: 'Save' }
 * ]);
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow Ctrl/Meta shortcuts in inputs
        if (!event.ctrlKey && !event.metaKey) {
          return;
        }
      }

      for (const shortcut of shortcuts) {
        const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatches = !shortcut.ctrlKey || event.ctrlKey;
        const metaMatches = !shortcut.metaKey || event.metaKey;
        const shiftMatches = !shortcut.shiftKey || event.shiftKey;
        const altMatches = !shortcut.altKey || event.altKey;

        if (keyMatches && ctrlMatches && metaMatches && shiftMatches && altMatches) {
          event.preventDefault();
          shortcut.action();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, enabled]);
}

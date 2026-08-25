import { useCallback, useEffect, useRef } from 'react';

/**
 * Scroll-into-view for guided flows. Returns a ref to attach to the section
 * that currently deserves attention plus a manual `scrollToFocus()` for
 * "do the next thing" buttons.
 *
 * `key` identifies the current focus target: when it changes, the section
 * scrolls itself into view (respecting prefers-reduced-motion) and briefly
 * pulses so the eye lands in the right place. A null key scrolls nothing,
 * and the first render is skipped so page loads don't yank the viewport.
 */
export function useGuidedFocus(key: string | null) {
  const ref = useRef<HTMLDivElement | null>(null);
  const seen = useRef<string | null>(null);

  const scrollToFocus = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    )?.matches;
    el.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'center'
    });
    el.classList.remove('focus-pulse');
    // Reflow so the animation restarts when the same element re-focuses.
    void el.offsetWidth;
    el.classList.add('focus-pulse');
  }, []);

  useEffect(() => {
    if (!key || seen.current === key) return;
    const first = seen.current === null;
    seen.current = key;
    if (first) return;
    // Let the newly-rendered section paint before scrolling to it.
    const id = window.setTimeout(scrollToFocus, 80);
    return () => window.clearTimeout(id);
  }, [key, scrollToFocus]);

  return { focusRef: ref, scrollToFocus };
}

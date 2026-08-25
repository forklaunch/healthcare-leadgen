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
export function useGuidedFocus<T extends HTMLElement = HTMLDivElement>(
  key: string | null
) {
  const ref = useRef<T | null>(null);
  const seen = useRef<string | null>(null);

  const scrollToFocus = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    )?.matches;
    // Top of the section, not its middle: for a tall panel, centering
    // hides the heading and the scores above the fold. `scroll-margin-top`
    // on the target keeps it clear of the sticky chrome.
    el.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'start'
    });
    el.classList.remove('focus-pulse');
    // Reflow so the animation restarts when the same element re-focuses.
    void el.offsetWidth;
    el.classList.add('focus-pulse');
  }, []);

  const mounted = useRef(false);
  useEffect(() => {
    // Only the value present at mount is skipped (so a page load doesn't
    // yank the viewport). Every focus change after that scrolls, including
    // the first one the user triggers.
    if (!mounted.current) {
      mounted.current = true;
      seen.current = key;
      return;
    }
    if (!key || seen.current === key) return;
    seen.current = key;
    // Let the newly-rendered section paint before scrolling to it.
    const id = window.setTimeout(scrollToFocus, 80);
    return () => window.clearTimeout(id);
  }, [key, scrollToFocus]);

  return { focusRef: ref, scrollToFocus };
}

/**
 * Scrolls the element with `elementId` into view whenever the id changes.
 *
 * Preferred over `useGuidedFocus` when the focus target moves between
 * siblings (e.g. an expanded table row): a single ref attached
 * conditionally is subject to React's detach-after-attach ordering, which
 * can null the ref out and silently skip the scroll. Looking the element up
 * by id at scroll time has no such race.
 */
export function useScrollToElementId(elementId: string | null) {
  const seen = useRef<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      seen.current = elementId;
      return;
    }
    if (!elementId || seen.current === elementId) return;
    seen.current = elementId;
    const id = window.setTimeout(() => {
      const el = document.getElementById(elementId);
      if (!el) return;
      const reduced = window.matchMedia?.(
        '(prefers-reduced-motion: reduce)'
      )?.matches;
      el.scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth',
        block: 'start'
      });
      el.classList.remove('focus-pulse');
      void el.offsetWidth;
      el.classList.add('focus-pulse');
    }, 90);
    return () => window.clearTimeout(id);
  }, [elementId]);
}

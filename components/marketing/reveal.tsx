'use client';

import { useEffect, useRef, type ElementType, type ReactNode } from 'react';

/**
 * Reveal a block as it comes into view.
 *
 * Arming happens on mount, not in the stylesheet. The element's resting CSS is
 * its visible state; this component adds `data-fb-armed` and only then does the
 * hidden state apply. So a visitor with JavaScript disabled, or one who scrolls
 * before hydration, reads a fully composed page rather than a column of blanks
 * — which is the usual way this pattern fails.
 *
 * It disarms itself when the phone has asked for reduced motion, and it
 * disconnects after firing: this is a page, not a scroll toy, and nothing here
 * should animate twice.
 */
export function Reveal({
  as: Tag = 'div',
  children,
  className,
  delay = 0,
  variant = 'rise'
}: {
  as?: ElementType;
  children?: ReactNode;
  className?: string;
  delay?: number;
  variant?: 'rise' | 'draw';
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof IntersectionObserver === 'undefined') return;

    node.dataset.fbArmed = 'true';

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          node.style.transitionDelay = `${delay}ms`;
          node.dataset.fbShown = 'true';
          observer.disconnect();
        }
      },
      // Fire a little before the block is fully on screen, so the motion has
      // finished by the time the reader's eye arrives at it.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [delay]);

  const attrs = variant === 'draw' ? { 'data-fb-draw': '' } : { 'data-fb-reveal': '' };

  return (
    <Tag ref={ref} className={className} {...attrs}>
      {children}
    </Tag>
  );
}

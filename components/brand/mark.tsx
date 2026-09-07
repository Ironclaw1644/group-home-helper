import { cn } from '@/lib/utils';

/**
 * The FlipBrief mark, inline.
 *
 * Same geometry as public/brand/flipbrief-mark.svg — an F whose middle arm
 * lifts at its end like a page being turned. It is inlined here rather than
 * loaded as an <img> for one reason: the lifting tip is a separate element, so
 * it can actually lift. The file on disk stays the canonical flat version for
 * favicons and one-colour letterheads.
 *
 * This lives outside components/marketing because it is not marketing: the
 * product's own mark belongs on the sign-in and install pages too, which are
 * seen by every agency and used to carry one customer's logo instead.
 *
 * It is deliberately painted in fixed `flip-*` hex rather than the themeable
 * `--brand-*` variables. This is FlipBrief's mark on FlipBrief's pages; an
 * agency's own logo appears on their letterhead and in their workspace, and
 * the two must not be able to overwrite each other.
 */
export function FlipMark({ className, tone = 'forest' }: { className?: string; tone?: 'forest' | 'paper' }) {
  const body = tone === 'paper' ? '#FBF8F3' : '#14452F';

  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="FlipBrief" className={cn('fb-mark', className)}>
      <title>FlipBrief</title>
      <g fillRule="evenodd">
        <path fill={body} d="M12 8h12v48H12z" />
        <path fill={body} d="M12 8h34v12H12z" />
        <path fill={body} d="M12 30h26v11H12z" />
        <path className="fb-mark-tip" fill="#D9B382" d="M38 30h4l12-9v11l-12 9h-4z" />
      </g>
    </svg>
  );
}

/** Mark plus wordmark, as used in the header and the footer. */
export function FlipLogo({
  className,
  tone = 'forest'
}: {
  className?: string;
  tone?: 'forest' | 'paper';
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <FlipMark className="h-7 w-7" tone={tone} />
      <span
        className={cn(
          'fb-display text-[1.3rem] font-semibold leading-none',
          tone === 'paper' ? 'text-flip-paper' : 'text-flip-forest'
        )}
      >
        FlipBrief
      </span>
    </span>
  );
}

import { splitHighlightSegments } from "@/lib/text-highlight";

/**
 * Renders `text` with every occurrence of a word from `query` wrapped in
 * <mark> (yellow highlighter). Pure/no hooks — safe to use in a Server
 * Component (feed rows, detail pages) or a Client Component alike. Segments
 * are always rendered as plain React text nodes, never raw HTML, so this is
 * safe to point at unsanitized member-authored content.
 */
export function HighlightText({ text, query, className }: { text: string; query?: string; className?: string }) {
  const segments = splitHighlightSegments(text, query);
  if (segments.length === 1 && !segments[0].matched) {
    return className ? <span className={className}>{text}</span> : <>{text}</>;
  }
  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.matched ? (
          <mark key={index} className="bg-yellow-200 text-inherit">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </span>
  );
}

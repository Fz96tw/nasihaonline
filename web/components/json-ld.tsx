/**
 * Renders one or more schema.org objects as <script type="application/ld+json">
 * tags. `dangerouslySetInnerHTML` is safe here only because every caller
 * passes machine-built schema.org data (event titles/descriptions come from
 * the DB, not raw user HTML) — JSON.stringify already escapes quotes, and
 * `</script>` sequences are additionally neutralized so injected content
 * can't prematurely close the tag.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const items = Array.isArray(data) ? data : [data];

  return (
    <>
      {items.map((item, index) => (
        <script
          key={index}
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(item).replace(/</g, "\\u003c"),
          }}
        />
      ))}
    </>
  );
}

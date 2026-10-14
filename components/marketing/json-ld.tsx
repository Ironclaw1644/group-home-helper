/**
 * One schema.org block, rendered server-side.
 *
 * `<` is escaped so a string inside the data can never close the script tag.
 * Everything passed here is our own copy or template metadata, but the escape
 * costs nothing and makes that an assumption nobody has to keep.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

const SITE = 'https://flipbrief.com';

/** BreadcrumbList for a public page. Each crumb is [name, path]. */
export function breadcrumbs(crumbs: readonly (readonly [string, string])[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(([name, path], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      item: `${SITE}${path}`
    }))
  };
}

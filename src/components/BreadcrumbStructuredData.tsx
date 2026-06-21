/**
 * BreadcrumbList JSON-LD schema.
 *
 * Why: Google uses BreadcrumbList to render the site hierarchy in
 * search results ("Home › Threat Intel › Actors › G0123") instead
 * of the URL slug. Ranks slightly higher in SERPs and gives users
 * a clearer sense of where the page sits in the site.
 *
 * Usage:
 *   <BreadcrumbListSchema items={[
 *     { name: 'Home', url: 'https://pranithjain.qzz.io' },
 *     { name: 'Threat Intel', url: 'https://pranithjain.qzz.io/threatintel' },
 *     { name: 'Actors', url: 'https://pranithjain.qzz.io/threatintel/actors' },
 *     { name: 'G0123', url: 'https://pranithjain.qzz.io/threatintel/actors/g0123' },
 *   ]} />
 *
 * The last item is the current page; it's still emitted so the
 * schema is well-formed.
 */
export interface BreadcrumbItem {
  name: string;
  /** Absolute URL. */
  url: string;
}

export function BreadcrumbListSchema({ items }: { items: BreadcrumbItem[] }): JSX.Element | null {
  if (items.length === 0) return null;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
    />
  );
}

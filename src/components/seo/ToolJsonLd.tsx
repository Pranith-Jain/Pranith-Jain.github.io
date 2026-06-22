/**
 * Drop-in JSON-LD structured data for any tool page.
 *
 * Two things the existing ToolStructuredData.tsx does NOT do that this
 * module does:
 *
 *   1. A per-tool schema (SoftwareApplication with name/description),
 *      not just the platform-wide schema. Lets search engines index
 *      individual tool pages as their own applications.
 *   2. A breadcrumbs schema derived from the section + tool name.
 *
 * Use:
 *   <ToolJsonLd
 *     section="dfir"
 *     toolName="IOC Investigator"
 *     description="Cross-source IOC investigation hub."
 *     path="/dfir/ioc-investigate"
 *   />
 */
import type { JSX } from 'react';

export interface ToolJsonLdProps {
  section: 'dfir' | 'threatintel' | 'mcp' | 'status' | 'api';
  toolName: string;
  description: string;
  path: string;
  category?: string;
  features?: string[];
}

const BASE_URL = 'https://pranithjain.qzz.io';

const SECTION_LABEL: Record<ToolJsonLdProps['section'], string> = {
  dfir: 'DFIR Toolkit',
  threatintel: 'Threat Intel Platform',
  mcp: 'MCP Server',
  status: 'System Status',
  api: 'API',
};

export function ToolJsonLd({ section, toolName, description, path, category, features }: ToolJsonLdProps): JSX.Element {
  const url = `${BASE_URL}${path}`;
  const sectionUrl = section === 'dfir' || section === 'threatintel' ? `${BASE_URL}/${section}` : BASE_URL;
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: SECTION_LABEL[section], item: sectionUrl },
      { '@type': 'ListItem', position: 3, name: toolName, item: url },
    ],
  };
  const software: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: toolName,
    description,
    url,
    applicationCategory: 'SecurityApplication',
    operatingSystem: 'Web Browser',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    isPartOf: {
      '@type': 'SoftwareApplication',
      name: 'Pranith Jain — DFIR & Threat Intel Platform',
      url: BASE_URL,
    },
    author: {
      '@type': 'Person',
      name: 'Pranith Jain',
      url: BASE_URL,
    },
  };
  if (category) software.category = category;
  if (features && features.length > 0) software.featureList = features;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(software) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
    </>
  );
}

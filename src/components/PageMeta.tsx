const SITE_NAME = 'Pranith Jain · Security Portfolio';

export interface PageMetaProps {
  title: string;
  description?: string;
  section?: string;
  canonicalPath?: string;
  fullTitle?: string;
  ogImage?: string;
}

export function PageMeta({ title, description, section, canonicalPath, fullTitle, ogImage }: PageMetaProps) {
  const resolvedTitle = fullTitle ?? (section ? `${title} — ${section} · ${SITE_NAME}` : `${title} · ${SITE_NAME}`);

  const siteUrl = 'https://pranithjain.qzz.io';
  const resolvedOgImage = ogImage
    ? ogImage.startsWith('http')
      ? ogImage
      : `${siteUrl}${ogImage}`
    : `${siteUrl}/og-image.svg`;

  const ogUrl = canonicalPath ? `${siteUrl}${canonicalPath}` : siteUrl;
  const ogType = section === 'Threat Intel' || section === 'DFIR' ? 'website' : 'profile';

  return (
    <>
      <title>{resolvedTitle}</title>
      {description && <meta name="description" content={description} />}
      {description && <meta property="og:description" content={description} />}
      {description && <meta name="twitter:description" content={description} />}
      <meta property="og:title" content={resolvedTitle} />
      <meta property="og:image" content={resolvedOgImage} />
      <meta property="og:image:alt" content={resolvedTitle} />
      <meta property="og:url" content={ogUrl} />
      <meta property="og:type" content={ogType} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={resolvedTitle} />
      <meta name="twitter:image" content={resolvedOgImage} />
      <meta name="twitter:image:alt" content={resolvedTitle} />
      <meta name="twitter:site" content="@pranithjain" />
      {canonicalPath && <link rel="canonical" href={`${siteUrl}${canonicalPath}`} />}
    </>
  );
}

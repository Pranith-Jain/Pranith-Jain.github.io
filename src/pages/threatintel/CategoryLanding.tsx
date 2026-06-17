/**
 * Generic SaaS-style category landing page.
 *
 * Renders the tile grid for a given hub. The hub data is pulled from
 * `data/threatintel-hubs.ts` so every page registered there automatically
 * gets a tile here.
 *
 * The actual hub id is read from the URL: /threatintel/<hub-id> or
 * /threatintel/<hub-id>/ (any trailing slash is normalized).
 */
import { useParams } from 'react-router-dom';
import { CategoryHub, type CategoryItem } from '../../components/CategoryHub';
import { HUB_META, type HubPage } from '../../data/threatintel-hubs';
import type { LucideIcon } from 'lucide-react';

export default function CategoryLanding(): JSX.Element {
  // The route is /threatintel/:hubId, so we pull hubId from the URL.
  // (When registered as /threatintel/:hubId, hubId will be the last path segment.)
  const params = useParams<{ hubId?: string; '*'?: string }>();
  const hubId = params.hubId ?? params['*'] ?? '';
  const hub = HUB_META.find((h) => h.id === hubId);

  if (!hub) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-display font-semibold">Unknown hub</h1>
        <p className="mt-2 text-slate-500">
          No hub registered for{' '}
          <code className="font-mono bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">{hubId}</code>.
        </p>
      </div>
    );
  }

  const items: CategoryItem[] = hub.pages.map((p) => hubPageToItem(p, hub.icon));
  return (
    <CategoryHub
      title={hub.label}
      blurb={hub.blurb}
      icon={hub.icon}
      backTo="/threatintel"
      backLabel="Threat Intel home"
      items={items}
      accentClass={hub.tone.split(' ')[0]}
    />
  );
}

function hubPageToItem(p: HubPage, fallbackIcon: LucideIcon): CategoryItem {
  return {
    label: p.label,
    desc: p.desc,
    href: p.path,
    icon: p.icon ?? fallbackIcon,
    badge: p.badge,
  };
}

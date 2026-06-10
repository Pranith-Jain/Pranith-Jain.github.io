import { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapIcon, Download, Upload, Plus, FilePlus2 } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { IdentifierGraph } from '../../components/dfir/osint/IdentifierGraph';
import { MapPane } from '../../components/dfir/osint/MapPane';
import { IdentifierForm } from '../../components/dfir/osint/IdentifierForm';
import { PinForm } from '../../components/dfir/osint/PinForm';
import {
  emptyProject,
  type Identifier,
  type Link,
  type OsintProject,
  type Pin,
} from '../../lib/dfir/osint/osint-schema';
import { loadState, saveProject, serializeProject, parseImport } from '../../lib/dfir/osint/osint-store';
import { reverseGeocode } from '../../lib/dfir/osint/geocode';

const ICONS_KEY = 'dfir-osint-icons:v1';

function loadIcons(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ICONS_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

type Selection = { kind: 'identifier' | 'pin'; id: string } | null;

export default function OsintMapper(): JSX.Element {
  const [project, setProject] = useState<OsintProject>(() => loadState().current ?? emptyProject('Untitled case'));
  const [icons, setIcons] = useState<Record<string, string>>(loadIcons);
  const [tab, setTab] = useState<'graph' | 'map'>('graph');
  const [pending, setPending] = useState<{ lat: number; lng: number; address?: string } | null>(null);
  const [addingId, setAddingId] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Debounced autosave. Date.now() is fine in the browser (not a workflow script).
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveProject(project, Date.now()), 400);
    return () => clearTimeout(saveTimer.current);
  }, [project]);

  const linkedPinIds = useMemo(() => {
    if (selection?.kind !== 'identifier') return new Set<string>();
    return new Set(project.links.filter((l) => l.identifierId === selection.id).map((l) => l.pinId));
  }, [selection, project.links]);

  function addIdentifier(id: Identifier, iconDataUrl?: string) {
    let withIcon = id;
    if (iconDataUrl) {
      const iconId = crypto.randomUUID();
      const nextIcons = { ...icons, [iconId]: iconDataUrl };
      setIcons(nextIcons);
      try {
        localStorage.setItem(ICONS_KEY, JSON.stringify(nextIcons));
      } catch {
        // quota / private-mode: keep icon in memory only
      }
      withIcon = { ...id, customIconId: iconId };
    }
    setProject((p) => ({ ...p, identifiers: [...p.identifiers, withIcon] }));
    setAddingId(false);
  }

  function addPin(pin: Pin, linkedIds: string[]) {
    const links: Link[] = linkedIds.map((identifierId) => ({ id: crypto.randomUUID(), identifierId, pinId: pin.id }));
    setProject((p) => ({ ...p, pins: [...p.pins, pin], links: [...p.links, ...links] }));
    setPending(null);
  }

  async function handleMapClick(lat: number, lng: number) {
    const address = (await reverseGeocode(lat, lng)) ?? undefined;
    setPending({ lat, lng, address });
  }

  function doExport() {
    const blob = new Blob([serializeProject(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '-') || 'case'}.osint.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function doImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then((t) => {
      const imported = parseImport(t);
      if (imported) {
        setProject(imported);
        setSelection(null);
        setImportError(null);
      } else {
        setImportError('Invalid .osint.json file — not a recognized OSINT project.');
      }
    });
    e.target.value = '';
  }

  const overlayWrap = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4';
  const overlayCard = 'bg-white dark:bg-slate-900 rounded-xl p-4 w-full max-w-md shadow-xl';

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<MapIcon size={28} />}
      title="OSINT Mapper"
      description="Catalog identifiers, pin locations, and cross-link them. All data stays in your browser."
      maxWidthClass="max-w-7xl"
      error={importError}
      onRetry={importError ? () => setImportError(null) : undefined}
      headerExtra={
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setProject(emptyProject('Untitled case'));
              setSelection(null);
            }}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700"
          >
            <FilePlus2 size={14} /> New
          </button>
          <button
            onClick={() => setAddingId(true)}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700"
          >
            <Plus size={14} /> Add identifier
          </button>
          <button
            onClick={doExport}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700"
          >
            <Download size={14} /> Export
          </button>
          <label className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 cursor-pointer">
            <Upload size={14} /> Import
            <input type="file" accept="application/json,.json" className="hidden" onChange={doImport} />
          </label>
        </div>
      }
    >
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab('graph')}
          className={`px-3 py-1.5 text-sm rounded ${tab === 'graph' ? 'bg-brand-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}
        >
          Graph ({project.identifiers.length})
        </button>
        <button
          onClick={() => setTab('map')}
          className={`px-3 py-1.5 text-sm rounded ${tab === 'map' ? 'bg-brand-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}
        >
          Map ({project.pins.length})
        </button>
      </div>

      {tab === 'graph' ? (
        <IdentifierGraph
          identifiers={project.identifiers}
          pins={project.pins}
          links={project.links}
          customIcons={icons}
          selectedId={selection?.kind === 'identifier' ? selection.id : null}
          onSelect={(id) => setSelection(id ? { kind: 'identifier', id } : null)}
        />
      ) : (
        <MapPane
          pins={project.pins}
          selectedPinId={selection?.kind === 'pin' ? selection.id : linkedPinIds.size ? [...linkedPinIds][0] : null}
          onMapClick={handleMapClick}
          onSelectPin={(id) => setSelection({ kind: 'pin', id })}
        />
      )}

      {addingId && (
        <div className={overlayWrap}>
          <div className={overlayCard}>
            <h2 className="font-medium mb-3">Add identifier</h2>
            <IdentifierForm onSubmit={addIdentifier} onCancel={() => setAddingId(false)} />
          </div>
        </div>
      )}
      {pending && (
        <div className={overlayWrap}>
          <div className={overlayCard}>
            <h2 className="font-medium mb-3">Add pin</h2>
            <PinForm
              lat={pending.lat}
              lng={pending.lng}
              address={pending.address}
              identifiers={project.identifiers}
              onSubmit={addPin}
              onCancel={() => setPending(null)}
            />
          </div>
        </div>
      )}
    </DataPageLayout>
  );
}

import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Image } from 'lucide-react';

const ReverseImage = lazy(() => import('./ReverseImage'));
const ImageFingerprint = lazy(() => import('./ImageFingerprint'));
const ScreenshotIntel = lazy(() => import('./ScreenshotIntel'));

type TabId = 'reverse' | 'fingerprint' | 'ocr';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'reverse', label: 'REVERSE SEARCH', desc: 'Reverse image search across multiple engines' },
  { id: 'fingerprint', label: 'FINGERPRINT', desc: 'Generate perceptual hashes and fingerprints for images' },
  { id: 'ocr', label: 'SCREENSHOT OCR', desc: 'Extract text from screenshots and images' },
];

export default function ImageIntel(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('reverse');

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Image size={28} />}
      title="Image Intelligence"
      description="Reverse search, fingerprint, and OCR tools for image-based intelligence gathering."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="Image intelligence tools"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${
              activeTab === t.id
                ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
            aria-selected={activeTab === t.id}
            role="tab"
          >
            {t.label}
          </button>
        ))}
      </nav>

      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
        {TABS.find((t) => t.id === activeTab)?.desc}
      </p>

      <div role="tabpanel">
        <Suspense fallback={<TabLoader />}>
          {activeTab === 'reverse' && <ReverseImage />}
          {activeTab === 'fingerprint' && <ImageFingerprint />}
          {activeTab === 'ocr' && <ScreenshotIntel />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}

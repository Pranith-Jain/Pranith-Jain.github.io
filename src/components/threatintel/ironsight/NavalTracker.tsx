import { useMemo } from 'react';
import { Anchor } from 'lucide-react';

interface NavalVessel {
  name: string;
  hull: string;
  type: string;
  class: string;
  navy: string;
  lat: number;
  lon: number;
  status: string;
  region: string;
  group?: string;
}

const NAVY_COLORS: Record<string, string> = {
  'US Navy': 'text-blue-400',
  'Royal Navy': 'text-sky-400',
  'French Navy': 'text-indigo-400',
  'Israeli Navy': 'text-cyan-400',
  'Iran Navy': 'text-red-400',
  'IRGC Navy': 'text-red-400',
  'Saudi Navy': 'text-emerald-400',
};
const TYPE_ICONS: Record<string, string> = {
  'Aircraft Carrier': '⛴',
  Destroyer: '🛥',
  Cruiser: '🛥',
  Frigate: '🛥',
  Corvette: '🚤',
  Submarine: '🔻',
  'Guided Missile Submarine': '🔻',
  'Amphibious Assault Ship': '⛴',
  'Fast Attack Craft': '🚤',
};

const SHIPS: NavalVessel[] = [
  {
    name: 'USS Bataan',
    hull: 'LHD-5',
    type: 'Amphibious Assault Ship',
    class: 'Wasp-class',
    navy: 'US Navy',
    lat: 26.1,
    lon: 50.5,
    status: 'Deployed',
    region: 'Persian Gulf',
    group: '5th Fleet',
  },
  {
    name: 'USS Mason',
    hull: 'DDG-87',
    type: 'Destroyer',
    class: 'Arleigh Burke-class',
    navy: 'US Navy',
    lat: 14.5,
    lon: 42.8,
    status: 'Active',
    region: 'Red Sea',
    group: 'Red Sea Task Force',
  },
  {
    name: 'USS Carney',
    hull: 'DDG-64',
    type: 'Destroyer',
    class: 'Arleigh Burke-class',
    navy: 'US Navy',
    lat: 13.8,
    lon: 43.2,
    status: 'Active',
    region: 'Red Sea',
    group: 'Red Sea Task Force',
  },
  {
    name: 'USS Laboon',
    hull: 'DDG-58',
    type: 'Destroyer',
    class: 'Arleigh Burke-class',
    navy: 'US Navy',
    lat: 25.8,
    lon: 52.1,
    status: 'Deployed',
    region: 'Persian Gulf',
    group: '5th Fleet',
  },
  {
    name: 'USS Philippine Sea',
    hull: 'CG-58',
    type: 'Cruiser',
    class: 'Ticonderoga-class',
    navy: 'US Navy',
    lat: 25.2,
    lon: 56.8,
    status: 'Deployed',
    region: 'Strait of Hormuz',
    group: 'Carrier Strike Group',
  },
  {
    name: 'USS Florida',
    hull: 'SSGN-728',
    type: 'Guided Missile Submarine',
    class: 'Ohio-class',
    navy: 'US Navy',
    lat: 26.5,
    lon: 56.2,
    status: 'Deployed',
    region: 'Strait of Hormuz',
    group: 'CENTCOM',
  },
  {
    name: 'HMS Diamond',
    hull: 'D34',
    type: 'Destroyer',
    class: 'Type 45',
    navy: 'Royal Navy',
    lat: 14.2,
    lon: 42.5,
    status: 'Active',
    region: 'Red Sea',
    group: 'Op Prosperity Guardian',
  },
  {
    name: 'FS Alsace',
    hull: 'D656',
    type: 'Frigate',
    class: 'FREMM-class',
    navy: 'French Navy',
    lat: 34.5,
    lon: 33.2,
    status: 'Deployed',
    region: 'Eastern Med',
  },
  {
    name: 'INS Magen',
    hull: "Sa'ar 6",
    type: 'Corvette',
    class: "Sa'ar 6-class",
    navy: 'Israeli Navy',
    lat: 32.8,
    lon: 34.5,
    status: 'Patrol',
    region: 'Eastern Med',
  },
  {
    name: 'INS Dolphin',
    hull: 'Submarine',
    type: 'Submarine',
    class: 'Dolphin-class',
    navy: 'Israeli Navy',
    lat: 31.5,
    lon: 33.8,
    status: 'Patrol',
    region: 'Eastern Med',
  },
  {
    name: 'IRIS Makran',
    hull: 'Forward Base Ship',
    type: 'Forward Base Ship',
    class: 'Makran-class',
    navy: 'Iran Navy',
    lat: 25.4,
    lon: 57.5,
    status: 'Active',
    region: 'Strait of Hormuz',
  },
  {
    name: 'IRIS Sahand',
    hull: 'F-74',
    type: 'Frigate',
    class: 'Moudge-class',
    navy: 'Iran Navy',
    lat: 27.1,
    lon: 56.3,
    status: 'Active',
    region: 'Persian Gulf',
  },
  {
    name: 'IRGCN Fast Boats',
    hull: 'Various',
    type: 'Fast Attack Craft',
    class: 'Various',
    navy: 'IRGC Navy',
    lat: 26.8,
    lon: 56.1,
    status: 'Active',
    region: 'Strait of Hormuz',
    group: 'IRGCN Patrol',
  },
  {
    name: 'HMS Al Riyadh',
    hull: 'F-3000S',
    type: 'Frigate',
    class: 'Al Riyadh-class',
    navy: 'Saudi Navy',
    lat: 20.5,
    lon: 39.8,
    status: 'Patrol',
    region: 'Red Sea',
  },
];

export default function NavalTracker() {
  const byNavy = useMemo(() => {
    const result: Record<string, NavalVessel[]> = {};
    SHIPS.forEach((s) => {
      if (!result[s.navy]) result[s.navy] = [];
      result[s.navy].push(s);
    });
    return result;
  }, []);
  const navyOrder = ['US Navy', 'Royal Navy', 'French Navy', 'Israeli Navy', 'Saudi Navy', 'Iran Navy', 'IRGC Navy'];
  const sorted = useMemo(
    () =>
      Object.keys(byNavy).sort(
        (a, b) =>
          (navyOrder.indexOf(a) === -1 ? 99 : navyOrder.indexOf(a)) -
          (navyOrder.indexOf(b) === -1 ? 99 : navyOrder.indexOf(b))
      ),
    [byNavy]
  );

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Anchor size={16} className="text-blue-400" />
          <h3 className="text-tool font-bold font-mono text-slate-700 dark:text-slate-200">NAVAL TRACKER</h3>
        </div>
        <span className="text-mini font-mono text-slate-400">{SHIPS.length} vessels · OSINT</span>
      </div>
      <div className="flex gap-3 mb-3 flex-wrap">
        {(['Persian Gulf', 'Red Sea', 'Eastern Med', 'Strait of Hormuz'] as const).map((r) => {
          const c = SHIPS.filter((s) => s.region === r).length;
          return c > 0 ? (
            <span key={r} className="text-mini text-slate-400">
              <span className="text-cyan-400 font-bold">{c}</span> {r}
            </span>
          ) : null;
        })}
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
        {sorted.map((navy) => (
          <div key={navy}>
            <div
              className={`text-mini font-bold font-mono tracking-wider mb-1 ${NAVY_COLORS[navy] || 'text-slate-400'}`}
            >
              {navy.toUpperCase()} ({byNavy[navy].length})
            </div>
            {byNavy[navy].map((ship, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">{TYPE_ICONS[ship.type] || '🛥'}</span>
                  <span className="text-tool font-medium text-slate-700 dark:text-slate-200">{ship.name}</span>
                  <span className="text-mini text-slate-400 font-mono">{ship.hull}</span>
                </div>
                <span
                  className={`text-mini px-1.5 py-0.5 rounded ${ship.status === 'Active' ? 'text-emerald-400 bg-emerald-500/10' : 'text-cyan-400 bg-cyan-500/10'}`}
                >
                  {ship.status}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

import { lazy, Suspense } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Crosshair } from 'lucide-react';

const IsraelAlerts = lazy(() => import('../../components/threatintel/ironsight/IsraelAlerts'));
const NavalTracker = lazy(() => import('../../components/threatintel/ironsight/NavalTracker'));
const MilitaryFlights = lazy(() => import('../../components/threatintel/ironsight/MilitaryFlights'));
const StrikeTracker = lazy(() => import('../../components/threatintel/ironsight/StrikeTracker'));
const RegionalThreats = lazy(() => import('../../components/threatintel/ironsight/RegionalThreats'));
const PredictionMarkets = lazy(() => import('../../components/threatintel/ironsight/PredictionMarkets'));
const DefenseMarkets = lazy(() => import('../../components/threatintel/ironsight/DefenseMarkets'));
const SatellitePanel = lazy(() => import('../../components/threatintel/ironsight/SatellitePanel'));

const Fallback = ({ className = 'h-48' }: { className?: string }) => (
  <div className={`${className} rounded-xl bg-slate-100 dark:bg-[rgb(var(--surface-200))] animate-pulse`} />
);

export default function Ironsight() {
  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Crosshair size={28} />}
      title="IRONSIGHT OSINT"
      description="Real-time OSINT command center — 50+ live sources including alerts, military tracking, strikes, prediction markets, and satellite thermal detection. Replicated from NoblerWorks-HQ/IRONSIGHT."
      maxWidthClass="max-w-7xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Suspense fallback={<Fallback />}>
            <IsraelAlerts />
          </Suspense>
          <Suspense fallback={<Fallback />}>
            <StrikeTracker />
          </Suspense>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <Suspense fallback={<Fallback className="h-64" />}>
              <RegionalThreats />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<Fallback className="h-64" />}>
              <NavalTracker />
            </Suspense>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Suspense fallback={<Fallback />}>
            <MilitaryFlights />
          </Suspense>
          <Suspense fallback={<Fallback />}>
            <PredictionMarkets />
          </Suspense>
          <Suspense fallback={<Fallback />}>
            <DefenseMarkets />
          </Suspense>
          <Suspense fallback={<Fallback />}>
            <SatellitePanel />
          </Suspense>
        </div>
      </div>
    </DataPageLayout>
  );
}

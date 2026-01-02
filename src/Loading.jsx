export default function Loading() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-brand-500 border-t-transparent"></div>
        <p className="mt-3 text-slate-600 dark:text-slate-400">Loading portfolio...</p>
      </div>
    </div>
  );
}
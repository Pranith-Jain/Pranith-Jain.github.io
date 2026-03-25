import { ArrowUp } from 'lucide-react';

interface BackToTopProps {
  visible: boolean;
  onClick: () => void;
}

export function BackToTop({ visible, onClick }: BackToTopProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`fixed bottom-8 right-8 z-50 grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-white shadow-lg transition-all duration-300 hover:bg-brand-700 hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'
      }`}
      aria-label="Back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <ArrowUp className="h-6 w-6" aria-hidden="true" />
    </button>
  );
}

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
      className={`fixed bottom-8 right-8 z-50 grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-white shadow-lg transition-all duration-300 hover:bg-brand-700 focus:outline-none ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'
      }`}
      aria-label="Back to top"
    >
      <ArrowUp className="h-6 w-6" />
    </button>
  );
}

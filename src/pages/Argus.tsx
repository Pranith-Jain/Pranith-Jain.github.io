import { useEffect } from 'react';

export default function ArgusPage() {
  useEffect(() => {
    window.location.href = 'https://argus-threat-intel.pages.dev/';
  }, []);
  return null;
}

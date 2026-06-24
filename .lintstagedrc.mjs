import { lstatSync } from 'fs';

// Filter out symlinks — prettier rejects them with an explicit error when
// they are passed as explicit file arguments (which lint-staged does).
// Symlinks like api/src/lib/si-svg-png.ts / social-carousel-raster.ts
// are worker tree re-exports that need no formatting.
function nonSymlinks(files) {
  return files.filter((f) => {
    try {
      return !lstatSync(f).isSymbolicLink();
    } catch {
      return true;
    }
  });
}

export default {
  '*.{ts,tsx}': (files) => {
    const real = nonSymlinks(files);
    if (real.length === 0) return [];
    return [`eslint --fix ${real.join(' ')}`, `prettier --write ${real.join(' ')}`];
  },
  '*.{js,jsx}': (files) => {
    const real = nonSymlinks(files);
    if (real.length === 0) return [];
    return [`eslint --fix ${real.join(' ')}`, `prettier --write ${real.join(' ')}`];
  },
  '*.{css,scss,json,md}': (files) => {
    const real = nonSymlinks(files);
    if (real.length === 0) return [];
    return [`prettier --write ${real.join(' ')}`];
  },
};

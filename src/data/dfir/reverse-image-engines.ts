/**
 * Reverse-image-search URL templates.
 *
 * Pure URL generation — we don't upload, scrape, or proxy anything.
 * The user clicks through to the engine, which fetches the image
 * server-side from the URL the user pasted.
 *
 * Each engine accepts an image URL via a documented (or stable) query
 * parameter. The URLs were probed against current behaviour at last
 * review; if an engine changes its query shape, fix it here.
 */

export interface ReverseImageEngine {
  id: string;
  name: string;
  blurb: string;
  /** Build the lookup URL from the image URL the user pasted. */
  build: (imageUrl: string) => string;
  /** True if the engine is generally reliable for this lookup style. */
  recommended?: boolean;
  /** Notes on coverage strengths / weaknesses. */
  coverage?: string;
}

const enc = (s: string) => encodeURIComponent(s);

export const ENGINES: ReverseImageEngine[] = [
  {
    id: 'google-lens',
    name: 'Google Lens',
    blurb: 'Strongest single engine for product / brand / face matches against the open web.',
    build: (u) => `https://lens.google.com/uploadbyurl?url=${enc(u)}`,
    recommended: true,
    coverage: 'Best general coverage. Strong on logos, products, faces, locations.',
  },
  {
    id: 'google-images',
    name: 'Google Images (legacy)',
    blurb: 'Older Google reverse-image endpoint — sometimes returns matches Lens misses.',
    build: (u) => `https://www.google.com/searchbyimage?image_url=${enc(u)}&safe=off`,
    coverage: 'Use as a cross-check for Lens.',
  },
  {
    id: 'bing-visual',
    name: 'Bing Visual Search',
    blurb: "Microsoft's reverse-image engine. Strong on stock-photo + retail matches.",
    build: (u) => `https://www.bing.com/images/search?q=imgurl:${enc(u)}&view=detailv2&iss=sbi`,
    recommended: true,
    coverage: 'Independent index from Google. Worth running in parallel.',
  },
  {
    id: 'yandex',
    name: 'Yandex Images',
    blurb: 'Best face-matching engine. Often catches things Google + Bing miss.',
    build: (u) => `https://yandex.com/images/search?rpt=imageview&url=${enc(u)}`,
    recommended: true,
    coverage: 'Especially strong on faces, Russian-language web, archived imagery.',
  },
  {
    id: 'tineye',
    name: 'TinEye',
    blurb: 'Original reverse-image engine. Strong on EXACT matches + first-seen attribution.',
    build: (u) => `https://tineye.com/search?url=${enc(u)}`,
    recommended: true,
    coverage: 'Lower coverage but better than the others at finding the FIRST appearance of an image.',
  },
  {
    id: 'baidu',
    name: 'Baidu Images',
    blurb: 'Chinese-language web index. Useful for content that originated in CN/APAC.',
    build: (u) => `https://graph.baidu.com/upload?image=${enc(u)}`,
    coverage: 'Chinese web has different content; useful for APAC OSINT.',
  },
  {
    id: 'sogou',
    name: 'Sogou Pics',
    blurb: 'Tencent search engine. Cross-check for Baidu coverage.',
    build: (u) => `https://pic.sogou.com/pic/searchList.jsp?query=${enc(u)}`,
    coverage: 'Less reliable than Baidu; included for completeness on CN content.',
  },
  {
    id: 'karma-decay',
    name: 'Karma Decay (Reddit)',
    blurb: 'Reddit-only reverse-image search. Useful when you suspect the image is from a Reddit post.',
    build: (u) => `https://karmadecay.com/index/?kdtoolver=b1&q=${enc(u)}`,
    coverage: 'Narrow but useful for "did this circulate on Reddit first?" lookups.',
  },
];

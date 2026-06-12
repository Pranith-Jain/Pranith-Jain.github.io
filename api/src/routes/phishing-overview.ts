import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchPhishingUrlsCached, brandFromUrl } from './phishing-urls';

export interface CategoryDef {
  key: string;
  label: string;
  description: string;
}

export interface PhishingOverviewStats {
  detections_total: number;
  brands_detected: number;
  categories: Array<{ key: string; label: string; count: number; description: string }>;
  top_brands: Array<{ brand: string; count: number }>;
}

export interface PhishingOverviewResponse {
  generated_at: string;
  stats: PhishingOverviewStats;
}

const CATEGORIES: CategoryDef[] = [
  { key: 'finance', label: 'Finance', description: 'Banks, payment processors, and financial services' },
  { key: 'cryptocurrency', label: 'Cryptocurrency', description: 'Exchanges, wallets, and DeFi platforms' },
  { key: 'application', label: 'Application', description: 'SaaS, cloud, and software vendors' },
  { key: 'ecommerce', label: 'E-commerce', description: 'Online retail and marketplaces' },
  { key: 'social-media', label: 'Social Media', description: 'Social networking platforms' },
  { key: 'email', label: 'Email', description: 'Webmail and email service providers' },
  { key: 'entertainment', label: 'Entertainment', description: 'Streaming and media platforms' },
  { key: 'government', label: 'Government', description: 'Tax agencies and government services' },
  { key: 'telecom', label: 'Telecom', description: 'Telecommunications providers' },
  { key: 'gaming', label: 'Gaming', description: 'Gaming platforms' },
  { key: 'logistics', label: 'Logistics', description: 'Shipping and postal services' },
  { key: 'travel', label: 'Travel', description: 'Travel and hospitality platforms' },
  { key: 'other', label: 'Other', description: 'Other brands and uncategorized targets' },
];

const BRAND_TO_CATEGORY: Record<string, string> = {
  Microsoft: 'application',
  Google: 'application',
  Apple: 'application',
  Amazon: 'ecommerce',
  Meta: 'social-media',
  Facebook: 'social-media',
  LinkedIn: 'social-media',
  Twitter: 'social-media',
  GitHub: 'application',
  Dropbox: 'application',
  Adobe: 'application',
  Yahoo: 'email',
  AOL: 'email',
  ProtonMail: 'email',
  Netflix: 'entertainment',
  Spotify: 'entertainment',
  'Disney+': 'entertainment',
  'HBO Max': 'entertainment',
  Hulu: 'entertainment',
  'Amazon Prime': 'entertainment',
  PayPal: 'finance',
  Stripe: 'finance',
  'Cash App': 'finance',
  Venmo: 'finance',
  Zelle: 'finance',
  'Bank of America': 'finance',
  Chase: 'finance',
  'Wells Fargo': 'finance',
  Citibank: 'finance',
  Amex: 'finance',
  'Capital One': 'finance',
  Discover: 'finance',
  'US Bank': 'finance',
  PNC: 'finance',
  TD: 'finance',
  HSBC: 'finance',
  Barclays: 'finance',
  Lloyds: 'finance',
  NatWest: 'finance',
  Halifax: 'finance',
  TSB: 'finance',
  Monzo: 'finance',
  Revolut: 'finance',
  Starling: 'finance',
  N26: 'finance',
  ING: 'finance',
  Santander: 'finance',
  'BNP Paribas': 'finance',
  'Societe Generale': 'finance',
  'Credit Agricole': 'finance',
  'Deutsche Bank': 'finance',
  Commerzbank: 'finance',
  DKB: 'finance',
  Sparkasse: 'finance',
  UBS: 'finance',
  ICICI: 'finance',
  HDFC: 'finance',
  SBI: 'finance',
  Coinbase: 'cryptocurrency',
  Binance: 'cryptocurrency',
  'Crypto.com': 'cryptocurrency',
  Kraken: 'cryptocurrency',
  KuCoin: 'cryptocurrency',
  OKX: 'cryptocurrency',
  Bybit: 'cryptocurrency',
  MetaMask: 'cryptocurrency',
  'Trust Wallet': 'cryptocurrency',
  Ledger: 'cryptocurrency',
  Phantom: 'cryptocurrency',
  Exodus: 'cryptocurrency',
  Trezor: 'cryptocurrency',
  Tezos: 'cryptocurrency',
  BitGo: 'cryptocurrency',
  Uniswap: 'cryptocurrency',
  DHL: 'logistics',
  FedEx: 'logistics',
  USPS: 'logistics',
  UPS: 'logistics',
  'Royal Mail': 'logistics',
  eBay: 'ecommerce',
  Walmart: 'ecommerce',
  Etsy: 'ecommerce',
  Shopify: 'ecommerce',
  Costco: 'ecommerce',
  'Best Buy': 'ecommerce',
  Target: 'ecommerce',
  Allegro: 'ecommerce',
  DocuSign: 'application',
  Salesforce: 'application',
  Slack: 'application',
  Zoom: 'application',
  'Cisco Webex': 'application',
  'AT&T': 'telecom',
  Verizon: 'telecom',
  'T-Mobile': 'telecom',
  Vodafone: 'telecom',
  BT: 'telecom',
  Steam: 'gaming',
  Roblox: 'gaming',
  'Epic Games': 'gaming',
  'Riot Games': 'gaming',
  Blizzard: 'gaming',
  'EA Games': 'gaming',
  'Booking.com': 'travel',
  Airbnb: 'travel',
  Expedia: 'travel',
  Uber: 'travel',
  IRS: 'government',
  HMRC: 'government',
  SSA: 'government',
  CRA: 'government',
  ATO: 'government',
  TurboTax: 'government',
  'H&R Block': 'government',
};

function computeOverview(urls: Array<{ url: string; target?: string }>): PhishingOverviewStats {
  const brandCounts = new Map<string, number>();
  for (const u of urls) {
    const brand = u.target ?? brandFromUrl(u.url) ?? undefined;
    if (!brand) continue;
    brandCounts.set(brand, (brandCounts.get(brand) ?? 0) + 1);
  }

  const topBrands = [...brandCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([brand, count]) => ({ brand, count }));

  const catCounts = new Map<string, number>();
  for (const brand of brandCounts.keys()) {
    const cat = BRAND_TO_CATEGORY[brand] ?? 'other';
    catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  }

  const categories = CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    description: c.description,
    count: catCounts.get(c.key) ?? 0,
  }));

  return {
    detections_total: urls.length,
    brands_detected: brandCounts.size,
    categories,
    top_brands: topBrands,
  };
}

export async function phishingOverviewHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const data = await fetchPhishingUrlsCached(c.executionCtx, c.env.KV_CACHE);
  const stats = computeOverview(data.urls);

  const body: PhishingOverviewResponse = {
    generated_at: new Date().toISOString(),
    stats,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300, stale-while-revalidate=1200',
    },
  });
}

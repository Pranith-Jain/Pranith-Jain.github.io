import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ToolGrid } from '../components/dfir/ToolGrid';
import { ThreatIntelFeed } from '../components/dfir/ThreatIntelFeed';

const PROVIDERS = ['VirusTotal', 'AbuseIPDB', 'Shodan', 'GreyNoise', 'OTX', 'URLScan', 'Hybrid Analysis', 'Pulsedive'];

export default function DFIRPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-6xl mx-auto px-8 py-16">
        <header className="mb-12">
          <span className="inline-block text-xs uppercase tracking-[0.2em] text-[#00fff9] font-mono mb-3">
            DFIR Toolkit
          </span>
          <h1 className="text-5xl sm:text-6xl font-display font-bold mb-4 leading-tight">
            Practical security tools, served from one URL.
          </h1>
          <p className="text-lg text-[#a1a1aa] max-w-2xl mb-6 leading-relaxed">
            IOC checks across 8 sources, domain health, phishing email parsing, exposure mapping, file hash lookups, and
            a working knowledge base. All on the Cloudflare free tier.
          </p>
          <div className="flex items-center gap-4 text-sm font-mono text-[#a1a1aa]">
            <span>
              <span className="text-[#fafafa] text-base">9</span> tools
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="text-[#fafafa] text-base">8</span> data sources
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="text-[#fafafa] text-base">0</span> credits required
            </span>
          </div>
        </header>

        <section className="mb-16">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="font-display font-bold text-2xl">Tools</h2>
            <Link
              to="/dfir/dashboard"
              className="text-xs font-mono text-[#00fff9] hover:underline inline-flex items-center gap-1"
            >
              recent lookups <ArrowRight size={12} />
            </Link>
          </div>
          <ToolGrid />
        </section>

        <section className="mb-16">
          <ThreatIntelFeed />
        </section>

        <footer className="mt-20 pt-10 border-t border-[#1f1f23]">
          <h3 className="text-xs uppercase tracking-wider text-[#a1a1aa] font-mono mb-3">Data Sources</h3>
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map((p) => (
              <span key={p} className="text-xs font-mono px-2 py-1 rounded border border-[#1f1f23] text-[#a1a1aa]">
                {p}
              </span>
            ))}
            <span className="text-xs font-mono px-2 py-1 rounded border border-[#1f1f23] text-[#a1a1aa]">crt.sh</span>
            <span className="text-xs font-mono px-2 py-1 rounded border border-[#1f1f23] text-[#a1a1aa]">RDAP</span>
            <span className="text-xs font-mono px-2 py-1 rounded border border-[#1f1f23] text-[#a1a1aa]">
              Cloudflare DoH
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { ToolGrid } from '../components/dfir/ToolGrid';
import { ThreatIntelFeed } from '../components/dfir/ThreatIntelFeed';

const PROVIDERS = ['VirusTotal', 'AbuseIPDB', 'Shodan', 'GreyNoise', 'OTX', 'URLScan', 'Hybrid Analysis', 'Pulsedive'];

export default function DFIRPage(): JSX.Element {
  return (
    <div className="max-w-6xl mx-auto px-8 py-16 text-slate-900 dark:text-slate-100">
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-12"
      >
        <span className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-3">
          DFIR Toolkit
        </span>
        <h1 className="text-5xl sm:text-6xl font-display font-bold text-slate-900 dark:text-slate-100 mb-4 leading-tight">
          Practical security tools, served from one URL.
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mb-6 leading-relaxed">
          IOC checks across 8 sources, domain health, phishing email parsing, exposure mapping, file hash lookups, and a
          working knowledge base. All on the Cloudflare free tier.
        </p>
        <div className="flex items-center gap-4 text-sm font-mono text-slate-600 dark:text-slate-400">
          <span>
            <span className="text-slate-900 dark:text-slate-100 text-base">15</span> tools
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="text-slate-900 dark:text-slate-100 text-base">8</span> data sources
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="text-slate-900 dark:text-slate-100 text-base">0</span> credits required
          </span>
        </div>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="mb-16"
      >
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">Tools</h2>
          <Link
            to="/dfir/dashboard"
            className="text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            recent lookups <ArrowRight size={12} />
          </Link>
        </div>
        <ToolGrid />
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="mb-16"
      >
        <ThreatIntelFeed />
      </motion.section>

      <footer className="mt-20 pt-10 border-t border-slate-200 dark:border-slate-800">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
          Data Sources
        </h3>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((p) => (
            <span
              key={p}
              className="text-xs font-mono px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
            >
              {p}
            </span>
          ))}
          <span className="text-xs font-mono px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
            crt.sh
          </span>
          <span className="text-xs font-mono px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
            RDAP
          </span>
          <span className="text-xs font-mono px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
            Cloudflare DoH
          </span>
        </div>
      </footer>
    </div>
  );
}

import { useState } from 'react';
import { Quote, Shield } from 'lucide-react';

const QUOTES = [
  {
    text: "Threat intelligence is not about collecting more data — it's about answering the questions that matter to your organization.",
    author: 'Recorded Future',
  },
  {
    text: 'OSINT is the art of finding needles in haystacks, except the haystack is the entire internet.',
    author: 'SANS Institute',
  },
  { text: 'The best threat intelligence is the kind that helps you make better decisions, faster.', author: 'Gartner' },
  { text: 'In incident response, speed matters — but accuracy matters more.', author: 'NIST' },
  {
    text: "Know thy network, know thy enemy, and know thyself — that's the trifecta of threat intelligence.",
    author: 'Adapted from Sun Tzu',
  },
  {
    text: "The adversary only needs to be right once. You need to be right every time. That's why intelligence matters.",
    author: 'CrowdStrike',
  },
  {
    text: "Good threat intel isn't about indicators alone — it's about understanding intent, capability, and opportunity.",
    author: 'Mandiant',
  },
  {
    text: "OSINT is not a tool, it's a mindset. Every piece of public data is a potential clue.",
    author: 'SANS Institute',
  },
  {
    text: 'Ransomware groups operate like businesses. Your intelligence should be as organized as their operations.',
    author: 'Recorded Future',
  },
  {
    text: 'The gap between detection and response is where attackers thrive. Close it with intelligence.',
    author: 'Palo Alto Unit 42',
  },
  {
    text: 'Every breach tells a story. Threat intelligence is how you read it before it happens to you.',
    author: 'FireEye',
  },
  {
    text: "Dark web monitoring isn't optional anymore — it's the front line of proactive defense.",
    author: 'Flashpoint',
  },
  { text: 'IOCs without context are just noise. Context without action is just trivia.', author: 'SANS Institute' },
  {
    text: "The most dangerous threat is the one you don't know about. That's why we collect intelligence.",
    author: 'MITRE ATT&CK',
  },
  { text: 'Attribution is hard, but understanding adversary behavior is essential for defense.', author: 'Mandiant' },
];

function getQuoteOfTheDay(): { text: string; author: string } {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return QUOTES[seed % QUOTES.length]!;
}

export function QuoteOfTheDay(): JSX.Element | null {
  const [quote] = useState(getQuoteOfTheDay);

  if (!quote) return null;

  return (
    <section className="group relative overflow-hidden rounded-lg border border-slate-200/70 dark:border-[rgb(var(--border-400))] p-5 transition-all duration-200 hover:border-brand-300/50 dark:hover:border-brand-500/30 hover:shadow-md dark:hover:shadow-brand-500/5">
      {/* Subtle gradient background */}
      <div aria-hidden className="absolute inset-0 bg-[rgb(var(--hover-100))]" />
      {/* Decorative icon */}
      <div aria-hidden className="absolute -right-4 -bottom-4 text-brand-100 dark:text-brand-500/10">
        <Shield size={80} strokeWidth={1} />
      </div>
      <div className="relative flex items-start gap-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/10 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400 shrink-0">
          <Quote size={14} />
        </div>
        <div>
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 italic">
            &ldquo;{quote.text}&rdquo;
          </p>
          <p className="mt-2 text-xs font-mono text-slate-500 dark:text-slate-400">— {quote.author}</p>
        </div>
      </div>
    </section>
  );
}

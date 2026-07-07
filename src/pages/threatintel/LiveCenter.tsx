import { useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ExternalLink, Terminal, Globe, AlertTriangle, Hash, Users } from 'lucide-react';

interface ToolDetail {
  install: string;
  example: string;
  url: string;
}

interface LiveTool {
  name: string;
  desc: string;
  detail: ToolDetail;
}

interface Category {
  id: string;
  label: string;
  icon: React.ReactNode;
  tools: LiveTool[];
}

const CATEGORIES: Category[] = [
  {
    id: 'email',
    label: 'Email OSINT',
    icon: <Users size={16} />,
    tools: [
      {
        name: 'Holehe',
        desc: 'Check if an email is registered on numerous social media sites.',
        detail: {
          install: 'pip install holehe',
          example: 'holehe user@example.com',
          url: 'https://github.com/megadose/holehe',
        },
      },
      {
        name: 'Zehef',
        desc: 'Check if an email is registered on 18 social media sites with basic breach check.',
        detail: {
          install: 'pip install zehef',
          example: 'zehef user@example.com',
          url: 'https://github.com/hippiiee/zehef',
        },
      },
      {
        name: 'MailSleuth',
        desc: 'Email OSINT tool for checking email registrations.',
        detail: {
          install: 'pip install mailsleuth',
          example: 'mailsleuth -e user@example.com',
          url: 'https://github.com/d8x-io/MailSleuth',
        },
      },
      {
        name: 'Email Validator',
        desc: 'Checks if an email is active and extracts server/creation data.',
        detail: {
          install: 'pip install email-validator',
          example: 'email-validator user@example.com',
          url: 'https://github.com/ChaosNugget/Email-Validator',
        },
      },
      {
        name: 'Eyes',
        desc: 'Advanced email reconnaissance tool for social media presence.',
        detail: {
          install: 'git clone https://github.com/ChrisAD/eyes.git',
          example: 'eyes -e user@example.com',
          url: 'https://github.com/ChrisAD/eyes',
        },
      },
      {
        name: 'Blackbird',
        desc: 'Check email registrations across platforms.',
        detail: {
          install: 'pip install blackbird-osint',
          example: 'blackbird --email user@example.com',
          url: 'https://github.com/p1ngul1n0/blackbird',
        },
      },
      {
        name: 'Ghunt',
        desc: 'Extract information from Google accounts using an email.',
        detail: {
          install: 'git clone https://github.com/mxrch/GHunt.git && pip install -r requirements.txt',
          example: 'ghunt email user@example.com',
          url: 'https://github.com/mxrch/GHunt',
        },
      },
    ],
  },
  {
    id: 'domain',
    label: 'Domain & URL',
    icon: <Globe size={16} />,
    tools: [
      {
        name: 'Subfinder',
        desc: 'Passive subdomain discovery tool.',
        detail: {
          install: 'go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest',
          example: 'subfinder -d example.com',
          url: 'https://github.com/projectdiscovery/subfinder',
        },
      },
      {
        name: 'Sublist3r',
        desc: 'Fast subdomain enumeration using search engines.',
        detail: {
          install: 'pip install sublist3r',
          example: 'sublist3r -d example.com',
          url: 'https://github.com/aboul3la/Sublist3r',
        },
      },
      {
        name: 'TheHarvester',
        desc: 'Gather emails, subdomains, and names from public sources.',
        detail: {
          install: 'git clone https://github.com/laramies/theHarvester.git && pip install -r requirements.txt',
          example: 'theHarvester -d example.com -b all',
          url: 'https://github.com/laramies/theHarvester',
        },
      },
      {
        name: 'Nmap',
        desc: 'Network scanning with basic options.',
        detail: {
          install: 'brew install nmap',
          example: 'nmap -sV -sC example.com',
          url: 'https://nmap.org',
        },
      },
      {
        name: 'ASN Lookup',
        desc: 'Autonomous System Number lookup tool.',
        detail: {
          install: 'pip install asnlookup',
          example: 'asnlookup -o 8.8.8.8',
          url: 'https://github.com/yasserjanah/ASN-Lookup',
        },
      },
      {
        name: 'DNSEnum',
        desc: 'DNS enumeration tool.',
        detail: {
          install: 'git clone https://github.com/fwaeytens/dnsenum.git',
          example: 'dnsenum example.com',
          url: 'https://github.com/fwaeytens/dnsenum',
        },
      },
    ],
  },
  {
    id: 'breaches',
    label: 'Breaches & Leaks',
    icon: <AlertTriangle size={16} />,
    tools: [
      {
        name: 'Have I Been Pwned',
        desc: 'Check email against known breaches.',
        detail: {
          install: 'Web-based — no install needed',
          example: 'https://haveibeenpwned.com/',
          url: 'https://haveibeenpwned.com',
        },
      },
      {
        name: 'HIBP Alternative',
        desc: 'CLI version of breach checking.',
        detail: {
          install: 'pip install pyhibp',
          example: 'pyhibp --email user@example.com',
          url: 'https://github.com/cloudsmesa/pyHIBP',
        },
      },
      {
        name: 'Chiasmodon',
        desc: 'OSINT gathering tool focused on credential leaks.',
        detail: {
          install: 'pip install chiasmodon',
          example: 'chiasmodon --email user@example.com',
          url: 'https://github.com/Chiasmod0n/Chiasmodon',
        },
      },
      {
        name: 'HashID',
        desc: 'Hash type identifier.',
        detail: {
          install: 'pip install hashid',
          example: 'hashid 5d41402abc4b2a76b9719d911017c592',
          url: 'https://github.com/psypanda/hashID',
        },
      },
      {
        name: 'Hudson Rock',
        desc: 'Credential breach database search.',
        detail: {
          install: 'Web-based — no install needed',
          example: 'https://www.hudsonrock.com/threat-intelligence-ai',
          url: 'https://www.hudsonrock.com/threat-intelligence-ai',
        },
      },
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    icon: <Hash size={16} />,
    tools: [
      {
        name: 'MastOSINT',
        desc: 'Mastodon profile and post search.',
        detail: {
          install: 'pip install mastosint',
          example: 'mastosint --username target_user',
          url: 'https://github.com/own007/MastOSINT',
        },
      },
      {
        name: 'OSINTSky',
        desc: 'BlueSky OSINT suite.',
        detail: {
          install: 'git clone https://github.com/0x7a7a/OSINTSky.git && pip install -r requirements.txt',
          example: 'osintsky --handle user.bsky.social',
          url: 'https://github.com/0x7a7a/OSINTSky',
        },
      },
      {
        name: 'OSINTChan',
        desc: '4chan API OSINT tool.',
        detail: {
          install: 'pip install osintchan',
          example: 'osintchan --board tech --thread 123456',
          url: 'https://github.com/binbashing/osintchan',
        },
      },
      {
        name: 'TeleGramSint',
        desc: 'Telegram data gathering tool.',
        detail: {
          install: 'git clone https://github.com/Arriven/telegram-sint.git && pip install -r requirements.txt',
          example: 'telegram-sint --username target_user',
          url: 'https://github.com/Arriven/telegram-sint',
        },
      },
      {
        name: 'SnapIntel',
        desc: 'Snapchat account lookup.',
        detail: {
          install: 'git clone https://github.com/snapintel/snapintel.git && pip install -r requirements.txt',
          example: 'snapintel --username target_user',
          url: 'https://github.com/snapintel/snapintel',
        },
      },
      {
        name: 'Reddit Push-Pull',
        desc: 'Deleted Reddit post recovery.',
        detail: {
          install: 'pip install pushshift.py',
          example: 'python -m pushshift --subreddit osint --before 2024-01-01',
          url: 'https://github.com/pushshift/api',
        },
      },
      {
        name: 'TikTok UserData',
        desc: 'TikTok user metadata extraction.',
        detail: {
          install: 'pip install tiktok-userdata',
          example: 'tiktok-userdata --username target_user',
          url: 'https://github.com/evilpete/tiktok-userdata',
        },
      },
      {
        name: 'Proton Intelligence',
        desc: 'ProtonMail information gathering.',
        detail: {
          install: 'git clone https://github.com/0xInfection/ProtonIntel.git && pip install -r requirements.txt',
          example: 'protonintel --email target@proton.me',
          url: 'https://github.com/0xInfection/ProtonIntel',
        },
      },
    ],
  },
];

const TOTAL_TOOLS = CATEGORIES.reduce((sum, c) => sum + c.tools.length, 0);

export default function LiveCenter(): JSX.Element {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Terminal size={28} />}
      title="Live Center — Web-Based OSINT Tools"
      description={
        <span>
          Collection of command line tools ready to be utilized.{' '}
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {TOTAL_TOOLS} tools across {CATEGORIES.length} categories
          </span>
        </span>
      }
      maxWidthClass="max-w-7xl"
    >
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CATEGORIES.map((cat) => (
          <div
            key={cat.id}
            className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 px-3 py-2"
          >
            <div className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {cat.label}
            </div>
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {cat.tools.length}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                {cat.tools.length === 1 ? 'tool' : 'tools'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-8">
        {CATEGORIES.map((cat) => (
          <section key={cat.id} aria-label={cat.label}>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-brand-600 dark:text-brand-400">{cat.icon}</span>
              <h2 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">{cat.label}</h2>
              <span className="rounded-full border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-0.5 text-micro font-mono text-slate-500 dark:text-slate-400">
                {cat.tools.length}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cat.tools.map((tool) => {
                const key = `${cat.id}:${tool.name}`;
                const open = expanded[key] ?? false;
                return (
                  <div
                    key={tool.name}
                    className="surface-card overflow-hidden rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 transition-all"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                          {tool.name}
                        </h3>
                        <span className="shrink-0 rounded border border-brand-500/30 bg-brand-500/10 px-1.5 py-0.5 text-micro font-mono uppercase tracking-wider text-brand-700 dark:text-brand-300">
                          {cat.id}
                        </span>
                      </div>
                      <p className="text-xs text-muted leading-relaxed mb-3">{tool.desc}</p>
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 text-xs font-mono font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-500/20 transition-colors"
                        aria-expanded={open}
                        aria-controls={`detail-${key}`}
                      >
                        <Terminal size={12} /> {open ? 'Close' : 'Launch'}
                      </button>
                    </div>
                    {open && (
                      <div
                        id={`detail-${key}`}
                        className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200)/0.6)] p-4 space-y-3 animate-fade-in-up"
                      >
                        <div>
                          <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Install
                          </span>
                          <pre className="mt-1 overflow-x-auto rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200">
                            {tool.detail.install}
                          </pre>
                        </div>
                        <div>
                          <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Example
                          </span>
                          <pre className="mt-1 overflow-x-auto rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200">
                            {tool.detail.example}
                          </pre>
                        </div>
                        <a
                          href={tool.detail.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          <ExternalLink size={11} /> {tool.detail.url.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </DataPageLayout>
  );
}

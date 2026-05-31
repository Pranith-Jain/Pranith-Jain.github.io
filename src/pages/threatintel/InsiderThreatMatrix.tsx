import { useMemo, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ChevronDown, ChevronRight, Search, ExternalLink, UserCheck } from 'lucide-react';

interface Technique {
  id: string;
  name: string;
  url: string;
}

interface Category {
  id: string;
  name: string;
  description: string;
  color: string;
  techniques: Technique[];
}

const CATEGORIES: Category[] = [
  {
    id: 'motive',
    name: 'Motive',
    description: 'The reason or underlying cause that prompts a subject to engage in an infringement.',
    color: 'border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-300',
    techniques: [
      { id: 'MT022', name: 'Boundary Testing', url: '/articles/AR1/sections/MT022' },
      { id: 'MT012', name: 'Coercion', url: '/articles/AR1/sections/MT012' },
      { id: 'MT021', name: 'Conflicts of Interest', url: '/articles/AR1/sections/MT021' },
      { id: 'MT018', name: 'Curiosity', url: '/articles/AR1/sections/MT018' },
      { id: 'MT017', name: 'Espionage', url: '/articles/AR1/sections/MT017' },
      { id: 'MT009', name: 'Fear of Reprisals', url: '/articles/AR1/sections/MT009' },
      { id: 'MT011', name: 'Hubris', url: '/articles/AR1/sections/MT011' },
      { id: 'MT016', name: 'Human Error', url: '/articles/AR1/sections/MT016' },
      { id: 'MT020', name: 'Ideology', url: '/articles/AR1/sections/MT020' },
      { id: 'MT008', name: 'Lack of Awareness', url: '/articles/AR1/sections/MT008' },
      { id: 'MT003', name: 'Leaver', url: '/articles/AR1/sections/MT003' },
      { id: 'MT013', name: 'Misapprehension or Delusion', url: '/articles/AR1/sections/MT013' },
      { id: 'MT005', name: 'Personal Gain', url: '/articles/AR1/sections/MT005' },
      { id: 'MT004', name: 'Political or Philosophical Beliefs', url: '/articles/AR1/sections/MT004' },
      { id: 'MT015', name: 'Recklessness', url: '/articles/AR1/sections/MT015' },
      { id: 'MT024', name: 'Recognition', url: '/articles/AR1/sections/MT024' },
      { id: 'MT007', name: 'Resentment', url: '/articles/AR1/sections/MT007' },
      { id: 'MT023', name: 'Revenge', url: '/articles/AR1/sections/MT023' },
      { id: 'MT019', name: 'Rogue Nationalism', url: '/articles/AR1/sections/MT019' },
      { id: 'MT010', name: 'Self Sabotage', url: '/articles/AR1/sections/MT010' },
      { id: 'MT006', name: 'Third Party Collusion Motivated by Personal Gain', url: '/articles/AR1/sections/MT006' },
    ],
  },
  {
    id: 'means',
    name: 'Means',
    description: 'The mechanisms or circumstances required for an infringement to occur.',
    color: 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300',
    techniques: [
      { id: 'ME026', name: 'Ability to Modify Cloud Resources', url: '/articles/AR2/sections/ME026' },
      { id: 'ME024', name: 'Access', url: '/articles/AR2/sections/ME024' },
      { id: 'ME018', name: 'Aiding and Abetting', url: '/articles/AR2/sections/ME018' },
      { id: 'ME004', name: 'Bluetooth', url: '/articles/AR2/sections/ME004' },
      { id: 'ME022', name: 'Bring Your Own Device (BYOD)', url: '/articles/AR2/sections/ME022' },
      { id: 'ME012', name: 'Clipboard', url: '/articles/AR2/sections/ME012' },
      { id: 'ME029', name: 'Corporate-Issued Device', url: '/articles/AR2/sections/ME029' },
      { id: 'ME027', name: 'Credential Access and Exposure', url: '/articles/AR2/sections/ME027' },
      { id: 'ME028', name: 'Delegated Access via Managed Service Providers', url: '/articles/AR2/sections/ME028' },
      { id: 'ME030', name: 'Enterprise-Integrated AI Platforms', url: '/articles/AR2/sections/ME030' },
      { id: 'ME009', name: 'FTP Servers', url: '/articles/AR2/sections/ME009' },
      { id: 'ME003', name: 'Installed Software', url: '/articles/AR2/sections/ME003' },
      { id: 'ME013', name: 'Media Capture', url: '/articles/AR2/sections/ME013' },
      { id: 'ME008', name: 'Network Attached Storage', url: '/articles/AR2/sections/ME008' },
      { id: 'ME017', name: 'Physical Disk Access', url: '/articles/AR2/sections/ME017' },
      { id: 'ME025', name: 'Placement', url: '/articles/AR2/sections/ME025' },
      { id: 'ME014', name: 'Printing', url: '/articles/AR2/sections/ME014' },
      { id: 'ME007', name: 'Privileged Access', url: '/articles/AR2/sections/ME007' },
      { id: 'ME005', name: 'Removable Media', url: '/articles/AR2/sections/ME005' },
      { id: 'ME011', name: 'Screenshots and Screen Recording', url: '/articles/AR2/sections/ME011' },
      { id: 'ME023', name: 'Sensitivity Label Leakage', url: '/articles/AR2/sections/ME023' },
      { id: 'ME015', name: 'SMB File Sharing', url: '/articles/AR2/sections/ME015' },
      { id: 'ME010', name: 'SSH Servers', url: '/articles/AR2/sections/ME010' },
      { id: 'ME016', name: 'System Startup Firmware Access', url: '/articles/AR2/sections/ME016' },
      { id: 'ME001', name: 'Unauthorized Access to Unassigned Hardware', url: '/articles/AR2/sections/ME001' },
      { id: 'ME031', name: 'Unmanaged Device Presence', url: '/articles/AR2/sections/ME031' },
      { id: 'ME002', name: 'Unrestricted Software Installation', url: '/articles/AR2/sections/ME002' },
      { id: 'ME021', name: 'Unrevoked Access', url: '/articles/AR2/sections/ME021' },
      { id: 'ME006', name: 'Web Access', url: '/articles/AR2/sections/ME006' },
    ],
  },
  {
    id: 'preparation',
    name: 'Preparation',
    description: 'The activities conducted by a subject to aid or enable an infringement.',
    color: 'border-yellow-500/40 bg-yellow-500/5 text-yellow-700 dark:text-yellow-300',
    techniques: [
      { id: 'PR038', name: 'AI-Assisted Capability Development', url: '/articles/AR3/sections/PR038' },
      { id: 'PR017', name: 'Archive Data', url: '/articles/AR3/sections/PR017' },
      { id: 'PR030', name: 'Authorization Token Staging', url: '/articles/AR3/sections/PR030' },
      { id: 'PR011', name: 'Boot Order Manipulation', url: '/articles/AR3/sections/PR011' },
      { id: 'PR007', name: 'CCTV Enumeration', url: '/articles/AR3/sections/PR007' },
      { id: 'PR018', name: 'Circumventing Security Controls', url: '/articles/AR3/sections/PR018' },
      { id: 'PR020', name: 'Data Obfuscation', url: '/articles/AR3/sections/PR020' },
      { id: 'PR016', name: 'Data Staging', url: '/articles/AR3/sections/PR016' },
      { id: 'PR035', name: 'Delegated Preparation via AI Agents', url: '/articles/AR3/sections/PR035' },
      { id: 'PR002', name: 'Device Mounting', url: '/articles/AR3/sections/PR002' },
      { id: 'PR015', name: 'Email Collection', url: '/articles/AR3/sections/PR015' },
      { id: 'PR014', name: 'External Media Formatting', url: '/articles/AR3/sections/PR014' },
      { id: 'PR025', name: 'File Download', url: '/articles/AR3/sections/PR025' },
      { id: 'PR004', name: 'File Exploration', url: '/articles/AR3/sections/PR004' },
      { id: 'PR036', name: 'Hardware-Based Remote Access (IP-KVM)', url: '/articles/AR3/sections/PR036' },
      { id: 'PR027', name: 'Impersonation', url: '/articles/AR3/sections/PR027' },
      { id: 'PR024', name: 'Increase Privileges', url: '/articles/AR3/sections/PR024' },
      { id: 'PR005', name: 'IT Ticketing System Exploration', url: '/articles/AR3/sections/PR005' },
      { id: 'PR033', name: 'Joiner', url: '/articles/AR3/sections/PR033' },
      { id: 'PR034', name: 'Media Capture via External Device', url: '/articles/AR3/sections/PR034' },
      { id: 'PR032', name: 'Mover', url: '/articles/AR3/sections/PR032' },
      { id: 'PR021', name: 'Network Scanning', url: '/articles/AR3/sections/PR021' },
      { id: 'PR039', name: 'Observational Information Gathering', url: '/articles/AR3/sections/PR039' },
      { id: 'PR028', name: 'On-Screen Data Collection', url: '/articles/AR3/sections/PR028' },
      { id: 'PR037', name: 'Oversight Circumvention and Control Degradation', url: '/articles/AR3/sections/PR037' },
      { id: 'PR029', name: 'Persistent Access via Bots', url: '/articles/AR3/sections/PR029' },
      { id: 'PR012', name: 'Physical Disk Removal', url: '/articles/AR3/sections/PR012' },
      { id: 'PR009', name: 'Physical Exploration', url: '/articles/AR3/sections/PR009' },
      { id: 'PR008', name: 'Physical Item Smuggling', url: '/articles/AR3/sections/PR008' },
      { id: 'PR019', name: 'Private / Incognito Browsing', url: '/articles/AR3/sections/PR019' },
      { id: 'PR001', name: 'Read Windows Registry', url: '/articles/AR3/sections/PR001' },
      { id: 'PR026', name: 'Remote Desktop (RDP)', url: '/articles/AR3/sections/PR026' },
      { id: 'PR006', name: 'Security Software Enumeration', url: '/articles/AR3/sections/PR006' },
      { id: 'PR022', name: 'Social Engineering (Outbound)', url: '/articles/AR3/sections/PR022' },
      { id: 'PR003', name: 'Software Installation', url: '/articles/AR3/sections/PR003' },
      { id: 'PR010', name: 'Software or Access Request', url: '/articles/AR3/sections/PR010' },
      { id: 'PR023', name: 'Suspicious Web Browsing', url: '/articles/AR3/sections/PR023' },
      { id: 'PR013', name: 'Testing Ability to Print', url: '/articles/AR3/sections/PR013' },
      { id: 'PR040', name: 'Testing Security Controls', url: '/articles/AR3/sections/PR040' },
      { id: 'PR031', name: 'VPN Usage', url: '/articles/AR3/sections/PR031' },
    ],
  },
  {
    id: 'infringement',
    name: 'Infringement',
    description: 'The act that harms or undermines an organization.',
    color: 'border-orange-500/40 bg-orange-500/5 text-orange-700 dark:text-orange-300',
    techniques: [
      { id: 'IF029', name: 'Codebase Integrity Compromise', url: '/articles/AR4/sections/IF029' },
      { id: 'IF022', name: 'Data Loss', url: '/articles/AR4/sections/IF022' },
      { id: 'IF028', name: 'Delegated Execution via AI Agents', url: '/articles/AR4/sections/IF028' },
      { id: 'IF026', name: 'Denial of Service', url: '/articles/AR4/sections/IF026' },
      { id: 'IF033', name: 'Digital Defacement', url: '/articles/AR4/sections/IF033' },
      { id: 'IF013', name: 'Disruption of Business Operations', url: '/articles/AR4/sections/IF013' },
      { id: 'IF017', name: 'Excessive Personal Use', url: '/articles/AR4/sections/IF017' },
      { id: 'IF034', name: 'Exfiltration via Automated Transcription', url: '/articles/AR4/sections/IF034' },
      { id: 'IF010', name: 'Exfiltration via Email', url: '/articles/AR4/sections/IF010' },
      { id: 'IF003', name: 'Exfiltration via Media Capture', url: '/articles/AR4/sections/IF003' },
      { id: 'IF005', name: 'Exfiltration via Messaging Applications', url: '/articles/AR4/sections/IF005' },
      { id: 'IF004', name: 'Exfiltration via Other Network Medium', url: '/articles/AR4/sections/IF004' },
      { id: 'IF002', name: 'Exfiltration via Physical Medium', url: '/articles/AR4/sections/IF002' },
      { id: 'IF024', name: 'Exfiltration via Screen Sharing', url: '/articles/AR4/sections/IF024' },
      { id: 'IF030', name: 'Exfiltration via SMS/MMS', url: '/articles/AR4/sections/IF030' },
      { id: 'IF001', name: 'Exfiltration via Web Service', url: '/articles/AR4/sections/IF001' },
      { id: 'IF032', name: 'External Credential Sharing', url: '/articles/AR4/sections/IF032' },
      { id: 'IF021', name: 'Harassment and Discrimination', url: '/articles/AR4/sections/IF021' },
      { id: 'IF008', name: 'Inappropriate Web Browsing', url: '/articles/AR4/sections/IF008' },
      { id: 'IF027', name: 'Installing Malicious Software', url: '/articles/AR4/sections/IF027' },
      { id: 'IF009', name: 'Installing Unapproved Software', url: '/articles/AR4/sections/IF009' },
      { id: 'IF025', name: 'Internal Credential Sharing', url: '/articles/AR4/sections/IF025' },
      { id: 'IF016', name: 'Misappropriation of Funds', url: '/articles/AR4/sections/IF016' },
      { id: 'IF036', name: 'Misuse of Corporate Communication Channels', url: '/articles/AR4/sections/IF036' },
      { id: 'IF019', name: 'Non-Corporate Device', url: '/articles/AR4/sections/IF019' },
      { id: 'IF037', name: 'Physical Sabotage', url: '/articles/AR4/sections/IF037' },
      { id: 'IF011', name: 'Providing Access to an Unauthorized Third Party', url: '/articles/AR4/sections/IF011' },
      { id: 'IF012', name: 'Public Statements Resulting in Brand Damage', url: '/articles/AR4/sections/IF012' },
      { id: 'IF023', name: 'Regulatory Non-Compliance', url: '/articles/AR4/sections/IF023' },
      { id: 'IF018', name: 'Sharing on AI Chatbot Platforms', url: '/articles/AR4/sections/IF018' },
      { id: 'IF015', name: 'Theft', url: '/articles/AR4/sections/IF015' },
      { id: 'IF014', name: 'Unauthorized Changes to IT Systems', url: '/articles/AR4/sections/IF014' },
      { id: 'IF031', name: 'Unauthorized Presence in Restricted Physical Areas', url: '/articles/AR4/sections/IF031' },
      { id: 'IF006', name: 'Unauthorized Printing of Documents', url: '/articles/AR4/sections/IF006' },
      { id: 'IF020', name: 'Unauthorized VPN Client', url: '/articles/AR4/sections/IF020' },
      { id: 'IF035', name: 'Unauthorized Work Location', url: '/articles/AR4/sections/IF035' },
      { id: 'IF038', name: 'Undisclosed Concurrent Employment', url: '/articles/AR4/sections/IF038' },
      { id: 'IF007', name: 'Unlawfully Accessing Copyrighted Material', url: '/articles/AR4/sections/IF007' },
    ],
  },
  {
    id: 'anti-forensics',
    name: 'Anti-Forensics',
    description: 'The actions undertaken by a subject to frustrate any subsequent investigation.',
    color: 'border-violet-500/40 bg-violet-500/5 text-violet-700 dark:text-violet-300',
    techniques: [
      { id: 'AF024', name: 'Account Misuse', url: '/articles/AR5/sections/AF024' },
      { id: 'AF004', name: 'Clear Browser Artifacts', url: '/articles/AR5/sections/AF004' },
      { id: 'AF027', name: 'Clear Email Artifacts', url: '/articles/AR5/sections/AF027' },
      { id: 'AF031', name: 'Code Contribution Obfuscation and Misrepresentation', url: '/articles/AR5/sections/AF031' },
      { id: 'AF019', name: 'Decrease Privileges', url: '/articles/AR5/sections/AF019' },
      { id: 'AF025', name: 'Delayed Execution Triggers', url: '/articles/AR5/sections/AF025' },
      { id: 'AF013', name: 'Delete User Account', url: '/articles/AR5/sections/AF013' },
      { id: 'AF020', name: 'Deletion of Volume Shadow Copy', url: '/articles/AR5/sections/AF020' },
      { id: 'AF006', name: 'Disk Wiping', url: '/articles/AR5/sections/AF006' },
      { id: 'AF015', name: 'File Deletion', url: '/articles/AR5/sections/AF015' },
      { id: 'AF005', name: 'File Encryption', url: '/articles/AR5/sections/AF005' },
      { id: 'AF012', name: 'Hide Artifacts', url: '/articles/AR5/sections/AF012' },
      { id: 'AF001', name: 'Hiding or Destroying Command History', url: '/articles/AR5/sections/AF001' },
      { id: 'AF002', name: 'Log Deletion', url: '/articles/AR5/sections/AF002' },
      { id: 'AF026', name: 'Log Modification', url: '/articles/AR5/sections/AF026' },
      { id: 'AF030', name: 'Message Deletion', url: '/articles/AR5/sections/AF030' },
      { id: 'AF033', name: 'Message Modification', url: '/articles/AR5/sections/AF033' },
      { id: 'AF007', name: 'Modify Windows Registry', url: '/articles/AR5/sections/AF007' },
      { id: 'AF029', name: 'Network Obfuscation', url: '/articles/AR5/sections/AF029' },
      { id: 'AF011', name: 'Physical Destruction of Storage Media', url: '/articles/AR5/sections/AF011' },
      { id: 'AF010', name: 'Physical Removal of Disk Storage', url: '/articles/AR5/sections/AF010' },
      { id: 'AF028', name: 'Stalling', url: '/articles/AR5/sections/AF028' },
      { id: 'AF008', name: 'Steganography', url: '/articles/AR5/sections/AF008' },
      { id: 'AF014', name: 'System Shutdown', url: '/articles/AR5/sections/AF014' },
      { id: 'AF032', name: 'System Time Modification', url: '/articles/AR5/sections/AF032' },
      { id: 'AF003', name: 'Timestomping', url: '/articles/AR5/sections/AF003' },
      { id: 'AF018', name: 'Tripwires', url: '/articles/AR5/sections/AF018' },
      { id: 'AF016', name: 'Uninstalling Software', url: '/articles/AR5/sections/AF016' },
      { id: 'AF022', name: 'Virtualization', url: '/articles/AR5/sections/AF022' },
    ],
  },
];

const TECHNIQUE_COUNT = CATEGORIES.reduce((s, c) => s + c.techniques.length, 0);

export default function InsiderThreatMatrix(): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(CATEGORIES.map((c) => c.id)));
  const [search, setSearch] = useState('');

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return CATEGORIES;
    return CATEGORIES.map((cat) => ({
      ...cat,
      techniques: cat.techniques.filter((t) => t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)),
    })).filter((cat) => cat.techniques.length > 0);
  }, [q]);

  const results = filtered.reduce((s, c) => s + c.techniques.length, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <div className="flex items-center gap-3 mb-2">
          <UserCheck size={28} className="text-brand-600 dark:text-brand-400" />
          <h1 className="text-3xl sm:text-4xl font-display font-bold">Insider Threat Matrix</h1>
        </div>
        <p className="text-slate-600 dark:text-slate-400 max-w-3xl text-sm font-mono">
          Open framework for computer-enabled insider threat investigations by{' '}
          <a
            href="https://insiderthreatmatrix.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Forscie Limited
          </a>
          . {TECHNIQUE_COUNT} techniques across 5 categories — Motive, Means, Preparation, Infringement, Anti-Forensics.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search techniques by name or ID..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500"
            aria-label="Search insider threat techniques"
          />
        </div>
      </div>

      {search && (
        <p className="text-[11px] font-mono text-slate-500 mb-4">
          {results} technique{results === 1 ? '' : 's'} match &quot;{search}&quot;
        </p>
      )}

      <div className="grid gap-6">
        {filtered.map((cat) => {
          const open = expanded.has(cat.id);
          return (
            <div
              key={cat.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
            >
              <button
                onClick={() => toggle(cat.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${cat.color}`}>{cat.id}</span>
                  <span className="font-display font-bold text-base">{cat.name}</span>
                  <span className="text-[11px] font-mono text-slate-400">{cat.techniques.length}</span>
                </div>
                {open ? (
                  <ChevronDown size={16} className="text-slate-400" />
                ) : (
                  <ChevronRight size={16} className="text-slate-400" />
                )}
              </button>
              {open && (
                <div className="px-4 pb-4">
                  <p className="text-xs text-slate-500 mb-3 font-mono">{cat.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cat.techniques.map((t) => (
                      <a
                        key={t.id}
                        href={`https://insiderthreatmatrix.org${t.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                        title={`View on Insider Threat Matrix — ${t.name}`}
                      >
                        <span className="text-[10px] text-slate-400">{t.id}</span>
                        {t.name}
                        <ExternalLink size={10} className="text-slate-400" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-[11px] font-mono text-slate-500 text-center">
        Data sourced from{' '}
        <a
          href="https://insiderthreatmatrix.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 hover:underline"
        >
          insiderthreatmatrix.org
        </a>{' '}
        · {TECHNIQUE_COUNT} techniques · 5 categories ·{' '}
        <a
          href="https://github.com/forscie/insider-threat-matrix"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 hover:underline"
        >
          GitHub
        </a>
      </p>
    </div>
  );
}

import { ExternalLink, ShieldCheck, Search, Scale } from 'lucide-react';

const CARDS = [
  {
    icon: Search,
    name: 'ID Ransomware',
    url: 'https://id-ransomware.malwarehunterteam.com/',
    blurb:
      'Upload a ransom note or encrypted sample file to identify the ransomware family. Identification is the first step — it determines whether a free decryptor exists.',
  },
  {
    icon: ShieldCheck,
    name: 'No More Ransom — Decryptors',
    url: 'https://www.nomoreransom.org/en/decryption-tools.html',
    blurb:
      'Free decryption tool repository from the No More Ransom project (Europol / Dutch police). If ID Ransomware names the family, check here for a working decryptor before considering payment.',
  },
  {
    icon: Scale,
    name: 'Ransom Payment Legality',
    url: 'https://rkovar.github.io/ransomwarelegality/',
    blurb:
      'Jurisdiction reference for ransom-payment legality and sanctions exposure (e.g. OFAC-listed actors). Paying can be a criminal offence — check here and involve legal counsel first.',
  },
];

export default function RansomwareRecovery({ embedded = false }: { embedded?: boolean }): JSX.Element {
  void embedded;
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <div className="surface-card p-4 sm:col-span-2">
        <h3 className="text-sm font-semibold text-heading">Suspected ransomware? Work this order</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted">
          <li>Isolate affected hosts, preserve the ransom note and one encrypted sample.</li>
          <li>Identify the family with ID Ransomware.</li>
          <li>Look for a free decryptor on No More Ransom.</li>
          <li>Check payment legality and sanctions exposure before any payment discussion.</li>
          <li>
            See also:{' '}
            <a
              className="text-brand-600 dark:text-brand-400 hover:underline"
              href="https://www.cisa.gov/stopransomware/newsroom"
              target="_blank"
              rel="noreferrer"
            >
              CISA StopRansomware advisories
            </a>
            .
          </li>
        </ol>
      </div>
      {CARDS.map((c) => (
        <article key={c.name} className="surface-card p-3.5">
          <a
            href={c.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-heading hover:text-rose-500 text-sm inline-flex items-center gap-1.5"
          >
            <c.icon className="h-4 w-4 shrink-0" /> {c.name} <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
          <p className="mt-1 text-xs text-muted">{c.blurb}</p>
        </article>
      ))}
    </section>
  );
}

/**
 * Personal Security & OPSEC checklist.
 *
 * Curated, interactive counterpart to the static resources listed in
 * /threatintel/external-resources. Inspired by the open-source Personal
 * Security Checklist (lissy93) and Digital Defense — both catalogued there
 * as `personal-security-checklist` and `digital-defense`.
 *
 * Each item is short and actionable. Severity encodes effort-vs-impact
 * roughly:
 *   - critical: do this week
 *   - high: do this month
 *   - medium: do this quarter
 *   - low: nice-to-have
 *
 * State (`covered | partial | gap | na | unset`) is stored in localStorage
 * so a returning visitor picks up where they left off. Export to markdown
 * gives a shareable audit artefact for vendor questionnaires or self-review.
 *
 * Last verified 2026-06-13.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type CheckStatus = 'unset' | 'covered' | 'partial' | 'gap' | 'na';

export interface CheckItem {
  id: string;
  title: string;
  body: string;
  severity: Severity;
  /** Optional links to authoritative guidance, one per line of the body. */
  refs?: Array<{ label: string; href: string }>;
}

export interface CheckCategory {
  id: CategoryId;
  short: string;
  longTitle: string;
  icon: 'accounts' | 'devices' | 'network' | 'comms' | 'physical' | 'opsec' | 'travel' | 'recovery' | 'family';
  intro: string;
  items: CheckItem[];
}

export type CategoryId =
  | 'accounts'
  | 'devices'
  | 'network'
  | 'comms'
  | 'physical'
  | 'opsec'
  | 'travel'
  | 'recovery'
  | 'family';

export const CATEGORIES: CheckCategory[] = [
  {
    id: 'accounts',
    short: 'Accounts',
    longTitle: 'Account & Identity Hygiene',
    icon: 'accounts',
    intro:
      'The cheapest compromise in 2026 is still credential reuse + weak MFA. Lock down the most exposed accounts first: primary email, password manager, banking, and any account with password-reset authority over those.',
    items: [
      {
        id: 'acc-pwmgr',
        title: 'Use a password manager',
        severity: 'critical',
        body: 'Generate and store every password in a reputable password manager. Memorise the master password and the recovery key — never type either into a webpage, email, or chat.',
        refs: [
          { label: 'Bitwarden', href: 'https://bitwarden.com/' },
          { label: '1Password', href: 'https://1password.com/' },
        ],
      },
      {
        id: 'acc-unique-pw',
        title: 'No password reuse across sites',
        severity: 'critical',
        body: 'Every account uses a unique password. A breach on one site must not cascade. Most password managers have an audit / reuse-report — fix the top 10 reused first.',
      },
      {
        id: 'acc-passkeys',
        title: 'Adopt passkeys on supported services',
        severity: 'high',
        body: 'Where supported (Google, Apple, Microsoft, GitHub, many banks), prefer a passkey over a password. Phishing-resistant by design — the key only works on the registered origin.',
      },
      {
        id: 'acc-mfa-primary',
        title: 'Hardware-key MFA on email + password manager + banking',
        severity: 'critical',
        body: 'FIDO2 / WebAuthn hardware keys (YubiKey, Token2, Solokey) on the three accounts that own your digital life. SMS and TOTP are better than nothing; hardware keys defeat SIM-swap and AiTM phishing.',
        refs: [
          { label: 'YubiKey', href: 'https://www.yubico.com/' },
          { label: 'FIDO Alliance', href: 'https://fidoalliance.org/' },
        ],
      },
      {
        id: 'acc-mfa-everywhere',
        title: 'MFA enabled on every account that offers it',
        severity: 'high',
        body: 'App-based TOTP (Authy, Aegis, Raivo) or hardware key. Avoid SMS as the only second factor where TOTP is available.',
      },
      {
        id: 'acc-recovery-codes',
        title: 'Recovery codes stored offline',
        severity: 'high',
        body: 'Print or write down the one-time recovery codes for primary email, password manager, and any account you cannot afford to lose. Store them in a fireproof envelope or safe — not in cloud notes.',
      },
      {
        id: 'acc-email-audit',
        title: 'Audit email forwarding + delegated access',
        severity: 'medium',
        body: 'Check Gmail/Outlook/Proton for active IMAP/POP, third-party app grants, and forwarding rules. Revoke anything you do not actively use. Attackers persist by adding a quiet forwarding rule.',
      },
      {
        id: 'acc-ssn',
        title: 'Lock / freeze credit bureaus',
        severity: 'high',
        body: 'Free credit freeze at Equifax, Experian, TransUnion (US) or equivalent. Cheaper and stronger than credit-monitoring — freezes block new account opening outright. Lift temporarily when applying for credit.',
      },
      {
        id: 'acc-haveibeenpwned',
        title: 'Subscribe to breach notifications',
        severity: 'medium',
        body: 'Sign up at haveibeenpwned.com for every email you actively use. Treat every notification as a forced password change + MFA check on the affected account.',
        refs: [{ label: 'Have I Been Pwned', href: 'https://haveibeenpwned.com/' }],
      },
      {
        id: 'acc-revoke-oauth',
        title: 'Revoke unused OAuth / social-login grants',
        severity: 'medium',
        body: 'Review Google "Third-party apps with account access" and the equivalent in Apple, Microsoft, Facebook. Revoke anything dormant for 90+ days.',
      },
    ],
  },
  {
    id: 'devices',
    short: 'Devices',
    longTitle: 'Devices & Endpoints',
    icon: 'devices',
    intro:
      'Phones, laptops, tablets, and the growing long tail of smart-home / IoT devices. Treat the primary phone and laptop as tier-1; everything else is a tier-2 attack surface.',
    items: [
      {
        id: 'dev-fde',
        title: 'Full-disk encryption on every device',
        severity: 'critical',
        body: 'BitLocker (Windows), FileVault (macOS), LUKS (Linux), default since Android 6 / iOS 8. Verify the recovery key is stored offline — not just in your password manager.',
      },
      {
        id: 'dev-os-updates',
        title: 'Auto-updates enabled for OS + firmware',
        severity: 'critical',
        body: 'Operating system, browser, firmware/UEFI where available. Attackers favour the gap between disclosure and patch adoption.',
      },
      {
        id: 'dev-screen-lock',
        title: 'Strong screen lock, short timeout',
        severity: 'high',
        body: 'PIN (not pattern) of 6+ digits, alphanumeric passphrase, or biometrics. Auto-lock at 1–5 minutes. Disable lock-screen notification previews for messaging and email.',
      },
      {
        id: 'dev-findmy',
        title: 'Find-my-device + remote wipe enabled',
        severity: 'high',
        body: 'Apple Find My, Google Find My Device, Microsoft Find My Device. Confirm you can remotely wipe from a second device. Test the flow once a year.',
      },
      {
        id: 'dev-backups',
        title: 'Encrypted, offline-tested backups (3-2-1)',
        severity: 'high',
        body: '3 copies, 2 different media, 1 offsite. At least one backup is air-gapped or immutable (tape, external drive in a safe, encrypted cloud with versioning). Quarterly restore drill.',
      },
      {
        id: 'dev-anti-malware',
        title: 'Endpoint protection active and updated',
        severity: 'medium',
        body: 'On macOS / Linux this is less critical but a reputable EDR is still useful. On Windows, do not disable Defender. For high-risk users, CrowdStrike / SentinelOne / Bitdefender.',
      },
      {
        id: 'dev-browser-isolation',
        title: 'Separate browser for high-value vs casual browsing',
        severity: 'medium',
        body: 'Use a hardened browser (Firefox with arkenfox, Brave, or Tor Browser) for sensitive work, and a different profile / browser for casual browsing to reduce cross-site fingerprinting and credential theft.',
      },
      {
        id: 'dev-extension-audit',
        title: 'Audit browser extensions quarterly',
        severity: 'medium',
        body: 'Remove anything you do not actively use. Many supply-chain compromises ride in via extensions with broad host permissions.',
      },
      {
        id: 'dev-iot-segment',
        title: 'IoT / smart-home devices on a guest VLAN',
        severity: 'medium',
        body: 'Cameras, TVs, vacuums, plugs, light bulbs — anything with a microphone, camera, or unknown patch cadence — should be on a network that cannot reach your primary devices or laptop.',
      },
      {
        id: 'dev-ble-airtags',
        title: 'Know what Bluetooth trackers are paired to you',
        severity: 'low',
        body: 'AirTag, Tile, SmartTag — review in iOS / Android settings. Stalking via rogue trackers is rare but real; the OS-level alerts work only if the setting is on.',
      },
    ],
  },
  {
    id: 'network',
    short: 'Network',
    longTitle: 'Network & Connectivity',
    icon: 'network',
    intro:
      'You are only as private as the networks you connect to. Public Wi-Fi is the single highest-risk vector outside of credential theft. Default-deny at every layer.',
    items: [
      {
        id: 'net-dns-encrypted',
        title: 'Use encrypted DNS (DoH, DoT, DoQ)',
        severity: 'high',
        body: 'DNS-over-HTTPS or DNS-over-TLS from the OS or router. Quad9 (9.9.9.9), Mullvad DNS, NextDNS. Stops the local network from seeing or spoofing your DNS lookups.',
        refs: [
          { label: 'Quad9', href: 'https://www.quad9.net/' },
          { label: 'Mullvad DNS', href: 'https://mullvad.net/help/dns-over-https-and-dns-over-tls' },
        ],
      },
      {
        id: 'net-vpn',
        title: 'Trusted VPN on untrusted networks',
        severity: 'high',
        body: 'On hotel, café, and conference Wi-Fi, run a paid, audited VPN (Mullvad, ProtonVPN, IVPN). Free VPNs are ad networks. Disable auto-connect to open Wi-Fi.',
      },
      {
        id: 'net-tor-need',
        title: 'Use Tor for high-anonymity research',
        severity: 'medium',
        body: 'For investigations into sensitive topics (whistleblowing, research, activism) where the mere association is harmful, route through Tor Browser from a Tails or Whonix environment. Never mix personal accounts with Tor sessions.',
        refs: [{ label: 'Tor Project', href: 'https://www.torproject.org/' }],
      },
      {
        id: 'net-router-firmware',
        title: 'Router firmware current, default creds changed',
        severity: 'high',
        body: 'Apply firmware updates quarterly. Change the admin password. Disable UPnP, remote admin, and WPS. Consider OpenWrt or a reputable vendor (eero, Firewalla, pfSense) for visibility.',
      },
      {
        id: 'net-firewall-egress',
        title: 'Egress filtering on the home network',
        severity: 'low',
        body: 'Default-deny outbound on the router or a dedicated firewall. Allow-list the services you actually use. Loud against malware and IoT C2 callbacks.',
      },
      {
        id: 'net-https-only',
        title: 'Force HTTPS-only mode in the browser',
        severity: 'high',
        body: 'Chrome "Always use secure connections", Firefox HTTPS-Only. Combined with HSTS preload, this defeats most active network attacks.',
      },
    ],
  },
  {
    id: 'comms',
    short: 'Comms',
    longTitle: 'Communications & Messaging',
    icon: 'comms',
    intro:
      'Default messenger, default email provider, default voice / video — these three choices leak the most metadata about your life. E2E encryption is necessary; metadata minimisation is what most people miss.',
    items: [
      {
        id: 'com-signal',
        title: 'Use Signal (or equivalent E2E messenger) by default',
        severity: 'high',
        body: 'Signal, Wire, or Element for personal messaging. Set messages to disappear where appropriate. Treat SMS and regular email as postcards.',
        refs: [{ label: 'Signal', href: 'https://signal.org/' }],
      },
      {
        id: 'com-email-encrypted',
        title: 'Email provider with strong encryption + minimal scanning',
        severity: 'high',
        body: 'Proton Mail, Tuta, or self-hosted. Avoid providers that scan message bodies for ad targeting. Use PGP / S/MIME where the threat model requires it.',
      },
      {
        id: 'com-metadata',
        title: 'Reduce metadata in calls and messages',
        severity: 'medium',
        body: 'Prefer a messenger that minimises who-sees-what metadata. Disable read receipts, "last seen", and contact-discovery broadcasts where you do not need them.',
      },
      {
        id: 'com-call-forwarding',
        title: 'Disable call-forwarding you did not set up',
        severity: 'high',
        body: 'Dial *#21# / *#61# / *#62# on your phone to inspect unconditional / no-answer / unreachable forwarding. SIM-swap attackers route your calls to capture 2FA codes.',
      },
      {
        id: 'com-voicemail-pin',
        title: 'Strong, unique voicemail PIN',
        severity: 'high',
        body: 'Default carrier voicemail PINs are typically the last 4 of your phone number — publicly guessable. Change it to a 6+ digit random PIN.',
      },
    ],
  },
  {
    id: 'physical',
    short: 'Physical',
    longTitle: 'Physical & Workspace Security',
    icon: 'physical',
    intro:
      'If someone has physical access to an unlocked device, all the cryptography in the world does not help. The same is true of your workspace, your bag, and your mail.',
    items: [
      {
        id: 'phys-lock-screen',
        title: 'Lock the screen every time you step away',
        severity: 'critical',
        body: 'Win+L, Ctrl+Cmd+Q, or a hot-corner. "Just a second" is enough for a casual shoulder-surf or a USB Rubber Ducky.',
      },
      {
        id: 'phys-webcam-cover',
        title: 'Webcam cover or hardware kill switch',
        severity: 'medium',
        body: 'Cheap plastic slider, or a laptop with a hardware camera kill switch. Disabling the camera in software is not enough — kernel-level malware can re-enable it.',
      },
      {
        id: 'phys-mic',
        title: 'Microphone muting habit for sensitive calls',
        severity: 'medium',
        body: 'Hotkey to mute, hardware kill switch, or remove the always-on assistants (Alexa, "Hey Siri", Google Assistant) from rooms where sensitive conversations happen.',
      },
      {
        id: 'phys-shredder',
        title: 'Cross-cut shredder for sensitive paper',
        severity: 'medium',
        body: 'Bank statements, medical bills, pre-approved credit offers. Cross-cut, not strip-cut. Burn or shred pre-sorted labels before recycling boxes.',
      },
      {
        id: 'phys-mail',
        title: 'USPS Informed Delivery (or local equivalent)',
        severity: 'low',
        body: 'See scanned images of incoming mail. Detects a fraudster re-routing your statements to a new address before the next bill cycle.',
      },
      {
        id: 'phys-usb',
        title: 'Never plug in unknown USB sticks',
        severity: 'high',
        body: 'BadUSB, HID attacks, and drop-payload sticks are cheap. If you find a stick in the parking lot, hand it to IT — do not test it on a personal laptop.',
      },
    ],
  },
  {
    id: 'opsec',
    short: 'OPSEC',
    longTitle: 'Digital OPSEC & Footprint',
    icon: 'opsec',
    intro:
      'Operational security is the discipline of not leaving crumbs that link your real identity to an alias, location, or activity. The biggest wins are on social media and search-engine dorking.',
    items: [
      {
        id: 'ops-self-search',
        title: 'Self-search for your name, email, phone, address',
        severity: 'critical',
        body: 'In all the major engines, in quotes, in image search, and in people-search aggregators (Pipl, Spokeo, Whitepages). What shows up is what an attacker, stalker, or recruiter sees.',
      },
      {
        id: 'ops-data-broker',
        title: 'Opt out of data-broker and people-search sites',
        severity: 'high',
        body: 'Each broker has a manual opt-out form. Services like DeleteMe, Privacy Duck, or Kanary automate this. Repeat quarterly — they re-add you from public sources.',
      },
      {
        id: 'ops-social-dox',
        title: 'Audit social-media for doxxing surface',
        severity: 'high',
        body: 'Geo-tagging, photo metadata (use /dfir/exif-parse to check), full name in profile, employer, school, family members, daily routine, security-camera shots showing your house. Each is a single piece of a jigsaw.',
      },
      {
        id: 'ops-alias',
        title: 'Use an alias for accounts that do not need your real name',
        severity: 'medium',
        body: 'Forums, mailing lists, giveaways, anywhere that demands an email but not a legal identity. Pair with SimpleLogin / AnonAddy / Apple Hide My Email for forwarding.',
      },
      {
        id: 'ops-photo-metadata',
        title: 'Strip EXIF metadata from photos before sharing',
        severity: 'high',
        body: 'GPS coordinates, device serial, timestamps. Most phones embed these. Use /dfir/exif-parse to inspect, or share via platforms that strip on upload.',
      },
      {
        id: 'ops-paste',
        title: 'Do not paste sensitive data into public AI chats',
        severity: 'critical',
        body: 'API keys, customer data, source code under NDA, internal documents. Most AI providers retain inputs for training or review. Use local models (Ollama, LM Studio) for sensitive analysis.',
      },
      {
        id: 'ops-shoulder',
        title: 'Screen-privacy filter for travel',
        severity: 'low',
        body: 'Polarising filter on the laptop screen. Cheap, single-purpose, defeats the most common shoulder-surfing attack on planes, trains, and coffee shops.',
      },
    ],
  },
  {
    id: 'travel',
    short: 'Travel',
    longTitle: 'Travel & Cross-Border',
    icon: 'travel',
    intro:
      'Border crossings and hotel rooms are environments where the threat model changes completely. Assume any device you take may be inspected, cloned, or retained.',
    items: [
      {
        id: 'tvl-burner',
        title: 'Consider a burner device for high-risk travel',
        severity: 'medium',
        body: 'For travel to jurisdictions with mandatory decryption laws (UK, US border, parts of EU, China, Russia), a clean device with the minimum data set, used only for the trip, then wiped or destroyed on return.',
      },
      {
        id: 'tvl-storage-encrypted',
        title: 'Encrypted portable storage (VeraCrypt, hardware-encrypted SSD)',
        severity: 'high',
        body: 'Sensitive data lives on an encrypted volume you can detach. At a border crossing you can comply with a "no" without the data being on the device they seize.',
      },
      {
        id: 'tvl-2fa-backup',
        title: 'Carry 2+ MFA options in case one is confiscated',
        severity: 'medium',
        body: 'A hardware key plus an authenticator app on a different device than the one you travel with. Account recovery when the primary device is at the bottom of a customs bin.',
      },
      {
        id: 'tvl-rogue-ev',
        title: 'Inspect charging ports — use a USB data blocker',
        severity: 'medium',
        body: 'Public USB charging (airports, hotels) can carry "juice-jacking" payloads. Carry a USB data-blocker dongle, or use only the AC adapter.',
      },
      {
        id: 'tvl-notify',
        title: 'Notify your bank + provider before travel',
        severity: 'low',
        body: 'Reduces false-positive fraud holds and SIM-swap alerts. Also ensures 2FA via SMS is not routed to a SIM the provider has flagged as "out of country".',
      },
    ],
  },
  {
    id: 'recovery',
    short: 'Recovery',
    longTitle: 'Incident Recovery & Estate',
    icon: 'recovery',
    intro:
      'Assume the breach will happen, not "if". Pre-staged recovery is the difference between an afternoon and a quarter of pain. Same discipline for digital estate as for physical.',
    items: [
      {
        id: 'rec-playbook',
        title: 'Written incident playbook (printed, offline)',
        severity: 'high',
        body: 'One page: which accounts to revoke, who to call, where the recovery codes live, how to file a police report and an FTC / IC3 complaint. Keep a printed copy where you can find it without logging in to anything.',
      },
      {
        id: 'rec-emergency',
        title: 'Trusted emergency contact with limited access',
        severity: 'medium',
        body: 'A lawyer, family member, or close friend with the location of your master-password recovery key and a sealed envelope of estate documents. Practise the hand-off at least once.',
      },
      {
        id: 'rec-will',
        title: 'Digital-estate clause in will / trust',
        severity: 'low',
        body: 'Designate a digital executor. List the password manager, email, crypto wallet, domain registrar, and 2FA method. Without it, an Apple / Google / Crypto exchange account can be effectively orphaned.',
      },
      {
        id: 'rec-revoke-session',
        title: 'Know how to kill all sessions on every major service',
        severity: 'medium',
        body: 'Google, Apple, Microsoft, Facebook, GitHub, password manager — each has a "sign out of all devices" path. Bookmarked. Used in the first 60 seconds of a confirmed compromise.',
      },
      {
        id: 'rec-monitoring',
        title: 'Identity-theft monitoring active',
        severity: 'medium',
        body: "Bank transaction alerts, credit-bureau monitoring, dark-web exposure alerts (Hudson Rock, SpyCloud, your password manager's breach report).",
      },
    ],
  },
  {
    id: 'family',
    short: 'Family',
    longTitle: 'Family & Household',
    icon: 'family',
    intro:
      'You are only as secure as the weakest member of your household — and the most willing to click. The goal is friction that is invisible for you and intuitive for them.',
    items: [
      {
        id: 'fam-shared-pwmgr',
        title: 'Shared password manager for household accounts',
        severity: 'high',
        body: 'Streaming, utilities, mortgage portal, school accounts, insurance. Shared vault with audit logs. New passwords are shared in the vault, not in texts or email.',
      },
      {
        id: 'fam-router-parental',
        title: 'Router / DNS-level content filtering',
        severity: 'medium',
        body: 'NextDNS, Cloudflare Family, AdGuard Home, or a router with built-in filtering. Defends every device on the network without per-device configuration.',
      },
      {
        id: 'fam-phishing-drill',
        title: 'Quarterly "phishing fire drill"',
        severity: 'medium',
        body: 'Send a fake phishing email to your household and walk through what they should look for. Reward the right behaviour. Use gophish or a vendor like KnowBe4.',
      },
      {
        id: 'fam-physical-keys',
        title: 'Spare hardware key stored offsite',
        severity: 'low',
        body: 'YubiKey in a safe deposit box or trusted family member. If your primary key is lost or destroyed, you can still recover the most important accounts.',
      },
      {
        id: 'fam-talk',
        title: 'Talk about it — "we have a security plan"',
        severity: 'high',
        body: 'A 30-minute conversation covers more than any tool. What is OPSEC, what is plausible to attack, what is the family protocol if someone thinks they have been compromised.',
      },
    ],
  },
];

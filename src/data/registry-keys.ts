export interface RegistryEntry {
  path: string;
  category: string;
  description: string;
  malware: string[];
  techniqueId: string;
  technique: string;
  tactic: string;
  risk: 'critical' | 'high' | 'medium' | 'low';
}

export const KNOWN_KEYS: RegistryEntry[] = [
  // Persistence — Run Keys
  {
    path: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    category: 'Persistence',
    description: 'Run key — common malware persistence via registry.',
    malware: ['Emotet', 'TrickBot', 'AgentTesla', 'QakBot'],
    techniqueId: 'T1547.001',
    technique: 'Registry Run Keys / Startup Folder',
    tactic: 'Persistence',
    risk: 'high',
  },
  {
    path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    category: 'Persistence',
    description: 'User-specific run key persistence.',
    malware: ['FormBook', 'Lokibot', 'RemcosRAT'],
    techniqueId: 'T1547.001',
    technique: 'Registry Run Keys / Startup Folder',
    tactic: 'Persistence',
    risk: 'high',
  },
  {
    path: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
    category: 'Persistence',
    description: 'Run once key — executes on next boot then deletes.',
    malware: ['Ryuk', 'Conti'],
    techniqueId: 'T1547.001',
    technique: 'Registry Run Keys / Startup Folder',
    tactic: 'Persistence',
    risk: 'medium',
  },
  {
    path: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\RunServices',
    category: 'Persistence',
    description: 'RunServices key — loads before user logon.',
    malware: ['NetBus', 'SubSeven'],
    techniqueId: 'T1547.001',
    technique: 'Registry Run Keys / Startup Folder',
    tactic: 'Persistence',
    risk: 'medium',
  },
  {
    path: 'HKLM\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Run',
    category: 'Persistence',
    description: '32-bit run key on 64-bit systems.',
    malware: ['CoinMiner'],
    techniqueId: 'T1547.001',
    technique: 'Registry Run Keys / Startup Folder',
    tactic: 'Persistence',
    risk: 'high',
  },

  // Boot Execute
  {
    path: 'HKLM\\System\\CurrentControlSet\\Control\\Session Manager\\BootExecute',
    category: 'Persistence',
    description: 'BootExecute — runs before system services start.',
    malware: ['BootRookit', 'TDSS', 'Petya'],
    techniqueId: 'T1547.002',
    technique: 'LSASS Driver Load',
    tactic: 'Persistence',
    risk: 'high',
  },

  // Service
  {
    path: 'HKLM\\System\\CurrentControlSet\\Services',
    category: 'Persistence',
    description: 'Windows services key — subkeys are individual service configurations.',
    malware: ['WannaCry', 'Stuxnet', 'TrickBot'],
    techniqueId: 'T1543.003',
    technique: 'Windows Service',
    tactic: 'Persistence',
    risk: 'high',
  },
  {
    path: 'HKLM\\System\\CurrentControlSet\\Control\\SafeBoot',
    category: 'Defense Evasion',
    description: 'SafeBoot configuration — malware may disable or use minimal safe mode.',
    malware: ['RobbinHood', 'GandCrab'],
    techniqueId: 'T1562.001',
    technique: 'Disable or Modify Tools',
    tactic: 'Defense Evasion',
    risk: 'medium',
  },

  // Image File Execution Options
  {
    path: 'HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options',
    category: 'Defense Evasion',
    description: 'IFEO — used for silent process exit debugging, process ghosting.',
    malware: ['PlugX', 'Houdini'],
    techniqueId: 'T1546.012',
    technique: 'Image File Execution Options Injection',
    tactic: 'Defense Evasion',
    risk: 'high',
  },
  {
    path: 'HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\*\\Debugger',
    category: 'Defense Evasion',
    description: 'Global debugger flags — redirects execution to an attacker binary.',
    malware: ['PlugX', 'Gh0stRAT'],
    techniqueId: 'T1546.012',
    technique: 'Image File Execution Options Injection',
    tactic: 'Defense Evasion',
    risk: 'high',
  },

  // Notifications — Winlogon
  {
    path: 'HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon\\Notify',
    category: 'Persistence',
    description: 'Winlogon notifications — loads DLLs on user logon.',
    malware: ['Mydoom', 'Gaobot'],
    techniqueId: 'T1547.004',
    technique: 'Winlogon Helper DLL',
    tactic: 'Persistence',
    risk: 'high',
  },
  {
    path: 'HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon\\Userinit',
    category: 'Persistence',
    description: 'Userinit — userinit.exe is launched at logon.',
    malware: ['TrickBot', 'Zeus', 'Banker'],
    techniqueId: 'T1547.004',
    technique: 'Winlogon Helper DLL',
    tactic: 'Persistence',
    risk: 'high',
  },
  {
    path: 'HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon\\Shell',
    category: 'Persistence',
    description: 'Shell — replaces explorer.exe as the default shell.',
    malware: ['Ransom.Win32.FileCrypt', 'Dexter'],
    techniqueId: 'T1547.004',
    technique: 'Winlogon Helper DLL',
    tactic: 'Persistence',
    risk: 'high',
  },

  // AppInit
  {
    path: 'HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows\\AppInit_DLLs',
    category: 'Persistence',
    description: 'AppInit_DLLs — loads DLLs into every process loading user32.dll.',
    malware: ['Koobface', 'Ramnit', 'Bancos'],
    techniqueId: 'T1546.001',
    technique: 'AppInit DLLs',
    tactic: 'Persistence',
    risk: 'critical',
  },
  {
    path: 'HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows\\LoadAppInit_DLLs',
    category: 'Persistence',
    description: 'Enables or disables AppInit_DLLs loading.',
    malware: ['Koobface'],
    techniqueId: 'T1546.001',
    technique: 'AppInit DLLs',
    tactic: 'Persistence',
    risk: 'high',
  },

  // Browser Helpers
  {
    path: 'HKLM\\Software\\Microsoft\\Internet Explorer\\Extensions',
    category: 'Persistence',
    description: 'IE extensions — depreacted but still supported for legacy compat.',
    malware: ['SearchProtect', 'SpySheriff'],
    techniqueId: 'T1176',
    technique: 'Browser Extensions',
    tactic: 'Persistence',
    risk: 'medium',
  },

  // LSA Security Packages
  {
    path: 'HKLM\\System\\CurrentControlSet\\Control\\Lsa\\Security Packages',
    category: 'Credential Access',
    description: 'LSA security packages — loads authentication packages including SSPs.',
    malware: ['Mimikatz SSP', 'Wannabe'],
    techniqueId: 'T1556.004',
    technique: 'Security Support Provider (SSP)',
    tactic: 'Credential Access',
    risk: 'high',
  },
  {
    path: 'HKLM\\System\\CurrentControlSet\\Control\\Lsa\\Authentication Packages',
    category: 'Credential Access',
    description: 'Authentication packages loaded by LSA.',
    malware: ['WannaMine'],
    techniqueId: 'T1556.004',
    technique: 'Security Support Provider (SSP)',
    tactic: 'Credential Access',
    risk: 'medium',
  },

  // Notification Packages
  {
    path: 'HKLM\\System\\CurrentControlSet\\Control\\Lsa\\Notification Packages',
    category: 'Credential Access',
    description: 'LSA notification packages for password change notifications (DPAPI).',
    malware: ['Mimikatz'],
    techniqueId: 'T1556.004',
    technique: 'Security Support Provider (SSP)',
    tactic: 'Credential Access',
    risk: 'high',
  },

  // Logon scripts
  {
    path: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System',
    category: 'Persistence',
    description: 'Windows system policies including logon scripts, hide last user.',
    malware: ['Vobfus', 'Autorun'],
    techniqueId: 'T1547.006',
    technique: 'Boot or Logon Autostart',
    tactic: 'Persistence',
    risk: 'medium',
  },
  {
    path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System',
    category: 'Persistence',
    description: 'Per-user system policies.',
    malware: ['LogonBGI'],
    techniqueId: 'T1547.006',
    technique: 'Boot or Logon Autostart',
    tactic: 'Persistence',
    risk: 'medium',
  },

  // Certificates
  {
    path: 'HKLM\\Software\\Microsoft\\SystemCertificates\\Root\\Certificates',
    category: 'Defense Evasion',
    description: 'Root certificate store — malware may install untrusted root CAs.',
    malware: ['Superfish', 'Dell eDellRoot', 'PlugX'],
    techniqueId: 'T1553.004',
    technique: 'Install Root Certificate',
    tactic: 'Defense Evasion',
    risk: 'high',
  },
  {
    path: 'HKLM\\Software\\Microsoft\\EnterpriseCertificates\\Root\\Certificates',
    category: 'Defense Evasion',
    description: 'Enterprise root certificate store.',
    malware: ['Stuxnet'],
    techniqueId: 'T1553.004',
    technique: 'Install Root Certificate',
    tactic: 'Defense Evasion',
    risk: 'medium',
  },

  // AppCert
  {
    path: 'HKLM\\System\\CurrentControlSet\\Control\\Session Manager\\AppCertDlls',
    category: 'Persistence',
    description: 'AppCert DLLs — loaded by every process that calls Win32 APIs.',
    malware: [],
    techniqueId: 'T1546.009',
    technique: 'AppCert DLLs',
    tactic: 'Persistence',
    risk: 'high',
  },

  // Active Setup
  {
    path: 'HKLM\\Software\\Microsoft\\Active Setup\\Installed Components',
    category: 'Persistence',
    description: 'Active Setup — runs on user logon before explorer.',
    malware: ['Adware', 'BrowseFox'],
    techniqueId: 'T1547.011',
    technique: 'Active Setup',
    tactic: 'Persistence',
    risk: 'medium',
  },

  // User Shell Folders
  {
    path: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
    category: 'Persistence',
    description: 'Shell folder redirection — malware can redirect startup/profile locations.',
    malware: ['ZeroAccess'],
    techniqueId: 'T1547.006',
    technique: 'Boot or Logon Autostart',
    tactic: 'Persistence',
    risk: 'medium',
  },
  {
    path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
    category: 'Persistence',
    description: 'Per-user shell folder redirection.',
    malware: [],
    techniqueId: 'T1547.006',
    technique: 'Boot or Logon Autostart',
    tactic: 'Persistence',
    risk: 'low',
  },
];

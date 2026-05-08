export interface MitreTechnique {
  id: string;
  name: string;
  description?: string;
  subtechniques?: Array<{ id: string; name: string }>;
}

export interface MitreTactic {
  id: string;
  name: string;
  short_name: string;
  description: string;
  techniques: MitreTechnique[];
}

export const mitreMatrix: MitreTactic[] = [
  {
    id: 'TA0043',
    name: 'Reconnaissance',
    short_name: 'reconnaissance',
    description: 'Adversaries try to gather information they can use to plan future operations.',
    techniques: [
      {
        id: 'T1595',
        name: 'Active Scanning',
        description: 'Adversaries scan victim infrastructure to gather information for targeting.',
      },
      {
        id: 'T1592',
        name: 'Gather Victim Host Information',
        description: "Adversaries gather information about the victim's hosts that can be used during targeting.",
      },
      {
        id: 'T1589',
        name: 'Gather Victim Identity Information',
        description: "Adversaries gather information about the victim's identity that can be used during targeting.",
      },
      {
        id: 'T1590',
        name: 'Gather Victim Network Information',
        description: "Adversaries gather information about the victim's networks that can be used during targeting.",
      },
      {
        id: 'T1591',
        name: 'Gather Victim Org Information',
        description:
          "Adversaries gather information about the victim's organization that can be used during targeting.",
      },
      {
        id: 'T1598',
        name: 'Phishing for Information',
        description: 'Adversaries send phishing messages to elicit sensitive information.',
      },
      {
        id: 'T1596',
        name: 'Search Open Technical Databases',
        description: 'Adversaries search freely available technical databases for information about victims.',
      },
      {
        id: 'T1593',
        name: 'Search Open Websites/Domains',
        description: 'Adversaries search freely available websites for information about victims.',
      },
      {
        id: 'T1594',
        name: 'Search Victim-Owned Websites',
        description: 'Adversaries search websites owned by the victim for information.',
      },
    ],
  },
  {
    id: 'TA0042',
    name: 'Resource Development',
    short_name: 'resource-development',
    description: 'Adversaries try to establish resources they can use to support operations.',
    techniques: [
      {
        id: 'T1583',
        name: 'Acquire Infrastructure',
        description: 'Adversaries buy, lease, or rent infrastructure for use during targeting.',
      },
      {
        id: 'T1586',
        name: 'Compromise Accounts',
        description: 'Adversaries compromise accounts with services that can be leveraged during targeting.',
      },
      {
        id: 'T1584',
        name: 'Compromise Infrastructure',
        description: 'Adversaries compromise third-party infrastructure for use during targeting.',
      },
      {
        id: 'T1587',
        name: 'Develop Capabilities',
        description: 'Adversaries build capabilities that can be used during targeting.',
      },
      {
        id: 'T1585',
        name: 'Establish Accounts',
        description: 'Adversaries create and cultivate accounts with services that can be used during targeting.',
      },
      {
        id: 'T1588',
        name: 'Obtain Capabilities',
        description: 'Adversaries buy, steal, or download capabilities that can be used during targeting.',
      },
      {
        id: 'T1608',
        name: 'Stage Capabilities',
        description:
          'Adversaries upload, install, or otherwise set up capabilities on infrastructure for use during targeting.',
      },
    ],
  },
  {
    id: 'TA0001',
    name: 'Initial Access',
    short_name: 'initial-access',
    description: 'Adversaries try to get into your network.',
    techniques: [
      {
        id: 'T1189',
        name: 'Drive-by Compromise',
        description: 'Adversaries gain access through a user visiting a website.',
      },
      {
        id: 'T1190',
        name: 'Exploit Public-Facing Application',
        description: 'Adversaries use software, data, or commands to exploit a weakness in internet-facing software.',
      },
      {
        id: 'T1133',
        name: 'External Remote Services',
        description: 'Adversaries leverage external-facing remote services to gain initial access.',
      },
      {
        id: 'T1566',
        name: 'Phishing',
        description: 'Adversaries send phishing messages to gain access to victim systems.',
        subtechniques: [
          { id: 'T1566.001', name: 'Spearphishing Attachment' },
          { id: 'T1566.002', name: 'Spearphishing Link' },
          { id: 'T1566.003', name: 'Spearphishing via Service' },
        ],
      },
      {
        id: 'T1195',
        name: 'Supply Chain Compromise',
        description: 'Adversaries manipulate products or delivery mechanisms before receipt by the final consumer.',
      },
      {
        id: 'T1199',
        name: 'Trusted Relationship',
        description: 'Adversaries breach or leverage organizations with access to intended victims.',
      },
      {
        id: 'T1078',
        name: 'Valid Accounts',
        description: 'Adversaries obtain and abuse credentials of existing accounts.',
      },
    ],
  },
  {
    id: 'TA0002',
    name: 'Execution',
    short_name: 'execution',
    description: 'Adversaries try to run malicious code.',
    techniques: [
      {
        id: 'T1059',
        name: 'Command and Scripting Interpreter',
        description: 'Adversaries abuse command and script interpreters to execute commands.',
        subtechniques: [
          { id: 'T1059.001', name: 'PowerShell' },
          { id: 'T1059.003', name: 'Windows Command Shell' },
          { id: 'T1059.004', name: 'Unix Shell' },
          { id: 'T1059.006', name: 'Python' },
        ],
      },
      {
        id: 'T1203',
        name: 'Exploitation for Client Execution',
        description: 'Adversaries exploit vulnerabilities in client applications to execute code.',
      },
      {
        id: 'T1106',
        name: 'Native API',
        description: 'Adversaries interact with the native OS API to execute behaviors.',
      },
      {
        id: 'T1053',
        name: 'Scheduled Task/Job',
        description: 'Adversaries abuse task scheduling functionality to facilitate initial or recurring execution.',
      },
      {
        id: 'T1072',
        name: 'Software Deployment Tools',
        description: 'Adversaries use third-party software suites to facilitate command execution.',
      },
      {
        id: 'T1569',
        name: 'System Services',
        description: 'Adversaries abuse system services or daemons to execute commands or programs.',
      },
      {
        id: 'T1204',
        name: 'User Execution',
        description: 'Adversaries rely upon specific actions by a user to gain execution.',
      },
      {
        id: 'T1047',
        name: 'Windows Management Instrumentation',
        description: 'Adversaries abuse WMI to achieve execution.',
      },
    ],
  },
  {
    id: 'TA0003',
    name: 'Persistence',
    short_name: 'persistence',
    description: 'Adversaries try to maintain their foothold.',
    techniques: [
      { id: 'T1098', name: 'Account Manipulation', description: 'Adversaries manipulate accounts to maintain access.' },
      {
        id: 'T1197',
        name: 'BITS Jobs',
        description: 'Adversaries abuse BITS jobs to execute code and maintain persistence.',
      },
      {
        id: 'T1547',
        name: 'Boot or Logon Autostart Execution',
        description: 'Adversaries configure system settings to automatically execute a program during boot or logon.',
      },
      {
        id: 'T1543',
        name: 'Create or Modify System Process',
        description: 'Adversaries create or modify system-level processes to repeatedly execute malicious payloads.',
      },
      {
        id: 'T1574',
        name: 'Hijack Execution Flow',
        description: 'Adversaries hijack legitimate execution flows to execute their own malicious code.',
      },
      {
        id: 'T1037',
        name: 'Boot or Logon Initialization Scripts',
        description: 'Adversaries use scripts run at boot or logon to establish persistence.',
      },
      {
        id: 'T1505',
        name: 'Server Software Component',
        description:
          'Adversaries abuse legitimate extensible development features of server applications to establish persistence.',
      },
      {
        id: 'T1136',
        name: 'Create Account',
        description: 'Adversaries create an account to maintain access to victim systems.',
      },
    ],
  },
  {
    id: 'TA0004',
    name: 'Privilege Escalation',
    short_name: 'privilege-escalation',
    description: 'Adversaries try to gain higher-level permissions.',
    techniques: [
      {
        id: 'T1548',
        name: 'Abuse Elevation Control Mechanism',
        description: 'Adversaries bypass mechanisms designed to control elevated privileges.',
      },
      {
        id: 'T1134',
        name: 'Access Token Manipulation',
        description: 'Adversaries modify access tokens to operate under a different user or system security context.',
      },
      {
        id: 'T1611',
        name: 'Escape to Host',
        description: 'Adversaries break out of a container to gain access to the underlying host.',
      },
      {
        id: 'T1068',
        name: 'Exploitation for Privilege Escalation',
        description: 'Adversaries exploit software vulnerabilities to elevate privileges.',
      },
      {
        id: 'T1055',
        name: 'Process Injection',
        description: 'Adversaries inject code into processes to evade defenses and elevate privileges.',
      },
      {
        id: 'T1053',
        name: 'Scheduled Task/Job',
        description: 'Adversaries abuse task scheduling to escalate privileges.',
      },
      {
        id: 'T1078',
        name: 'Valid Accounts',
        description: 'Adversaries obtain and use credentials of existing accounts for privilege escalation.',
      },
    ],
  },
  {
    id: 'TA0005',
    name: 'Defense Evasion',
    short_name: 'defense-evasion',
    description: 'Adversaries try to avoid being detected.',
    techniques: [
      {
        id: 'T1140',
        name: 'Deobfuscate/Decode Files or Information',
        description: 'Adversaries use obfuscated files or information to hide artifacts of an intrusion.',
      },
      { id: 'T1562', name: 'Impair Defenses', description: 'Adversaries disable security tools to avoid detection.' },
      {
        id: 'T1070',
        name: 'Indicator Removal',
        description:
          'Adversaries delete or alter artifacts generated on a system to remove evidence of their presence.',
      },
      {
        id: 'T1036',
        name: 'Masquerading',
        description: 'Adversaries manipulate features of artifacts to make them appear legitimate.',
      },
      {
        id: 'T1027',
        name: 'Obfuscated Files or Information',
        description: 'Adversaries attempt to make payloads difficult to discover or analyze.',
      },
      {
        id: 'T1055',
        name: 'Process Injection',
        description: 'Adversaries inject code into processes to evade defenses.',
      },
      {
        id: 'T1553',
        name: 'Subvert Trust Controls',
        description: 'Adversaries undermine security controls that will deny execution of untrusted programs.',
      },
      {
        id: 'T1218',
        name: 'System Binary Proxy Execution',
        description: 'Adversaries bypass process allow lists by using trusted binaries to proxy execution.',
      },
    ],
  },
  {
    id: 'TA0006',
    name: 'Credential Access',
    short_name: 'credential-access',
    description: 'Adversaries try to steal account names and passwords.',
    techniques: [
      {
        id: 'T1110',
        name: 'Brute Force',
        description: 'Adversaries use brute force techniques to gain access to accounts.',
      },
      {
        id: 'T1555',
        name: 'Credentials from Password Stores',
        description: 'Adversaries search for common password storage locations.',
      },
      {
        id: 'T1212',
        name: 'Exploitation for Credential Access',
        description: 'Adversaries exploit software vulnerabilities to obtain credentials.',
      },
      {
        id: 'T1187',
        name: 'Forced Authentication',
        description: 'Adversaries gather credential material by invoking authentication.',
      },
      {
        id: 'T1056',
        name: 'Input Capture',
        description: 'Adversaries use methods of capturing user input to obtain credentials.',
      },
      {
        id: 'T1003',
        name: 'OS Credential Dumping',
        description: 'Adversaries attempt to dump credentials to obtain account login information.',
      },
      {
        id: 'T1528',
        name: 'Steal Application Access Token',
        description: 'Adversaries steal application access tokens as a means of acquiring credentials.',
      },
      {
        id: 'T1539',
        name: 'Steal Web Session Cookie',
        description: 'Adversaries steal web session cookies from a specific user.',
      },
    ],
  },
  {
    id: 'TA0007',
    name: 'Discovery',
    short_name: 'discovery',
    description: 'Adversaries try to figure out your environment.',
    techniques: [
      {
        id: 'T1087',
        name: 'Account Discovery',
        description: 'Adversaries attempt to get a listing of valid accounts.',
      },
      {
        id: 'T1217',
        name: 'Browser Information Discovery',
        description: 'Adversaries enumerate browser-related information.',
      },
      {
        id: 'T1580',
        name: 'Cloud Infrastructure Discovery',
        description: 'Adversaries attempt to discover infrastructure and resources available in a cloud environment.',
      },
      {
        id: 'T1046',
        name: 'Network Service Discovery',
        description: 'Adversaries try to get a listing of services running on remote hosts.',
      },
      {
        id: 'T1135',
        name: 'Network Share Discovery',
        description: 'Adversaries look for folders and drives shared over a network.',
      },
      {
        id: 'T1057',
        name: 'Process Discovery',
        description: 'Adversaries attempt to get information about running processes.',
      },
      {
        id: 'T1018',
        name: 'Remote System Discovery',
        description: 'Adversaries attempt to get a listing of other systems by IP address, hostname, or domain.',
      },
      {
        id: 'T1016',
        name: 'System Network Configuration Discovery',
        description: 'Adversaries look for details about the network configuration of a system.',
      },
    ],
  },
  {
    id: 'TA0008',
    name: 'Lateral Movement',
    short_name: 'lateral-movement',
    description: 'Adversaries try to move through your environment.',
    techniques: [
      {
        id: 'T1210',
        name: 'Exploitation of Remote Services',
        description: 'Adversaries exploit remote services to gain unauthorized access to systems.',
      },
      {
        id: 'T1534',
        name: 'Internal Spearphishing',
        description: 'Adversaries use internal spearphishing to gain access to additional information.',
      },
      {
        id: 'T1570',
        name: 'Lateral Tool Transfer',
        description: 'Adversaries transfer tools or files between systems in a compromised environment.',
      },
      {
        id: 'T1563',
        name: 'Remote Service Session Hijacking',
        description: 'Adversaries take control of preexisting sessions with remote services.',
      },
      {
        id: 'T1021',
        name: 'Remote Services',
        description:
          'Adversaries may use valid accounts to log into a service specifically designed to accept remote connections.',
      },
      {
        id: 'T1091',
        name: 'Replication Through Removable Media',
        description: 'Adversaries move onto systems via removable media.',
      },
      {
        id: 'T1072',
        name: 'Software Deployment Tools',
        description: 'Adversaries use third-party software suites to facilitate lateral movement.',
      },
    ],
  },
  {
    id: 'TA0009',
    name: 'Collection',
    short_name: 'collection',
    description: 'Adversaries try to gather data of interest to their goal.',
    techniques: [
      {
        id: 'T1560',
        name: 'Archive Collected Data',
        description: 'Adversaries compress and/or encrypt data before exfiltration.',
      },
      { id: 'T1123', name: 'Audio Capture', description: 'Adversaries use peripherals to capture audio recordings.' },
      {
        id: 'T1115',
        name: 'Clipboard Data',
        description: 'Adversaries collect data stored in the clipboard from users copying information.',
      },
      {
        id: 'T1213',
        name: 'Data from Information Repositories',
        description: 'Adversaries collect data stored in cloud storage, databases, or code repositories.',
      },
      {
        id: 'T1005',
        name: 'Data from Local System',
        description: 'Adversaries search local system sources to find files of interest.',
      },
      {
        id: 'T1039',
        name: 'Data from Network Shared Drive',
        description: 'Adversaries search network shares on compromised systems.',
      },
      {
        id: 'T1025',
        name: 'Data from Removable Media',
        description: 'Adversaries search removable media on compromised systems.',
      },
      {
        id: 'T1114',
        name: 'Email Collection',
        description: 'Adversaries target user email to collect sensitive information.',
      },
    ],
  },
  {
    id: 'TA0011',
    name: 'Command and Control',
    short_name: 'command-and-control',
    description: 'Adversaries try to communicate with compromised systems to control them.',
    techniques: [
      {
        id: 'T1071',
        name: 'Application Layer Protocol',
        description: 'Adversaries communicate using application layer protocols to avoid detection.',
      },
      {
        id: 'T1092',
        name: 'Communication Through Removable Media',
        description: 'Adversaries communicate using removable media as a layer of indirection.',
      },
      {
        id: 'T1132',
        name: 'Data Encoding',
        description: 'Adversaries encode data to make the content of C2 traffic more difficult to detect.',
      },
      {
        id: 'T1001',
        name: 'Data Obfuscation',
        description: 'Adversaries obfuscate C2 communications in an attempt to make detection more difficult.',
      },
      {
        id: 'T1568',
        name: 'Dynamic Resolution',
        description: 'Adversaries dynamically establish connections to C2 using legitimate online services.',
      },
      {
        id: 'T1573',
        name: 'Encrypted Channel',
        description: 'Adversaries employ encryption in an attempt to hide C2 communications.',
      },
      {
        id: 'T1008',
        name: 'Fallback Channels',
        description: 'Adversaries use fallback or alternate communication channels if the primary is compromised.',
      },
      {
        id: 'T1095',
        name: 'Non-Application Layer Protocol',
        description: 'Adversaries use non-application layer protocols for communication.',
      },
    ],
  },
  {
    id: 'TA0010',
    name: 'Exfiltration',
    short_name: 'exfiltration',
    description: 'Adversaries try to steal data.',
    techniques: [
      {
        id: 'T1020',
        name: 'Automated Exfiltration',
        description: 'Adversaries exfiltrate data automatically once collection criteria are met.',
      },
      {
        id: 'T1030',
        name: 'Data Transfer Size Limits',
        description: 'Adversaries exfiltrate data in fixed-size chunks instead of dumping all files at once.',
      },
      {
        id: 'T1048',
        name: 'Exfiltration Over Alternative Protocol',
        description: 'Adversaries steal data using a different protocol than C2.',
      },
      {
        id: 'T1041',
        name: 'Exfiltration Over C2 Channel',
        description: 'Adversaries steal data by exfiltrating it over an existing C2 channel.',
      },
      {
        id: 'T1011',
        name: 'Exfiltration Over Other Network Medium',
        description: 'Adversaries attempt to exfiltrate data over a different network medium than the C2.',
      },
      {
        id: 'T1567',
        name: 'Exfiltration Over Web Service',
        description: 'Adversaries use an existing and legitimate external web service to exfiltrate data.',
      },
      {
        id: 'T1029',
        name: 'Scheduled Transfer',
        description:
          'Adversaries schedule data exfiltration to blend in with normal network traffic or avoid detection.',
      },
    ],
  },
  {
    id: 'TA0040',
    name: 'Impact',
    short_name: 'impact',
    description: 'Adversaries try to manipulate, interrupt, or destroy your systems and data.',
    techniques: [
      {
        id: 'T1531',
        name: 'Account Access Removal',
        description:
          'Adversaries interrupt availability of system and network resources by inhibiting access to accounts.',
      },
      {
        id: 'T1485',
        name: 'Data Destruction',
        description: 'Adversaries destroy data and files on specific systems or large numbers of systems.',
      },
      {
        id: 'T1486',
        name: 'Data Encrypted for Impact',
        description:
          'Adversaries encrypt data on target systems or large numbers of systems to interrupt availability.',
      },
      {
        id: 'T1491',
        name: 'Defacement',
        description: 'Adversaries modify visual content available internally or externally.',
      },
      {
        id: 'T1561',
        name: 'Disk Wipe',
        description: 'Adversaries wipe or corrupt raw disk data on specific systems or large numbers of systems.',
      },
      {
        id: 'T1499',
        name: 'Endpoint Denial of Service',
        description: 'Adversaries perform denial of service attacks against endpoints.',
      },
      { id: 'T1657', name: 'Financial Theft', description: 'Adversaries steal monetary resources from targets.' },
      {
        id: 'T1490',
        name: 'Inhibit System Recovery',
        description: 'Adversaries delete or remove built-in data and inhibit recovery of a victim system.',
      },
    ],
  },
];

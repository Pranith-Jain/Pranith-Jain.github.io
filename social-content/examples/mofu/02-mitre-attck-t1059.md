---
slug: mofu-02-mitre-attck-t1059
title: MITRE T1059: Catch Every Scripting Attack
funnel: mofu
platform: linkedin
format: carousel
hook: how-to
persona: Detection Engineer
hashtags: cybersecurity, MITRE, ATT&CK, T1059, detection-engineering
cta: If this helped, save it for your next detection review.
notes: How-to hook. Framework variant = 8 sub-techniques in a 2x4 grid. Each card = technique + 1 detection idea.
---

MITRE T1059: Command and Scripting Interpreter.
8 sub-techniques. One technique covers 40% of all endpoint attacks.

---

KIND: framework
T1059.001: PowerShell
Still the #1 attacker tool after 15 years.

- Encoded commands (-enc), download cradles (Net.WebClient)
- AMSI bypass attempts: amsiInitFailed, ScriptBlockText logging gaps
- Detection: enable PowerShell ScriptBlock + Module logging (event 4104)
- Hunt: powershell.exe spawning from non-admin users with -enc

---

KIND: framework
T1059.002: AppleScript
macOS attackers' favorite, often missed by EDR.

- osascript -e, .scpt files, embedded in .app bundles
- Used in 3CX, Atomic Stealer, and most macOS-targeted ops
- Detection: Unified Log stream "osascript" + "exec" events
- Hunt: osascript spawning curl, wget, or /usr/bin/python

---

KIND: framework
T1059.003: Windows Command Shell
cmd.exe — the old reliable, still everywhere.

- Living-off-the-land: whoami, net, ipconfig, nltest, dsquery
- Detection: Sysmon Event 1 (process create) + parent-child correlation
- Hunt: cmd.exe spawned by Office apps, browsers, or PDF readers
- Pair with 4688 with command-line auditing enabled

---

KIND: framework
T1059.004: Unix Shell
bash on Linux and macOS, often not logged.

- Reverse shells, curl-to-bash, base64-encoded payloads
- Detection: auditd execve + syscall monitoring, or Falco rules
- Hunt: bash spawned by www-data, nginx, or systemd services
- Enable shell history forwarding to a central log shipper

---

KIND: framework
T1059.005: Visual Basic
Office macros are still the #1 phishing payload.

- .docm, .xlsm, .pptm with AutoOpen / Document_Open triggers
- AMSI scans macros in Office 365 — but only if macros are enabled
- Detection: Office spawns wscript, cscript, powershell, or mshta
- Hunt: any Office file write to %TEMP% followed by a script engine

---

KIND: framework
T1059.006: Python
The cross-platform payload language of 2024.

- pyinstaller EXEs, base64-encoded .py in clipboard, or direct exec
- Detection: Sysmon Event 1 for python.exe + parent process
- Hunt: python.exe spawned by Office, browsers, or LOLBins
- Watch for python.exe in user-writable paths (AppData, Downloads)

---

KIND: framework
T1059.007: JavaScript
Browser-based + Node.js for desktop-side ops.

- Malicious npm packages, prototype pollution, JScript on Windows
- Detection: Sysmon for cscript / wscript + JScript engine events
- Hunt: cscript.exe spawning from Office, .js in startup folders
- Watch for unusual Node.js processes (parent != IDE or build tool)

---

KIND: framework
T1059.008: Network Device CLI
The one everyone forgets until Cisco gets popped.

- Cisco IOS, Junos, Arista EOS — often no EDR coverage at all
- Detection: TACACS+/RADIUS accounting logs + syslog forwarding
- Hunt: configuration changes outside change windows
- Backup configs + git diff them. Catch unauthorized changes fast.

---

CTA: If this helped,
save it for your next detection review.

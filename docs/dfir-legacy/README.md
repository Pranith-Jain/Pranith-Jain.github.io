# DFIR Legacy Artifacts

This directory contains reference material from the original standalone `dfir`
repo (https://github.com/Pranith-Jain/DFIR-PLATFORM). It is **read-only** and
exists only to support porting work during phase 2 of the integration plan.

## Contents

- `DFIR-PLATFORM-PLAN.md` — original 2026-04-19 platform plan
- `api-reference/*.py` — original FastAPI implementation. Use only as a
  reference when porting providers and scoring logic to the API Worker. Do
  not run this code; it has no Worker runtime.

After phase 2 ships and the TypeScript ports are validated, this entire
directory should be removed.

# DFIR Toolkit: Gaps & Improvements Plan

> Generated: 2026-05-08

## Current State

### Tools (10)

| #   | Tool              | Route             | Status      |
| --- | ----------------- | ----------------- | ----------- |
| 1   | IOC Checker       | `/dfir/ioc-check` | ✅ Complete |
| 2   | Phishing Analyzer | `/dfir/phishing`  | ✅ Complete |
| 3   | Domain Lookup     | `/dfir/domain`    | ✅ Complete |
| 4   | Exposure Scanner  | `/dfir/exposure`  | ✅ Complete |
| 5   | File Analyzer     | `/dfir/file`      | ✅ Complete |
| 6   | Knowledge Base    | `/dfir/wiki`      | ✅ Complete |
| 7   | Recent Lookups    | `/dfir/dashboard` | ✅ Complete |
| 8   | Threat Actors     | `/dfir/actors`    | ✅ Complete |
| 9   | Privacy Check     | `/dfir/privacy`   | ✅ Complete |
| 10  | Intel Briefings   | `/dfir/briefings` | ✅ Complete |

### Providers Integrated (8)

- VirusTotal
- AbuseIPDB
- Shodan
- GreyNoise
- OTX (AlienVault)
- URLScan
- Hybrid Analysis
- Pulsedive

---

## Gaps Identified

### High Value - Easy

| #   | Gap                     | Description                                                         | Est. Effort |
| --- | ----------------------- | ------------------------------------------------------------------- | ----------- |
| G1  | **CVE Lookup**          | No way to query NVD for CVE details, CVSS scores, affected products | 2-3 hrs     |
| G2  | **Hash Type Detection** | Users must know hash type (MD5/SHA1/SHA256) ahead of time           | 1 hr        |
| G3  | **Base64/URL Decode**   | Phishing emails often have encoded IOCs - no decode capability      | 2 hrs       |
| G4  | **ASN Lookup**          | Network enumeration - lookup ASN ownership, related IPs             | 2-3 hrs     |

### Medium Value - More Complex

| #   | Gap                    | Description                                        | Est. Effort |
| --- | ---------------------- | -------------------------------------------------- | ----------- |
| G5  | **SSL Cert Timeline**  | Full cert history from crt.sh - extend Domain tool | 3-4 hrs     |
| G6  | **URL Preview (Safe)** | HEAD request + screenshot without visiting         | 4-5 hrs     |
| G7  | **Breach Checker**     | HaveIBeenPwned k-anonymity API integration         | 3 hrs       |
| G8  | **Image EXIF Parser**  | Extract GPS, camera metadata from images           | 3-4 hrs     |

### Advanced / Future

| #   | Gap                     | Description                             | Est. Effort |
| --- | ----------------------- | --------------------------------------- | ----------- |
| G9  | **YARA Rule Tester**    | Sandbox execution for YARA rule testing | 8+ hrs      |
| G10 | **PCAP Analyzer**       | Parse pcap files, show HTTP/DNS flows   | 8+ hrs      |
| G11 | **Git Repo Scanner**    | Scan public repos for exposed secrets   | 6+ hrs      |
| G12 | **MITRE ATT&CK Matrix** | Visual navigator - extend Actors tool   | 4-5 hrs     |

---

## Implementation Plan

### Phase 1: Quick Wins (Week 1)

#### 1.1 Hash Type Detection

- **File**: `src/lib/dfir/indicator-client.ts`
- **Add**: Auto-detect hash type from string pattern
- **Route**: Extend existing IOC checker

#### 1.2 Base64/URL Decoder

- **File**: New component `src/components/dfir/Decoder.tsx`
- **Route**: `/dfir/decode`
- **Features**:
  - Base64 decode
  - URL decode
  - Multiple pass decoding
  - Auto-detect encoded content

#### 1.3 CVE Lookup

- **File**: `api/src/routes/cve.ts`
- **Route**: `/api/v1/cve/search?q=CVE-2024-1234`
- **API**: NVD API (free tier)
- **Response**: CVSS, description, references, affected products

### Phase 2: Enhanced Tools (Week 2)

#### 2.1 ASN Lookup

- **File**: `api/src/routes/asn.ts`
- **Route**: `/api/v1/asn/lookup?asn=AS15169`
- **API**: ASN lookup service
- **Response**: Org name, CIDRs, abuse contact, announcement history

#### 2.2 SSL Certificate Timeline

- **Extend**: `api/src/routes/domain.ts`
- **Add**: Endpoint `/api/v1/domain/certs?domain=example.com`
- **API**: crt.sh
- **Response**: All certs issued, timeline

### Phase 3: New Tools (Week 3)

#### 3.1 Breach Checker

- **File**: `api/src/routes/breach.ts`
- **Route**: `/api/v1/breach/check?email=user@example.com`
- **API**: HaveIBeenPwned (k-anonymity)
- **Response**: List of breaches

#### 3.2 Image EXIF Parser

- **File**: `api/src/routes/exif.ts`
- **Route**: POST `/api/v1/exif/analyze`
- **Features**: GPS extraction, camera info, software metadata

### Phase 4: Advanced (Week 4+)

#### 4.1 MITRE ATT&CK Integration

- **Extend**: `src/pages/dfir/Actors.tsx`
- **Add**: Technique matrix visualization
- **Data**: Add MITRE technique mappings to threat-actors.ts

#### 4.2 URL Preview

- **File**: `api/src/routes/url-preview.ts`
- **Features**: HEAD request, metadata extraction, safe screenshot

---

## Code Quality Issues

### Immediate Fixes

| Issue                      | Location            | Status       |
| -------------------------- | ------------------- | ------------ |
| API TypeScript errors (37) | `api/src/lib/*.ts`  | 🔴 Not Fixed |
| Frontend TypeScript errors | -                   | ✅ Fixed     |
| Frontend Lint warnings     | -                   | ✅ Fixed     |
| Test failures              | `useInView.test.ts` | 🔴 Not Fixed |

### Missing

| Item            | Status     |
| --------------- | ---------- |
| API lint script | 🔴 Missing |
| CI/CD pipeline  | 🔴 Missing |

---

## Files to Create/Modify

### New Files

```
src/components/dfir/Decoder.tsx         # Base64/URL decoder
src/pages/dfir/Decode.tsx               # Decoder page
api/src/routes/cve.ts                   # CVE lookup
api/src/routes/asn.ts                   # ASN lookup
api/src/routes/breach.ts                # Breach checker
api/src/routes/exif.ts                  # EXIF parser
docs/superpowers/specs/cve-design.md    # CVE spec
docs/superpowers/specs/asn-design.md   # ASN spec
```

### Modify Existing

```
src/components/dfir/ToolGrid.tsx       # Add new tools
src/lib/dfir/indicator-client.ts       # Hash detection
api/src/routes/domain.ts                # Add cert timeline
api/src/data/dfir/threat-actors.ts     # Add MITRE techniques
api/package.json                       # Add lint script
```

---

## Priority Order

1. ✅ **DONE** - Fix TypeScript/lint issues
2. 🔄 **NEXT** - Hash type detection (1 hr)
3. 📋 **TODO** - CVE lookup (3 hrs)
4. 📋 **TODO** - Base64 decoder (2 hrs)
5. 📋 **TODO** - ASN lookup (3 hrs)
6. 📋 **TODO** - SSL timeline (4 hrs)
7. 📋 **TODO** - Breach checker (3 hrs)
8. 📋 **TODO** - EXIF parser (4 hrs)

---

## Notes

- All external APIs must use free tiers where possible
- Rate limiting required for all external APIs
- Cache responses to minimize API calls
- Use SSE for long-running operations
- Consider API key requirements for each service

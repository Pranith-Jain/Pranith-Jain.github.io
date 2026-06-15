# Signinlogs_Anomalies_KQL_CL

Author: Automated Anomaly KQL Job
Last Updated: 2025-11-20
Scope: Interactive & Non-Interactive Entra ID sign-in anomaly events
Retention (assumed): Matches Log Analytics custom table retention unless overridden

## Purpose
The `Signinlogs_Anomalies_KQL_CL` table stores normalized anomaly detection results produced by a scheduled **hourly KQL job**. It consolidates both Interactive (`SigninLogs`) and Non-Interactive (`AADNonInteractiveUserSignInLogs`) sign-in anomalies, enabling rapid triage, correlation, enrichment, and alerting. Each record represents a NEW entity observation within the **last 1 hour** relative to a 90-day baseline excluding the most recent 1-hour window (baseline vs recent comparison model). The logic flags network origin changes, device fingerprint changes, and geo novelty.

## Detection Model Summary
1. Baseline Window: (Now - 90d - 1h) to (Now - 1h) – captures historical, stable usage (90-day lookback excluding the most recent hour).
2. Recent Window: Last 1 hour – candidate period for new artifacts (evaluated every hour).
3. IPv6 Exclusion: Baseline and recent IP sets exclude IPv6 (`where IPAddress !has ":"`) to reduce noise from frequently changing IPv6 addresses and privacy extensions.
4. Newness Criteria:
    - IP: Not in baseline (IPv4-only) IP set for user.
    - Device Combo: OS|BrowserFamily not in baseline device set for user.
    - Geo Novelty: Country / City / State not previously observed in baseline sets for user.
5. Volume Metrics: `ArtifactHits` counts recent window occurrences for the anomaly value (IP or Device), used for severity scoring and noise suppression.

### IPv6 Exclusion Rationale
Transient IPv6 addresses (privacy extensions, mobile carriers, rotating prefixes) inflated false positives without meaningful security signal. Filtering to IPv4 stabilizes baseline continuity while retaining most actionable anomalies (corporate NATs, VPN egress, residential broadband). Re‑enable IPv6 later if you implement prefix aggregation or heuristic grouping.

## Columns
| Column | Type | Description |
|--------|------|-------------|
| `DetectedDateTime` | datetime | Time the anomaly record was generated (job execution time). |
| `UserPrincipalName` | string | Entra ID user identifier associated with the anomaly. |
| `AnomalyType` | string | Category: `NewInteractiveIP`, `NewInteractiveDeviceCombo`, `NewNonInteractiveIP`, `NewNonInteractiveDeviceCombo`. |
| `Value` | string | Primary anomalous artifact (IP address or `OS|BrowserFamily` device combo). |
| `OS` | string | Operating system (for device anomalies; empty for IP anomalies). |
| `BrowserFamily` | string | Parsed high-level browser family (first token before space). |
| `RawBrowser` | string | Full raw browser string (version included). |
| `Country` | string | Normalized country or region code/name (prefers `countryOrRegion` over simple `Location`). |
| `City` | string | City from `LocationDetails`. |
| `State` | string | State / region from `LocationDetails`. |
| `CountryNovelty` | bool | True if `Country` not in baseline countries for the user. |
| `CityNovelty` | bool | True if `City` not in baseline cities for the user (non-empty). |
| `StateNovelty` | bool | True if `State` not in baseline states for the user (non-empty). |
| `BaselineCountryCount` | int | Count of distinct baseline countries for the user. |
| `BaselineCityCount` | int | Count of distinct baseline cities. |
| `BaselineStateCount` | int | Count of distinct baseline states. |
| `BaselineSize` | int | Size of baseline set (IPs for IP anomalies; device combos for device anomalies). |
| `RecentSize` | int | Size of recent set for the respective artifact type. |
| `FirstSeenRecent` | datetime | First timestamp the new artifact appeared during recent window. |
| (Removed) `Lat` | real | Removed to simplify payload; re-add if travel distance scoring required. |
| (Removed) `Lon` | real | Removed; can be reintroduced with geo distance logic. |
| `ArtifactHits` | int | Count of occurrences of the new artifact in recent window (signal strength). |
| `BaselineIPList` | dynamic | Array of baseline IPs for the user (included for IP anomalies; present & useful for device anomalies too). |
| `BaselineCountryList` | dynamic | Array of baseline countries. |
| `BaselineCityList` | dynamic | Array of baseline cities. |
| `BaselineStateList` | dynamic | Array of baseline states. |
| `BaselineDeviceList` | dynamic | Array of baseline device combos. |
| `BaselineOSList` | dynamic | Array of baseline operating systems. |
| `BaselineBrowserFamilyList` | dynamic | Array of baseline browser families. |
| `BaselineRawBrowserList` | dynamic | Array of baseline raw browser strings. |
| `Severity` | string | Derived field computed post-ingestion using artifact volume & novelty logic. |

## Suggested Severity Logic (Post-Ingestion)
```
| extend Severity = case(
    // Baseline guardrail: suppress users still building baseline (< 3 artifacts in 90-day history)
    // New users generate noise across ALL anomaly types — Q3 (Identity Protection) covers genuine new-account compromise
    BaselineSize < 3, "Informational",
    // HIGH: Very aggressive use (>= 20 hits in 1 hour) + geographic novelty
    CountryNovelty and CityNovelty and ArtifactHits >= 20, "High",
    // MEDIUM: Moderate use (>= 10 hits) OR any geo novelty
    ArtifactHits >= 10, "Medium",
    (CountryNovelty or CityNovelty or StateNovelty), "Medium",
    // LOW: Multiple uses (>= 5 hits) without geo novelty
    ArtifactHits >= 5, "Low",
    // INFORMATIONAL: 1-4 hits, no geo novelty
    "Informational"
)
```
**Threshold Rationale (Hourly Detection Window):**
- **Baseline guardrail:** `BaselineSize < 3` → always Informational (user still building 90d baseline; applies to ALL anomaly types — interactive and non-interactive). New users generate noise because everything is "new" — Q3/Identity Protection provides genuine new-account compromise coverage.
- **20 hits/hour** = Very aggressive (1 sign-in every 3 minutes) → High severity
- **10 hits/hour** = Active session (P95 threshold) → Medium severity
- **5 hits/hour** = Multiple uses (above P75) → Low severity
- **Geographic novelty always escalates** to Medium regardless of frequency

These thresholds are calibrated for **hourly detection windows** (1-hour recent period). If you change the detection frequency (e.g., daily runs), adjust proportionally (multiply by 24 for daily detection).

## Common Triage Questions & How to Answer
| Question | KQL / Approach |
|----------|----------------|
| Has this IP now appeared in interactive AND non-interactive? | Join table back to source logs: `Signinlogs_Anomalies_KQL_CL | where Value matches regex "^([0-9]{1,3}\.){3}[0-9]{1,3}$" | join kind=inner (SigninLogs ...) on UserPrincipalName, Value`. |
| Was MFA enforced for sessions behind this anomaly IP? | Pull sign-ins: `SigninLogs | where IPAddress == Value and UserPrincipalName == ... | project TimeGenerated, MfaDetail, ConditionalAccessStatus`. |
| Is geo novelty legitimate travel? | Compare to HR travel feed (if ingested) or correlate with device compliance: `Device compliance logs` vs anomaly timestamps. |
| Does the device combo also change when IP changes? | `Signinlogs_Anomalies_KQL_CL | summarize by UserPrincipalName, AnomalyType, Value, OS, BrowserFamily`. |
| Do we see risky sign-ins around FirstSeenRecent? | Join to `AADUserRiskEvents` on UserPrincipalName with time window ±1h. |

## False Positive Patterns
- Cloud infrastructure shift (new Azure region NAT IP) without device or country novelty (only IP flagged).
- Mobile user switching cellular subnet within same metro repeatedly (CityNovelty toggles among neighborhoods).
- Browser auto-update altering minor version (no anomaly unless OS|BrowserFamily changes).

## Recommended Suppression / Allowlisting
Create a watchlist or custom table (e.g. `AcceptedAnomalyArtifacts_CL`) containing JSON objects:
```
{ "Type": "IP", "Artifact": "13.72.241.239", "User": "user@domain.com", "Expires": "2025-12-31" }
{ "Type": "Device", "Artifact": "Windows10|Edge", "User": "*", "Expires": "2026-01-15" }
```
Usage: Left-anti join before alerting.
```
Signinlogs_Anomalies_KQL_CL
| lookup AcceptedAnomalyArtifacts_CL on $left.Value == $right.Artifact and $left.UserPrincipalName == $right.User
| where isnull(Type)  // Only unsuppressed anomalies
```

## Sample Alert Rule (Conceptual)
```
Signinlogs_Anomalies_KQL_CL
| where DetectedDateTime > ago(1h)  // Query last hour of detections (aligned with hourly job execution)
| where ArtifactHits >= 30 or CountryNovelty or CityNovelty
| extend Severity = case(ArtifactHits >= 100, "High", CountryNovelty or CityNovelty, "Medium", "Low")
| project-away BaselineRawBrowserList  // reduce payload size if needed
```

## Enrichment Opportunities
- ASN / Org: Join to IP enrichment table (e.g. `IPEnrichment_CL` with columns `IPAddress`, `ASN`, `Org`).
- Risk Aggregation: Correlate with `AADUserRiskEvents` severity or `RiskLevelDuringSignIn`.
- Conditional Access Context: Count distinct enforced policies at anomaly time.
- Geo Distance: Compute km between baseline centroid and anomaly coordinate using Haversine to rank travel plausibility.

## (Optional) Geo Distance
Lat/Lon dropped for baseline job. If re-added, compute distance using Haversine and store `TravelDistanceKm` then severity-weight by unexpected large jumps.

## Operational Workflow
1. **Ingest anomalies** - Scheduled hourly job runs every hour, detecting new artifacts in the last 1 hour compared to 90-day baseline.
2. **Hourly/shift review** - Filter High/Medium severity (or threshold hits) from most recent run.
3. **Enrich with IP reputation** - WHOIS/ASN lookup for new IPs.
4. **Classify** - Benign Infrastructure / User Travel / Suspicious.
5. **Suppress benign artifacts** - Add to allowlist with expiry date.
6. **Escalate suspicious** - Create incident, force token revocation, add conditional access hardening.
7. **Periodic baseline tuning** - Baseline window is automatically maintained (90 days, excluding most recent hour).  

## Table Maintenance & Quality Checks
- Validate column presence after job updates; add KQL unit tests: `project-away` expected fields; if fails, trigger notification.
- Monitor growth: If ArtifactHits inflation occurs, consider percentile-based thresholds instead of static numeric cutoffs.
- Confirm no duplicate rows per (UserPrincipalName, AnomalyType, Value, FirstSeenRecent) each run; apply a `summarize arg_min(DetectedDateTime, *)` de-dup if needed.

## Extending Schema
Add columns via job modification: `Severity`, `ASN`, `Org`, `WatchlistStatus`, `TravelDistanceKm`. Keep names consistent; avoid renaming existing to preserve downstream dashboards.

## Quick Access Query Snippets
Top 20 newest IP anomalies last 24h (multiple hourly runs):
```
Signinlogs_Anomalies_KQL_CL
| where AnomalyType endswith "IP" and DetectedDateTime > ago(24h)
| sort by DetectedDateTime desc
| take 20
```

Most recent hourly anomalies:
```
Signinlogs_Anomalies_KQL_CL
| where DetectedDateTime > ago(1h)
| sort by Severity asc, ArtifactHits desc
```
High activity new device combos (ArtifactHits >= 20):
```
Signinlogs_Anomalies_KQL_CL
| where AnomalyType endswith "DeviceCombo" and ArtifactHits >= 20
| project UserPrincipalName, Value, ArtifactHits, CountryNovelty, CityNovelty
```
Users with multiple geo novelties in 7d:
```
Signinlogs_Anomalies_KQL_CL
| where CountryNovelty or CityNovelty
| summarize NoveltyEvents = count(), Countries = make_set(Country) by UserPrincipalName
| where NoveltyEvents >= 2
```

## Design Rationale
- Dual-set baseline separation prevents recent novel artifacts from polluting historical reference during evaluation.
- Use of dynamic arrays allows flexible post-processing without altering detection job.
- Explicit baseline lists accelerate manual analyst verification (no need to recompute sets per user in ad-hoc queries).

## Future Improvements
- Unified baseline across interactive & non-interactive before anomaly classification (reduces duplicate novelty events).
- Machine learning scoring (e.g. user entropy change) layering on top of rule-based anomalies.
- Automated acceptance workflow: After N consecutive days appearance + no risk events → mark artifact benign automatically.

---

## Example Scenario: Baseline Growth Analysis for Mobile User

**Scenario**: A security analyst wants to understand a user's anomaly patterns and whether their baseline is still expanding or has stabilized.

**Context**: User `jsmith@contoso.com` is a field sales representative who travels extensively across the United States. The analyst notices multiple NewNonInteractiveIP anomalies over the past 30 days and wants to determine if this represents a security concern or normal business activity.

### Step 1: Query Recent Anomalies (30 Days)

```kql
let start = datetime(2025-11-01);
let end = datetime(2025-12-03);
Signinlogs_Anomalies_KQL_CL
| where DetectedDateTime between (start .. end)
| where UserPrincipalName =~ 'jsmith@contoso.com'
| extend Severity = case(
    BaselineSize < 3, "Informational",
    CountryNovelty and CityNovelty and ArtifactHits >= 20, "High",
    ArtifactHits >= 10, "Medium",
    (CountryNovelty or CityNovelty or StateNovelty), "Medium",
    ArtifactHits >= 5, "Low",
    "Informational")
| extend SeverityOrder = case(Severity == 'High', 1, Severity == 'Medium', 2, Severity == 'Low', 3, 4)
| project
    DetectedDateTime,
    UserPrincipalName,
    AnomalyType,
    Value,
    Severity,
    SeverityOrder,
    Country,
    City,
    State,
    CountryNovelty,
    CityNovelty,
    StateNovelty,
    ArtifactHits,
    FirstSeenRecent,
    BaselineSize,
    OS,
    BrowserFamily,
    RawBrowser
| order by SeverityOrder asc, DetectedDateTime desc
```

**Sample Results** (17 anomalies detected):

| DetectedDateTime | City | State | Severity | BaselineSize | ArtifactHits | CountryNovelty |
|------------------|------|-------|----------|--------------|--------------|----------------|
| 2025-11-27T17:00 | Phoenix | Arizona | Medium | 20 | 1 | false |
| 2025-11-27T09:00 | Dallas | Texas | Medium | 19 | 5 | false |
| 2025-11-25T13:00 | Atlanta | Georgia | Medium | 15 | 5 | false |
| 2025-11-23T16:30 | Denver | Colorado | Medium | 10 | 3 | false |
| 2025-11-22T16:30 | Seattle | Washington | Medium | 8 | 2 | false |
| 2025-11-21T16:30 | Portland | Oregon | Medium | 5 | 7 | false |
| 2025-11-21T16:30 | Miami | Florida | Medium | 5 | 1 | false |
| 2025-11-21T16:30 | Toronto | Ontario | Medium | 5 | 46 | true |
| 2025-12-01T08:00 | Chicago | Illinois | Informational | 22 | 6 | false |
| 2025-11-28T09:00 | Boston | Massachusetts | Informational | 21 | 5 | false |
| ... | ... | ... | ... | ... | ... | ... |

### Step 2: Extract Unique IPs and Enrich

Using the IP enrichment module to analyze the 17 unique IPs discovered:

```bash
python enrich_ips.py 203.0.118.42 198.51.105.18 192.0.2.125 ... (all 17 IPs)
```

**Enrichment Summary**:
- **16 Clean IPs**: All US-based residential ISPs (Verizon, AT&T, Comcast, T-Mobile)
- **1 VPN/Corporate Infrastructure**: 40.68.205.15 (Toronto) - Microsoft Corporation datacenter
- **No malicious indicators**: Zero abuse reports, no threat intelligence matches
- **ISP Distribution**: Primarily mobile carriers (T-Mobile, Verizon) indicating cellular connectivity

### Step 3: Baseline Growth Analysis

Tracking `BaselineSize` progression over time:

| Date | BaselineSize | Daily Growth | Anomaly Count |
|------|--------------|--------------|---------------|
| Nov 21 | 5 | - | 3 new IPs |
| Nov 22 | 8 | +3 | 1 new IP |
| Nov 23 | 10 | +2 | 2 new IPs |
| Nov 24 | 12 | +2 | 2 new IPs |
| Nov 25 | 14-16 | +2-4 | 3 new IPs |
| Nov 27 | 18-20 | +2-4 | 3 new IPs |
| Nov 28 | 21 | +1 | 1 new IP |
| Dec 1 | 22 | +1 | 1 new IP |

**Growth Pattern**:
- **Early Period (Nov 21-25)**: Rapid expansion at ~2-3 IPs/day (340% growth over 10 days)
- **Recent Period (Nov 27-Dec 1)**: Slowdown to ~1 IP/day
- **Trend**: Decelerating growth indicating baseline saturation

### Step 4: Findings and Interpretation

**User Behavior Profile**:
1. **Mobile Professional**: Exclusive use of cellular ISPs (Verizon, AT&T, T-Mobile) across diverse US cities
2. **Geographic Coverage**: 15 US cities across 10 states + 1 international (Toronto - Microsoft office)
3. **Corporate Context**: Toronto IP is Microsoft infrastructure, likely accessing SharePoint/Teams
4. **Authentication Pattern**: All NewNonInteractiveIP anomalies = token-based auth (normal OAuth refresh)

**Baseline Growth Explanation**:
- User is establishing **regional sales territory** connectivity pattern
- Each new city visited adds new mobile carrier IP to baseline
- Growth rate (340% in 10 days) reflects **extensive field travel**
- **Baseline stabilization** in progress: Growth slowed from +3/day to +1/day

**Risk Assessment**: **LOW**

**Why This is Legitimate**:
- ✅ All US IPs are residential/mobile ISPs (not hosting/VPN/proxy)
- ✅ Microsoft infrastructure IP expected for corporate employee
- ✅ Zero abuse reports or threat intelligence hits
- ✅ Consistent mobile carrier pattern (T-Mobile, Verizon, AT&T)
- ✅ Non-interactive auth = normal token reuse (user authenticated once, tokens refreshed automatically)
- ✅ Geographic diversity matches sales role (multi-state coverage)
- ✅ No impossible travel or concurrent sessions from distant locations

**Recommendations**:
1. **No action required** - Pattern consistent with mobile sales employee
2. **Optional user confirmation**: "We noticed you've been traveling across the US recently - is this expected for your role?"
3. **Monitor for changes**: Watch for non-US locations (outside Canada) or sudden hosting/VPN usage
4. **Baseline stabilization expectation**: Anomaly rate should decrease to <1/week as user completes their regular circuit

**Conclusion**: This user exhibits **healthy baseline growth from legitimate mobile/travel activity**. The diversity of US cities, exclusive use of residential/mobile ISPs, and Microsoft infrastructure access all point to a traveling sales employee with no security concerns. The baseline is stabilizing as expected after initial establishment phase.

### Key Takeaways for Analysts

1. **Baseline growth is normal** for mobile users establishing new regional patterns
2. **Rapid initial expansion** (300%+ in 10 days) followed by **deceleration** indicates legitimate behavior
3. **IP enrichment is critical** - residential ISPs vs hosting/VPN/proxy determines legitimacy
4. **Context matters** - Sales, field engineers, executives naturally trigger geographic anomalies
5. **Monitor the trend** - Stable baseline = healthy; continued exponential growth = suspicious
6. **Don't panic on Medium severity** - Geographic novelty alone doesn't mean compromise

---
Reference this file in agent prompts to provide context on the anomaly table structure and intended analytic workflows.

## Full Current Hourly Anomaly Query (IPv6 excluded, Lat/Lon removed)
```
let RecentDays = 1h;
let BaselineDays = 90d;        // Baseline excludes the recent 1h window (evaluated hourly)
let DomainFilter = "@";        // Use endswith(DomainFilter) or multiple filters via a list
// ============= INTERACTIVE BASELINES (IPv4 only) =============
let InteractiveBaselineIPs =
    SigninLogs
    | where TimeGenerated between (ago(BaselineDays + RecentDays) .. ago(RecentDays))
    | where isnotempty(IPAddress) and IPAddress !has ":" and UserPrincipalName contains DomainFilter
    | extend Country = tostring(Location)
    | extend LD = parse_json(tostring(LocationDetails))
    | extend City = tostring(LD.city), State = tostring(LD.state), CountryFull = tostring(LD.countryOrRegion)
    | extend CountryNorm = iff(isempty(CountryFull), Country, CountryFull)
    | summarize BaselineIPs = make_set(IPAddress),
              BaselineCountries = make_set(CountryNorm),
              BaselineCities = make_set(City),
              BaselineStates = make_set(State) by UserPrincipalName;
let InteractiveBaselineDevices =
    SigninLogs
    | where TimeGenerated between (ago(BaselineDays + RecentDays) .. ago(RecentDays))
    | where UserPrincipalName contains DomainFilter
    | extend DJ = parse_json(tostring(DeviceDetail))
    | extend RawOS = tostring(DJ.operatingSystem), RawBrowser = tostring(DJ.browser)
    | extend BrowserFamily = iff(isempty(RawBrowser), "", split(RawBrowser, " ")[0])
    | extend OS = RawOS
    | extend Device = strcat(OS, "|", BrowserFamily)
    | where Device != "|"
    | extend LD = parse_json(tostring(LocationDetails))
    | extend Country = tostring(Location), City = tostring(LD.city), State = tostring(LD.state), CountryFull = tostring(LD.countryOrRegion)
    | extend CountryNorm = iff(isempty(CountryFull), Country, CountryFull)
    | summarize BaselineDevices = make_set(Device),
              BaselineOSSet = make_set(OS),
              BaselineBrowserFamilySet = make_set(BrowserFamily),
              BaselineRawBrowserSet = make_set(RawBrowser),
              BaselineCountriesDevices = make_set(CountryNorm),
              BaselineCitiesDevices = make_set(City),
              BaselineStatesDevices = make_set(State) by UserPrincipalName;
// ============= INTERACTIVE RECENT FACTS =============
let InteractiveRecentIPFacts =
    SigninLogs
    | where TimeGenerated > ago(RecentDays)
    | where isnotempty(IPAddress) and IPAddress !has ":" and UserPrincipalName contains DomainFilter
    | extend Country = tostring(Location)
    | extend LD = parse_json(tostring(LocationDetails))
    | extend City = tostring(LD.city), State = tostring(LD.state), CountryFull = tostring(LD.countryOrRegion)
    | extend CountryNorm = iff(isempty(CountryFull), Country, CountryFull)
    | summarize FirstSeenRecent = min(TimeGenerated),
              RecentIPHits = count(),
              CountriesRecent = make_set(CountryNorm),
              CitiesRecent = make_set(City),
              StatesRecent = make_set(State) by UserPrincipalName, IPAddress;
let InteractiveRecentIPs =
    SigninLogs
    | where TimeGenerated > ago(RecentDays)
    | where isnotempty(IPAddress) and IPAddress !has ":" and UserPrincipalName contains DomainFilter
    | summarize RecentIPs = make_set(IPAddress) by UserPrincipalName;
let InteractiveRecentDeviceFacts =
    SigninLogs
    | where TimeGenerated > ago(RecentDays)
    | where UserPrincipalName contains DomainFilter
    | extend DJ = parse_json(tostring(DeviceDetail))
    | extend RawOS = tostring(DJ.operatingSystem), RawBrowser = tostring(DJ.browser)
    | extend BrowserFamily = iff(isempty(RawBrowser), "", split(RawBrowser, " ")[0])
    | extend OS = RawOS
    | extend Device = strcat(OS, "|", BrowserFamily)
    | where Device != "|"
    | extend LD = parse_json(tostring(LocationDetails))
    | extend Country = tostring(Location), City = tostring(LD.city), State = tostring(LD.state), CountryFull = tostring(LD.countryOrRegion)
    | extend CountryNorm = iff(isempty(CountryFull), Country, CountryFull)
    | summarize FirstSeenRecent = min(TimeGenerated),
              RecentDeviceHits = count(),
              CountriesRecent = make_set(CountryNorm),
              CitiesRecent = make_set(City),
              StatesRecent = make_set(State) by UserPrincipalName, Device, OS, BrowserFamily, RawBrowser;
let InteractiveRecentDevices =
    SigninLogs
    | where TimeGenerated > ago(RecentDays)
    | where UserPrincipalName contains DomainFilter
    | extend DJ = parse_json(tostring(DeviceDetail))
    | extend RawOS = tostring(DJ.operatingSystem), RawBrowser = tostring(DJ.browser)
    | extend BrowserFamily = iff(isempty(RawBrowser), "", split(RawBrowser, " ")[0])
    | extend OS = RawOS
    | extend Device = strcat(OS, "|", BrowserFamily)
    | where Device != "|"
    | summarize RecentDevices = make_set(Device) by UserPrincipalName;
// ============= INTERACTIVE ANOMALIES =============
let InteractiveIPAnomalies =
    InteractiveRecentIPFacts
    | join kind=leftouter InteractiveBaselineIPs on UserPrincipalName
    | join kind=leftouter InteractiveRecentIPs on UserPrincipalName
    | join kind=leftouter InteractiveBaselineDevices on UserPrincipalName
    | extend BaselineIPs = coalesce(BaselineIPs, dynamic([])),
             BaselineCountries = coalesce(BaselineCountries, dynamic([])),
             BaselineCities = coalesce(BaselineCities, dynamic([])),
             BaselineStates = coalesce(BaselineStates, dynamic([])),
             BaselineDevices = coalesce(BaselineDevices, dynamic([])),
             BaselineOSSet = coalesce(BaselineOSSet, dynamic([])),
             BaselineBrowserFamilySet = coalesce(BaselineBrowserFamilySet, dynamic([])),
             BaselineRawBrowserSet = coalesce(BaselineRawBrowserSet, dynamic([])),
             RecentIPs = coalesce(RecentIPs, dynamic([]))
    | where array_index_of(BaselineIPs, IPAddress) == -1
    | extend BaselineSize = array_length(BaselineIPs),
             RecentSize = array_length(RecentIPs)
    | extend Country = tostring(CountriesRecent[0]),
             City = tostring(CitiesRecent[0]),
             State = tostring(StatesRecent[0])
    | extend CountryNovelty = array_index_of(BaselineCountries, Country) == -1
    | extend CityNovelty = iff(isempty(City), false, array_index_of(BaselineCities, City) == -1)
    | extend StateNovelty = iff(isempty(State), false, array_index_of(BaselineStates, State) == -1)
    | project DetectedDateTime = now(),
              UserPrincipalName,
              AnomalyType = "NewInteractiveIP",
              Value = IPAddress,
              OS = "",
              BrowserFamily = "",
              RawBrowser = "",
              Country, City, State,
              CountryNovelty, CityNovelty, StateNovelty,
              BaselineCountryCount = array_length(BaselineCountries),
              BaselineCityCount = array_length(BaselineCities),
              BaselineStateCount = array_length(BaselineStates),
              BaselineSize, RecentSize, FirstSeenRecent,
              ArtifactHits = RecentIPHits,
              BaselineIPList = BaselineIPs,
              BaselineCountryList = BaselineCountries,
              BaselineCityList = BaselineCities,
              BaselineStateList = BaselineStates,
              BaselineDeviceList = BaselineDevices,
              BaselineOSList = BaselineOSSet,
              BaselineBrowserFamilyList = BaselineBrowserFamilySet,
              BaselineRawBrowserList = BaselineRawBrowserSet;
let InteractiveDeviceAnomalies =
    InteractiveRecentDeviceFacts
    | join kind=leftouter InteractiveBaselineDevices on UserPrincipalName
    | join kind=leftouter InteractiveRecentDevices on UserPrincipalName
    | extend BaselineDevices = coalesce(BaselineDevices, dynamic([])),
             BaselineOSSet = coalesce(BaselineOSSet, dynamic([])),
             BaselineBrowserFamilySet = coalesce(BaselineBrowserFamilySet, dynamic([])),
             BaselineRawBrowserSet = coalesce(BaselineRawBrowserSet, dynamic([])),
             BaselineCountriesDevices = coalesce(BaselineCountriesDevices, dynamic([])),
             BaselineCitiesDevices = coalesce(BaselineCitiesDevices, dynamic([])),
             BaselineStatesDevices = coalesce(BaselineStatesDevices, dynamic([])),
             RecentDevices = coalesce(RecentDevices, dynamic([]))
    | where array_index_of(BaselineDevices, Device) == -1
    | extend BaselineSize = array_length(BaselineDevices),
             RecentSize = array_length(RecentDevices)
    | extend Country = tostring(CountriesRecent[0]),
             City = tostring(CitiesRecent[0]),
             State = tostring(StatesRecent[0])
    | extend CountryNovelty = array_index_of(BaselineCountriesDevices, Country) == -1
    | extend CityNovelty = iff(isempty(City), false, array_index_of(BaselineCitiesDevices, City) == -1)
    | extend StateNovelty = iff(isempty(State), false, array_index_of(BaselineStatesDevices, State) == -1)
    | project DetectedDateTime = now(),
              UserPrincipalName,
              AnomalyType = "NewInteractiveDeviceCombo",
              Value = Device, OS, BrowserFamily, RawBrowser,
              Country, City, State,
              CountryNovelty, CityNovelty, StateNovelty,
              BaselineCountryCount = array_length(BaselineCountriesDevices),
              BaselineCityCount = array_length(BaselineCitiesDevices),
              BaselineStateCount = array_length(BaselineStatesDevices),
              BaselineSize, RecentSize, FirstSeenRecent,
              ArtifactHits = RecentDeviceHits,
              BaselineDeviceList = BaselineDevices,
              BaselineOSList = BaselineOSSet,
              BaselineBrowserFamilyList = BaselineBrowserFamilySet,
              BaselineRawBrowserList = BaselineRawBrowserSet,
              BaselineCountryList = BaselineCountriesDevices,
              BaselineCityList = BaselineCitiesDevices,
              BaselineStateList = BaselineStatesDevices;
// ============= NON-INTERACTIVE BASELINES (IPv4 only) =============
let NonIntBaselineIPs =
    AADNonInteractiveUserSignInLogs
    | where TimeGenerated between (ago(BaselineDays + RecentDays) .. ago(RecentDays))
    | where isnotempty(IPAddress) and IPAddress !has ":" and UserPrincipalName contains DomainFilter
    | extend Country = tostring(Location)
    | extend LD = parse_json(tostring(LocationDetails))
    | extend City = tostring(LD.city), State = tostring(LD.state), CountryFull = tostring(LD.countryOrRegion)
    | extend CountryNorm = iff(isempty(CountryFull), Country, CountryFull)
    | summarize BaselineIPs = make_set(IPAddress),
              BaselineCountries = make_set(CountryNorm),
              BaselineCities = make_set(City),
              BaselineStates = make_set(State) by UserPrincipalName;
let NonIntBaselineDevices =
    AADNonInteractiveUserSignInLogs
    | where TimeGenerated between (ago(BaselineDays + RecentDays) .. ago(RecentDays))
    | where UserPrincipalName contains DomainFilter
    | extend DJ = parse_json(tostring(DeviceDetail))
    | extend RawOS = tostring(DJ.operatingSystem), RawBrowser = tostring(DJ.browser)
    | extend BrowserFamily = iff(isempty(RawBrowser), "", split(RawBrowser, " ")[0])
    | extend OS = RawOS
    | extend Device = strcat(OS, "|", BrowserFamily)
    | where Device != "|"
    | extend LD = parse_json(tostring(LocationDetails))
    | extend Country = tostring(Location), City = tostring(LD.city), State = tostring(LD.state), CountryFull = tostring(LD.countryOrRegion)
    | extend CountryNorm = iff(isempty(CountryFull), Country, CountryFull)
    | summarize BaselineDevices = make_set(Device),
              BaselineOSSet = make_set(OS),
              BaselineBrowserFamilySet = make_set(BrowserFamily),
              BaselineRawBrowserSet = make_set(RawBrowser),
              BaselineCountriesDevices = make_set(CountryNorm),
              BaselineCitiesDevices = make_set(City),
              BaselineStatesDevices = make_set(State) by UserPrincipalName;
// ============= NON-INTERACTIVE RECENT FACTS =============
let NonIntRecentIPFacts =
    AADNonInteractiveUserSignInLogs
    | where TimeGenerated > ago(RecentDays)
    | where isnotempty(IPAddress) and IPAddress !has ":" and UserPrincipalName contains DomainFilter
    | extend Country = tostring(Location)
    | extend LD = parse_json(tostring(LocationDetails))
    | extend City = tostring(LD.city), State = tostring(LD.state), CountryFull = tostring(LD.countryOrRegion)
    | extend CountryNorm = iff(isempty(CountryFull), Country, CountryFull)
    | summarize FirstSeenRecent = min(TimeGenerated),
              RecentIPHits = count(),
              CountriesRecent = make_set(CountryNorm),
              CitiesRecent = make_set(City),
              StatesRecent = make_set(State) by UserPrincipalName, IPAddress;
let NonIntRecentIPs =
    AADNonInteractiveUserSignInLogs
    | where TimeGenerated > ago(RecentDays)
    | where isnotempty(IPAddress) and IPAddress !has ":" and UserPrincipalName contains DomainFilter
    | summarize RecentIPs = make_set(IPAddress) by UserPrincipalName;
let NonIntRecentDeviceFacts =
    AADNonInteractiveUserSignInLogs
    | where TimeGenerated > ago(RecentDays)
    | where UserPrincipalName contains DomainFilter
    | extend DJ = parse_json(tostring(DeviceDetail))
    | extend RawOS = tostring(DJ.operatingSystem), RawBrowser = tostring(DJ.browser)
    | extend BrowserFamily = iff(isempty(RawBrowser), "", split(RawBrowser, " ")[0])
    | extend OS = RawOS
    | extend Device = strcat(OS, "|", BrowserFamily)
    | where Device != "|"
    | extend LD = parse_json(tostring(LocationDetails))
    | extend Country = tostring(Location), City = tostring(LD.city), State = tostring(LD.state), CountryFull = tostring(LD.countryOrRegion)
    | extend CountryNorm = iff(isempty(CountryFull), Country, CountryFull)
    | summarize FirstSeenRecent = min(TimeGenerated),
              RecentDeviceHits = count(),
              CountriesRecent = make_set(CountryNorm),
              CitiesRecent = make_set(City),
              StatesRecent = make_set(State) by UserPrincipalName, Device, OS, BrowserFamily, RawBrowser;
let NonIntRecentDevices =
    AADNonInteractiveUserSignInLogs
    | where TimeGenerated > ago(RecentDays)
    | where UserPrincipalName contains DomainFilter
    | extend DJ = parse_json(tostring(DeviceDetail))
    | extend RawOS = tostring(DJ.operatingSystem), RawBrowser = tostring(DJ.browser)
    | extend BrowserFamily = iff(isempty(RawBrowser), "", split(RawBrowser, " ")[0])
    | extend OS = RawOS
    | extend Device = strcat(OS, "|", BrowserFamily)
    | where Device != "|"
    | summarize RecentDevices = make_set(Device) by UserPrincipalName;
// ============= NON-INTERACTIVE ANOMALIES =============
let NonIntIPAnomalies =
    NonIntRecentIPFacts
    | join kind=leftouter NonIntBaselineIPs on UserPrincipalName
    | join kind=leftouter NonIntRecentIPs on UserPrincipalName
    | join kind=leftouter NonIntBaselineDevices on UserPrincipalName
    | extend BaselineIPs = coalesce(BaselineIPs, dynamic([])),
             BaselineCountries = coalesce(BaselineCountries, dynamic([])),
             BaselineCities = coalesce(BaselineCities, dynamic([])),
             BaselineStates = coalesce(BaselineStates, dynamic([])),
             BaselineDevices = coalesce(BaselineDevices, dynamic([])),
             BaselineOSSet = coalesce(BaselineOSSet, dynamic([])),
             BaselineBrowserFamilySet = coalesce(BaselineBrowserFamilySet, dynamic([])),
             BaselineRawBrowserSet = coalesce(BaselineRawBrowserSet, dynamic([])),
             RecentIPs = coalesce(RecentIPs, dynamic([]))
    | where array_index_of(BaselineIPs, IPAddress) == -1
    | extend BaselineSize = array_length(BaselineIPs),
             RecentSize = array_length(RecentIPs)
    | extend Country = tostring(CountriesRecent[0]),
             City = tostring(CitiesRecent[0]),
             State = tostring(StatesRecent[0])
    | extend CountryNovelty = array_index_of(BaselineCountries, Country) == -1
    | extend CityNovelty = iff(isempty(City), false, array_index_of(BaselineCities, City) == -1)
    | extend StateNovelty = iff(isempty(State), false, array_index_of(BaselineStates, State) == -1)
    | project DetectedDateTime = now(),
              UserPrincipalName,
              AnomalyType = "NewNonInteractiveIP",
              Value = IPAddress,
              OS = "", BrowserFamily = "", RawBrowser = "",
              Country, City, State,
              CountryNovelty, CityNovelty, StateNovelty,
              BaselineCountryCount = array_length(BaselineCountries),
              BaselineCityCount = array_length(BaselineCities),
              BaselineStateCount = array_length(BaselineStates),
              BaselineSize, RecentSize, FirstSeenRecent,
              ArtifactHits = RecentIPHits,
              BaselineIPList = BaselineIPs,
              BaselineCountryList = BaselineCountries,
              BaselineCityList = BaselineCities,
              BaselineStateList = BaselineStates,
              BaselineDeviceList = BaselineDevices,
              BaselineOSList = BaselineOSSet,
              BaselineBrowserFamilyList = BaselineBrowserFamilySet,
              BaselineRawBrowserList = BaselineRawBrowserSet;
let NonIntDeviceAnomalies =
    NonIntRecentDeviceFacts
    | join kind=leftouter NonIntBaselineDevices on UserPrincipalName
    | join kind=leftouter NonIntRecentDevices on UserPrincipalName
    | extend BaselineDevices = coalesce(BaselineDevices, dynamic([])),
             BaselineOSSet = coalesce(BaselineOSSet, dynamic([])),
             BaselineBrowserFamilySet = coalesce(BaselineBrowserFamilySet, dynamic([])),
             BaselineRawBrowserSet = coalesce(BaselineRawBrowserSet, dynamic([])),
             BaselineCountriesDevices = coalesce(BaselineCountriesDevices, dynamic([])),
             BaselineCitiesDevices = coalesce(BaselineCitiesDevices, dynamic([])),
             BaselineStatesDevices = coalesce(BaselineStatesDevices, dynamic([])),
             RecentDevices = coalesce(RecentDevices, dynamic([]))
    | where array_index_of(BaselineDevices, Device) == -1
    | extend BaselineSize = array_length(BaselineDevices),
             RecentSize = array_length(RecentDevices)
    | extend Country = tostring(CountriesRecent[0]),
             City = tostring(CitiesRecent[0]),
             State = tostring(StatesRecent[0])
    | extend CountryNovelty = array_index_of(BaselineCountriesDevices, Country) == -1
    | extend CityNovelty = iff(isempty(City), false, array_index_of(BaselineCitiesDevices, City) == -1)
    | extend StateNovelty = iff(isempty(State), false, array_index_of(BaselineStatesDevices, State) == -1)
    | project DetectedDateTime = now(),
              UserPrincipalName,
              AnomalyType = "NewNonInteractiveDeviceCombo",
              Value = Device, OS, BrowserFamily, RawBrowser,
              Country, City, State,
              CountryNovelty, CityNovelty, StateNovelty,
              BaselineCountryCount = array_length(BaselineCountriesDevices),
              BaselineCityCount = array_length(BaselineCitiesDevices),
              BaselineStateCount = array_length(BaselineStatesDevices),
              BaselineSize, RecentSize, FirstSeenRecent,
              ArtifactHits = RecentDeviceHits,
              BaselineDeviceList = BaselineDevices,
              BaselineOSList = BaselineOSSet,
              BaselineBrowserFamilyList = BaselineBrowserFamilySet,
              BaselineRawBrowserList = BaselineRawBrowserSet,
              BaselineCountryList = BaselineCountriesDevices,
              BaselineCityList = BaselineCitiesDevices,
              BaselineStateList = BaselineStatesDevices;
// ============= UNION & SEVERITY =============
InteractiveIPAnomalies
| union InteractiveDeviceAnomalies
| union NonIntIPAnomalies
| union NonIntDeviceAnomalies
| extend Severity = case(
    BaselineSize < 3, "Informational",
    CountryNovelty and CityNovelty and ArtifactHits >= 20, "High",
    ArtifactHits >= 10, "Medium",
    (CountryNovelty or CityNovelty or StateNovelty), "Medium",
    ArtifactHits >= 5, "Low",
    "Informational"
)
| order by DetectedDateTime desc

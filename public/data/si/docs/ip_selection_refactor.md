# IP Selection Strategy - Deterministic Investigation Workflow

## Overview

This document describes the current IP selection strategy used in security investigations. The workflow uses **deterministic KQL queries** to select priority IPs for enrichment and analysis.

## Current Architecture

IP selection is handled by **Query 1** (Deterministic IP Selection with Risky IPs), which runs as part of **Batch 1** in the investigation workflow. This query uses a priority-based approach to identify the most relevant IPs for investigation.

## Query 1: Deterministic IP Selection with Risky IPs

This query runs in **Batch 1** (parallel with other Sentinel queries) and returns up to **15 prioritized IPs** for enrichment.

### Query Logic

```kql
// Query 1: Deterministic IP Selection with Risky IPs
// Returns top 15 IPs across priority categories
let start = datetime(<StartDate>);
let end = datetime(<EndDate>);
let upn = '<UPN>';

// Priority 1: Anomaly IPs (top 8 by anomaly count)
let anomaly_ips = 
    Signinlogs_Anomalies_KQL_CL
    | where DetectedDateTime between (start .. end)
    | where UserPrincipalName =~ upn
    | where AnomalyType endswith "IP"
    | summarize AnomalyCount = count() by IPAddress = Value
    | top 8 by AnomalyCount desc
    | extend Priority = 1, Source = "Anomaly";

// Priority 2: Risky IPs from Identity Protection (top 10 for selection pool)
let risky_ips_pool = 
    AADUserRiskEvents
    | where ActivityDateTime between (start .. end)
    | where UserPrincipalName =~ upn
    | where isnotempty(IpAddress)
    | summarize RiskCount = count() by IPAddress = IpAddress
    | top 10 by RiskCount desc
    | extend Priority = 2, Source = "RiskyIP";

// Priority 3: Frequent Sign-in IPs (top 10 for selection pool)
let frequent_ips_pool =
    union isfuzzy=true SigninLogs, AADNonInteractiveUserSignInLogs
    | where TimeGenerated between (start .. end)
    | where UserPrincipalName =~ upn
    | summarize SignInCount = count() by IPAddress
    | top 10 by SignInCount desc
    | extend Priority = 3, Source = "Frequent";

// Get anomaly IP list for exclusion from risky slot
let anomaly_ip_list = anomaly_ips | project IPAddress;

// Get anomaly + risky IP list for exclusion from frequent slot
let priority_ip_list = 
    union anomaly_ips, risky_ips_pool
    | project IPAddress;

// Reserve slots with deduplication: 8 anomaly + 4 risky + 3 frequent
let anomaly_slot = anomaly_ips | extend Count = AnomalyCount;
let risky_slot = risky_ips_pool 
    | join kind=anti anomaly_ip_list on IPAddress  // Exclude IPs already in anomaly list
    | top 4 by RiskCount desc
    | extend Count = RiskCount;
let frequent_slot = frequent_ips_pool 
    | join kind=anti priority_ip_list on IPAddress  // Exclude IPs already in anomaly/risky lists
    | top 3 by SignInCount desc
    | extend Count = SignInCount;

union anomaly_slot, risky_slot, frequent_slot
| project IPAddress, Priority, Count, Source
| order by Priority asc, Count desc
| project IPAddress

```

### Slot Allocation Strategy (15 IPs max)

- **8 slots**: Anomaly IPs (highest priority - triggered detection rules)
- **4 slots**: Risky IPs from Identity Protection (excluding those already in anomaly slots)
- **3 slots**: Frequent IPs (baseline context - excluding anomaly/risky IPs)

### Usage Pattern

1. Query 1 runs in **Batch 1** (parallel with other Sentinel queries)
2. Extract `IPAddress` column into array: `["ip1", "ip2", "ip3", ...]`
3. Build dynamic array: `let target_ips = dynamic(["ip1", "ip2", "ip3", ...]);`
4. Pass `target_ips` to **Batch 2** queries:
   - Query 11 (Threat Intel)
   - Query 3d (Sign-in Counts by IP)

## Investigation Workflow Sequence


**Current Workflow:**

1. **Batch 1 (Parallel Sentinel Queries):**
   - Query 1: IP selection (returns up to 15 prioritized IPs)
   - Query 2: Anomalies
   - Query 3: Sign-in by application
   - Query 3b: Sign-in by location
   - Query 3c: Sign-in failures
   - Query 4: Audit logs
   - Query 5: Office 365 activity
   - Query 10: DLP events
   - Query 6: Security incidents

2. **After Batch 1:** Extract IP array from Query 1 results

3. **Batch 2 (Parallel IP Enrichment + Graph Queries):**
   - Query 11: Threat Intel (uses IPs from Query 1)
   - Query 3d: IP frequency (uses IPs from Query 1)
   - Microsoft Graph queries (user profile, MFA, devices, risk profile, risk detections, risky sign-ins)

4. **Export:** Merge all results into single JSON file

## Query 3d: Sign-in Counts with AuthenticationDetails Handling

**Purpose:** Get detailed sign-in statistics and authentication patterns for priority IPs.

**Key Features:**

- Handles empty `AuthenticationDetails` arrays gracefully (avoids row drops from `mv-expand`)
- Uses fallback handling with `iif()` and `array_length()`
- Prioritizes most recent authentication result detail
- Captures comprehensive sign-in metrics

**Query Pattern:**

```kql
let target_ips = dynamic(["<IP_1>", "<IP_2>", "<IP_3>", ...]);  // From Query 1 results
let start = datetime(<StartDate>);
let end = datetime(<EndDate>);
// Get the most recent sign-in per IP with full event context
let most_recent_signins = union isfuzzy=true SigninLogs, AADNonInteractiveUserSignInLogs
| where TimeGenerated between (start .. end)
| where UserPrincipalName =~ '<UPN>'
| where IPAddress in (target_ips)
| summarize arg_max(TimeGenerated, *) by IPAddress;
// Expand authentication details for the most recent sign-in per IP
most_recent_signins
| extend AuthDetails = parse_json(AuthenticationDetails)
| extend HasAuthDetails = array_length(AuthDetails) > 0
| extend AuthDetailsToExpand = iif(HasAuthDetails, AuthDetails, dynamic([{"authenticationStepResultDetail": ""}]))
| mv-expand AuthDetailsToExpand
| extend AuthStepResultDetail = tostring(AuthDetailsToExpand.authenticationStepResultDetail)
| extend AuthPriority = case(
    AuthStepResultDetail has "MFA requirement satisfied", 1,
    AuthStepResultDetail has "Correct password", 2,
    AuthStepResultDetail has "Passkey", 2,
    AuthStepResultDetail has "Phone sign-in", 2,
    AuthStepResultDetail has "SMS verification", 2,
    AuthStepResultDetail has "First factor requirement satisfied", 3,
    AuthStepResultDetail has "MFA required", 4,
    999)
| summarize 
    MostRecentTime = any(TimeGenerated),
    MostRecentResultType = any(ResultType),
    HasAuthDetails = any(HasAuthDetails),
    MinPriority = min(AuthPriority),
    AllAuthDetails = make_set(AuthStepResultDetail)
    by IPAddress
| extend LastAuthResultDetail = case(
    MostRecentResultType != "0", "Authentication failed",  // Failure takes priority over auth details
    not(HasAuthDetails) and MostRecentResultType == "0", "Token",  // Non-interactive token-based auth
    MinPriority == 1 and AllAuthDetails has "MFA requirement satisfied", "MFA requirement satisfied by claim in the token",  // Catches all MFA variants
    MinPriority == 2 and AllAuthDetails has "Correct password", "Correct password",
    MinPriority == 2 and AllAuthDetails has "Passkey (device-bound)", "Passkey (device-bound)",
    MinPriority == 3 and AllAuthDetails has "First factor requirement satisfied by claim in the token", "First factor requirement satisfied by claim in the token",
    MinPriority == 4 and AllAuthDetails has "MFA required in Azure AD", "MFA required in Azure AD",
    tostring(AllAuthDetails[0]))
// Join back to get aggregate sign-in counts across all time
| join kind=inner (
    union isfuzzy=true SigninLogs, AADNonInteractiveUserSignInLogs
    | where TimeGenerated between (start .. end)
    | where UserPrincipalName =~ '<UPN>'
    | where IPAddress in (target_ips)
    | summarize 
        SignInCount = count(),
        SuccessCount = countif(ResultType == '0'),
        FailureCount = countif(ResultType != '0'),
        FirstSeen = min(TimeGenerated),
        LastSeen = max(TimeGenerated)
        by IPAddress
) on IPAddress
| project IPAddress, SignInCount, SuccessCount, FailureCount, FirstSeen, LastSeen, LastAuthResultDetail
| order by SignInCount desc
```

### Key Implementation Details

**AuthenticationDetails Handling:**
1. **Check if empty**: `array_length(AuthDetails) > 0`
2. **Create fallback array**: `iif(HasAuthDetails, AuthDetails, dynamic([{"authenticationStepResultDetail": ""}]))`
3. **Prioritize failure + empty auth**: `not(HasAuthDetails) and MostRecentResultType != "0"` → "Authentication failed"
4. **Handle success + empty auth**: `not(HasAuthDetails) and MostRecentResultType == "0"` → "Token"

**Why This Matters:**
- `mv-expand` on empty arrays drops rows entirely
- Empty `AuthenticationDetails` is valid (token-based auth, non-interactive sign-ins)
- Without fallback, important IPs disappear from results

## Benefits of Current Approach

✅ **Deterministic**: Same investigation parameters always produce same IP list  
✅ **No LLM guessing**: IP extraction is pure KQL logic  
✅ **Bug-proof**: Handles empty AuthenticationDetails arrays gracefully  
✅ **Single source of truth**: IP priority logic exists only in Query 1  
✅ **Consistent**: Batch 2 queries guaranteed to use identical IP lists  
✅ **Auditable**: Query 1 results can be logged for forensic review  
✅ **Fast**: Parallel execution with no sequential dependencies

## Integration with Report Generation

The report generator (`generate_report_from_json.py`) uses the IP list from Query 1 for:

1. **IP Enrichment**: Calls ipinfo.io, vpnapi.io, AbuseIPDB for each IP
2. **Threat Intelligence**: Merges Sentinel ThreatIntelIndicators data
3. **Risk Assessment**: Calculates risk scores based on enrichment + threat intel
4. **HTML Report**: Generates IP intelligence cards with all context

The investigation JSON structure includes:

```json
{
  "signin_ip_counts": [
    {
      "IPAddress": "203.0.113.42",
      "SignInCount": 150,
      "SuccessCount": 148,
      "FailureCount": 2,
      "FirstSeen": "2025-10-15T14:23:05Z",
      "LastSeen": "2025-11-25T09:30:12Z",
      "LastAuthResultDetail": "MFA requirement satisfied by claim in the token"
    }
  ],
  "ip_enrichment": [
    {
      "ip": "203.0.113.42",
      "city": "Tokyo",
      "country": "JP",
      "org": "AS9009 M247 Europe SRL",
      "is_vpn": true,
      "abuse_confidence_score": 0,
      "threat_description": "Surfshark VPN",
      "risk_level": "MEDIUM"
    }
  ]
}
```

## References

For complete query documentation and usage examples, see:
- `copilot-instructions.md` - Sample KQL Queries section (Query 1, Query 3d)
- `docs/Signinlogs_Anomalies_KQL_CL.md` - Anomaly detection details
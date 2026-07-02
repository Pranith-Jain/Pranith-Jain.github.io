# Microsoft Entra ID Identity Protection Integration

## Overview
Microsoft Entra ID Identity Protection provides ML-powered risk detection integrated into security investigations. This document covers the complete implementation, workflow, and query patterns.

---

## Table of Contents
1. [Integration Overview](#integration-overview)
2. [Data Sources & Dataclasses](#data-sources--dataclasses)
3. [Investigation Workflow](#investigation-workflow)
4. [Query Patterns](#query-patterns)
5. [Comprehensive KQL Query](#comprehensive-kql-query)
6. [Risk Event Types Reference](#risk-event-types-reference)
7. [Usage Examples](#usage-examples)

---

## Integration Overview

### What It Provides
- **User Risk Profile**: Overall risk assessment from Microsoft's ML models
- **Risk Detections**: Specific risk events (unlikely travel, unfamiliar features, anonymous IP, etc.)
- **Risky Sign-ins**: Authentication attempts flagged as risky by Identity Protection

### Why It Matters
1. **Cross-Validation**: Anomalies detected by Sentinel can be cross-referenced with Identity Protection
   - Example: Brazil IP appears in BOTH Sentinel anomalies AND Identity Protection risk detections
   - Confirms anomaly is not a false positive

2. **Risk Context**: Provides Microsoft's ML-powered risk assessment alongside manual investigation
   - Unlikely travel detection explains why Brazil IP is suspicious
   - Unfamiliar features detection provides additional context

3. **Investigation History**: Risk state shows if previous investigation occurred
   - `dismissed` = Admin already reviewed
   - `atRisk` = Still requires investigation
   - `remediated` = Automatically resolved

4. **Comprehensive View**: Combines multiple data sources:
   - Sentinel anomaly detection (behavioral analytics)
   - Identity Protection (ML-powered risk detection)
   - Sign-in logs (raw authentication events)
   - IP enrichment (geographic and ASN data)

---

## Data Sources & Dataclasses

### Core Dataclasses (investigator.py)

#### RiskDetection
Represents individual risk events detected by Identity Protection.

```python
@dataclass
class RiskDetection:
    risk_event_type: str        # e.g., "unlikelyTravel", "unfamiliarFeatures", "anonymizedIPAddress"
    risk_state: str             # "atRisk", "confirmedCompromised", "dismissed", "remediated"
    risk_level: str             # "low", "medium", "high"
    detected_date: str          # ISO 8601 timestamp
    last_updated: str           # ISO 8601 timestamp
    activity: str               # "signin"
    ip_address: str             # IP where risk was detected
    location_city: str          # Geographic location
    location_state: str
    location_country: str
```

#### RiskySignIn
Sign-in events flagged as risky.

```python
@dataclass
class RiskySignIn:
    sign_in_id: str             # Unique sign-in identifier
    created_date: str           # When sign-in occurred
    upn: str                    # User principal name
    app_display_name: str       # Application accessed
    ip_address: str
    location_city: str
    location_state: str
    location_country: str
    risk_state: str             # Risk state at time of sign-in
    risk_level: str             # Risk level assessed
    risk_event_types: List[str] # Types of risks detected
    risk_detail: str            # Additional risk information
    status_error_code: int      # 0 = success, non-zero = failure
    status_failure_reason: str  # Failure description
```

#### UserRiskProfile
Overall user risk assessment.

```python
@dataclass
class UserRiskProfile:
    risk_level: str             # "none", "low", "medium", "high"
    risk_state: str             # Overall risk state
    risk_detail: str            # Additional details
    risk_last_updated: str      # Last risk calculation timestamp
    is_deleted: bool            # User deleted flag
    is_processing: bool         # Risk processing flag
```

#### InvestigationResult Updates
```python
@dataclass
class InvestigationResult:
    # ... existing fields ...
    user_risk_profile: Optional[UserRiskProfile] = None
    risk_detections: List[RiskDetection] = None
    risky_signins: List[RiskySignIn] = None
```

---

## Investigation Workflow

### Phase 1: Get User Object ID (REQUIRED FIRST)
```
mcp_microsoft_mcp_microsoft_graph_suggest_queries("get user by email")
mcp_microsoft_mcp_microsoft_graph_get("/v1.0/users/<UPN>?$select=id,displayName,userPrincipalName,onPremisesSecurityIdentifier")
```
Extract `user_id` (Azure AD Object ID) and `onPremisesSecurityIdentifier` (Windows SID) from response for subsequent queries.

### Phase 2 (Batch 2): Query Identity Protection (Run in Parallel)

**Step 1: Get User Risk Profile**
```
mcp_microsoft_mcp_microsoft_graph_suggest_queries("get risky users by user id")
mcp_microsoft_mcp_microsoft_graph_get("/v1.0/identityProtection/riskyUsers/<USER_ID>")
```
Returns: riskLevel (low/medium/high/none), riskState (atRisk/confirmedCompromised/dismissed/remediated), riskDetail, riskLastUpdatedDateTime

**Step 2: Get Risk Detections**
```
mcp_microsoft_mcp_microsoft_graph_suggest_queries("get risk detections for user")
mcp_microsoft_mcp_microsoft_graph_get("/v1.0/identityProtection/riskDetections?$filter=userId eq '<USER_ID>'&$select=id,detectedDateTime,riskEventType,riskLevel,riskState,riskDetail,ipAddress,location,activity,activityDateTime&$orderby=detectedDateTime desc&$top=5")
```
Returns: Array of risk events (top 5 most recent) with riskEventType (unlikelyTravel, unfamiliarFeatures, anonymizedIPAddress, maliciousIPAddress, etc.), riskState, riskLevel, detectedDateTime, activity, ipAddress, location

**Step 3: Get Risky Sign-ins**
```
mcp_microsoft_mcp_microsoft_graph_suggest_queries("get risky sign-ins for user")
mcp_microsoft_mcp_microsoft_graph_get("/beta/auditLogs/signIns?$filter=userPrincipalName eq '<UPN>' and (riskState eq 'atRisk' or riskState eq 'confirmedCompromised')&$select=id,createdDateTime,userPrincipalName,appDisplayName,ipAddress,location,riskState,riskLevelDuringSignIn,riskEventTypes_v2,riskDetail,status&$orderby=createdDateTime desc&$top=5")
```
**NOTE**: Risky sign-ins are ONLY available in `/beta` endpoint, not `/v1.0`

Returns: Array of sign-in events (top 5 most recent) with riskLevelDuringSignIn, riskEventTypes_v2, riskState, riskDetail, status (errorCode, failureReason)

---

## Query Patterns

### Microsoft Graph API Endpoints

1. `/v1.0/users/{upn}?$select=id` - Get user Object ID (REQUIRED)
2. `/v1.0/identityProtection/riskyUsers/{userId}` - Get user risk profile
3. `/v1.0/identityProtection/riskDetections?$filter=userId eq '{userId}'&$top=5` - Get risk detections (top 5)
4. `/beta/auditLogs/signIns?$filter=...&$top=5` - Get risky sign-ins (BETA endpoint, top 5)

**CRITICAL**: User Object ID is required for all Identity Protection queries. Risky sign-ins are ONLY available in `/beta` endpoint.

---

## Comprehensive KQL Query

The investigation report includes a **"Copy KQL"** button that provides this comprehensive query to retrieve all Identity Protection events:

```kql
// Comprehensive Entra ID Identity Protection Query
// Returns all risk detections and risky sign-ins for a specific user
let startDate = datetime(YYYY-MM-DD);  // Replace with investigation start date
let endDate = datetime(YYYY-MM-DD);    // Replace with investigation end date
let targetUPN = "user@domain.com";      // Replace with target user UPN
let targetUserId = "user-guid-here";    // Replace with target user Azure AD Object ID

// 1. Risk Detections from AADUserRiskEvents
let riskDetections = AADUserRiskEvents
| where TimeGenerated between (startDate .. endDate)
| where UserPrincipalName =~ targetUPN or UserId =~ targetUserId
| extend LocationJson = parse_json(Location)
| project 
    EventType = "RiskDetection",
    TimeGenerated,
    DetectedDateTime,
    RiskEventType,
    RiskLevel,
    RiskState,
    RiskDetail,
    Activity,
    IpAddress,
    City = tostring(LocationJson.city),
    State = tostring(LocationJson.state),
    Country = tostring(LocationJson.countryOrRegion),
    DetectionTimingType,
    CorrelationId;

// 2. Risky Sign-ins from SigninLogs
let riskySignins = SigninLogs
| where TimeGenerated between (startDate .. endDate)
| where UserPrincipalName =~ targetUPN or UserId =~ targetUserId
| where RiskLevelDuringSignIn != "none" or RiskState in ("atRisk", "confirmedCompromised")
| project 
    EventType = "RiskySignIn",
    TimeGenerated = CreatedDateTime,
    DetectedDateTime = CreatedDateTime,
    RiskEventType = tostring(RiskEventTypes_V2),
    RiskLevel = RiskLevelDuringSignIn,
    RiskState,
    RiskDetail,
    Activity = "signin",
    IpAddress = IPAddress,
    City = Location,
    State = "",
    Country = "",
    DetectionTimingType = "realtime",
    CorrelationId;

// 3. Combine and sort chronologically
union riskDetections, riskySignins
| order by TimeGenerated desc
| take 100  // Limit to 100 most recent events
```

### Query Features

**Unified Schema**: Both data sources transformed into common schema:
- **EventType**: `RiskDetection` or `RiskySignIn`
- **TimeGenerated**: Timestamp of the event
- **DetectedDateTime**: When the risk was detected
- **RiskEventType**: Type of risk (e.g., `anonymizedIPAddress`, `unfamiliarFeatures`, `unlikelyTravel`)
- **RiskLevel**: Severity (`none`, `low`, `medium`, `high`)
- **RiskState**: Current state (`atRisk`, `remediated`, `dismissed`, `confirmedCompromised`)
- **RiskDetail**: Additional context (e.g., `userPassedMFADrivenByRiskBasedPolicy`)
- **Activity**: Activity type (always `signin` for Identity Protection)
- **IpAddress**: Source IP address
- **City**, **State**, **Country**: Geographic location
- **DetectionTimingType**: `realtime` or `offline`
- **CorrelationId**: Correlation identifier for event tracking

**Dual Filtering**: Filters by **both UPN and User Object ID** to ensure comprehensive results. Some alerts only contain User ID in entities, not UPN.

**Location Parsing**: `AADUserRiskEvents` stores location as dynamic JSON → parsed to extract city, state, country.

---

## Risk Event Types Reference

### Common riskEventType Values

| Risk Event Type | Description |
|----------------|-------------|
| **unlikelyTravel** | User traveled impossible distance between sign-ins |
| **unfamiliarFeatures** | Sign-in from unfamiliar location/device/IP |
| **anonymizedIPAddress** | Sign-in from Tor, VPN, or proxy |
| **maliciousIPAddress** | Sign-in from known malicious IP |
| **malwareInfectedIPAddress** | Sign-in from IP with malware activity |
| **suspiciousIPAddress** | Sign-in from suspicious IP patterns |
| **leakedCredentials** | User credentials found in leak databases |
| **investigationsThreatIntelligence** | Microsoft threat intel flagged activity |

### Risk State Transitions

| Risk State | Meaning | Action Required |
|-----------|---------|-----------------|
| **atRisk** | Active risk detection requiring investigation | ✅ Investigate now |
| **confirmedCompromised** | Admin confirmed account compromise | 🚨 Critical action required |
| **dismissed** | Admin reviewed and dismissed as false positive | ℹ️ No action needed |
| **remediated** | Risk automatically resolved (e.g., password reset, MFA completed) | ✅ Resolved automatically |

### Risk Detail Examples

- **userPassedMFADrivenByRiskBasedPolicy**: User successfully completed MFA challenge
- **adminConfirmedSigninSafe**: Admin marked sign-in as safe
- **aiConfirmedSigninSafe**: AI dismissed risk as false positive
- **none**: No additional detail available

---

## Usage Examples

### Example 1: Investigation Script with MCP

```python
from investigator import InvestigationResult, RiskDetection, RiskySignIn, UserRiskProfile

# Phase 1: Get User Object ID
user_data = mcp_microsoft_mcp_microsoft_graph_get("/v1.0/users/user@domain.com?$select=id")
user_id = user_data["id"]

# Phase 2 (Batch 2): Query Identity Protection in parallel
risk_profile_data = mcp_microsoft_mcp_microsoft_graph_get(f"/v1.0/identityProtection/riskyUsers/{user_id}")
risk_detections_data = mcp_microsoft_mcp_microsoft_graph_get(
    f"/v1.0/identityProtection/riskDetections?$filter=userId eq '{user_id}'&$orderby=detectedDateTime desc&$top=5"
)
risky_signins_data = mcp_microsoft_mcp_microsoft_graph_get(
    f"/beta/auditLogs/signIns?$filter=userPrincipalName eq 'user@domain.com' and (riskState eq 'atRisk' or riskState eq 'confirmedCompromised')&$orderby=createdDateTime desc&$top=5"
)

# Phase 3: Populate InvestigationResult
result.user_risk_profile = UserRiskProfile(
    risk_level=risk_profile_data.get("riskLevel", "none"),
    risk_state=risk_profile_data.get("riskState", "none"),
    risk_detail=risk_profile_data.get("riskDetail", ""),
    risk_last_updated=risk_profile_data.get("riskLastUpdatedDateTime", ""),
    is_deleted=risk_profile_data.get("isDeleted", False),
    is_processing=risk_profile_data.get("isProcessing", False)
)

result.risk_detections = [
    RiskDetection(
        risk_event_type=d.get("riskEventType", ""),
        risk_state=d.get("riskState", ""),
        risk_level=d.get("riskLevel", ""),
        detected_date=d.get("detectedDateTime", ""),
        last_updated=d.get("lastUpdatedDateTime", ""),
        activity=d.get("activity", ""),
        ip_address=d.get("ipAddress", ""),
        location_city=d.get("location", {}).get("city", ""),
        location_state=d.get("location", {}).get("state", ""),
        location_country=d.get("location", {}).get("countryOrRegion", "")
    )
    for d in risk_detections_data.get("value", [])
]

result.risky_signins = [
    RiskySignIn(
        sign_in_id=s.get("id", ""),
        created_date=s.get("createdDateTime", ""),
        upn=s.get("userPrincipalName", ""),
        app_display_name=s.get("appDisplayName", ""),
        ip_address=s.get("ipAddress", ""),
        location_city=s.get("location", {}).get("city", ""),
        location_state=s.get("location", {}).get("state", ""),
        location_country=s.get("location", {}).get("countryOrRegion", ""),
        risk_state=s.get("riskState", ""),
        risk_level=s.get("riskLevelDuringSignIn", ""),
        risk_event_types=s.get("riskEventTypes_v2", []),
        risk_detail=s.get("riskDetail", ""),
        status_error_code=s.get("status", {}).get("errorCode", 0),
        status_failure_reason=s.get("status", {}).get("failureReason", "")
    )
    for s in risky_signins_data.get("value", [])
]
```

### Example 2: Cross-Reference with Sentinel Anomalies

```python
# From Sentinel Anomalies: NewNonInteractiveIP 198.51.100.10 (Tokyo, JP)
# From Risk Detections: unlikelyTravel from 198.51.100.10 (Tokyo, JP)

# This confirms the anomaly is NOT a false positive - Microsoft's ML also flagged it
# Check risk_state to see if investigation occurred:
# - "dismissed" = Admin reviewed and cleared
# - "atRisk" = Still requires investigation
# - "remediated" = Automatically resolved
```

### Example 3: Sample Results

**Risk Detection - Anonymized IP:**
```
EventType: RiskDetection
DetectedDateTime: 2025-11-24T21:20:32.912Z
RiskEventType: anonymizedIPAddress
RiskLevel: medium
RiskState: remediated
RiskDetail: userPassedMFADrivenByRiskBasedPolicy
IpAddress: 146.70.9.214
City: Shek Kip Mei
Country: HK
```

**Risky Sign-in - Unfamiliar Features:**
```
EventType: RiskySignIn
DetectedDateTime: 2025-11-23T01:42:17.175882Z
RiskEventType: ["unfamiliarFeatures","unlikelyTravel"]
RiskLevel: low
RiskState: dismissed
RiskDetail: aiConfirmedSigninSafe
IpAddress: 193.19.205.125
City: BR
```

---

## Report Integration

### HTML Report Section

The report generator (`report_generator.py`) includes an Identity Protection section that displays:

1. **User Risk Profile** - Alert box showing:
   - Current risk state (atRisk, confirmedCompromised, dismissed, remediated)
   - Risk level badge (LOW, MEDIUM, HIGH)
   - Last updated timestamp
   - Risk detail if available

2. **Risk Detections** - Table showing:
   - Detection date
   - Risk event type
   - Risk level badge
   - Risk state badge
   - IP address
   - Location
   - Warning box if active risks exist

3. **Risky Sign-ins** - Table showing:
   - Date of sign-in
   - Application accessed
   - IP address and location
   - Risk level and state
   - Risk event types
   - Success/failure status
   - Warning box if risky sign-ins detected

### Copy KQL Button

Each report includes a **"📋 Copy KQL"** button in the Identity Protection section that:
- Copies the comprehensive KQL query (shown above)
- Pre-populates investigation parameters (dates, UPN, User ID)
- Opens Microsoft Sentinel Lake Explorer on first click
- Provides immediate query execution capability

---

## Performance Notes

### Query Execution
- Query scans two large tables (`AADUserRiskEvents`, `SigninLogs`)
- Filters on `TimeGenerated` first for optimal performance
- Uses `take 100` to limit result set size
- Typical execution time: **3-5 seconds** for 30-day range

### Troubleshooting
If no results, check:
- User has Identity Protection license (P2 required)
- Date range includes activity
- User ID is correct (get from Microsoft Graph)
- User has risky activity in the time period

---

## Related Documentation

- [Copilot Instructions](.github/copilot-instructions.md) - Complete investigation workflow
- [Graph Query Analysis](GRAPH_QUERY_ANALYSIS.md) - Graph API query optimization
- [Copy KQL Feature](COPY_KQL_FEATURE.md) - General documentation for Copy KQL buttons
- [Microsoft Identity Protection Documentation](https://learn.microsoft.com/en-us/entra/id-protection/)

---

## Files Modified

1. `investigator.py` - Added RiskDetection, RiskySignIn, UserRiskProfile dataclasses
2. `report_generator.py` - Added Identity Protection section builder, CSS styles
3. `.github/copilot-instructions.md` - Comprehensive workflow documentation

---

## Version History

- **November 23, 2025**: Initial Identity Protection integration
- **November 28, 2025**: Added Copy KQL feature for Identity Protection section
- **December 1, 2025**: Consolidated documentation into single comprehensive file

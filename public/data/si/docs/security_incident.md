# Security Incident Query Pattern

**Date:** 2025-11-21  
**Updated:** 2025-12-01  
**Status:** ✅ Complete

## Overview

The security investigation system uses a comprehensive `SecurityIncident` query that joins incident metadata with alert details. This provides full incident lifecycle tracking, ownership visibility, and classification information.

## Changes Made

### 1. Current KQL Query Pattern

**Approach:**
- Query `SecurityIncident` table joined with `SecurityAlert`
- Provides full incident lifecycle information
- Includes incident metadata: title, classification, owner, provider URLs
- Better deduplication using `arg_max` on both IncidentNumber and SystemAlertId
- Groups by `ProviderIncidentId` to ensure one row per external incident ID
- **Requires three identifiers**: UPN, User Object ID (AAD), and Windows SID (on-premises)

### 2. Updated Files

#### `.github/copilot-instructions.md`
- **Section 6**: Security Incidents with Alerts Correlated to User
- **Required Fields** (returned by query):
  - `ProviderIncidentId` (grouping key - external incident ID like "2273")
  - `Title`
  - `Severity` (incident-level)
  - `Status`
  - `Classification` (TruePositive, FalsePositive, BenignPositive, Undetermined)
  - `CreatedTime`
  - `LastModifiedTime` (most recent update timestamp)
  - `OwnerUPN`
  - `ProviderIncidentUrl`
  - `AlertCount` (number of alerts in the incident)
- **Critical Requirement**: Must provide `targetUPN`, `targetUserId`, and `targetSid` (all three identifiers)

#### `report_generator.py`
- Enhanced security alerts table with 7 columns (was 4):
  - Incident # (with clickable URL link)
  - Title
  - Severity
  - Created
  - Status
  - Classification (color-coded)
  - Owner
- Updated section heading from "Security Alerts" to "Security Incidents"
- Changed severity categorization to use incident `Severity` (fallback to `AlertSeverity`)
- Added classification color coding:
  - TruePositive: Red
  - FalsePositive: Green
  - BenignPositive: Blue
  - Undetermined: Gray

#### `investigator.py`
- Updated risk assessment logic to use incident `Severity` field (with fallback to `AlertSeverity`)

#### `investigation_user_7days.py`
- Updated sample data to include all new incident fields
- Changed from 7 fields per alert to 13 fields per incident

## Current Query Pattern

```kql
let targetUPN = "<UPN>";
let targetUserId = "<USER_OBJECT_ID>";  // REQUIRED: Get from Microsoft Graph API (/v1.0/users/<UPN>?$select=id)
let targetSid = "<WINDOWS_SID>";  // REQUIRED: Get from Microsoft Graph API (/v1.0/users/<UPN>?$select=onPremisesSecurityIdentifier)
let start = datetime(<StartDate>);
let end = datetime(<EndDate>);
let relevantAlerts = SecurityAlert
| where TimeGenerated between (start .. end)
| where Entities has targetUPN or Entities has targetUserId or Entities has targetSid
| summarize arg_max(TimeGenerated, *) by SystemAlertId
| project SystemAlertId, AlertName, AlertSeverity, ProviderName, Tactics;
SecurityIncident
| where CreatedTime between (start .. end)  // Filter on CreatedTime for incidents created in range
| summarize arg_max(TimeGenerated, *) by IncidentNumber  // Get most recent update for each incident
| mv-expand AlertId = AlertIds
| extend AlertId = tostring(AlertId)
| join kind=inner relevantAlerts on $left.AlertId == $right.SystemAlertId
| extend ProviderIncidentUrl = tostring(AdditionalData.providerIncidentUrl)
| extend OwnerUPN = tostring(Owner.userPrincipalName)
| extend LastModifiedTime = todatetime(LastModifiedTime)
| summarize 
    Title = any(Title),
    Severity = any(Severity),
    Status = any(Status),
    Classification = any(Classification),
    CreatedTime = any(CreatedTime),
    LastModifiedTime = any(LastModifiedTime),
    OwnerUPN = any(OwnerUPN),
    ProviderIncidentUrl = any(ProviderIncidentUrl),
    AlertCount = count()
    by ProviderIncidentId
| order by LastModifiedTime desc
| take 10
```

**Key Query Features:**
- **Three-identifier matching**: Searches alerts by UPN, User Object ID, and Windows SID (catches both cloud and on-premises alerts)
- **Time filtering**: Uses `CreatedTime` for incident creation time (not `TimeGenerated`)
- **Deduplication**: `arg_max(TimeGenerated, *)` on both IncidentNumber and SystemAlertId
- **Final grouping**: Groups by `ProviderIncidentId` to collapse multiple alerts per incident
- **Alert counting**: Returns `AlertCount` to show multi-alert incidents
- **Latest update tracking**: Sorts by `LastModifiedTime` (most recent incident update)
- **Result limit**: Top 10 incidents (most recently modified)

## Benefits

1. **Better Context**: Full incident lifecycle tracking (New → Active → Closed)
2. **Ownership Visibility**: See who owns each incident
3. **Classification Tracking**: Know investigation outcomes (TruePositive, FalsePositive, etc.)
4. **Direct Links**: ProviderIncidentUrl enables one-click access to full incident details in Defender portal
5. **Reduced Noise**: Incidents aggregate multiple alerts, reducing duplication
6. **Severity Accuracy**: Incident severity may differ from alert severity based on analyst assessment
7. **Multi-Alert Tracking**: AlertCount shows incidents with multiple correlated alerts
8. **Comprehensive Coverage**: Three-identifier matching catches both cloud and on-premises incidents
9. **Update Tracking**: LastModifiedTime shows most recent incident activity (status changes, comments)
10. **External ID Mapping**: ProviderIncidentId links to external security systems (e.g., Microsoft Defender incident "2273")

## Testing

Regenerated investigation report for user@domain.com:
- ✅ All 7 incidents loaded successfully
- ✅ Incident metadata displayed correctly
- ✅ Classification color coding working
- ✅ Severity categorization using incident-level severity
- ✅ Report generated successfully

**Report Location:** `reports/Investigation_Report_user_2025-11-21_222754.html`

## Usage in Investigation Workflow

**Prerequisites:**
1. **Get User Identifiers** (REQUIRED before running query):
   ```
   /v1.0/users/<UPN>?$select=id,onPremisesSecurityIdentifier
   ```
   Returns:
   - `id`: Azure AD User Object ID (GUID)
   - `onPremisesSecurityIdentifier`: Windows SID (format: S-1-5-21-...)

2. **Run SecurityIncident Query** with all three identifiers:
   - `targetUPN`: User's UPN (e.g., user@domain.com)
   - `targetUserId`: User Object ID from step 1
   - `targetSid`: Windows SID from step 1

3. **Export to Investigation JSON**:
   - Field: `incidents` (array of incident objects)
   - Each incident includes: ProviderIncidentId, Title, Severity, Status, Classification, CreatedTime, LastModifiedTime, OwnerUPN, ProviderIncidentUrl, AlertCount

4. **Report Generation**:
   - Report generator displays enhanced incident table with 7 columns
   - Classification color-coded (TruePositive=Red, FalsePositive=Green, BenignPositive=Blue, Undetermined=Gray)
   - ProviderIncidentUrl rendered as clickable link

## Why Three Identifiers Are Required

**Problem**: Different alert types use different entity formats
- **Cloud alerts**: Use Azure AD UPN or User Object ID (e.g., "Device Code Authentication Flow Detected")
- **On-premises alerts**: Use Windows SID only (e.g., "Rare RDP Connections", "RDP Nesting")

**Solution**: Search alerts using all three identifiers:
```kql
| where Entities has targetUPN or Entities has targetUserId or Entities has targetSid
```

**Impact**: Without all three identifiers, on-premises incidents will be missed!

## Example Output Structure

```json
{
  "incidents": [
    {
      "ProviderIncidentId": "2273",
      "Title": "Authentications of Privileged Accounts",
      "Severity": "High",
      "Status": "Closed",
      "Classification": "BenignPositive",
      "CreatedTime": "2025-11-23T20:10:00Z",
      "LastModifiedTime": "2025-11-24T08:30:00Z",
      "OwnerUPN": "analyst@contoso.com",
      "ProviderIncidentUrl": "https://security.microsoft.com/incidents/2273",
      "AlertCount": 3
    }
  ]
}
```

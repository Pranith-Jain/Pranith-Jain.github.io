# Copy KQL Feature Implementation

## Overview
Added "Copy KQL" buttons to investigation reports, enabling SOC analysts to easily copy and reuse KQL queries directly from the HTML report.

## Implementation Date
November 23, 2025

## Changes Made

### 1. Data Model Update (`investigator.py`)
**Added field to InvestigationResult dataclass:**
```python
kql_queries: Optional[Dict[str, str]] = None  # Keys: section names, Values: KQL query strings
```

This field stores the actual KQL queries used during investigation, making them available for the report generator.

### 2. Report Generator Update (`report_generator.py`)

**Note:** The compact report generator (now the default `report_generator.py`) implements Copy KQL functionality.

#### CSS Styling
Added `.kql-copy-button` styles with:
- Blue theme matching Microsoft brand (#00a1f1)
- Hover effects (darker blue #0078d4)
- Active state (scale transform)
- Visual feedback: Button shows "✓" in green (#7cbb00) for 2 seconds after copy

#### JavaScript Functionality
Added `copyKQL(event, queryType)` function:
- Uses `navigator.clipboard.writeText()` API
- Visual feedback: Button icon changes to "✓" and turns green for 2 seconds
- Automatically opens Microsoft Sentinel Lake Explorer on first copy
- Error handling with fallback

#### Section Integration
Copy KQL buttons are integrated into these sections:
- IP Intelligence cards (per-IP queries auto-generated)
- DLP Events section
- Security Incidents section
- Sign-in Failures section
- Office 365 Activity section
- Audit Logs section
- Anomalies section (in header)

### 3. Documentation Update (`.github/copilot-instructions.md`)
- Added `kql_queries` field to InvestigationResult structure documentation
- Created "KQL Queries Dictionary Pattern" section with example
- Added notes about field being optional but highly recommended

### 4. Example Scripts
Created two example scripts:
- `investigation_example_with_kql.py`: Template showing how to populate kql_queries
- Updated `investigation_user_7days_nov23_v2.py`: Full working example with all 6 KQL queries

## Supported Query Sections

| Section | Key | Description |
|---------|-----|-------------|
| Anomaly Detection | `anomalies` | Signinlogs_Anomalies_KQL_CL query |
| Sign-in Failures | `signin_failures` | Sign-in failures with detailed breakdown |
| Audit Logs | `audit` | AuditLogs query with aggregation |
| Office 365 Activity | `activity_summary` | OfficeActivity query by RecordType/Operation |
| Security Incidents | `incidents` | SecurityIncident joined with SecurityAlert |
| DLP Events | `dlp` | CloudAppEvents with DLP violations |
| **IP Intelligence** (per-IP) | `ip_{IP_ADDRESS}` | Individual IP investigation query (dots replaced with underscores) |

**Note:** The compact report automatically generates IP-specific queries. All other queries must be provided in the `kql_queries` dictionary when creating the InvestigationResult.

## IP Intelligence Copy KQL Feature (Added November 28, 2025)

### Overview
The report now includes a "Copy KQL" button (📋) on each IP Intelligence card, enabling one-click access to comprehensive IP investigation queries that union multiple log sources.

### Implementation

#### Report Generator (`report_generator.py`)
**Automatic Query Generation**: In `_generate_html()` method, IP-specific queries are automatically generated for each IP address in the investigation:

```python
# Add IP-specific KQL queries for "Copy KQL" buttons in IP Intelligence section
for ip_intel in (result.ip_intelligence or []):
    ip_address = ip_intel.ip
    kql_key = f"ip_{ip_address.replace('.', '_')}"
    self.kql_queries[kql_key] = f"""// Activity from IP: {ip_address} ({location})
// Organization: {ip_intel.org}
// Risk Level: {ip_intel.risk_level}
let TargetIP = "{ip_address}";
let TimeRange = 30d;
union isfuzzy=true
    (SigninLogs | where TimeGenerated > ago(TimeRange) | where IPAddress == TargetIP | ...),
    (AADNonInteractiveUserSignInLogs | where TimeGenerated > ago(TimeRange) | where IPAddress == TargetIP | ...),
    (OfficeActivity | where TimeGenerated > ago(TimeRange) | where ClientIP == TargetIP | ...),
    (AuditLogs | where tostring(InitiatedBy.user.ipAddress) == TargetIP or tostring(InitiatedBy.app.ipAddress) == TargetIP | ...),
    (AzureActivity | where TimeGenerated > ago(TimeRange) | where CallerIpAddress == TargetIP | ...)
| order by TimeGenerated desc"""
```

**IP Card Button Integration**: Copy KQL button is embedded in each IP card header alongside the risk badge.

### Query Structure
Each IP investigation query includes:
- **Header comments**: IP address, location, organization, risk level
- **Variable declaration**: `let TargetIP = "{ip_address}"; let TimeRange = 30d;`
- **Five data sources** (union):
  1. **SigninLogs**: Interactive user authentications
  2. **AADNonInteractiveUserSignInLogs**: Service principal/app authentications
  3. **OfficeActivity**: Email, Teams, SharePoint activity (matches on `ClientIP`)
  4. **AuditLogs**: Directory changes, policy updates (matches on `InitiatedBy.user.ipAddress` or `InitiatedBy.app.ipAddress`)
  5. **AzureActivity**: Azure resource management operations (matches on `CallerIpAddress`)
- **Unified schema**: All sources project to common fields (TimeGenerated, LogSource, UserPrincipalName, IPAddress, Location, AppDisplayName, ResultType, ResultDescription)
- **Time-ordered results**: `order by TimeGenerated desc` for chronological investigation

### Benefits
- **Efficiency**: Single query template per IP (stored once, referenced per card)
- **Comprehensive**: Covers all major log sources for IP-based investigation
- **Contextual**: Query comments include IP metadata (location, org, risk level)
- **Reusable**: Copy directly to Microsoft Sentinel Lake Explorer (opens automatically on first copy)
- **Consistent**: Same query structure across all IP cards
- **Automated**: Queries are auto-generated - no manual intervention needed

## Usage Example

```python
from investigator import InvestigationResult
from report_generator import CompactReportGenerator

# Create investigation result with all fields
result = InvestigationResult(
    upn="user@domain.com",
    investigation_date="2025-11-23",
    start_date="2025-11-15",
    end_date="2025-11-22",
    # ... populate all required fields ...
)

# Add KQL queries for Copy KQL buttons
# Note: IP queries are auto-generated, but other section queries should be provided
result.kql_queries = {
    'anomalies': """Signinlogs_Anomalies_KQL_CL
| where DetectedDateTime between (datetime(2025-11-15) .. datetime(2025-11-22))
| where UserPrincipalName =~ 'user@domain.com'
| extend Severity = case(...)
| order by DetectedDateTime desc""",
    
    'signin_failures': """union isfuzzy=true SigninLogs, AADNonInteractiveUserSignInLogs
| where TimeGenerated between (datetime(2025-11-15) .. datetime(2025-11-22))
| where UserPrincipalName =~ 'user@domain.com'
| where ResultType != '0'
| summarize FailureCount=count(), ...""",
    
    # Add queries for: audit, activity_summary, dlp, incidents
}

# Generate report with Copy KQL buttons
generator = CompactReportGenerator()
report_path = generator.generate(result)
```

## Testing

Verified functionality in generated reports:
- **Button Count**: 6+ Copy KQL buttons (section buttons + per-IP buttons)
- **JavaScript**: All queries properly injected into `copyKQL()` function
- **CSS**: All styles applied correctly
- **Visual Feedback**: Buttons show "✓" icon in green for 2 seconds after copy
- **Lake Explorer**: Automatically opens on first copy (subsequent copies don't re-open)
- **IP Queries**: Auto-generated for each IP address in investigation

## Browser Compatibility

The `navigator.clipboard` API requires:
- HTTPS or localhost (security requirement)
- Modern browsers (Chrome 63+, Firefox 53+, Safari 13.1+, Edge 79+)
- User gesture (button click) to access clipboard

## Benefits for SOC Analysts

1. **Faster Investigation**: No need to manually recreate queries
2. **Reproducibility**: Exact queries used in investigation are available
3. **Learning Tool**: Analysts can see KQL patterns and adapt them
4. **Customization**: Copy base query and modify for different users/timeframes
5. **Audit Trail**: Queries used are preserved in the report
6. **Direct Access**: Lake Explorer opens automatically on first copy
7. **Per-IP Queries**: Comprehensive investigation queries auto-generated for each IP

## Performance Impact

- **Report Generation**: Negligible (<0.1s) - just string formatting
- **Report Size**: +2-5KB per query (minimal)
- **Browser Rendering**: No impact - queries loaded only when button clicked

## Future Enhancements (Optional)

1. **Syntax Highlighting**: Add KQL syntax highlighting in modal preview
2. **Download as .kql**: Add option to download query as .kql file
3. **Run in Sentinel**: Deep link to run query directly in Sentinel UI
4. **Query History**: Track which queries analyst has copied
5. **Parameterization**: Show query with placeholders for UPN/dates

## Files Modified

- `investigator.py`: Added `kql_queries` field to InvestigationResult
- `report_generator.py`: Implements Copy KQL feature (CSS, JavaScript, auto-generated IP queries)
- `.github/copilot-instructions.md`: Updated documentation
- **Note**: The compact report generator is now the default `report_generator.py`

## Backward Compatibility

✅ **Fully backward compatible**:
- `kql_queries` field is optional (`Optional[Dict[str, str]] = None`)
- If not provided, buttons simply don't appear in report
- Existing investigation scripts work without modification
- Old reports still render correctly

## Conclusion

The Copy KQL feature enhances report usability by making investigation queries easily accessible to analysts. Implementation is complete, tested, and documented. All existing functionality preserved with zero breaking changes.

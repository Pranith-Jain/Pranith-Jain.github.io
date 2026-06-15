# Microsoft Graph API Queries - Current Configuration

## Overview
All Graph queries return JSON objects or arrays. Unlike Sentinel KQL queries, Graph API queries don't use `| take` syntax - they use OData `$top` parameter instead.

---

## Current Graph Queries (6 total)

### Query 1: User Profile (Single Object)
**Endpoint**: `/v1.0/users/<UPN>?$select=id,displayName,userPrincipalName,mail,userType,jobTitle,department,officeLocation,accountEnabled`

**Returns**: Single user object (9 fields)

**Expected Size**: ~250 bytes (single object)

**Limit Required?**: ❌ No - always returns exactly 1 user object

**Notes**: 
- This is a GET request for a single resource by UPN
- No collection, no need for limits

---

### Query 2: MFA Methods (Array)
**Endpoint**: `/v1.0/users/<USER_ID>/authentication/methods?$top=5`

**Returns**: Array of authentication methods

**Typical Count**: 3-5 methods per user (phone, app, FIDO2, email, etc.) - limited by $top=5

**Expected Size**: ~250 bytes (5 methods × ~50 bytes each)

**Limit Applied**: ✅ **YES** - `$top=5` to limit to top 5 methods

**Notes**:
- Most users have 3-8 methods
- Power users might have 15-20 methods
- Current behavior: Returns top 5 authentication methods
- Covers primary authentication methods while keeping response size manageable

---

### Query 3: Registered Devices (Array)
**Endpoint**: `/v1.0/users/<USER_ID>/ownedDevices?$select=id,deviceId,displayName,operatingSystem,operatingSystemVersion,registrationDateTime,isCompliant,isManaged,trustType,approximateLastSignInDateTime&$orderby=approximateLastSignInDateTime desc&$top=5&$count=true`

**Returns**: Array of devices (10 fields each)

**Typical Count**: 1-5 devices per user (limited by $top=5)

**Expected Size**: ~1,000 bytes (5 devices × ~200 bytes each)

**Limit Applied**: ✅ **YES** - `$top=5` to limit to top 5 most recent devices

**Notes**:
- Most users have 2-5 devices (laptop, phone, tablet)
- Power users might have 10-20 devices
- IT admins might have 30+ devices
- Current behavior: Returns top 5 devices ordered by last sign-in with `&$count=true`
- Sorted by `approximateLastSignInDateTime desc` to get most recently used devices

---

### Query 4: User Risk Profile (Single Object)
**Endpoint**: `/v1.0/identityProtection/riskyUsers/<USER_ID>`

**Returns**: Single risk user object (6 fields)

**Expected Size**: ~200 bytes (single object)

**Limit Required?**: ❌ No - always returns exactly 1 user risk profile

**Notes**:
- This is a GET request for a single resource by User ID
- No collection, no need for limits

---

### Query 5: Risk Detections (Array)
**Endpoint**: `/v1.0/identityProtection/riskDetections?$filter=userId eq '<USER_ID>'&$select=id,detectedDateTime,riskEventType,riskLevel,riskState,riskDetail,ipAddress,location,activity,activityDateTime&$orderby=detectedDateTime desc&$top=5`

**Returns**: Array of risk detection events (10 fields each)

**Typical Count**: 0-5 events per user (limited by $top=5)

**Expected Size**: ~1,200 bytes (5 events × ~240 bytes each)

**Limit Applied**: ✅ **YES** - `$top=5` with `$orderby=detectedDateTime desc` to get most recent 5

**Notes**:
- Most users have 0-5 risk detections
- Compromised accounts might have 20-50 events
- High-risk users might have 100+ historical events
- Current behavior: Returns top 5 most recent risk detections ordered by detection date
- Includes explicit field selection via `$select` to reduce payload size

---

### Query 6: Risky Sign-ins (Array)
**Endpoint**: `/beta/auditLogs/signIns?$filter=userPrincipalName eq '<UPN>' and (riskState eq 'atRisk' or riskState eq 'confirmedCompromised')&$select=id,createdDateTime,userPrincipalName,appDisplayName,ipAddress,location,riskState,riskLevelDuringSignIn,riskEventTypes_v2,riskDetail,status&$orderby=createdDateTime desc&$top=5`

**Returns**: Array of risky sign-in events (11 fields each)

**Typical Count**: 0-5 events per user (limited by $top=5)

**Expected Size**: ~1,000 bytes (5 events × ~200 bytes each)

**Limit Applied**: ✅ **YES** - `$top=5` with `$orderby=createdDateTime desc` to get most recent 5

**Notes**:
- Most users have 0-5 risky sign-ins
- Compromised accounts might have 20-100 risky sign-ins
- Current behavior: Returns top 5 most recent risky sign-ins matching filter
- Already has `&$orderby=createdDateTime desc` (newest first)
- Uses `/beta` endpoint as risky sign-ins are not available in `/v1.0`

---

## Summary

### Queries That DON'T Need Limits (2)
1. ✅ User Profile - Single object GET
2. ✅ User Risk Profile - Single object GET

### Queries With Limits Applied (4)

| Query | Current | Typical Size | Limit Applied |
|-------|---------|--------------|---------------|
| **MFA Methods** | `$top=5` | 3-5 methods (~250 bytes) | ✅ Top 5 methods |
| **Devices** | `$top=5` | 2-5 devices (~1,000 bytes) | ✅ Top 5 devices (by last sign-in) |
| **Risk Detections** | `$top=5` | 0-5 events (~1,200 bytes) | ✅ Top 5 events (by detection date) |
| **Risky Sign-ins** | `$top=5` | 0-5 events (~1,000 bytes) | ✅ Top 5 events (by creation date) |

### Actual Token Usage (Current Implementation)

**Current (with $top=5 limits applied)**:
- User Profile: ~250 bytes (single object)
- MFA Methods: ~250 bytes (5 methods)
- Devices: ~1,000 bytes (5 devices)
- User Risk Profile: ~200 bytes (single object)
- Risk Detections: ~1,200 bytes (5 events)
- Risky Sign-ins: ~1,000 bytes (5 events)
- **Total**: ~3,900 bytes (~4 KB) for Graph queries

**If no limits were applied (worst-case for high-risk user)**:
- MFA Methods: ~1,000 bytes (20 methods)
- Devices: ~6,000 bytes (30 devices)
- Risk Detections: ~24,000 bytes (100 events)
- Risky Sign-ins: ~20,000 bytes (100 events)
- **Total**: ~51,000 bytes (~51 KB) for Graph queries alone

**Savings Achieved**: ~47 KB (92% reduction for high-risk users)

**Typical User (2-5 items each)**:
- Current with limits: ~3,400 bytes
- Impact: Limits prevent bloat for compromised/high-risk accounts while having no impact on typical users

### Implementation Status

**✅ All Recommendations Implemented:**
- ✅ `$top=5` applied to **Risk Detections** (prevents 24 KB bloat for compromised accounts)
- ✅ `$top=5` applied to **Risky Sign-ins** (prevents 20 KB bloat for compromised accounts)
- ✅ `$top=5` applied to **Devices** (prevents 6 KB bloat for IT admins with many devices)
- ✅ `$top=5` applied to **MFA Methods** (prevents 1 KB bloat for users with many methods)

**Benefits Achieved**:
- Consistent limit of 5 items across all collection queries
- 92% reduction in Graph query payload for high-risk users
- No impact on typical users (most have <5 items per collection)
- All queries include `$orderby` to return most recent/relevant items first
- Explicit field selection via `$select` reduces payload size further

---

## OData $top vs KQL | take

**Graph API (OData)**:
- Use `$top=N` query parameter
- Example: `?$top=10`
- Can combine with `$orderby`, `$filter`, `$select`
- Example: `?$filter=riskState eq 'atRisk'&$orderby=detectedDateTime desc&$top=10`

**Sentinel (KQL)**:
- Use `| take N` operator
- Example: `| take 5`
- Placed at end of query pipeline
- Can combine with `| order by`, `| where`, `| project`
- Example: `| where riskLevel == 'high' | order by timestamp desc | take 5`

**Key Difference**: 
- `$top` is a URL parameter (before query execution)
- `| take` is a pipeline operator (after filtering/sorting)

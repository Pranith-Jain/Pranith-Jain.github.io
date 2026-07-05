#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy Detection Chokepoints Sentinel Scheduled Analytics Rules.
.DESCRIPTION
    Reads sentinel-chokepoint-rules.json and deploys each rule to Microsoft Sentinel
    via the Microsoft Graph Security API (beta/security/alertRules).
.PARAMETER WorkspaceId
    Log Analytics workspace resource ID (e.g., /subscriptions/.../resourcegroups/.../providers/microsoft.operationalinsights/workspaces/...)
.PARAMETER DryRun
    If specified, validates rules without deploying.
.EXAMPLE
    .\Deploy-SentinelChokepointRules.ps1 -WorkspaceId "/subscriptions/.../workspaces/myWorkspace" -DryRun
    .\Deploy-SentinelChokepointRules.ps1 -WorkspaceId "/subscriptions/.../workspaces/myWorkspace"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$WorkspaceId,

    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$RulesPath = Join-Path $PSScriptRoot '..' 'scripts' 'sentinel-chokepoint-rules.json'
if (-not (Test-Path $RulesPath)) {
    $RulesPath = Join-Path $PSScriptRoot 'sentinel-chokepoint-rules.json'
}

$Rules = Get-Content $RulesPath -Raw | ConvertFrom-Json

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Detection Chokepoints — Sentinel Rules    " -ForegroundColor Cyan
Write-Host "  Rules: $($Rules.rules.Count)                              " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Get access token
$Token = (Get-AzAccessToken -ResourceUrl "https://graph.microsoft.com").Token
if (-not $Token) {
    Write-Error "Not authenticated. Run Connect-AzAccount first."
    exit 1
}

$Headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type"  = "application/json"
}

$BaseUrl = "https://graph.microsoft.com/beta"

$Results = @()

foreach ($Rule in $Rules.rules) {
    Write-Host "[$($Rule.id)] $($Rule.displayName)" -ForegroundColor Yellow

    $SeverityMap = @{
        "Critical" = "critical"
        "High"     = "high"
        "Medium"   = "medium"
        "Low"      = "low"
        "Informational" = "informational"
    }

    $TacticMap = @{
        "CredentialAccess"    = "credentialAccess"
        "DefenseEvasion"      = "defenseEvasion"
        "Impact"              = "impact"
        "InitialAccess"       = "initialAccess"
        "Execution"           = "execution"
        "LateralMovement"     = "lateralMovement"
        "Persistence"         = "persistence"
        "Discovery"           = "discovery"
        "PrivilegeEscalation" = "privilegeEscalation"
        "CommandAndControl"   = "commandAndControl"
        "Collection"          = "collection"
        "Exfiltration"        = "exfiltration"
    }

    $Body = @{
        "@odata.type"       = "#microsoft.graph.security.alertRule"
        "displayName"       = $Rule.displayName
        "description"       = $Rule.description
        "severity"          = $SeverityMap[$Rule.severity]
        "enabled"           = $Rule.enabled
        "query"             = $Rule.query
        "queryFrequency"    = $Rule.queryFrequency
        "queryPeriod"       = $Rule.queryPeriod
        "triggerOperator"   = $Rule.triggerOperator
        "triggerThreshold"  = $Rule.triggerThreshold
        "suppressionDuration" = $Rule.suppressionDuration
        "suppressionEnabled"  = $Rule.suppressionEnabled
        "tactics"           = $Rule.tactics | ForEach-Object { $TacticMap[$_] }
        "techniques"        = $Rule.techniques
        "entityMappings"    = $Rule.entityMappings
        "customDetails"     = $Rule.customDetails
    } | ConvertTo-Json -Depth 10

    if ($DryRun) {
        Write-Host "  [DRY RUN] Would deploy rule: $($Rule.displayName)" -ForegroundColor Magenta
        Write-Host "  Severity: $($Rule.severity) | Tactics: $($Rule.tactics -join ', ')" -ForegroundColor DarkGray
        Write-Host "  Techniques: $($Rule.techniques -join ', ')" -ForegroundColor DarkGray
        Write-Host "  Entity mappings: $($Rule.entityMappings.Count) | Custom details: $($Rule.customDetails.Count)" -ForegroundColor DarkGray
        $Results += @{ id = $Rule.id; status = "dry-run"; name = $Rule.displayName }
    } else {
        try {
            $Uri = "$BaseUrl/security/alertRules/sentinel?`$filter=displayName eq '$($Rule.displayName)'"
            $Existing = Invoke-RestMethod -Uri $Uri -Headers $Headers -Method GET

            if ($Existing.value.Count -gt 0) {
                $RuleId = $Existing.value[0].id
                $Uri = "$BaseUrl/security/alertRules/$RuleId"
                $Response = Invoke-RestMethod -Uri $Uri -Headers $Headers -Method PATCH -Body $Body
                Write-Host "  UPDATED rule: $($Rule.displayName)" -ForegroundColor Green
                $Results += @{ id = $Rule.id; status = "updated"; name = $Rule.displayName }
            } else {
                $Uri = "$BaseUrl/security/alertRules?workspaceId=$WorkspaceId"
                $Response = Invoke-RestMethod -Uri $Uri -Headers $Headers -Method POST -Body $Body
                Write-Host "  DEPLOYED rule: $($Rule.displayName)" -ForegroundColor Green
                $Results += @{ id = $Rule.id; status = "deployed"; name = $Rule.displayName }
            }
        } catch {
            Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
            $Results += @{ id = $Rule.id; status = "failed"; name = $Rule.displayName; error = $_.Exception.Message }
        }
    }
    Write-Host ""
}

# Summary
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  DEPLOYMENT SUMMARY                        " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
$Deployed = ($Results | Where-Object { $_.status -eq "deployed" }).Count
$Updated = ($Results | Where-Object { $_.status -eq "updated" }).Count
$Failed = ($Results | Where-Object { $_.status -eq "failed" }).Count
$DryRunCount = ($Results | Where-Object { $_.status -eq "dry-run" }).Count

if ($DryRun) {
    Write-Host "  Dry run: $DryRunCount rules validated" -ForegroundColor Magenta
} else {
    Write-Host "  Deployed: $Deployed" -ForegroundColor Green
    Write-Host "  Updated:  $Updated" -ForegroundColor Yellow
    Write-Host "  Failed:   $Failed" -ForegroundColor Red
}

Write-Host ""
Write-Host "Rules by severity:" -ForegroundColor White
$Rules.rules | Group-Object { $_.severity } | Sort-Object { $_.Count } -Descending | ForEach-Object {
    Write-Host "  $($_.Name): $($_.Count)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "MITRE ATT&CK coverage:" -ForegroundColor White
$AllTechniques = $Rules.rules | ForEach-Object { $_.techniques } | Sort-Object -Unique
Write-Host "  Techniques: $($AllTechniques.Count) ($($AllTechniques -join ', '))" -ForegroundColor Gray
$AllTactics = $Rules.rules | ForEach-Object { $_.tactics } | Sort-Object -Unique
Write-Host "  Tactics: $($AllTactics.Count) ($($AllTactics -join ', '))" -ForegroundColor Gray

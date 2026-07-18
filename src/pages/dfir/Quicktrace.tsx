import { useState, useMemo } from 'react';
import { BackLink } from '../../components/BackLink';
import { CopyButton } from '../../components/dfir/CopyButton';
import { Search, Zap, Shield, Globe, Monitor, Cloud, AlertTriangle } from 'lucide-react';

type CategoryId = 'auth' | 'network' | 'endpoint' | 'cloud';
type PlatformId = 'kql' | 'xql' | 'spl';

interface TriageQuery {
  id: string;
  name: string;
  description: string;
  category: CategoryId;
  platforms: Partial<Record<PlatformId, string>>;
  dataSources: string[];
}

const CATEGORY_META: Record<CategoryId, { label: string; icon: typeof Shield; color: string }> = {
  auth: { label: 'Authentication', icon: Shield, color: 'text-sky-600 dark:text-sky-400' },
  network: { label: 'Network', icon: Globe, color: 'text-emerald-600 dark:text-emerald-400' },
  endpoint: { label: 'Endpoint', icon: Monitor, color: 'text-violet-600 dark:text-violet-400' },
  cloud: { label: 'Cloud', icon: Cloud, color: 'text-orange-600 dark:text-orange-400' },
};

const CATEGORY_BG: Record<CategoryId, string> = {
  auth: 'bg-sky-100 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300',
  network: 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300',
  endpoint: 'bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300',
  cloud: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300',
};

const PLATFORM_LABELS: Record<PlatformId, string> = {
  kql: 'KQL',
  xql: 'XQL',
  spl: 'SPL',
};

const ALL_QUERIES: TriageQuery[] = [
  // ── Authentication ──
  {
    id: 'auth-001',
    name: 'Failed Logins — Spike Detection',
    description: 'Detects anomalous spikes in failed authentication attempts across Azure AD and on-prem AD.',
    category: 'auth',
    dataSources: ['AzureAD', 'Windows Event Log (4625)'],
    platforms: {
      kql: `SigninLogs
| where ResultType == "50057" or ResultType == "50126"
| summarize FailedCount = count() by UserPrincipalName, AppDisplayName, bin(Timestamp, 1h)
| where FailedCount > 10`,
      xql: `dataset = authentication
| filter event_type = "AZURE_SIGNIN" and TIMESTAMP > NOW() - 24h
| filter result_type in ("50057", "50126")
| bucket span = 1h
| aggregation count() BY user, app
| filter count > 10`,
      spl: `index=azure sourcetype=signinlogs
ResultType IN ("50057","50126")
| bin span=1h _time
| stats count as fail_count by user, app, _time
| where fail_count > 10`,
    },
  },
  {
    id: 'auth-002',
    name: 'MFA Failures — Possible Fatigue Attack',
    description: 'Multiple MFA denial prompts in short window indicating MFA fatigue / bombing attacks.',
    category: 'auth',
    dataSources: ['AzureAD', 'Duo', 'Okta'],
    platforms: {
      kql: `SigninLogs
| where ResultType == "500121"
| summarize DenialCount = count() by UserPrincipalName, bin(Timestamp, 15m)
| where DenialCount > 5`,
      xql: `dataset = authentication
| filter event_type = "AZURE_SIGNIN" and TIMESTAMP > NOW() - 24h
| filter result_code = "500121"
| bucket span = 15m
| aggregation count() BY user
| filter count > 5`,
      spl: `index=azure sourcetype=signinlogs
ResultType=500121
| bin span=15m _time
| stats count as mfa_denials by user, _time
| where mfa_denials > 5`,
    },
  },
  {
    id: 'auth-003',
    name: 'Privileged Account Usage — Off-Hours',
    description: 'Privileged account logons outside business hours (20:00–06:00 local).',
    category: 'auth',
    dataSources: ['Windows Event Log (4672)', 'AzureAD'],
    platforms: {
      kql: `SigninLogs
| where ResultType == "0"
| where UserPrincipalName contains "admin" or UserPrincipalName contains "svc-"
| extend Hour = datetime_part("hour", Timestamp)
| where Hour < 6 or Hour > 20
| project Timestamp, UserPrincipalName, IPAddress, AppDisplayName`,
      xql: `dataset = authentication
| filter event_type = "AZURE_SIGNIN" and TIMESTAMP > NOW() - 24h
| filter result_code = "0"
| filter user contains "admin" or user contains "svc-"
| filter hour(TIMESTAMP) < 6 or hour(TIMESTAMP) > 20
| fields TIMESTAMP, user, src_ip, app`,
      spl: `index=azure sourcetype=signinlogs
ResultType=0 (user=*admin* OR user=*svc-*)
| eval hour=strftime(_time, "%H")
| where hour < 6 OR hour > 20
| table _time, user, src_ip, app`,
    },
  },
  {
    id: 'auth-004',
    name: 'Service Account Anomalous Logon',
    description: 'Service accounts logging in from unexpected locations or non-allowlisted IP ranges.',
    category: 'auth',
    dataSources: ['AzureAD', 'Windows Event Log (4624)'],
    platforms: {
      kql: `SigninLogs
| where ResultType == "0"
| where UserPrincipalName startswith "svc-"
| where Location !in ("US", "CA") or IPAddress !startswith "10."
| project Timestamp, UserPrincipalName, IPAddress, Location`,
      xql: `dataset = authentication
| filter event_type = "AZURE_SIGNIN" and TIMESTAMP > NOW() - 24h
| filter user startswith "svc-"
| filter not (country_code in ("US", "CA") or src_ip startswith "10.")
| fields TIMESTAMP, user, src_ip, country_code`,
      spl: `index=azure sourcetype=signinlogs
ResultType=0 user=svc-*
NOT (Location IN ("US","CA") OR src_ip="10.*")
| table _time, user, src_ip, Location`,
    },
  },
  {
    id: 'auth-005',
    name: 'Guest User Activity — Suspicious',
    description: 'Guest/external user access to sensitive applications or elevated privilege grants.',
    category: 'auth',
    dataSources: ['AzureAD', 'Microsoft 365'],
    platforms: {
      kql: `AuditLogs
| where OperationName has_any ("Add guest", "Invite guest", "Grant consent")
| where ResultStatus == "success"
| project Timestamp, OperationName, InitiatedBy.user.userPrincipalName, TargetResources`,
      xql: `dataset = cloud_audit
| filter event_type = "AZURE_AUDIT" and TIMESTAMP > NOW() - 7d
| filter operation_name contains any ("guest", "invite", "consent")
| filter result = "SUCCESS"
| fields TIMESTAMP, operation_name, user, target`,
      spl: `index=azure sourcetype=audit
operation IN ("Add guest user", "Invite guest", "Grant consent") result=success
| table _time, user, operation, target`,
    },
  },
  {
    id: 'auth-006',
    name: 'Password Spray — Pattern Detection',
    description: 'Same password attempted across multiple accounts in rapid succession.',
    category: 'auth',
    dataSources: ['AzureAD', 'Windows Event Log (4625)'],
    platforms: {
      kql: `SigninLogs
| where ResultType == "50126"
| summarize UniqueAccounts = dcount(UserPrincipalName) by IPAddress, AppDisplayName, bin(Timestamp, 5m)
| where UniqueAccounts > 3`,
      xql: `dataset = authentication
| filter event_type = "AZURE_SIGNIN" and TIMESTAMP > NOW() - 4h
| filter result_code = "50126"
| bucket span = 5m
| aggregation dcount(user) BY src_ip, app
| filter dcount > 3`,
      spl: `index=azure sourcetype=signinlogs
ResultType=50126
| bin span=5m _time
| stats dc(user) as unique_users by src_ip, app, _time
| where unique_users > 3`,
    },
  },
  // ── Network ──
  {
    id: 'net-001',
    name: 'Unusual Outbound Traffic — Beaconing',
    description:
      'Periodic outbound connections to rare destinations with regular intervals indicative of C2 beaconing.',
    category: 'network',
    dataSources: ['Firewall logs', 'Zeek', 'Cloudflare'],
    platforms: {
      kql: `DeviceNetworkEvents
| where Timestamp > ago(24h)
| where ActionType == "ConnectionSuccess"
| where RemoteIPType == "Public"
| summarize ConnectionCount = count(), AvgInterval = datetime_diff("second", max(Timestamp), min(Timestamp)) / count() by RemoteIP, RemotePort
| where ConnectionCount > 10 and AvgInterval between (30 .. 180)`,
      xql: `dataset = network_connection
| filter event_type = "NETWORK" and TIMESTAMP > NOW() - 24h
| filter dest_ip_type = "PUBLIC" and initiated = true
| aggregation count() as cnt, span_avg(1m) as interval BY dest_ip, dest_port
| filter cnt > 10 and interval between (30 and 180)`,
      spl: `index=network sourcetype=flow
dest_ip_type=public initiated=true
| stats count as conn_count, range(_time) / count as avg_interval by dest_ip, dest_port
| where conn_count > 10 AND avg_interval BETWEEN 30 AND 180`,
    },
  },
  {
    id: 'net-002',
    name: 'DNS Anomalies — DGA or Tunnel',
    description: 'High-entropy DNS queries, excessive NXDOMAIN responses, or long subdomain lengths.',
    category: 'network',
    dataSources: ['DNS logs', 'Zeek dns.log'],
    platforms: {
      kql: `DeviceNetworkEvents
| where Timestamp > ago(24h)
| where RemoteUrl matches regex "^[a-z0-9]{20,}\\.[a-z]+$"
| project Timestamp, DeviceName, RemoteUrl, RemoteIP`,
      xql: `dataset = dns_query
| filter event_type = "DNS" and TIMESTAMP > NOW() - 24h
| filter query matches regex "^[a-z0-9]{20,}\\.[a-z]{2,}$"
| fields TIMESTAMP, hostname, query, response`,
      spl: `index=network sourcetype=dns
query = regex("^[a-z0-9]{20,}\\.[a-z]+$")
| eval threat="Possible DGA Domain"
| table _time, src_ip, query, answer`,
    },
  },
  {
    id: 'net-003',
    name: 'TLS Handshake Failures — SSL/TLS Anomalies',
    description: 'Repeated TLS handshake failures suggesting certificate mismatch or MITM attempts.',
    category: 'network',
    dataSources: ['Zeek ssl.log', 'Firewall logs'],
    platforms: {
      kql: `DeviceNetworkEvents
| where Timestamp > ago(24h)
| where ActionType in ("ConnectionFailed", "TLSHandshakeFailed")
| summarize FailCount = count() by DeviceName, RemoteIP, RemotePort
| where FailCount > 5`,
      xql: `dataset = network_connection
| filter event_type = "NETWORK" and TIMESTAMP > NOW() - 24h
| filter action in ("CONNECTION_FAILED", "TLS_FAILED")
| aggregation count() BY hostname, dest_ip, dest_port
| filter count > 5`,
      spl: `index=network sourcetype=flow
action IN ("connection_failed","tls_failed")
| stats count as fail_count by src_ip, dest_ip, dest_port
| where fail_count > 5`,
    },
  },
  {
    id: 'net-004',
    name: 'Port Scanning — Inbound Recon',
    description: 'Multiple ports targeted from a single source IP indicating reconnaissance.',
    category: 'network',
    dataSources: ['Firewall logs', 'Zeek conn.log'],
    platforms: {
      kql: `DeviceNetworkEvents
| where Timestamp > ago(4h)
| where ActionType == "ConnectionAttempt"
| summarize UniquePorts = dcount(RemotePort) by RemoteIP, DeviceName
| where UniquePorts > 10`,
      xql: `dataset = network_connection
| filter event_type = "NETWORK" and TIMESTAMP > NOW() - 4h
| filter action = "ATTEMPT"
| aggregation dcount(dest_port) BY src_ip, hostname
| filter dcount > 10`,
      spl: `index=network sourcetype=flow
action=attempt
| stats dc(dest_port) as port_count by src_ip, dest_ip
| where port_count > 10`,
    },
  },
  {
    id: 'net-005',
    name: 'Data Transfer Spikes — Exfiltration',
    description: 'Outbound data volume spike to a single destination exceeding baseline by 3 sigma.',
    category: 'network',
    dataSources: ['Firewall logs', 'Zeek', 'Zscaler'],
    platforms: {
      kql: `DeviceNetworkEvents
| where Timestamp > ago(6h)
| where ActionType == "ConnectionSuccess"
| summarize TotalBytes = sum(SessionBytes) by RemoteIP, DeviceName
| where TotalBytes > 500000000`,
      xql: `dataset = network_connection
| filter event_type = "NETWORK" and TIMESTAMP > NOW() - 6h
| aggregation sum(bytes_total) AS TotalBytes BY dest_ip, hostname
| filter TotalBytes > 500000000`,
      spl: `index=network sourcetype=netflow
| stats sum(bytes_out) as total_bytes by dest_ip, src_ip
| where total_bytes > 500000000`,
    },
  },
  {
    id: 'net-006',
    name: 'Tor / Proxy / VPN Connections',
    description: 'Outbound connections to known Tor exit nodes, proxy services, or commercial VPN ranges.',
    category: 'network',
    dataSources: ['Firewall logs', 'Zeek', 'Threat intelligence'],
    platforms: {
      kql: `DeviceNetworkEvents
| where Timestamp > ago(24h)
| where RemoteIP in (dynamic(["185.220.101.0", "185.220.102.0", "199.249.230.0"]))
// Tor exit node ranges — expand with TI feed
| project Timestamp, DeviceName, RemoteIP, RemotePort, InitiatingProcessFileName`,
      xql: `dataset = network_connection
| filter event_type = "NETWORK" and TIMESTAMP > NOW() - 24h
| filter dest_ip in ("185.220.101.0/24", "185.220.102.0/24", "199.249.230.0/24")
| fields TIMESTAMP, hostname, dest_ip, dest_port, process`,
      spl: `index=network sourcetype=flow
dest_ip IN ("185.220.101.0/24", "185.220.102.0/24", "199.249.230.0/24")
| eval threat="Tor Exit Node Connection"
| table _time, src_ip, dest_ip, dest_port`,
    },
  },
  // ── Endpoint ──
  {
    id: 'end-001',
    name: 'Process Creation — Anomalous Parents',
    description: 'Unusual parent-child process relationships (e.g., Office spawning cmd, PDF launching PowerShell).',
    category: 'endpoint',
    dataSources: ['Windows Event Log (4688)', 'Sysmon (1)'],
    platforms: {
      kql: `DeviceProcessEvents
| where Timestamp > ago(24h)
| where InitiatingProcessFileName in~ ("winword.exe", "excel.exe", "outlook.exe", "acrobat.exe", "chrome.exe")
| where FileName in~ ("powershell.exe", "cmd.exe", "wscript.exe", "cscript.exe", "mshta.exe")
| project Timestamp, DeviceName, InitiatingProcessFileName, FileName, ProcessCommandLine`,
      xql: `dataset = process_creation
| filter event_type = "PROCESS" and TIMESTAMP > NOW() - 24h
| filter parent_process_path contains any ("winword.exe", "excel.exe", "outlook.exe", "acrobat.exe")
| filter process_path contains any ("powershell.exe", "cmd.exe", "wscript.exe", "mshta.exe")
| fields TIMESTAMP, hostname, parent_process_path, process_path, process_cmdline`,
      spl: `index=windows sourcetype=WinEventLog:Security EventCode=4688
ParentProcessName IN ("*winword.exe","*excel.exe","*outlook.exe","*acrobat.exe")
NewProcessName IN ("*powershell.exe","*cmd.exe","*wscript.exe","*cscript.exe")
| table _time, host, user, ParentProcessName, NewProcessName, CommandLine`,
    },
  },
  {
    id: 'end-002',
    name: 'Scheduled Task Creation — Persistence',
    description: 'New scheduled tasks created by non-admin users or with suspicious names/actions.',
    category: 'endpoint',
    dataSources: ['Windows Event Log (4698)', 'Sysmon (1)'],
    platforms: {
      kql: `DeviceProcessEvents
| where Timestamp > ago(7d)
| where FileName == "schtasks.exe"
| where ProcessCommandLine contains "/create"
| project Timestamp, DeviceName, ProcessCommandLine, AccountName`,
      xql: `dataset = process_creation
| filter event_type = "PROCESS" and TIMESTAMP > NOW() - 7d
| filter process_path contains "schtasks.exe" and process_cmdline contains "/create"
| fields TIMESTAMP, hostname, user, process_cmdline`,
      spl: `index=windows sourcetype=WinEventLog:Security EventCode=4698
| table _time, host, user, TaskName, Command`,
    },
  },
  {
    id: 'end-003',
    name: 'Service Installation — Suspicious',
    description: 'New Windows services installed by non-approved processes or from temp directories.',
    category: 'endpoint',
    dataSources: ['Windows Event Log (7045)', 'Sysmon'],
    platforms: {
      kql: `DeviceProcessEvents
| where Timestamp > ago(7d)
| where FileName == "sc.exe" and ProcessCommandLine contains "create"
| project Timestamp, DeviceName, ProcessCommandLine, AccountName`,
      xql: `dataset = process_creation
| filter event_type = "PROCESS" and TIMESTAMP > NOW() - 7d
| filter process_path contains "sc.exe" and process_cmdline contains "create"
| fields TIMESTAMP, hostname, process_cmdline, user`,
      spl: `index=windows sourcetype=WinEventLog:System EventCode=7045
| eval threat="New Service Installed"
| table _time, host, ServiceName, ImagePath, AccountName`,
    },
  },
  {
    id: 'end-004',
    name: 'DLL Load Monitoring — Side-Loading',
    description: 'DLLs loaded from non-standard paths by trusted binaries indicating DLL side-loading.',
    category: 'endpoint',
    dataSources: ['Sysmon (7)', 'Windows Event Log'],
    platforms: {
      kql: `DeviceEvents
| where Timestamp > ago(7d)
| where ActionType == "DllLoaded"
| where FolderPath contains "\\Temp\\" or FolderPath contains "\\AppData\\Local\\Temp\\"
| where InitiatingProcessFileName in~ ("svchost.exe", "rundll32.exe", "regsvr32.exe")
| project Timestamp, DeviceName, FileName, FolderPath, InitiatingProcessFileName`,
      xql: `dataset = dll_load
| filter event_type = "DLL_LOAD" and TIMESTAMP > NOW() - 7d
| filter dll_path contains any ("\\Temp\\", "\\AppData\\Local\\Temp\\")
| filter process_name in ("svchost.exe", "rundll32.exe", "regsvr32.exe")
| fields TIMESTAMP, hostname, dll_path, process_name`,
      spl: `index=windows sourcetype=XmlWinEventLog:Microsoft-Windows-Sysmon/Operational EventCode=7
ImageLoaded IN ("*\\Temp\\*", "*\\AppData\\Local\\Temp\\*")
Image IN ("*svchost.exe", "*rundll32.exe", "*regsvr32.exe")
| table _time, host, Image, ImageLoaded`,
    },
  },
  {
    id: 'end-005',
    name: 'Registry Persistence — Run Keys',
    description: 'New or modified auto-run registry keys pointing to unsigned binaries.',
    category: 'endpoint',
    dataSources: ['Sysmon (13)', 'Windows Event Log'],
    platforms: {
      kql: `DeviceEvents
| where Timestamp > ago(7d)
| where ActionType == "RegistryValueSet"
| where RegistryKey contains "\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
| project Timestamp, DeviceName, RegistryKey, RegistryValueName, RegistryValueData`,
      xql: `dataset = registry_event
| filter event_type = "REGISTRY_SET" and TIMESTAMP > NOW() - 7d
| filter registry_key contains "CurrentVersion\\Run"
| fields TIMESTAMP, hostname, registry_key, registry_value, registry_data`,
      spl: `index=windows sourcetype=WinEventLog:Microsoft-Windows-Sysmon/Operational EventCode=13
TargetObject="*CurrentVersion\\Run*"
| table _time, host, TargetObject, Details`,
    },
  },
  {
    id: 'end-006',
    name: 'USB Device Events — Unauthorized',
    description: 'New USB device connections with device IDs not in the approved hardware list.',
    category: 'endpoint',
    dataSources: ['Windows Event Log (6416)', 'Sysmon'],
    platforms: {
      kql: `DeviceEvents
| where Timestamp > ago(7d)
| where ActionType == "UsbDeviceConnected"
| extend DeviceId = tostring(AdditionalFields["DeviceId"])
| project Timestamp, DeviceName, DeviceId, FileName`,
      xql: `dataset = usb_events
| filter event_type = "USB_CONNECT" and TIMESTAMP > NOW() - 7d
| fields TIMESTAMP, hostname, device_id, device_name`,
      spl: `index=windows sourcetype=WinEventLog:Security EventCode=6416
| table _time, host, DeviceId, DeviceDescription`,
    },
  },
  // ── Cloud ──
  {
    id: 'cloud-001',
    name: 'IAM Changes — Privilege Escalation',
    description: 'New IAM roles, policy attachments, or permission grants that could indicate privilege escalation.',
    category: 'cloud',
    dataSources: ['CloudTrail', 'Azure Activity Log'],
    platforms: {
      kql: `AuditLogs
| where OperationName has_any ("Add role", "Create role", "Assign policy", "Update policy")
| where ResultStatus == "success"
| project Timestamp, OperationName, InitiatedBy.user.userPrincipalName, TargetResources`,
      xql: `dataset = cloud_audit
| filter event_type = "CLOUDTRAIL" and TIMESTAMP > NOW() - 7d
| filter operation_name contains any ("CreateRole", "AttachRolePolicy", "PutRolePolicy")
| filter result = "SUCCESS"
| fields TIMESTAMP, user, operation_name, target`,
      spl: `index=aws sourcetype=cloudtrail
eventName IN ("CreateRole", "AttachRolePolicy", "PutRolePolicy", "CreatePolicy")
| eval threat="IAM Privilege Escalation"
| table _time, userIdentity.arn, eventName, requestParameters`,
    },
  },
  {
    id: 'cloud-002',
    name: 'Storage Access — Public/Anomalous',
    description: 'S3/GCS/Azure Blob access from public IPs or anonymous principals outside expected patterns.',
    category: 'cloud',
    dataSources: ['CloudTrail', 'S3 server logs'],
    platforms: {
      kql: `StorageBlobLogs
| where Timestamp > ago(24h)
| where AuthenticationType != "accountkey"
| where StatusCode == 200
| project Timestamp, AccountName, ObjectKey, CallerIpAddress, RequesterObjectId`,
      xql: `dataset = cloud_storage
| filter event_type = "S3_ACCESS" and TIMESTAMP > NOW() - 24h
| filter not auth_type in ("ACCOUNT_KEY", "IAM")
| filter status_code = 200
| fields TIMESTAMP, bucket, object_key, src_ip, user`,
      spl: `index=aws sourcetype=cloudtrail
eventSource="s3.amazonaws.com" userIdentity type="Anonymous"
| eval threat="Anonymous S3 Access"
| table _time, src_ip, bucket, key, eventName`,
    },
  },
  {
    id: 'cloud-003',
    name: 'API Call Spike — Anomalous Volume',
    description: 'Sudden increase in API calls from a single principal or source IP, indicating credential abuse.',
    category: 'cloud',
    dataSources: ['CloudTrail', 'Azure Activity Log'],
    platforms: {
      kql: `AuditLogs
| where Timestamp > ago(6h)
| summarize CallCount = count() by InitiatedBy.user.userPrincipalName, bin(Timestamp, 15m)
| where CallCount > 100`,
      xql: `dataset = cloud_audit
| filter event_type = "CLOUDTRAIL" and TIMESTAMP > NOW() - 6h
| bucket span = 15m
| aggregation count() BY user
| filter count > 100`,
      spl: `index=aws source=cloudtrail
| bin span=15m _time
| stats count as api_calls by userIdentity.arn, _time
| where api_calls > 100`,
    },
  },
  {
    id: 'cloud-004',
    name: 'Configuration Drift — Security Group Changes',
    description: 'Security group, firewall rule, or NSG changes opening ports to 0.0.0.0/0.',
    category: 'cloud',
    dataSources: ['CloudTrail', 'Azure Activity Log', 'GCP Audit Log'],
    platforms: {
      kql: `AuditLogs
| where OperationName has_any ("AuthorizeSecurityGroupIngress", "CreateSecurityGroup")
| where ResultStatus == "success"
| extend RuleJson = tostring(TargetResources[0].modifiedProperties[0].newValue)
| where RuleJson contains "0.0.0.0/0" or RuleJson contains "*"
| project Timestamp, OperationName, InitiatedBy.user.userPrincipalName, RuleJson`,
      xql: `dataset = cloud_audit
| filter event_type = "CLOUDTRAIL" and TIMESTAMP > NOW() - 7d
| filter operation_name contains any ("AuthorizeSecurityGroupIngress", "RevokeSecurityGroupEgress")
| filter request_parameters contains "0.0.0.0/0"
| fields TIMESTAMP, user, operation_name, request_parameters`,
      spl: `index=aws sourcetype=cloudtrail
eventName IN ("AuthorizeSecurityGroupIngress", "RevokeSecurityGroupEgress")
requestParameters.ipPermissions.items{}.ipRanges{}.cidrIp="0.0.0.0/0"
| table _time, userIdentity.arn, eventName, requestParameters`,
    },
  },
  {
    id: 'cloud-005',
    name: 'VPC Changes — Network Hijacking',
    description: 'Modifications to VPC route tables, peering connections, or VPN attachments.',
    category: 'cloud',
    dataSources: ['CloudTrail', 'VPC Flow Logs'],
    platforms: {
      kql: `AuditLogs
| where OperationName has_any ("CreateVpcPeering", "ModifyVpcAttribute", "CreateRoute", "ReplaceRoute")
| where ResultStatus == "success"
| project Timestamp, OperationName, InitiatedBy.user.userPrincipalName, TargetResources`,
      xql: `dataset = cloud_audit
| filter event_type = "CLOUDTRAIL" and TIMESTAMP > NOW() - 7d
| filter operation_name contains any ("CreateVpcPeering", "ModifyVpcAttribute", "CreateRoute")
| filter result = "SUCCESS"
| fields TIMESTAMP, user, operation_name, target`,
      spl: `index=aws sourcetype=cloudtrail
eventName IN ("CreateVpcPeering", "ModifyVpcAttribute", "CreateRoute", "ReplaceRoute")
| eval threat="VPC Configuration Change"
| table _time, userIdentity.arn, eventName, sourceIPAddress`,
    },
  },
  {
    id: 'cloud-006',
    name: 'Key Rotation Failures — Crypto Doom',
    description: 'Failed KMS key rotation, disabled keys used for decryption, or deleted key material.',
    category: 'cloud',
    dataSources: ['CloudTrail', 'AWS KMS logs'],
    platforms: {
      kql: `AuditLogs
| where OperationName has_any ("DisableKey", "ScheduleKeyDeletion", "CancelKeyDeletion")
| where ResultStatus == "success"
| project Timestamp, OperationName, InitiatedBy.user.userPrincipalName, TargetResources`,
      xql: `dataset = cloud_audit
| filter event_type = "CLOUDTRAIL" and TIMESTAMP > NOW() - 30d
| filter operation_name contains any ("DisableKey", "ScheduleKeyDeletion")
| filter result = "SUCCESS"
| fields TIMESTAMP, user, operation_name, target`,
      spl: `index=aws sourcetype=cloudtrail
eventName IN ("DisableKey", "ScheduleKeyDeletion", "CancelKeyDeletion")
| eval threat="KMS Key Operation"
| table _time, userIdentity.arn, eventName, requestParameters`,
    },
  },
];

const CATEGORY_ORDER: CategoryId[] = ['auth', 'network', 'endpoint', 'cloud'];

export default function Quicktrace(): JSX.Element {
  const [category, setCategory] = useState<CategoryId>('auth');
  const [platform, setPlatform] = useState<PlatformId>('kql');
  const [search, setSearch] = useState('');

  const categoryQueries = useMemo(() => {
    const catFiltered = ALL_QUERIES.filter((q) => q.category === category);
    if (!search.trim()) return catFiltered;
    const q = search.toLowerCase();
    return catFiltered.filter(
      (query) =>
        query.name.toLowerCase().includes(q) ||
        query.description.toLowerCase().includes(q) ||
        query.dataSources.some((d) => d.toLowerCase().includes(q))
    );
  }, [category, search]);

  const totalQueries = ALL_QUERIES.length;
  const totalAuth = ALL_QUERIES.filter((q) => q.category === 'auth').length;
  const totalNet = ALL_QUERIES.filter((q) => q.category === 'network').length;
  const totalEnd = ALL_QUERIES.filter((q) => q.category === 'endpoint').length;
  const totalCloud = ALL_QUERIES.filter((q) => q.category === 'cloud').length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <Zap size={28} className="text-brand-600 dark:text-brand-400" /> QUICKTRACE
        </h1>
        <p className="text-muted max-w-2xl leading-relaxed">
          Daily triage queries across authentication, network, endpoint, and cloud — ready to paste into Sentinel, XQL,
          or Splunk.
          <span className="text-slate-500"> {totalQueries} queries across 4 domains</span>
        </p>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-1 mb-5 border-b border-slate-200 dark:border-[rgb(var(--border-400))] pb-0">
        {CATEGORY_ORDER.map((cat) => {
          const Icon = CATEGORY_META[cat].icon;
          const counts: Record<CategoryId, number> = {
            auth: totalAuth,
            network: totalNet,
            endpoint: totalEnd,
            cloud: totalCloud,
          };
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-2 text-xs font-mono font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                category === cat
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'
              }`}
            >
              <Icon size={12} />
              {CATEGORY_META[cat].label} ({counts[cat]})
            </button>
          );
        })}
      </div>

      {/* Platform Tabs */}
      <div className="flex flex-wrap gap-1 mb-5">
        {(Object.entries(PLATFORM_LABELS) as [PlatformId, string][]).map(([pid, label]) => (
          <button
            key={pid}
            onClick={() => setPlatform(pid)}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono border transition-colors ${
              platform === pid
                ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-brand-500/30'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${CATEGORY_META[category].label.toLowerCase()} queries…`}
          className="w-full pl-9 pr-3 h-10 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
        />
      </div>

      {/* Count */}
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-4 font-mono">
        {categoryQueries.length} {CATEGORY_META[category].label.toLowerCase()} queries ({platform.toUpperCase()})
      </div>

      {/* Query cards */}
      {categoryQueries.length === 0 ? (
        <div className="surface-card/40 shadow-e1 p-8 text-center">
          <AlertTriangle size={24} className="mx-auto mb-2 text-slate-400" />
          <p className="text-sm text-slate-500">No queries match your filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {categoryQueries.map((query) => (
            <div key={query.id} className="surface-card/40 shadow-e1 p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-sm font-semibold">{query.name}</h3>
                    <span className={`text-micro font-mono px-1.5 py-0.5 rounded ${CATEGORY_BG[query.category]}`}>
                      {CATEGORY_META[query.category].label}
                    </span>
                  </div>
                  <p className="text-xs text-muted">{query.description}</p>
                </div>
                <CopyButton value={query.platforms[platform] ?? 'No query available for this platform'} />
              </div>
              {/* Data source tags */}
              <div className="flex flex-wrap gap-1 mb-3">
                {query.dataSources.map((ds) => (
                  <span
                    key={ds}
                    className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-500 dark:text-slate-400"
                  >
                    {ds}
                  </span>
                ))}
              </div>
              {/* Query code */}
              <pre className="bg-slate-50 dark:bg-[rgb(var(--input-200))] rounded-xl p-4 overflow-x-auto text-xs text-slate-700 dark:text-slate-300 font-mono border border-slate-200 dark:border-[rgb(var(--border-400))] whitespace-pre-wrap">
                {query.platforms[platform] ?? (
                  <span className="text-slate-400 italic">Not available for {platform.toUpperCase()}</span>
                )}
              </pre>
            </div>
          ))}
        </div>
      )}

      {/* Summary footer */}
      <div className="mt-8 surface-card/40 shadow-e1 p-4 text-center text-xs text-slate-500 dark:text-slate-400 font-mono">
        {totalQueries} queries across 4 domains · {totalAuth} authentication · {totalNet} network · {totalEnd} endpoint
        · {totalCloud} cloud
      </div>
    </div>
  );
}

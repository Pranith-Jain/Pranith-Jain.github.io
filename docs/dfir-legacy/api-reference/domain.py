import asyncio
import aiohttp
import socket
import ssl
import re
from typing import Dict, Any, List, Optional
from datetime import datetime
import whois
import dns.resolver
from urllib.parse import urlparse

class DomainChecker:
    def __init__(self):
        self.resolver = dns.resolver.Resolver()
        self.resolver.timeout = 5
        self.resolver.lifetime = 10
        self.resolver.nameservers = ['8.8.8.8', '8.8.4.4']
    
    async def check_domain(self, domain: str) -> Dict[str, Any]:
        domain = domain.strip().lower()
        if domain.startswith(('http://', 'https://')):
            domain = urlparse(domain).netloc
        
        results = await asyncio.gather(
            self.get_whois(domain),
            self.get_dns_records(domain),
            self.get_mx_records(domain),
            self.get_spf_record(domain),
            self.get_dkim_selectors(domain),
            self.get_dmarc_record(domain),
            self.check_ssl(domain),
            self.check_dnssec(domain),
            self.check_email_security(domain),
            self.check_bimi(domain),
            self.check_mta_sts(domain),
            self.check_tls_rpt(domain),
            self.check_dane(domain),
            self.check_blacklist(domain),
            return_exceptions=True
        )
        
        whois_data, dns_records, mx_records, spf_record, dkim_info, dmarc_record, ssl_info, dnssec_info, email_security, bimi, mta_sts, tls_rpt, dane, blacklist = results
        
        if isinstance(whois_data, Exception):
            whois_data = {"error": str(whois_data)}
        if isinstance(dns_records, Exception):
            dns_records = {"error": str(dns_records)}
        
        score = self.calculate_security_score(email_security, ssl_info, dnssec_info, dmarc_record, bimi, mta_sts, tls_rpt, dane, blacklist)
        
        return {
            "domain": domain,
            "score": score,
            "generated": datetime.utcnow().isoformat() + "Z",
            "health_score": f"{score}/100",
            "processing_time_ms": 0,
            "whois": whois_data,
            "dns": dns_records,
            "mx": mx_records,
            "spf": spf_record,
            "dkim": dkim_info,
            "dmarc": dmarc_record,
            "ssl": ssl_info,
            "dnssec": dnssec_info,
            "email_security": email_security,
            "bimi": bimi,
            "mta_sts": mta_sts,
            "tls_rpt": tls_rpt,
            "dane": dane,
            "blacklist": blacklist,
            "verdict": "secure" if score >= 70 else "warning" if score >= 40 else "insecure"
        }
    
    async def get_whois(self, domain: str) -> Dict[str, Any]:
        try:
            w = whois.whois(domain)
            return {
                "registrar": w.registrar,
                "creation_date": str(w.creation_date) if w.creation_date else None,
                "expiration_date": str(w.expiration_date) if w.expiration_date else None,
                "updated_date": str(w.updated_date) if w.updated_date else None,
                "name_servers": w.name_servers if w.name_servers else [],
                "status": w.status if w.status else [],
                "emails": w.emails if w.emails else [],
                "country": getattr(w, 'country', None),
                "org": getattr(w, 'org', None)
            }
        except Exception as e:
            return {"error": str(e)}
    
    async def get_dns_records(self, domain: str) -> Dict[str, Any]:
        record_types = ['A', 'AAAA', 'NS', 'TXT', 'CNAME', 'SOA', 'CAA']
        results = {}
        
        for record_type in record_types:
            try:
                answers = self.resolver.resolve(domain, record_type)
                results[record_type] = [str(r) for r in answers]
            except dns.resolver.NXDOMAIN:
                results[record_type] = []
            except dns.resolver.NoAnswer:
                results[record_type] = []
            except Exception as e:
                results[record_type] = []
        
        return results
    
    async def get_mx_records(self, domain: str) -> Dict[str, Any]:
        try:
            import subprocess
            import re
            
            mx_list = []
            dns_servers = ['1.1.1.1', '8.8.8.8']
            
            for dns_server in dns_servers:
                try:
                    result = subprocess.run(
                        ['dig', f'@{dns_server}', domain, 'MX', '+noall', '+answer'],
                        capture_output=True, text=True, timeout=5
                    )
                    
                    # Parse: google.com. 227 IN MX 10 smtp.google.com.
                    pattern = r'(\S+)\.\s+\d+\s+IN\s+MX\s+(\d+)\s+(\S+)\.'
                    matches = re.findall(pattern, result.stdout)
                    
                    for match in matches:
                        try:
                            priority = int(match[1])
                            host = match[2].rstrip('.')
                            mx_list.append({"priority": priority, "host": host})
                        except (ValueError, IndexError):
                            continue
                    
                    if mx_list:
                        break
                except:
                    continue
            
            # Remove duplicates preserving order
            seen = set()
            unique_mx = []
            for mx in mx_list:
                if mx["host"] not in seen:
                    seen.add(mx["host"])
                    unique_mx.append(mx)
            mx_list = unique_mx
            mx_list.sort(key=lambda x: x["priority"])
            
            return {
                "records": mx_list,
                "found": len(mx_list) > 0
            }
        except Exception as e:
            return {"records": [], "found": False, "error": str(e)}
    
    async def _get_mx_records_fallback(self, domain: str) -> Dict[str, Any]:
        try:
            answers = self.resolver.resolve(domain, 'MX')
            mx_list = []
            for rdata in answers:
                mx_str = str(rdata)
                mx_list.append({"priority": 10, "host": mx_str.rstrip('.')})
            return {"records": mx_list, "found": len(mx_list) > 0}
        except Exception as e:
            return {"records": [], "found": False, "error": str(e)}
    
    async def get_spf_record(self, domain: str) -> Dict[str, Any]:
        try:
            answers = self.resolver.resolve(domain, 'TXT')
            for rdata in answers:
                txt = str(rdata).strip('"')
                if txt.startswith('v=spf1'):
                    return self.parse_spf_record(txt)
            return {"found": False, "record": None}
        except dns.resolver.NoAnswer:
            return {"found": False, "record": None}
        except Exception as e:
            return {"found": False, "error": str(e)}
    
    def parse_spf_record(self, txt: str) -> Dict[str, Any]:
        parts = txt.split()
        mechanisms = []
        qualifiers = {}
        
        for part in parts[1:]:
            if part.startswith('+') or part.startswith('-') or part.startswith('~'):
                qualifiers[part[0]] = part[1:]
            elif '=' in part:
                key, value = part.split('=', 1)
                mechanisms.append({key: value})
                if key == 'redirect':
                    qualifiers['redirect'] = value
        
        all_count = txt.count('all')
        if '+all' in txt:
            policy = "pass-all (insecure)"
        elif '-all' in txt:
            policy = "fail (secure)"
        elif '~all' in txt:
            policy = "softfail (neutral)"
        else:
            policy = "none"
        
        lookup_count = txt.count('include:') + txt.count('a:') + txt.count('mx:')
        
        return {
            "found": True,
            "record": txt[:255],
            "policy": policy,
            "mechanisms": mechanisms,
            "mechanisms_count": len(mechanisms),
            "lookup_count": lookup_count,
            "lookup_limit_exceeded": lookup_count > 10
        }
    
    async def get_dkim_selectors(self, domain: str) -> List[Dict[str, Any]]:
        dkim_selectors = [
            ('default', 'Default'),
            ('google', 'Google Workspace'),
            ('google2', 'Google Workspace 2'),
            ('dkim', 'Generic DKIM'),
            ('mail', 'Mail'),
            ('selector1', 'Selector 1'),
            ('selector2', 'Selector 2'),
            ('mxvault', 'MXVault'),
            ('s1', 'SendGrid'),
            ('s2', 'SendGrid 2'),
            ('mg', 'Mailgun'),
            ('mailjet', 'Mailjet'),
            ('ovh', 'OVH'),
            ('zendesk1', 'Zendesk'),
            ('zendesk2', 'Zendesk 2'),
            ('zohocorp', 'Zoho Mail'),
            ('zoho1', 'Zoho 1'),
            ('zoho2', 'Zoho 2'),
            ('mkto', 'Marketo'),
            ('sig1', 'Apple iCloud'),
            ('sig2', 'Apple iCloud 2'),
            ('protonmail', 'ProtonMail'),
            ('proton', 'Proton'),
            ('ac', 'ActiveCampaign'),
            ('kl', 'Klaviyo'),
            ('pm', 'Postmark'),
            ('fm1', 'Fastmail'),
            ('gandi', 'Gandi'),
            ('bh', 'Bluehost'),
            ('dh', 'DreamHost'),
            ('zcsend', 'Zoho Campaigns'),
            ('sp', 'SendPulse'),
            ('ee', 'Elastic Email'),
            ('ml', 'MailerLite'),
            ('ck', 'ConvertKit'),
            ('gr', 'GetResponse'),
            ('zcrm', 'Zoho CRM'),
            ('mr', 'Mailrelay'),
            ('omni', 'Omnisend'),
            ('ms', 'MailerSend'),
            ('mailo', 'TierPeak CRM'),
            ('systemeio1', 'Systeme.io 1'),
            ('systemeio2', 'Systeme.io 2'),
            ('hse', 'HornetSecurity'),
            ('hse1', 'HornetSecurity 1'),
            ('hse2', 'HornetSecurity 2'),
            ('amazonses', 'Amazon SES'),
            ('amazonses2', 'Amazon SES 2'),
            ('office', 'Microsoft Office 365'),
            ('outlook', 'Outlook'),
            ('mimecast', 'Mimecast'),
            ('proofpoint', 'Proofpoint'),
            ('cisco', 'Cisco'),
            ('m365', 'Microsoft 365'),
            ('dmarc', 'DMARC'),
            ('yahoo', 'Yahoo'),
            ('icloud', 'iCloud'),
            ('hubspot', 'HubSpot'),
            ('salesforce', 'Salesforce'),
            ('mandrill', 'Mandrill'),
            ('sendgrid', 'SendGrid Full'),
            ('amavis', 'Amavis'),
            ('co', 'Cloudflare'),
            ('cloudflare', 'Cloudflare'),
            ('vali', 'Valimail'),
            ('returnkey', 'Return Path'),
            ('tx', 'Twilio SendGrid'),
            ('sparkpost', 'SparkPost'),
            ('sailthru', 'Sailthru'),
            ('k谢谢你', 'Customer'),
            ('google1', 'Google 1'),
            ('yahoo1', 'Yahoo 1'),
        ]
        
        selectors = []
        
        for sel, provider in dkim_selectors:
            try:
                selector_domain = f"{sel}._domainkey.{domain}"
                answers = self.resolver.resolve(selector_domain, 'TXT')
                for rdata in answers:
                    txt = str(rdata).strip('"')
                    if txt:
                        selectors.append({
                            "selector": sel,
                            "provider": provider,
                            "record": txt[:255],
                            "found": True
                        })
                        break
            except:
                continue
        
        return selectors if selectors else [{"selector": "default", "provider": "Unknown", "found": False}]
    
    async def get_dmarc_record(self, domain: str) -> Dict[str, Any]:
        try:
            answers = self.resolver.resolve(f"_dmarc.{domain}", 'TXT')
            for rdata in answers:
                txt = str(rdata).strip('"')
                return self.parse_dmarc_record(txt)
            return {"found": False}
        except dns.resolver.NoAnswer:
            return {"found": False, "record": None}
        except Exception as e:
            return {"found": False, "error": str(e)}
    
    def parse_dmarc_record(self, txt: str) -> Dict[str, Any]:
        parts = txt.split(';')
        record = {"found": True, "record": txt}
        
        for part in parts:
            part = part.strip()
            if '=' in part:
                key, value = part.split('=', 1)
                record[key.strip()] = value.strip()
        
        policy = record.get('p', 'none')
        record["policy_level"] = "secure" if policy == "reject" else "warning" if policy == "quarantine" else "insecure"
        
        return record
    
    async def check_ssl(self, domain: str) -> Dict[str, Any]:
        try:
            context = ssl.create_default_context()
            
            try:
                with socket.create_connection((domain, 443), timeout=5) as sock:
                    with context.wrap_socket(sock, server_hostname=domain) as ssock:
                        cert = ssock.getpeercert()
                        return {
                            "valid": True,
                            "issuer": dict(x[0] for x in cert.get('issuer', [])),
                            "subject": dict(x[0] for x in cert.get('subject', [])),
                            "version": cert.get('version'),
                            "not_before": cert.get('notBefore'),
                            "not_after": cert.get('notAfter'),
                            "san": cert.get('subjectAltName', []),
                            "protocol": ssock.version()
                        }
            except socket.timeout:
                return {"valid": False, "error": "Connection timeout"}
            except ConnectionRefusedError:
                return {"valid": False, "error": "Connection refused"}
        except Exception as e:
            return {"valid": False, "error": str(e)}
    
    async def check_dnssec(self, domain: str) -> Dict[str, Any]:
        try:
            answers = self.resolver.resolve(domain, 'DS')
            ds_records = [str(r) for r in answers]
            return {
                "enabled": True,
                "ds_records": ds_records
            }
        except dns.resolver.NoAnswer:
            return {"enabled": False, "ds_records": []}
        except:
            return {"enabled": False}
    
    async def check_email_security(self, domain: str) -> Dict[str, Any]:
        try:
            spf = await self.get_spf_record(domain)
            dmarc = await self.get_dmarc_record(domain)
            mx = await self.get_mx_records(domain)
            
            checks = {
                "spf": spf.get("found", False),
                "dmarc": dmarc.get("found", False),
                "mx_found": mx.get("found", False),
                "has_mx": mx.get("found", False),
                "spf_secure": spf.get("policy") in ["fail (secure)", "softfail (neutral)"],
                "dmarc_secure": dmarc.get("policy") in ["reject", "quarantine"],
                "issues": []
            }
            
            if not checks["mx_found"]:
                checks["issues"].append("No MX records - domain may not accept email")
            if not checks["spf"]:
                checks["issues"].append("Missing SPF record")
            if not checks["dmarc"]:
                checks["issues"].append("Missing DMARC record")
            
            spf_lookup = spf.get("lookup_limit_exceeded", False)
            if spf_lookup:
                checks["issues"].append("SPF lookup limit exceeded (10+ includes)")
            
            return checks
        except Exception as e:
            return {"error": str(e)}
    
    def calculate_security_score(self, email_security: Dict, ssl_info: Dict, dnssec_info: Dict, dmarc_info: Dict, bimi: Dict = None, mta_sts: Dict = None, tls_rpt: Dict = None, dane: Dict = None, blacklist: List = None) -> int:
        score = 0
        
        if email_security.get("spf"):
            score += 12
        if email_security.get("dmarc"):
            score += 12
        if email_security.get("has_mx"):
            score += 8
        if email_security.get("spf_secure"):
            score += 8
        if email_security.get("dmarc_secure"):
            score += 10
        
        if ssl_info.get("valid"):
            score += 10
        
        if dnssec_info.get("enabled"):
            score += 5
        
        if bimi and bimi.get("found"):
            score += 3
        if mta_sts and mta_sts.get("found"):
            score += 4
        if tls_rpt and tls_rpt.get("found"):
            score += 3
        if dane and dane.get("found"):
            score += 3
        
        # Blacklist penalty
        if blacklist:
            listed_count = len([x for x in blacklist if x.get("listed")])
            if listed_count > 0:
                score -= listed_count * 15
            else:
                score += 7  # Not blacklisted bonus
        
        return max(0, min(score, 100))
        
        if dnssec_info.get("enabled"):
            score += 8
        
        if bimi and bimi.get("found"):
            score += 5
        if mta_sts and mta_sts.get("found"):
            score += 7
        if tls_rpt and tls_rpt.get("found"):
            score += 5
        if dane and dane.get("found"):
            score += 5
        
        return min(score, 100)

    async def check_bimi(self, domain: str) -> Dict[str, Any]:
        try:
            answers = self.resolver.resolve(f"default._bimi.{domain}", 'TXT')
            for rdata in answers:
                txt = str(rdata).strip('"')
                if txt.startswith('v=BIMI1'):
                    return {"found": True, "record": txt}
            return {"found": False}
        except:
            return {"found": False}

    async def check_mta_sts(self, domain: str) -> Dict[str, Any]:
        try:
            answers = self.resolver.resolve(f"_mta-sts.{domain}", 'TXT')
            for rdata in answers:
                txt = str(rdata).strip('"')
                if txt.startswith('v=STSw1'):
                    policy_version = None
                    max_age = None
                    policy = None
                    for part in txt.split(';'):
                        if '=' in part:
                            k, v = part.strip().split('=', 1)
                            if k == 'v':
                                policy_version = v
                            elif k == 'mx':
                                max_age = v
                            elif k == 'policy':
                                policy = v
                    return {
                        "found": True,
                        "record": txt,
                        "version": policy_version,
                        "max_age": max_age,
                        "policy": policy
                    }
            return {"found": False}
        except:
            return {"found": False}

    async def check_tls_rpt(self, domain: str) -> Dict[str, Any]:
        try:
            answers = self.resolver.resolve(f"_tls-rpt.{domain}", 'TXT')
            for rdata in answers:
                txt = str(rdata).strip('"')
                if txt.startswith('v=TLSRPTw1'):
                    return {"found": True, "record": txt}
            return {"found": False}
        except:
            return {"found": False}

    async def check_dane(self, domain: str) -> Dict[str, Any]:
        try:
            answers = self.resolver.resolve(f"_25._tcp.{domain}", 'TLSA')
            records = []
            for rdata in answers:
                records.append(str(rdata))
            if records:
                return {"found": True, "records": records}
            return {"found": False}
        except:
            return {"found": False}

    async def check_blacklist(self, domain: str) -> List[Dict[str, Any]]:
        blacklist_results = []
        
        # Get domain IPs
        try:
            domain_ips = []
            try:
                answers = self.resolver.resolve(domain, 'A')
                domain_ips = [str(r) for r in answers]
            except:
                pass
            
            # Also get MX server IPs
            mx_ips = []
            try:
                mx = await self.get_mx_records(domain)
                for mx_record in mx.get("records", []):
                    try:
                        answers = self.resolver.resolve(mx_record["host"], 'A')
                        mx_ips.extend([str(r) for r in answers])
                    except:
                        pass
            except:
                pass
            
            all_ips = list(set(domain_ips + mx_ips))
            
            # Check IPs against blacklist APIs
            for ip in all_ips[:5]:
                bl_result = await self._check_ip_blacklist(ip)
                if bl_result["listed"]:
                    blacklist_results.append(bl_result)
                    
        except Exception as e:
            pass
        
        return blacklist_results
    
    async def _check_ip_blacklist(self, ip: str) -> Dict[str, Any]:
        result = {
            "ip": ip,
            "listed": False,
            "blacklists": []
        }
        
        # Simple DNS-based blacklist check
        blacklist_zones = [
            "zen.spamhaus.org",
            "b.barracudacentral.org",
            "bl.spamcop.net",
        ]
        
        try:
            import socket
            reversed_ip = '.'.join(reversed(ip.split('.')))
            
            for bl_zone in blacklist_zones:
                try:
                    host = f"{reversed_ip}.{bl_zone}"
                    socket.gethostbyname(host)
                    result["listed"] = True
                    result["blacklists"].append(bl_zone)
                except socket.gaierror:
                    pass
        except:
            pass
        
        return result


class ExposureScanner:
    def __init__(self):
        self.resolver = dns.resolver.Resolver()
        self.resolver.timeout = 5
        self.resolver.lifetime = 10
    
    async def scan(self, domain: str) -> Dict[str, Any]:
        domain = domain.strip().lower()
        if domain.startswith(('http://', 'https://')):
            domain = urlparse(domain).netloc
        
        results = await asyncio.gather(
            self.enumerate_subdomains(domain),
            self.scan_common_ports(domain),
            self.check_cdn_detection(domain),
            return_exceptions=True
        )
        
        subdomains, ports, cdn_info = results
        
        return {
            "domain": domain,
            "subdomains": subdomains,
            "open_ports": ports,
            "cdn": cdn_info,
            "attack_surface_score": self.calculate_attack_surface_score(ports, subdomains)
        }
    
    async def enumerate_subdomains(self, domain: str) -> List[str]:
        common_subs = ['www', 'mail', 'ftp', 'localhost', 'webmail', 'smtp', 'pop', 'ns1', 'webdisk', 
                    'ns2', 'oaut', 'oauth', 'docs', 'm', 'blog', 'pop3', 'dev', 'www2', 'admin',
                    'forum', 'news', 'vpn', 'ns3', 'test', 'mx1', 'mx2', 'email', 'cvs', 'gitlab',
                    'jenkins', 'prod', 'qa', 'stage', 'cdn', 'static', 'assets', 'backup', 'mail2']
        
        found = []
        
        async def check_sub(sub):
            try:
                full_domain = f"{sub}.{domain}"
                self.resolver.resolve(full_domain, 'A')
                return full_domain
            except:
                return None
        
        results = await asyncio.gather(*[check_sub(s) for s in common_subs])
        found = [r for r in results if r]
        
        return found
    
    async def scan_common_ports(self, domain: str) -> Dict[str, Any]:
        ports = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 465, 587, 993, 995, 3306, 3389, 5432, 8080, 8443, 27017]
        port_names = {
            21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS",
            80: "HTTP", 110: "POP3", 143: "IMAP", 443: "HTTPS", 445: "SMB",
            465: "SMTPS", 587: "Submission", 993: "IMAPS", 995: "POP3S",
            3306: "MySQL", 3389: "RDP", 5432: "PostgreSQL",
            8080: "HTTP-Alt", 8443: "HTTPS-Alt", 27017: "MongoDB"
        }
        
        open_ports = []
        closed_ports = []
        
        async def check_port(port):
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(2)
                result = sock.connect_ex((domain, port))
                sock.close()
                return port, result == 0
            except:
                return port, False
        
        results = await asyncio.gather(*[check_port(p) for p in ports])
        
        for port, is_open in results:
            if is_open:
                open_ports.append({"port": port, "service": port_names.get(port, "Unknown")})
            else:
                closed_ports.append(port)
        
        return {
            "open": open_ports,
            "open_count": len(open_ports),
            "risky_services": [p for p in open_ports if p["service"] in ["Telnet", "FTP", "SMB", "RDP", "MySQL", "PostgreSQL", "MongoDB"]]
        }
    
    async def check_cdn_detection(self, domain: str) -> Dict[str, Any]:
        try:
            answers = self.resolver.resolve(domain, 'A')
            ip = str(answers[0]).strip()
            
            cdn_ips = {
                'Cloudflare': ['104.', '172.', '131.', '172.64.', '172.65.', '172.66.', '172.67.', '172.68.', '172.69.', '103.', '2606:'],
                'AWS': ['54.', '52.', '50.', '44.', '18.', '3.', '52.'],
                'Azure': ['20.', '40.', '13.', '52.', '23.'],
                'Google': ['142.250', '172.217', '216.', '74.125.', '108.'],
                'Fastly': ['23.', '151.', '199.'],
            }
            
            for cdn, prefixes in cdn_ips.items():
                for prefix in prefixes:
                    if ip.startswith(prefix):
                        return {"cdn": cdn, "ip": ip}
            
            return {"cdn": "None/Self-hosted", "ip": ip}
        except Exception as e:
            return {"error": str(e)}
    
    def calculate_attack_surface_score(self, ports: Dict, subdomains: List) -> str:
        risky = len(ports.get("risky_services", []))
        sub_count = len(subdomains)
        
        if risky > 3 or sub_count > 10:
            return "high"
        elif risky > 0 or sub_count > 3:
            return "medium"
        return "low"


class FileAnalyzer:
    def __init__(self):
        pass
    
    async def analyze_hash(self, hash_value: str) -> Dict[str, Any]:
        hash_value = hash_value.strip().lower()
        
        if len(hash_value) == 32:
            hash_type = "md5"
        elif len(hash_value) == 40:
            hash_type = "sha1"
        elif len(hash_value) == 64:
            hash_type = "sha256"
        else:
            return {"error": "Invalid hash length"}
        
        return {
            "hash": hash_value,
            "type": hash_type,
            "verdict": "unknown",
            "detection_ratio": 0,
            "total_engines": 0,
            "tags": [],
            "first_seen": None,
            "sources": []
        }
    
    async def analyze_file_upload(self, file_data: bytes, filename: str) -> Dict[str, Any]:
        import hashlib
        
        md5 = hashlib.md5(file_data).hexdigest()
        sha1 = hashlib.sha1(file_data).hexdigest()
        sha256 = hashlib.sha256(file_data).hexdigest()
        
        import magic
        mime = magic.from_buffer(file_data[:1024], mime=True)
        
        suspicious_extensions = ['.exe', '.scr', '.bat', '.vbs', '.js', '.jar', '.com', '.pif', '.msi', '.hta']
        
        return {
            "filename": filename,
            "size": len(file_data),
            "mime_type": mime,
            "md5": md5,
            "sha1": sha1,
            "sha256": sha256,
            "suspicious_extension": any(filename.endswith(ext) for ext in suspicious_extensions),
            "verdict": "requires-upload",
            "recommendation": "Upload to sandbox for analysis"
        }
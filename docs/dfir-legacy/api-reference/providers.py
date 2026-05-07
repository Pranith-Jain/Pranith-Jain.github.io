import os
import asyncio
import aiohttp
from typing import Optional, List, Dict, Any
from abc import ABC, abstractmethod

class ThreatIntelProvider(ABC):
    def __init__(self, name: str, api_key: Optional[str] = None):
        self.name = name
        self.api_key = api_key or os.getenv(f"{name.upper()}_API_KEY")
    
    @abstractmethod
    async def check_ip(self, ip: str) -> Dict[str, Any]:
        pass
    
    @abstractmethod
    async def check_domain(self, domain: str) -> Dict[str, Any]:
        pass
    
    @abstractmethod
    async def check_hash(self, hash_value: str) -> Dict[str, Any]:
        pass

class VirusTotalProvider(ThreatIntelProvider):
    def __init__(self, api_key: Optional[str] = None):
        super().__init__("virustotal", api_key or os.getenv("VIRUSTOTAL_API_KEY"))
        self.base_url = "https://www.virustotal.com/api/v3"
    
    async def _request(self, endpoint: str) -> Dict[str, Any]:
        if not self.api_key:
            return {"error": "No API key"}
        headers = {"x-apikey": self.api_key}
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(f"{self.base_url}{endpoint}", headers=headers) as resp:
                    return await resp.json() if resp.status == 200 else {"error": f"Status {resp.status}"}
            except Exception as e:
                return {"error": str(e)}
    
    async def check_ip(self, ip: str) -> Dict[str, Any]:
        result = await self._request(f"/ip_addresses/{ip}")
        data = result.get("data", {})
        attributes = data.get("attributes", {})
        last_analysis = attributes.get("last_analysis_stats", {})
        return {
            "provider": "VirusTotal",
            "malicious": attributes.get("last_analysis_results", {}).get("malicious", 0),
            "suspicious": last_analysis.get("suspicious", 0),
            "harmless": last_analysis.get("harmless", 0),
            "undetected": last_analysis.get("undetected", 0),
            "total": sum(last_analysis.values()),
            "country": attributes.get("country", {}),
            "tags": attributes.get("tags", [])
        }
    
    async def check_domain(self, domain: str) -> Dict[str, Any]:
        result = await self._request(f"/domains/{domain}")
        data = result.get("data", {})
        attributes = data.get("attributes", {})
        last_analysis = attributes.get("last_analysis_stats", {})
        return {
            "provider": "VirusTotal",
            "malicious": attributes.get("last_analysis_results", {}).get("malicious", 0),
            "suspicious": last_analysis.get("suspicious", 0),
            "harmless": last_analysis.get("harmless", 0),
            "undetected": last_analysis.get("undetected", 0),
            "total": sum(last_analysis.values()),
            "tags": attributes.get("tags", [])
        }
    
    async def check_hash(self, hash_value: str) -> Dict[str, Any]:
        result = await self._request(f"/files/{hash_value}")
        data = result.get("data", {})
        attributes = data.get("attributes", {})
        last_analysis = attributes.get("last_analysis_stats", {})
        return {
            "provider": "VirusTotal",
            "malicious": attributes.get("last_analysis_results", {}).get("malicious", 0),
            "suspicious": last_analysis.get("suspicious", 0),
            "harmless": last_analysis.get("harmless", 0),
            "undetected": last_analysis.get("undetected", 0),
            "total": sum(last_analysis.values()),
            "meaningful_name": attributes.get("meaningful_name", ""),
            "first_submitted": attributes.get("first_submitted", "")
        }

class AbuseIPDBProvider(ThreatIntelProvider):
    def __init__(self, api_key: Optional[str] = None):
        super().__init__("abuseipdb", api_key or os.getenv("ABUSEIPDB_API_KEY"))
        self.base_url = "https://api.abuseipdb.com/api/v2"
    
    async def _request(self, endpoint: str, params: Dict = None) -> Dict[str, Any]:
        if not self.api_key:
            return {"error": "No API key"}
        headers = {"Key": self.api_key, "Accept": "application/json"}
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(f"{self.base_url}{endpoint}", params=params or {}, headers=headers) as resp:
                    return await resp.json() if resp.status == 200 else {"error": f"Status {resp.status}"}
            except Exception as e:
                return {"error": str(e)}
    
    async def check_ip(self, ip: str) -> Dict[str, Any]:
        params = {"ipAddress": ip, "maxAgeInDays": 90, "verbose": ""}
        result = await self._request("/check", params)
        data = result.get("data", {})
        return {
            "provider": "AbuseIPDB",
            "abuse_confidence_score": data.get("abuseConfidenceScore", 0),
            "ip_address": data.get("ipAddress", ip),
            "is_public": data.get("isPublic", False),
            "is_whitelisted": data.get("isWhitelisted", False),
            "usage_type": data.get("usageType", ""),
            "isp": data.get("isp", ""),
            "domain": data.get("domain", ""),
            "country_code": data.get("countryCode", ""),
            "reports": data.get("totalReports", 0),
            "num_days": data.get("numDaysReported", 0)
        }
    
    async def check_domain(self, domain: str) -> Dict[str, Any]:
        return {"provider": "AbuseIPDB", "error": "Domain check not supported"}
    
    async def check_hash(self, hash_value: str) -> Dict[str, Any]:
        return {"provider": "AbuseIPDB", "error": "Hash check not supported"}

class ShodanProvider(ThreatIntelProvider):
    def __init__(self, api_key: Optional[str] = None):
        super().__init__("shodan", api_key or os.getenv("SHODAN_API_KEY"))
        self.base_url = "https://api.shodan.io"
    
    async def _request(self, endpoint: str, params: Dict = None) -> Dict[str, Any]:
        if not self.api_key:
            return {"error": "No API key"}
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(f"{self.base_url}{endpoint}", params=params or {}) as resp:
                    return await resp.json() if resp.status == 200 else {"error": f"Status {resp.status}"}
            except Exception as e:
                return {"error": str(e)}
    
    async def check_ip(self, ip: str) -> Dict[str, Any]:
        result = await self._request(f"/shodan/host/{ip}", {"key": self.api_key})
        if "error" in result:
            return {"provider": "Shodan", "error": result.get("error")}
        return {
            "provider": "Shodan",
            "ip": result.get("ip_str", ip),
            "country": result.get("country_name", ""),
            "city": result.get("city", ""),
            "isp": result.get("isp", ""),
            "os": result.get("os", ""),
            "ports": result.get("ports", []),
            "tags": result.get("tags", []),
            "domains": result.get("domains", []),
            "vulns": result.get("vulns", [])
        }
    
    async def check_domain(self, domain: str) -> Dict[str, Any]:
        result = await self._request(f"/dns/resolve", {"hostnames": domain, "key": self.api_key})
        if "error" in result:
            return {"provider": "Shodan", "error": result.get("error")}
        return {
            "provider": "Shodan",
            "resolves_to": result.get(domain, "")
        }
    
    async def check_hash(self, hash_value: str) -> Dict[str, Any]:
        return {"provider": "Shodan", "error": "Hash check not supported"}

class GreyNoiseProvider(ThreatIntelProvider):
    def __init__(self, api_key: Optional[str] = None):
        super().__init__("greynoise", api_key or os.getenv("GREYNOISE_API_KEY"))
        self.base_url = "https://api.greynoise.io/v3"
    
    async def _request(self, endpoint: str) -> Dict[str, Any]:
        if not self.api_key:
            return {"error": "No API key"}
        headers = {"key": self.api_key}
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(f"{self.base_url}{endpoint}", headers=headers) as resp:
                    return await resp.json() if resp.status == 200 else {"error": f"Status {resp.status}"}
            except Exception as e:
                return {"error": str(e)}
    
    async def check_ip(self, ip: str) -> Dict[str, Any]:
        result = await self._request(f"/noise/{ip}")
        return {
            "provider": "GreyNoise",
            "noise": result.get("noise", False),
            "classification": result.get("classification", "unknown"),
            "seen": result.get("seen", False),
            "tags": result.get("tags", []),
            "actor": result.get("metadata", {}).get("actor", ""),
            "metadata": result.get("metadata", {})
        }
    
    async def check_domain(self, domain: str) -> Dict[str, Any]:
        return {"provider": "GreyNoise", "error": "Domain check not supported"}
    
    async def check_hash(self, hash_value: str) -> Dict[str, Any]:
        return {"provider": "GreyNoise", "error": "Hash check not supported"}

class OTXProvider(ThreatIntelProvider):
    def __init__(self, api_key: Optional[str] = None):
        super().__init__("otx", api_key or os.getenv("OTX_API_KEY"))
        self.base_url = "https://otx.alienvault.com/api/v1"
    
    async def _request(self, endpoint: str) -> Dict[str, Any]:
        if not self.api_key:
            return {"error": "No API key"}
        headers = {"X-OTX-API-KEY": self.api_key}
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(f"{self.base_url}{endpoint}", headers=headers) as resp:
                    return await resp.json() if resp.status == 200 else {"error": f"Status {resp.status}"}
            except Exception as e:
                return {"error": str(e)}
    
    async def check_ip(self, ip: str) -> Dict[str, Any]:
        result = await self._request(f"/indicators/IPv4/{ip}/general")
        pulse_count = len(result.get("pulse_info", {}).get("pulses", []))
        return {
            "provider": "OTX",
            "pulse_count": pulse_count,
            "-country": result.get("country_code", ""),
            "asn": result.get("asn", ""),
            "reputation": result.get("reputation", 0),
            "sections": list(result.keys())
        }
    
    async def check_domain(self, domain: str) -> Dict[str, Any]:
        result = await self._request(f"/indicators/domain/{domain}/general")
        pulse_count = len(result.get("pulse_info", {}).get("pulses", []))
        return {
            "provider": "OTX",
            "pulse_count": pulse_count,
            "reputation": result.get("reputation", 0),
            "Sections": list(result.keys())[:5]
        }
    
    async def check_hash(self, hash_value: str) -> Dict[str, Any]:
        result = await self._request(f"/indicators/file_hash/{hash_value}/general")
        return {
            "provider": "OTX",
            "detection_ratio": result.get("detection", {}).get("ratio", ""),
            "first_seen": result.get("first_seen", ""),
            "last_seen": result.get("last_seen", "")
        }

class URLScanProvider(ThreatIntelProvider):
    def __init__(self, api_key: Optional[str] = None):
        super().__init__("urlscan", api_key or os.getenv("URLSCAN_API_KEY"))
        self.base_url = "https://urlscan.io/api/v1"
    
    async def _request(self, endpoint: str) -> Dict[str, Any]:
        if not self.api_key:
            return {"error": "No API key"}
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(f"{self.base_url}{endpoint}") as resp:
                    return await resp.json() if resp.status == 200 else {"error": f"Status {resp.status}"}
            except Exception as e:
                return {"error": str(e)}
    
    async def check_ip(self, ip: str) -> Dict[str, Any]:
        return {"provider": "urlscan.io", "error": "IP check not supported"}
    
    async def check_domain(self, domain: str) -> Dict[str, Any]:
        result = await self._request(f"/search/?q=domain:{domain}&size=1")
        results = result.get("results", [])
        if results:
            return {
                "provider": "urlscan.io",
                "total_results": result.get("total", 0),
                "last_submitted": results[0].get("task", {}).get("time", ""),
                "verdict": results[0].get("verdict", {}).get("malicious", False)
            }
        return {"provider": "urlscan.io", "total_results": 0}
    
    async def check_hash(self, hash_value: str) -> Dict[str, Any]:
        return {"provider": "urlscan.io", "error": "Hash check not supported"}


async def check_ioc_all_providers(indicator: str, ioc_type: str) -> List[Dict[str, Any]]:
    providers = [
        VirusTotalProvider(),
        AbuseIPDBProvider(),
        ShodanProvider(),
        GreyNoiseProvider(),
        OTXProvider(),
        URLScanProvider()
    ]
    
    results = []
    tasks = []
    
    for provider in providers:
        if ioc_type == "ipv4":
            tasks.append(provider.check_ip(indicator))
        elif ioc_type in ["domain", "url"]:
            tasks.append(provider.check_domain(indicator))
        elif ioc_type in ["md5", "sha1", "sha256"]:
            tasks.append(provider.check_hash(indicator))
        else:
            tasks.append(asyncio.coroutine(lambda: {"provider": provider.name, "error": "Unsupported type"})())
    
    provider_results = await asyncio.gather(*tasks, return_exceptions=True)
    
    for provider, result in zip(providers, provider_results):
        if isinstance(result, Exception):
            results.append({"provider": provider.name, "error": str(result)})
        elif "error" not in result:
            results.append(result)
    
    return results

def calculate_score(results: List[Dict[str, Any]]) -> tuple[int, str, List[str]]:
    scores = []
    tags = []
    
    for result in results:
        if "error" in result and result["error"] != "No API key":
            continue
            
        provider = result.get("provider", "")
        
        if provider == "VirusTotal":
            malicious = result.get("malicious", 0)
            total = result.get("total", 1)
            if total > 0:
                scores.append(int((malicious / total) * 100))
                if malicious > 0:
                    tags.append("vt-malicious")
        
        elif provider == "AbuseIPDB":
            abuse_score = result.get("abuse_confidence_score", 0)
            scores.append(abuse_score)
            if abuse_score > 70:
                tags.append("high-abuse-confidence")
        
        elif provider == "GreyNoise":
            if result.get("noise", False):
                scores.append(80)
                tags.append("grey-noise")
            elif result.get("classification") in ["malicious", "spam"]:
                scores.append(70)
                tags.append(result["classification"])
        
        elif provider == "OTX":
            pulse_count = result.get("pulse_count", 0)
            if pulse_count > 0:
                scores.append(min(pulse_count * 20, 100))
                tags.append("otx-pulse")
        
        elif provider == "Shodan":
            vulns = result.get("vulns", [])
            if vulns:
                scores.append(60)
                tags.append("known-vulnerabilities")
    
    if not scores:
        return 0, "unknown", []
    
    avg_score = int(sum(scores) / len(scores))
    
    if avg_score >= 70:
        verdict = "malicious"
    elif avg_score >= 30:
        verdict = "suspicious"
    else:
        verdict = "clean"
    
    return avg_score, verdict, tags
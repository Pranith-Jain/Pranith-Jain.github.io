from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import re
import asyncio

from providers import check_ioc_all_providers, calculate_score
from domain import DomainChecker, ExposureScanner, FileAnalyzer
from wiki_data import wiki_articles, wiki_content

app = FastAPI(title="DFIR Platform API", version="1.0.0")

domain_checker = DomainChecker()
exposure_scanner = ExposureScanner()
file_analyzer = FileAnalyzer()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PhishingRequest(BaseModel):
    email_raw: str

class IOCRequest(BaseModel):
    indicator: str

class IOCResponse(BaseModel):
    success: bool
    indicator: str
    type: str
    score: int
    verdict: str
    sources: List[dict]
    tags: List[str]
    defanged: str
    credits_used: int

class PhishingResponse(BaseModel):
    success: bool
    verdict: str
    confidence: int
    auth_results: dict
    extracted_iocs: List[dict]
    tags: List[str]
    credits_used: int

def defang(ioc: str) -> str:
    result = ioc
    if re.match(r'\d+\.\d+\.\d+\.\d+', ioc):
        result = ioc.replace('.', '[.]')
    return result

def detect_ioc_type(indicator: str) -> str:
    indicator = indicator.strip()
    
    if re.match(r'\d+\.\d+\.\d+\.\d+$', indicator):
        return "ipv4"
    if re.match(r'[0-9a-fA-F]{32}$', indicator):
        return "md5"
    if re.match(r'[0-9a-fA-F]{40}$', indicator):
        return "sha1"
    if re.match(r'[0-9a-fA-F]{64}$', indicator):
        return "sha256"
    if indicator.startswith(('http://', 'https://', 'ftp://')):
        return "url"
    if '@' in indicator and '.' in indicator:
        return "email"
    if re.match(r'^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]', indicator):
        return "domain"
    return "unknown"

@app.get("/")
def root():
    return {"status": "ok", "service": "DFIR Platform API", "version": "1.0.0"}

@app.post("/api/v1/ioc/check", response_model=IOCResponse)
async def check_ioc(request: IOCRequest):
    indicator = request.indicator.strip()
    ioc_type = detect_ioc_type(indicator)
    defanged_ioc = defang(indicator)
    
    sources = await check_ioc_all_providers(indicator, ioc_type)
    score, verdict, tags = calculate_score(sources)
    
    return IOCResponse(
        success=True,
        indicator=indicator,
        type=ioc_type,
        score=score,
        verdict=verdict,
        sources=sources,
        tags=tags,
        defanged=defanged_ioc,
        credits_used=1
    )

@app.post("/api/v1/phishing/analyze", response_model=PhishingResponse)
def analyze_phishing(request: PhishingRequest):
    email_content = request.email_raw
    
    auth_results = {
        "spf": analyze_spf(email_content),
        "dkim": analyze_dkim(email_content),
        "dmarc": analyze_dmarc(email_content)
    }
    
    tags = []
    verdict = "clean"
    confidence = 95
    
    urgency_keywords = ['urgent', 'immediately', 'suspend', 'locked', 'verify', 'unauthorized', 'action required']
    if any(kw in email_content.lower() for kw in urgency_keywords):
        tags.append("urgency-language")
        verdict = "suspicious"
        confidence = min(confidence - 30, 60)
    
    financial_keywords = ['invoice', 'payment', 'wire transfer', 'bank', 'account update', 'balance']
    if any(kw in email_content.lower() for kw in financial_keywords):
        tags.append("financial-context")
        if verdict == "suspicious":
            verdict = "malicious"
            confidence = min(confidence - 20, 70)
    
    extracted_iocs = []
    
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
    urls = re.findall(url_pattern, email_content)
    for url in urls[:5]:
        extracted_iocs.append({"type": "url", "value": url})
    
    ip_pattern = r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
    ips = re.findall(ip_pattern, email_content)
    for ip in ips[:5]:
        if not ip.startswith('0.') and not ip.startswith('255.'):
            extracted_iocs.append({"type": "ipv4", "value": ip})
    
    domain_pattern = r'[a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|org|net|io|co|ru|cn|xyz|info|biz|tk|ml|ga|cf|gq|pw|cc|ws|top|site|online|club|fun|tech|pro)'
    domains = re.findall(domain_pattern, email_content.lower())
    for domain in set(domains[:5]):
        extracted_iocs.append({"type": "domain", "value": domain})
    
    hash_patterns = [
        r'\b[0-9a-fA-F]{32}\b',
        r'\b[0-9a-fA-F]{40}\b',
        r'\b[0-9a-fA-F]{64}\b'
    ]
    for pattern in hash_patterns:
        hashes = re.findall(pattern, email_content)
        for h in hashes[:3]:
            length = len(h)
            h_type = "md5" if length == 32 else "sha1" if length == 40 else "sha256"
            extracted_iocs.append({"type": h_type, "value": h})
    
    suspicious_attachments = ['.exe', '.scr', '.bat', '.vbs', '.js', '.jar', '.zip', '.rar']
    for ext in suspicious_attachments:
        if ext in email_content.lower():
            tags.append(f"suspicious-attachment:{ext}")
    
    display_mismatch = check_link_display_mismatch(email_content)
    if display_mismatch:
        tags.append("link-display-mismatch")
        verdict = "malicious"
        confidence = max(confidence - 25, 75)
    
    suspicious_tlds = ['.tk', '.ml', '.ga', '.cf', '.gq', '.pw', '.cc', '.xyz', '.top']
    for ioc in extracted_iocs:
        if ioc.get('type') == 'domain':
            domain = ioc.get('value', '')
            if any(domain.endswith(tld) for tld in suspicious_tlds):
                tags.append("suspicious-tld")
                break
    
    return PhishingResponse(
        success=True,
        verdict=verdict,
        confidence=confidence,
        auth_results=auth_results,
        extracted_iocs=extracted_iocs,
        tags=tags,
        credits_used=1
    )

def analyze_spf(email_content: str) -> str:
    if 'spf=pass' in email_content.lower():
        return "pass"
    elif 'spf=fail' in email_content.lower() or 'spf=softfail' in email_content.lower():
        return "fail"
    elif 'spf=neutral' in email_content.lower():
        return "neutral"
    return "unknown"

def analyze_dkim(email_content: str) -> str:
    if 'dkim=pass' in email_content.lower():
        return "pass"
    elif 'dkim=fail' in email_content.lower():
        return "fail"
    return "unknown"

def analyze_dmarc(email_content: str) -> str:
    if 'dmarc=pass' in email_content.lower():
        return "pass"
    elif 'dmarc=fail' in email_content.lower():
        return "fail"
    return "unknown"

def check_link_display_mismatch(email_content: str) -> bool:
    link_pattern = r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>([^<]+)</a>'
    matches = re.findall(link_pattern, email_content, re.IGNORECASE)
    for href, text in matches:
        text_clean = text.replace('[.]', '.').replace('[dot]', '.').strip()
        if href and text_clean and text_clean not in href:
            return True
    return False

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.get("/api/providers/status")
def providers_status():
    return {
        "providers": [
            {"name": "VirusTotal", "status": "configured" if os.getenv("VIRUSTOTAL_API_KEY") else "missing-api-key"},
            {"name": "AbuseIPDB", "status": "configured" if os.getenv("ABUSEIPDB_API_KEY") else "missing-api-key"},
            {"name": "Shodan", "status": "configured" if os.getenv("SHODAN_API_KEY") else "missing-api-key"},
            {"name": "GreyNoise", "status": "configured" if os.getenv("GREYNOISE_API_KEY") else "missing-api-key"},
            {"name": "OTX", "status": "configured" if os.getenv("OTX_API_KEY") else "missing-api-key"},
            {"name": "URLScan", "status": "configured" if os.getenv("URLSCAN_API_KEY") else "missing-api-key"}
        ]
    }

class DomainRequest(BaseModel):
    domain: str

class ExposureRequest(BaseModel):
    domain: str

class FileRequest(BaseModel):
    hash_value: str

@app.post("/api/v1/domain/check")
async def check_domain(request: DomainRequest):
    return await domain_checker.check_domain(request.domain)

@app.post("/api/v1/exposure/scan")
async def scan_exposure(request: ExposureRequest):
    return await exposure_scanner.scan(request.domain)

@app.post("/api/v1/file/analyze")
async def analyze_file(request: FileRequest):
    return await file_analyzer.analyze_hash(request.hash_value)

@app.get("/api/v1/wiki")
def get_wiki_categories():
    return {"categories": [
        {"id": "email_security", "name": "Email Security", "count": len(wiki_articles["email_security"])},
        {"id": "threat_intelligence", "name": "Threat Intelligence", "count": len(wiki_articles["threat_intelligence"])},
        {"id": "forensics", "name": "Forensics", "count": len(wiki_articles["forensics"])},
        {"id": "detection_engineering", "name": "Detection Engineering", "count": len(wiki_articles["detection_engineering"])},
        {"id": "attack_types", "name": "Attack Types", "count": len(wiki_articles["attack_types"])}
    ]}

@app.get("/api/v1/wiki/{category}")
def get_wiki_category(category: str):
    if category in wiki_articles:
        return {"category": category, "articles": wiki_articles[category]}
    return {"error": "Category not found"}

@app.get("/api/v1/wiki/article/{slug}")
def get_wiki_article(slug: str):
    if slug in wiki_content:
        return wiki_content[slug]
    for category in wiki_articles.values():
        for article in category:
            if article["slug"] == slug:
                return {"title": article["title"], "description": article["description"], "slug": slug}
    return {"error": "Article not found"}

import os
import httpx

@app.get("/api/v1/intel/feed")
async def get_intel_feed():
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get("https://dfir-lab.ch/feed.xml")
            return {"xml": response.text}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/v1/research/feeds")
async def get_research_feeds():
    feeds = [
        {"name": "The Hacker News", "url": "https://feeds.feedburner.com/TheHackersNews"},
        {"name": "BleepingComputer", "url": "https://www.bleepingcomputer.com/feed/"},
        {"name": "Krebs on Security", "url": "https://krebsonsecurity.com/feed/"},
        {"name": "Schneier on Security", "url": "https://www.schneier.com/feed/atom/"},
        {"name": "Dark Reading", "url": "https://www.darkreading.com/rss.xml"},
        {"name": "SecurityWeek", "url": "https://www.securityweek.com/feed/"},
        {"name": "CISA Alerts", "url": "https://www.cisa.gov/uscert/ncas/alerts.xml"},
    ]
    results = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        for feed in feeds:
            try:
                response = await client.get(feed["url"])
                from xml.etree import ElementTree
                root = ElementTree.fromstring(response.text)
                items = []
                for item in root.findall(".//item")[:5]:
                    title = item.find("title")
                    link = item.find("link")
                    pubDate = item.find("pubDate")
                    desc = item.find("description")
                    items.append({
                        "title": title.text if title is not None else "",
                        "link": link.text if link is not None else "",
                        "pubDate": pubDate.text if pubDate is not None else "",
                        "desc": desc.text[:200] + "..." if desc is not None and len(desc.text or "") > 200 else desc.text if desc is not None else ""
                    })
                results.append({"name": feed["name"], "items": items})
            except Exception:
                results.append({"name": feed["name"], "items": [], "error": "Failed to fetch"})
    return {"feeds": results}
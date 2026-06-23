import type { Context } from 'hono';
import type { Env } from '../env';
import { runAi, parseJson } from '../lib/ai';

const IOC_SYSTEM = `You are an expert threat intelligence analyst. Extract ALL indicators of compromise (IOCs) from the given text.
Return ONLY valid JSON:
{
  "iocs": {
    "ipv4": ["1.2.3.4"],
    "ipv6": ["::1"],
    "domain": ["evil.com"],
    "url": ["https://malware.example.com/payload.exe"],
    "md5": ["d41d8cd98f00b204e9800998ecf8427e"],
    "sha1": ["da39a3ee5e6b4b0d3255bfef95601890afd80709"],
    "sha256": ["e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    "email": ["admin@evil.com"],
    "cve": ["CVE-2024-1234"],
    "mutex": ["Global\\MyMutex"],
    "registry": ["HKLM\\Software\\Evil"],
    "filename": ["malware.exe", "payload.dll"]
  },
  "summary": "Brief summary of what these IOCs represent",
  "threat_context": "1-2 sentences on the threat landscape these IOCs belong to"
}
Only include IOCs that are clearly present in the text. Empty arrays for types not found.`;

interface IocExtractionRequest {
  text: string;
  title?: string;
  source?: string;
}

export async function iocExtractionHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<IocExtractionRequest>();
    if (!body.text?.trim()) return c.json({ error: 'missing text' }, 400);

    const user = [
      body.title ? `Title: ${body.title}` : '',
      body.source ? `Source: ${body.source}` : '',
      `Content:\n${body.text.slice(0, 4000)}`,
    ]
      .filter(Boolean)
      .join('\n');

    const { text, model } = await runAi(c.env.AI, c.env.GROQ_API_KEY, {
      system: IOC_SYSTEM,
      user,
      maxTokens: 2000,
    }, c.env.GOOGLE_AI_STUDIO_API_KEY);

    const analysis = parseJson(text);
    return c.json({ analysis, model, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('ioc-extraction error:', e);
    return c.json({ error: 'extraction failed' }, 500);
  }
}

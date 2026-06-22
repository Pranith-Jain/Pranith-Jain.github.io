import type { Context } from 'hono';
import type { Env } from '../env';
import { runAi, parseJson } from '../lib/ai';

const MITRE_SYSTEM = `You are a MITRE ATT&CK framework expert. Map the given threat intelligence to relevant ATT&CK techniques.
Return ONLY valid JSON:
{
  "techniques": [
    {
      "id": "T1566",
      "name": "Phishing",
      "tactic": "Initial Access",
      "confidence": "high|medium|low",
      "evidence": "Brief quote or reason from the text"
    }
  ],
  "summary": "1-2 sentence summary of the attack chain described",
  "kill_chain_phase": "The primary kill chain phase (e.g., Initial Access, Execution, Persistence)",
  "detection_difficulty": "easy|moderate|hard",
  "detection_tips": ["tip1", "tip2"]
}
Map to the most specific technique/sub-technique possible. Include 3-8 techniques.`;

interface MitreMappingRequest {
  text: string;
  title?: string;
}

export async function mitreMappingHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<MitreMappingRequest>();
    if (!body.text?.trim()) return c.json({ error: 'missing text' }, 400);

    const user = [body.title ? `Title: ${body.title}` : '', `Content:\n${body.text.slice(0, 4000)}`]
      .filter(Boolean)
      .join('\n');

    const { text, model } = await runAi(c.env.AI, c.env.GROQ_API_KEY, {
      system: MITRE_SYSTEM,
      user,
      maxTokens: 2000,
    });

    const mapping = parseJson(text);
    return c.json({ mapping, model, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('mitre-mapping error:', e);
    return c.json({ error: 'mapping failed' }, 500);
  }
}

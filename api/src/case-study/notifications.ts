/**
 * Notification webhooks for case-study pipeline events.
 * Sends Discord (rich embed) and/or Slack (simple message) webhooks when a
 * post is published, a social post fails, or a draft is ready for review.
 * Best-effort — failures are logged and swallowed.
 */

export interface WebhookEnv {
  DISCORD_WEBHOOK_URL?: string;
  SLACK_WEBHOOK_URL?: string;
  SITE_URL?: string;
}

interface WebhookPayload {
  title: string;
  description: string;
  color?: number;
  url?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
}

function discordPayload(p: WebhookPayload): Record<string, unknown> {
  return {
    embeds: [
      {
        title: p.title,
        description: p.description,
        url: p.url,
        color: p.color ?? 0x0ea5e9,
        fields: p.fields,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function slackPayload(p: WebhookPayload): Record<string, unknown> {
  return {
    text: p.title,
    attachments: [
      {
        fallback: p.description,
        text: p.description,
        title_link: p.url,
        color: p.color ? `#${p.color.toString(16).padStart(6, '0')}` : '#0ea5e9',
        fields: p.fields?.map((f) => ({ title: f.name, value: f.value, short: f.inline ?? false })),
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

async function sendWebhook(url: string, body: Record<string, unknown>): Promise<void> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error(`webhook to ${url.slice(0, 40)}... failed: ${r.status} ${await r.text().catch(() => '')}`);
  }
}

export async function notifyPublished(env: WebhookEnv, slug: string, title: string, type: string): Promise<void> {
  const siteUrl = env.SITE_URL ?? 'https://pranithjain.qzz.io';
  const p: WebhookPayload = {
    title: 'Post Published',
    description: `**${title}** (${type})`,
    color: 0x10b981,
    url: `${siteUrl}/blog/${slug}`,
    fields: [
      { name: 'Slug', value: slug, inline: true },
      { name: 'Type', value: type, inline: true },
    ],
  };
  const promises: Promise<void>[] = [];
  if (env.DISCORD_WEBHOOK_URL) promises.push(sendWebhook(env.DISCORD_WEBHOOK_URL, discordPayload(p)));
  if (env.SLACK_WEBHOOK_URL) promises.push(sendWebhook(env.SLACK_WEBHOOK_URL, slackPayload(p)));
  await Promise.allSettled(promises);
}

export async function notifySocialFailed(
  env: WebhookEnv,
  slug: string,
  platform: string,
  error: string
): Promise<void> {
  const p: WebhookPayload = {
    title: 'Social Post Failed',
    description: `Failed to post to **${platform}** for \`${slug}\``,
    color: 0xef4444,
    fields: [{ name: 'Error', value: error.slice(0, 1000), inline: false }],
  };
  const promises: Promise<void>[] = [];
  if (env.DISCORD_WEBHOOK_URL) promises.push(sendWebhook(env.DISCORD_WEBHOOK_URL, discordPayload(p)));
  if (env.SLACK_WEBHOOK_URL) promises.push(sendWebhook(env.SLACK_WEBHOOK_URL, slackPayload(p)));
  await Promise.allSettled(promises);
}

export async function notifyDraftReady(env: WebhookEnv, slug: string, title: string, type: string): Promise<void> {
  const siteUrl = env.SITE_URL ?? 'https://pranithjain.qzz.io';
  const p: WebhookPayload = {
    title: 'Draft Ready for Review',
    description: `**${title}** (${type}) is awaiting approval`,
    color: 0xf59e0b,
    url: `${siteUrl}/admin`,
    fields: [
      { name: 'Slug', value: slug, inline: true },
      { name: 'Type', value: type, inline: true },
    ],
  };
  const promises: Promise<void>[] = [];
  if (env.DISCORD_WEBHOOK_URL) promises.push(sendWebhook(env.DISCORD_WEBHOOK_URL, discordPayload(p)));
  if (env.SLACK_WEBHOOK_URL) promises.push(sendWebhook(env.SLACK_WEBHOOK_URL, slackPayload(p)));
  await Promise.allSettled(promises);
}

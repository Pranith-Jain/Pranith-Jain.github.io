interface SocialParts {
  body: string;
  link?: { label: string; value: string };
  carousel?: string;
}

function splitSocialParts(text: string): SocialParts {
  let body = (text ?? '').trim();
  let link: { label: string; value: string } | undefined;
  const linkMatch = body.match(/^[ \t]*FIRST (COMMENT|REPLY):[ \t]*(\S.*)$/im);
  if (linkMatch && linkMatch.index !== undefined) {
    link = {
      label: linkMatch[1]!.toUpperCase() === 'COMMENT' ? 'First comment' : 'First reply',
      value: linkMatch[2]!.trim(),
    };
    body = (body.slice(0, linkMatch.index) + body.slice(linkMatch.index + linkMatch[0].length)).trim();
  }
  return { body, link };
}

export interface TwitterCredentials {
  apiKey: string;
  apiKeySecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export interface PostResult {
  ok: boolean;
  platform: 'twitter' | 'linkedin';
  postUrl?: string;
  error?: string;
}

/**
 * Post a thread to X/Twitter API v2 using OAuth 1.0a user context.
 * Each post segment becomes a separate tweet linked via reply.
 * The "FIRST REPLY:" link is posted as the first reply tweet.
 */
export async function postToTwitter(text: string, creds: TwitterCredentials): Promise<PostResult> {
  if (!creds.apiKey || !creds.apiKeySecret || !creds.accessToken || !creds.accessTokenSecret) {
    return { ok: false, platform: 'twitter', error: 'twitter_credentials_missing' };
  }

  const parts = splitSocialParts(text);
  const posts = parseTwitterPosts(parts.body);
  const linkText = parts.link?.value ?? '';

  let prevTweetId: string | undefined;

  try {
    for (const post of posts) {
      const body: Record<string, unknown> = { text: post };
      if (prevTweetId) {
        body.reply = { in_reply_to_tweet_id: prevTweetId };
      }

      const authHeader = await buildOAuth1Header('POST', 'https://api.twitter.com/2/tweets', creds);
      const res = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        return { ok: false, platform: 'twitter', error: `twitter_api_error: ${res.status} ${errBody}` };
      }

      const data = (await res.json()) as { data?: { id: string } };
      prevTweetId = data?.data?.id;
    }

    if (linkText && prevTweetId) {
      const authHeader = await buildOAuth1Header('POST', 'https://api.twitter.com/2/tweets', creds);
      const res = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          text: linkText,
          reply: { in_reply_to_tweet_id: prevTweetId },
        }),
      });

      if (!res.ok) {
        console.error('twitter link reply failed:', res.status, await res.text());
      } else {
        const data = (await res.json()) as { data?: { id: string } };
        prevTweetId = data?.data?.id;
      }
    }

    const postUrl = prevTweetId ? `https://x.com/i/status/${prevTweetId}` : undefined;
    return { ok: true, platform: 'twitter', postUrl };
  } catch (err) {
    return { ok: false, platform: 'twitter', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Post to LinkedIn API v2 using OAuth 2.0 Bearer token.
 * Gets the user profile to construct author URN, then posts.
 */
export async function postToLinkedin(text: string, accessToken: string): Promise<PostResult> {
  if (!accessToken) {
    return { ok: false, platform: 'linkedin', error: 'linkedin_token_missing' };
  }

  const parts = splitSocialParts(text);
  const bodyText = parts.body.trim();
  if (!bodyText) {
    return { ok: false, platform: 'linkedin', error: 'empty_content' };
  }

  try {
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      const errBody = await profileRes.text();
      return { ok: false, platform: 'linkedin', error: `linkedin_profile_error: ${profileRes.status} ${errBody}` };
    }

    const profile = (await profileRes.json()) as { sub?: string };
    const authorUrn = `urn:li:person:${profile.sub}`;

    const postBody = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: bodyText },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    const postRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(postBody),
    });

    if (!postRes.ok) {
      const errBody = await postRes.text();
      return { ok: false, platform: 'linkedin', error: `linkedin_post_error: ${postRes.status} ${errBody}` };
    }

    const postData = (await postRes.json()) as { id?: string };
    const postUrl = postData?.id ? `https://www.linkedin.com/feed/update/${postData.id}` : undefined;

    return { ok: true, platform: 'linkedin', postUrl };
  } catch (err) {
    return { ok: false, platform: 'linkedin', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Parse Twitter thread text into individual posts.
 */
function parseTwitterPosts(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => p.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim());
}

/**
 * Build an OAuth 1.0a Authorization header using HMAC-SHA1 via Web Crypto.
 */
async function buildOAuth1Header(method: string, url: string, creds: TwitterCredentials): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_token: creds.accessToken,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: randomString(32),
    oauth_version: '1.0',
  };

  const paramKeys = Object.keys(oauthParams).sort();

  const paramStr = paramKeys.map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k]!)}`).join('&');

  const signatureBase = `${method}&${percentEncode(url)}&${percentEncode(paramStr)}`;
  const signingKey = `${percentEncode(creds.apiKeySecret)}&${percentEncode(creds.accessTokenSecret)}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(signingKey), { name: 'HMAC', hash: 'SHA-1' }, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signatureBase));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  oauthParams.oauth_signature = signatureB64;

  const header = 'OAuth ' + paramKeys.map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k]!)}"`).join(', ');

  return header;
}

function percentEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function randomString(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(len);
  crypto.getRandomValues(array);
  for (let i = 0; i < len; i++) {
    result += chars[array[i]! % chars.length];
  }
  return result;
}

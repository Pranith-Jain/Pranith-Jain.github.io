interface SocialParts {
  body: string;
  link?: { label: string; value: string };
  carousel?: string;
}

const ALLOWED_LINK_DOMAIN = 'pranithjain.qzz.io';

function splitSocialParts(text: string): SocialParts {
  let body = (text ?? '').trim();
  let link: { label: string; value: string } | undefined;
  const linkMatch = body.match(/^[ \t]*FIRST (COMMENT|REPLY):[ \t]*(\S.*)$/im);
  if (linkMatch && linkMatch.index !== undefined) {
    const rawValue = linkMatch[2]!.trim();
    // Validate the extracted URL — only allow links to our own domain
    const validated = validateLinkUrl(rawValue);
    if (validated) {
      link = {
        label: linkMatch[1]!.toUpperCase() === 'COMMENT' ? 'First comment' : 'First reply',
        value: validated,
      };
      body = (body.slice(0, linkMatch.index) + body.slice(linkMatch.index + linkMatch[0].length)).trim();
    } else {
      console.warn('splitSocialParts: discarded link not matching allowed domain:', rawValue.slice(0, 80));
    }
  }
  return { body, link };
}

/** Validate a FIRST REPLY / FIRST COMMENT URL is on our allowed domain. */
function validateLinkUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return undefined;
    if (parsed.hostname !== ALLOWED_LINK_DOMAIN) return undefined;
    return url;
  } catch {
    return undefined;
  }
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
 * Upload a PNG to Twitter's v1.1 media endpoint and return its media_id.
 * Multipart form upload — only the OAuth params are signed (the binary body
 * is not part of the OAuth 1.0a signature base for multipart/form-data).
 * Returns undefined on any failure so the caller can post without media.
 */
async function uploadTwitterMedia(image: Uint8Array, creds: TwitterCredentials): Promise<string | undefined> {
  const url = 'https://upload.twitter.com/1.1/media/upload.json';
  try {
    const form = new FormData();
    form.append('media', new Blob([image], { type: 'image/png' }));
    form.append('media_category', 'tweet_image');
    const authHeader = await buildOAuth1Header('POST', url, creds);
    const res = await fetch(url, { method: 'POST', headers: { Authorization: authHeader }, body: form });
    if (!res.ok) {
      console.error('twitter media upload failed:', res.status, await res.text());
      return undefined;
    }
    const data = (await res.json()) as { media_id_string?: string };
    return data.media_id_string;
  } catch (err) {
    console.error('twitter media upload error:', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

/**
 * Post a thread to X/Twitter API v2 using OAuth 1.0a user context.
 * Each post segment becomes a separate tweet linked via reply.
 * The "FIRST REPLY:" link is posted as the first reply tweet.
 * When `image` is provided it is uploaded once and attached to the FIRST tweet
 * (the card the unfurl shows); upload failure degrades to a text-only thread.
 */
export async function postToTwitter(text: string, creds: TwitterCredentials, image?: Uint8Array): Promise<PostResult> {
  if (!creds.apiKey || !creds.apiKeySecret || !creds.accessToken || !creds.accessTokenSecret) {
    return { ok: false, platform: 'twitter', error: 'twitter_credentials_missing' };
  }

  const parts = splitSocialParts(text);
  const posts = parseTwitterPosts(parts.body);
  const linkText = parts.link?.value ?? '';

  const mediaId = image && image.length > 0 ? await uploadTwitterMedia(image, creds) : undefined;

  let prevTweetId: string | undefined;
  let isFirst = true;

  try {
    for (const post of posts) {
      const body: Record<string, unknown> = { text: post };
      if (prevTweetId) {
        body.reply = { in_reply_to_tweet_id: prevTweetId };
      }
      if (isFirst && mediaId) {
        body.media = { media_ids: [mediaId] };
      }
      isFirst = false;

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
 * Upload a PNG to LinkedIn via the v2 Assets API and return its asset URN.
 * Two steps: registerUpload (reserve an asset + signed upload URL), then PUT
 * the binary to that URL. Returns undefined on any failure so the caller can
 * post text-only. `ownerUrn` is the author the asset belongs to.
 */
async function uploadLinkedinImage(
  image: Uint8Array,
  accessToken: string,
  ownerUrn: string
): Promise<string | undefined> {
  try {
    const regRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: ownerUrn,
          serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
        },
      }),
    });
    if (!regRes.ok) {
      console.error('linkedin registerUpload failed:', regRes.status, await regRes.text());
      return undefined;
    }
    const reg = (await regRes.json()) as {
      value?: { asset?: string; uploadMechanism?: Record<string, { uploadUrl?: string }> };
    };
    const asset = reg.value?.asset;
    const uploadUrl =
      reg.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
    if (!asset || !uploadUrl) return undefined;

    // Binary upload is a PUT (curl --upload-file) with the bearer token.
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'image/png' },
      body: image,
    });
    if (!putRes.ok) {
      console.error('linkedin image PUT failed:', putRes.status, await putRes.text());
      return undefined;
    }
    return asset;
  } catch (err) {
    console.error('linkedin image upload error:', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

/**
 * Post to LinkedIn API v2 using OAuth 2.0 Bearer token.
 * Gets the user profile to construct author URN, then posts.
 * When `image` is provided it is uploaded and attached as the share's media
 * (shareMediaCategory IMAGE); upload failure degrades to a text-only share.
 */
export async function postToLinkedin(text: string, accessToken: string, image?: Uint8Array): Promise<PostResult> {
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

    const mediaAsset = image && image.length > 0 ? await uploadLinkedinImage(image, accessToken, authorUrn) : undefined;

    const shareContent: Record<string, unknown> = {
      shareCommentary: { text: bodyText },
      shareMediaCategory: mediaAsset ? 'IMAGE' : 'NONE',
    };
    if (mediaAsset) {
      shareContent.media = [{ status: 'READY', media: mediaAsset, title: { text: 'Threat Briefing' } }];
    }

    const postBody = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': shareContent,
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

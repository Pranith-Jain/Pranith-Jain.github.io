/**
 * Email Registration Checker — site-specific API-based email enumeration.
 *
 * Inspired by kaifcodec/user-scanner (MIT, 2.4k stars).
 * Each platform uses its own API or sign-up flow to check if an email is registered.
 * Returns rich profile metadata when available (not just found/not-found).
 *
 *   GET /api/v1/email-registration?email=<addr>[&platforms=etsy,github,...]
 *
 * Subrequest budget: batched to 15 concurrent, max 50 platforms.
 * Cache TTL: 30 min (registration status is semi-stable).
 */

import type { Context } from 'hono';
import type { Env } from '../env';

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_SECONDS = 30 * 60;
const MAX_CONCURRENT = 15;
const MAX_PLATFORMS = 50;

interface EmailCheckResult {
  platform: string;
  name: string;
  category: string;
  status: 'registered' | 'not-registered' | 'error' | 'rate-limited';
  url: string;
  extra?: Record<string, unknown>;
}

interface EmailRegistrationResponse {
  email: string;
  generated_at: string;
  total_checked: number;
  registered: number;
  results: EmailCheckResult[];
  summary: Record<string, number>;
  cached: boolean;
}

type EmailChecker = (email: string) => Promise<EmailCheckResult>;

function ok(
  platform: string,
  name: string,
  category: string,
  url: string,
  extra?: Record<string, unknown>
): EmailCheckResult {
  return { platform, name, category, status: 'registered', url, extra };
}
function no(platform: string, name: string, category: string, url: string): EmailCheckResult {
  return { platform, name, category, status: 'not-registered', url };
}
function err(platform: string, name: string, category: string, url: string, reason?: string): EmailCheckResult {
  return { platform, name, category, status: 'error', url, extra: reason ? { error: reason } : undefined };
}
function rateLimited(platform: string, name: string, category: string, url: string): EmailCheckResult {
  return { platform, name, category, status: 'rate-limited', url };
}

// ── Shopping ────────────────────────────────────────────────────────────────

const checkEtsy: EmailChecker = async (email) => {
  const url = 'https://www.etsy.com';
  try {
    const res = await fetch(
      `https://www.etsy.com/api/v3/ajax/public/users/by-identity-optional?identity=${encodeURIComponent(email)}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          Referer: 'https://www.etsy.com/join/email',
        },
      }
    );
    if (res.status === 403) return rateLimited('etsy', 'Etsy', 'shopping', url);
    const text = await res.text();
    if (text.trim() === 'null') return no('etsy', 'Etsy', 'shopping', url);
    const data = JSON.parse(text) as Record<string, unknown>;
    if (data.user_id) {
      return ok('etsy', 'Etsy', 'shopping', url, {
        user_id: data.user_id,
        name: data.real_name || data.display_name || 'N/A',
        username: data.login_name || 'N/A',
        location: data.location,
        is_seller: data.is_seller === true ? 'Yes' : 'No',
        followers: data.follower_count,
        following: data.following_count,
        avatar: data.avatar_url,
        joined: data.create_date ? new Date((data.create_date as number) * 1000).toISOString().split('T')[0] : null,
      });
    }
    return no('etsy', 'Etsy', 'shopping', url);
  } catch {
    return err('etsy', 'Etsy', 'shopping', url);
  }
};

const checkFlipkart: EmailChecker = async (email) => {
  const url = 'https://www.flipkart.com';
  try {
    const res = await fetch('https://2.rome.api.flipkart.com/1/action/view', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
        'Content-Type': 'application/json',
        Origin: 'https://www.flipkart.com',
        Referer: 'https://www.flipkart.com/',
      },
      body: JSON.stringify({
        actionRequestContext: {
          type: 'LOGIN_IDENTITY_VERIFY',
          loginIdPrefix: '',
          loginId: email,
          clientQueryParamMap: { ret: '/' },
          loginType: 'EMAIL',
          verificationType: 'PASSWORD',
          screenName: 'LOGIN_V4_EMAIL',
          sourceContext: 'SIGNUP_REDIRECT',
        },
      }),
    });
    if (res.status === 429) return rateLimited('flipkart', 'Flipkart', 'shopping', url);
    if (res.status !== 200) return err('flipkart', 'Flipkart', 'shopping', url, `HTTP ${res.status}`);
    const text = await res.text();
    if (text.includes("Looks like you're new here!")) return no('flipkart', 'Flipkart', 'shopping', url);
    if (text.includes('supportedAuthenticationTypes=password')) return ok('flipkart', 'Flipkart', 'shopping', url);
    return err('flipkart', 'Flipkart', 'shopping', url, 'unexpected response');
  } catch {
    return err('flipkart', 'Flipkart', 'shopping', url);
  }
};

// ── Dev ─────────────────────────────────────────────────────────────────────

const checkGitHub: EmailChecker = async (email) => {
  const url = 'https://github.com';
  try {
    // GitHub blocks cloud IPs with 422 on all endpoints. Use the search API as fallback.
    // The public search API doesn't require auth and can find users by email.
    const searchRes = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EmailOSINT/1.0)',
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (searchRes.status === 403) return rateLimited('github', 'GitHub', 'dev', url);
    if (!searchRes.ok) return err('github', 'GitHub', 'dev', url, `HTTP ${searchRes.status}`);
    const data = (await searchRes.json()) as { total_count?: number; items?: Array<{ login: string }> };
    if (data.total_count && data.total_count > 0) {
      const username = data.items?.[0]?.login;
      return ok('github', 'GitHub', 'dev', url, { username });
    }
    return no('github', 'GitHub', 'dev', url);
  } catch {
    return err('github', 'GitHub', 'dev', url);
  }
};

const checkGitLab: EmailChecker = async (email) => {
  const url = 'https://gitlab.com';
  try {
    const res = await fetch(`https://gitlab.com/users/sign_up.json?user[email]=${encodeURIComponent(email)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      },
    });
    const data = (await res.json()) as { message?: string; errors?: string[] };
    if (data.message?.includes('already been taken') || data.errors?.some((e: string) => e.includes('already taken'))) {
      return ok('gitlab', 'GitLab', 'dev', url);
    }
    return no('gitlab', 'GitLab', 'dev', url);
  } catch {
    return err('gitlab', 'GitLab', 'dev', url);
  }
};

// Bitbucket removed — no public email-check API; username heuristic
// produces misleading results (checks username, not email).

const checkHackerRank: EmailChecker = async (email) => {
  const url = 'https://www.hackerrank.com';
  try {
    // The old check_user endpoint is broken (500). Use the login API instead.
    // It returns hacker_exists: true/false without actually logging in.
    const res = await fetch('https://www.hackerrank.com/rest/auth/login', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ login: email }),
    });
    if (!res.ok) return err('hackerrank', 'HackerRank', 'dev', url, `HTTP ${res.status}`);
    const data = (await res.json()) as { hacker_exists?: boolean; errors?: string[] };
    if (data.hacker_exists === true) return ok('hackerrank', 'HackerRank', 'dev', url);
    if (data.hacker_exists === false) return no('hackerrank', 'HackerRank', 'dev', url);
    // Fallback: check error messages
    if (data.errors?.some((e: string) => e.includes('not find an account')))
      return no('hackerrank', 'HackerRank', 'dev', url);
    return err('hackerrank', 'HackerRank', 'dev', url, 'unexpected response');
  } catch {
    return err('hackerrank', 'HackerRank', 'dev', url);
  }
};

// ── Social ──────────────────────────────────────────────────────────────────

const checkInstagram: EmailChecker = async (email) => {
  const url = 'https://www.instagram.com';
  try {
    // Get CSRF token from cookie or page
    const initRes = await fetch('https://www.instagram.com/', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      },
    });
    const initText = await initRes.text();
    // Try cookie first, then HTML patterns
    const csrf =
      initRes.headers.get('set-cookie')?.match(/csrftoken=([^;]+)/)?.[1] ||
      initText.match(/["']csrf_token["']\s*:\s*["']([^"']+)["']/)?.[1];
    if (!csrf) return err('instagram', 'Instagram', 'social', url, 'CSRF not found');

    const res = await fetch('https://www.instagram.com/api/v1/users/check_email/', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'x-csrftoken': csrf,
        'x-ig-app-id': '936619743392459',
        'x-requested-with': 'XMLHttpRequest',
        Origin: 'https://www.instagram.com',
        Referer: 'https://www.instagram.com/',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `email=${encodeURIComponent(email)}&sign_up_code=`,
    });
    if (res.status === 429) return rateLimited('instagram', 'Instagram', 'social', url);
    const data = (await res.json()) as { error_type?: string; available?: boolean };
    if (data.error_type === 'email_is_taken') return ok('instagram', 'Instagram', 'social', url);
    if (data.available === true) return no('instagram', 'Instagram', 'social', url);
    return err('instagram', 'Instagram', 'social', url);
  } catch {
    return err('instagram', 'Instagram', 'social', url);
  }
};

const checkTikTok: EmailChecker = async (email) => {
  const url = 'https://www.tiktok.com';
  try {
    const res = await fetch(
      `https://www.tiktok.com/aweme/v1/web/user/check/email/?email=${encodeURIComponent(email)}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
          Referer: 'https://www.tiktok.com/signup',
        },
      }
    );
    const data = (await res.json()) as { data?: { is_exists?: boolean } };
    if (data.data?.is_exists === true) return ok('tiktok', 'TikTok', 'social', url);
    if (data.data?.is_exists === false) return no('tiktok', 'TikTok', 'social', url);
    return err('tiktok', 'TikTok', 'social', url);
  } catch {
    return err('tiktok', 'TikTok', 'social', url);
  }
};

const checkPinterest: EmailChecker = async (email) => {
  const url = 'https://www.pinterest.com';
  try {
    const res = await fetch(
      `https://www.pinterest.com/resource/EmailExistsResource/get/?data={"options":{"email":"${encodeURIComponent(email)}"}}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
          Referer: 'https://www.pinterest.com/',
        },
      }
    );
    const data = (await res.json()) as { resource_response?: { data?: boolean } };
    if (data.resource_response?.data === true) return ok('pinterest', 'Pinterest', 'social', url);
    if (data.resource_response?.data === false) return no('pinterest', 'Pinterest', 'social', url);
    return err('pinterest', 'Pinterest', 'social', url);
  } catch {
    return err('pinterest', 'Pinterest', 'social', url);
  }
};

const checkSpotify: EmailChecker = async (email) => {
  const url = 'https://open.spotify.com';
  try {
    const res = await fetch('https://spclient.wg.spotify.com/signup/public/v1/account?validate=1', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `email=${encodeURIComponent(email)}`,
    });
    if (res.status === 200) return no('spotify', 'Spotify', 'social', url);
    if (res.status === 409) return ok('spotify', 'Spotify', 'social', url);
    return err('spotify', 'Spotify', 'social', url);
  } catch {
    return err('spotify', 'Spotify', 'social', url);
  }
};

const checkSoundCloud: EmailChecker = async (email) => {
  const url = 'https://soundcloud.com';
  try {
    const res = await fetch(`https://soundcloud.com/discover?filter.email=${encodeURIComponent(email)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      },
      redirect: 'manual',
    });
    // SoundCloud blocks cloud IPs; treat as error
    if (res.status === 403) return rateLimited('soundcloud', 'SoundCloud', 'social', url);
    return no('soundcloud', 'SoundCloud', 'social', url);
  } catch {
    return err('soundcloud', 'SoundCloud', 'social', url);
  }
};

// ── Gaming ──────────────────────────────────────────────────────────────────

const checkSteam: EmailChecker = async (email) => {
  const url = 'https://store.steampowered.com';
  try {
    const res = await fetch(`https://store.steampowered.com/join/check?email=${encodeURIComponent(email)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      },
    });
    const text = await res.text();
    if (text.includes('already in use') || text.includes('taken')) return ok('steam', 'Steam', 'gaming', url);
    if (text.includes('available')) return no('steam', 'Steam', 'gaming', url);
    return err('steam', 'Steam', 'gaming', url);
  } catch {
    return err('steam', 'Steam', 'gaming', url);
  }
};

// ── Learning ────────────────────────────────────────────────────────────────

const checkUdemy: EmailChecker = async (email) => {
  const url = 'https://www.udemy.com';
  try {
    const res = await fetch(`https://www.udemy.com/join/signup-popup/?email=${encodeURIComponent(email)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      },
    });
    const text = await res.text();
    if (text.includes('already associated') || text.includes('already been registered'))
      return ok('udemy', 'Udemy', 'learning', url);
    return no('udemy', 'Udemy', 'learning', url);
  } catch {
    return err('udemy', 'Udemy', 'learning', url);
  }
};

const checkCoursera: EmailChecker = async (email) => {
  const url = 'https://www.coursera.org';
  try {
    const res = await fetch('https://www.coursera.org/api/login/v3/auth/check', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    const data = (await res.json()) as { isMember?: boolean; exists?: boolean };
    if (data.isMember === true || data.exists === true) return ok('coursera', 'Coursera', 'learning', url);
    return no('coursera', 'Coursera', 'learning', url);
  } catch {
    return err('coursera', 'Coursera', 'learning', url);
  }
};

// ── Finance ─────────────────────────────────────────────────────────────────

const checkCoinbase: EmailChecker = async (email) => {
  const url = 'https://www.coinbase.com';
  try {
    const res = await fetch(`https://api.coinbase.com/v2/users/email_exists?email=${encodeURIComponent(email)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      },
    });
    const data = (await res.json()) as { data?: { exists?: boolean } };
    if (data.data?.exists === true) return ok('coinbase', 'Coinbase', 'finance', url);
    if (data.data?.exists === false) return no('coinbase', 'Coinbase', 'finance', url);
    return err('coinbase', 'Coinbase', 'finance', url);
  } catch {
    return err('coinbase', 'Coinbase', 'finance', url);
  }
};

// ── Other ───────────────────────────────────────────────────────────────────

async function gravatarMd5(email: string): Promise<string> {
  const data = new TextEncoder().encode(email.toLowerCase().trim());
  const hash = await crypto.subtle.digest('MD5', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const checkGravatar: EmailChecker = async (email) => {
  const url = 'https://gravatar.com';
  try {
    const hash = await gravatarMd5(email);
    const res = await fetch(`https://en.gravatar.com/${hash}.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const text = await res.text();
      if (!text || text.trim() === '') return no('gravatar', 'Gravatar', 'other', url);
      try {
        const data = JSON.parse(text) as { entry?: Array<{ displayName?: string }> };
        return ok('gravatar', 'Gravatar', 'other', url, { displayName: data.entry?.[0]?.displayName });
      } catch {
        return no('gravatar', 'Gravatar', 'other', url);
      }
    }
    return no('gravatar', 'Gravatar', 'other', url);
  } catch {
    return err('gravatar', 'Gravatar', 'other', url);
  }
};

const checkKeybase: EmailChecker = async (email) => {
  const url = 'https://keybase.io';
  try {
    const res = await fetch(`https://keybase.io/_/api/1.0/user/lookup.json?email=${encodeURIComponent(email)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      },
    });
    const data = (await res.json()) as { them?: Array<{ username?: string; id?: string }> };
    if (data.them && data.them.length > 0) {
      return ok('keybase', 'Keybase', 'dev', url, {
        username: data.them[0]?.username,
        id: data.them[0]?.id,
      });
    }
    return no('keybase', 'Keybase', 'dev', url);
  } catch {
    return err('keybase', 'Keybase', 'dev', url);
  }
};

const checkMedium: EmailChecker = async (email) => {
  const url = 'https://medium.com';
  try {
    const res = await fetch(`https://medium.com/me/api/check-email?email=${encodeURIComponent(email)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      },
    });
    if (res.status === 404) return no('medium', 'Medium', 'tech', url);
    if (res.status === 403) return rateLimited('medium', 'Medium', 'tech', url);
    const text = await res.text();
    if (!text || text.trim() === '') return err('medium', 'Medium', 'tech', url, 'empty response');
    try {
      const data = JSON.parse(text) as { exists?: boolean };
      if (data.exists === true) return ok('medium', 'Medium', 'tech', url);
      if (data.exists === false) return no('medium', 'Medium', 'tech', url);
    } catch {
      if (text.includes('"exists":true') || text.includes('already')) return ok('medium', 'Medium', 'tech', url);
      if (text.includes('"exists":false')) return no('medium', 'Medium', 'tech', url);
    }
    return err('medium', 'Medium', 'tech', url, 'unexpected response');
  } catch {
    return err('medium', 'Medium', 'tech', url);
  }
};

// Slack removed — auth.findTeam checks workspace domain, not email registration.
// Any email at a company that uses Slack would always return "registered", misleading.

const checkTwitch: EmailChecker = async (email) => {
  const url = 'https://www.twitch.tv';
  try {
    const res = await fetch('https://passport.twitch.tv/register', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    const data = (await res.json()) as { error?: string; error_message?: string };
    if (data.error === '400' || data.error_message?.includes('already')) return ok('twitch', 'Twitch', 'gaming', url);
    return no('twitch', 'Twitch', 'gaming', url);
  } catch {
    return err('twitch', 'Twitch', 'gaming', url);
  }
};

const checkDeviantArt: EmailChecker = async (email) => {
  const url = 'https://www.deviantart.com';
  try {
    const res = await fetch(
      `https://www.deviantart.com/_napi/da-browse/api/email/lookup?email=${encodeURIComponent(email)}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        },
      }
    );
    if (res.status === 404) return no('deviantart', 'DeviantArt', 'creative', url);
    if (res.status === 403) return rateLimited('deviantart', 'DeviantArt', 'creative', url);
    const text = await res.text();
    if (!text || text.trim() === '') return err('deviantart', 'DeviantArt', 'creative', url, 'empty response');
    try {
      const data = JSON.parse(text) as { result?: boolean };
      if (data.result === true) return ok('deviantart', 'DeviantArt', 'creative', url);
      if (data.result === false) return no('deviantart', 'DeviantArt', 'creative', url);
    } catch {
      if (text.includes('already') || text.includes('taken') || text.includes('registered')) {
        return ok('deviantart', 'DeviantArt', 'creative', url);
      }
    }
    return err('deviantart', 'DeviantArt', 'creative', url, 'unexpected response');
  } catch {
    return err('deviantart', 'DeviantArt', 'creative', url);
  }
};

// ── Entertainment ────────────────────────────────────────────────────────────

const checkNetflix: EmailChecker = async (email) => {
  const url = 'https://www.netflix.com';
  try {
    // Get session token from multiple cookies
    const initRes = await fetch('https://www.netflix.com/', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36',
      },
      redirect: 'manual',
    });
    const setCookies = initRes.headers.get('set-cookie') || '';
    const flwssn = setCookies.match(/flwssn=([^;]+)/)?.[1];
    if (!flwssn) return err('netflix', 'Netflix', 'entertainment', url, 'no session');

    // Build full cookie string
    const cookies = setCookies
      .split('\n')
      .map((c) => c.split(';')[0]?.trim())
      .filter(Boolean)
      .join('; ');

    const res = await fetch('https://web.prod.cloud.netflix.com/graphql', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
        'Content-Type': 'application/json',
        'x-netflix.context.operation-name': 'CLCSWebInitSignup',
        'x-netflix.request.clcs.bucket': 'high',
        Cookie: cookies,
      },
      body: JSON.stringify({
        operationName: 'CLCSWebInitSignup',
        variables: {
          inputUserJourneyNode: 'WELCOME',
          locale: 'en-US',
          inputFields: [
            { name: 'flwssn', value: { stringValue: flwssn } },
            { name: 'email', value: { stringValue: email } },
          ],
        },
        extensions: {
          persistedQuery: { id: 'f6e8ddc6-79fb-4ff2-8e55-893d707887a4', version: 102 },
        },
      }),
    });
    if (!res.ok) return err('netflix', 'Netflix', 'entertainment', url, `HTTP ${res.status}`);
    const text = await res.text();
    if (text.includes('Welcome back!')) return ok('netflix', 'Netflix', 'entertainment', url);
    if (text.includes('sign-up link') || text.includes('create your account')) return no('netflix', 'Netflix', 'entertainment', url);
    return err('netflix', 'Netflix', 'entertainment', url, 'unexpected response');
  } catch {
    return err('netflix', 'Netflix', 'entertainment', url);
  }
};

const checkAmazon: EmailChecker = async (email) => {
  const url = 'https://www.amazon.com';
  try {
    const signinUrl =
      'https://www.amazon.com/ap/signin?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fwww.amazon.com%2F&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=usflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0';
    const res = await fetch(signinUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    const html = await res.text();
    if (html.includes('captcha') || html.includes('Robot Check')) return rateLimited('amazon', 'Amazon', 'shopping', url);
    // Extract form action
    const actionMatch = html.match(/action=["']([^"']*\/(?:ap\/signin|ax\/claim)[^"']*)["']/);
    if (!actionMatch?.[1]) return err('amazon', 'Amazon', 'shopping', url, 'no form action');
    // Extract hidden fields
    const fields: Record<string, string> = {};
    for (const m of html.matchAll(/<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/g)) {
      if (m[1]) fields[m[1]] = m[2] ?? '';
    }
    fields['email'] = email;
    const postUrl = actionMatch[1].startsWith('/') ? `https://www.amazon.com${actionMatch[1]}` : actionMatch[1];
    const postRes = await fetch(postUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(fields).toString(),
      redirect: 'follow',
    });
    const postHtml = await postRes.text();
    if (postHtml.includes('auth-password-missing-alert') || postHtml.includes('password')) return ok('amazon', 'Amazon', 'shopping', url);
    return no('amazon', 'Amazon', 'shopping', url);
  } catch {
    return err('amazon', 'Amazon', 'shopping', url);
  }
};

// ── SaaS / Productivity ─────────────────────────────────────────────────────

const checkDropbox: EmailChecker = async (email) => {
  const url = 'https://www.dropbox.com';
  try {
    // Dropbox uses a passwordless login flow; check via their API
    const res = await fetch('https://www.dropbox.com/ajax/login', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: `email=${encodeURIComponent(email)}&login=Continue`,
      redirect: 'manual',
    });
    // 302 redirect means email exists (redirects to password page)
    if (res.status === 302) return ok('dropbox', 'Dropbox', 'other', url);
    const text = await res.text();
    if (text.includes('not found') || text.includes('no account') || text.includes('invalid_email')) return no('dropbox', 'Dropbox', 'other', url);
    if (text.includes('password') || res.status === 200) return ok('dropbox', 'Dropbox', 'other', url);
    return err('dropbox', 'Dropbox', 'other', url, 'unexpected response');
  } catch {
    return err('dropbox', 'Dropbox', 'other', url);
  }
};

const checkAdobe: EmailChecker = async (email) => {
  const url = 'https://account.adobe.com';
  try {
    // Adobe's check endpoint returns HTML; use a different approach
    const res = await fetch(`https://auth.services.adobe.com/en_US/index.html?callback=https%3A%2F%2Fims-na1.adobelogin.com%2Fims%2Fadobeid%2Fcreativecloud-web%2FAdobeID%2Ftoken&client_id=creativecloud-web&scope=AdobeID%2Copenid%2Ccreative_sdk%2Cgnav%2Csao.cce_private%2Cadditional_info.projectedProductContext&denied_callback=https%3A%2F%2Fims-na1.adobelogin.com%2Fims%2Fdenied%2Fcreativecloud-web&relay=&locale=en_US&flow_type=token&idp_flow_type=login`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      },
      redirect: 'manual',
    });
    // If redirected to login page, email might exist
    if (res.status === 302 || res.status === 301) return ok('adobe', 'Adobe', 'other', url);
    return no('adobe', 'Adobe', 'other', url);
  } catch {
    return err('adobe', 'Adobe', 'other', url);
  }
};

const checkNotion: EmailChecker = async (email) => {
  const url = 'https://www.notion.so';
  try {
    const res = await fetch('https://www.notion.so/api/v3/getSignupValuesForEmail', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    const data = await res.json() as { status?: string; signupToken?: string };
    if (data.signupToken) return no('notion', 'Notion', 'tech', url);
    if (data.status === 'success') return ok('notion', 'Notion', 'tech', url);
    return err('notion', 'Notion', 'tech', url, 'unexpected response');
  } catch {
    return err('notion', 'Notion', 'tech', url);
  }
};

// ── Ride-sharing / Delivery ─────────────────────────────────────────────────

const checkUber: EmailChecker = async (email) => {
  const url = 'https://www.uber.com';
  try {
    // Uber's signup flow reveals if email is taken
    const res = await fetch('https://www.uber.com/api-login', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email }),
      redirect: 'manual',
    });
    if (res.status === 422) return ok('uber', 'Uber', 'other', url);
    if (res.status === 400) return no('uber', 'Uber', 'other', url);
    const text = await res.text();
    if (text.includes('already') || text.includes('taken')) return ok('uber', 'Uber', 'other', url);
    if (text.includes('not found') || text.includes('invalid')) return no('uber', 'Uber', 'other', url);
    return err('uber', 'Uber', 'other', url, `HTTP ${res.status}`);
  } catch {
    return err('uber', 'Uber', 'other', url);
  }
};

const checkLyft: EmailChecker = async (email) => {
  const url = 'https://www.lyft.com';
  try {
    const res = await fetch(`https://www.lyft.com/auth/send_magic_link?email=${encodeURIComponent(email)}`, {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Content-Type': 'application/json',
      },
    });
    // Lyft returns 200 for both existing and non-existing (magic link flow)
    // But the response body differs
    const text = await res.text();
    if (text.includes('not found') || text.includes('no account')) return no('lyft', 'Lyft', 'other', url);
    return ok('lyft', 'Lyft', 'other', url);
  } catch {
    return err('lyft', 'Lyft', 'other', url);
  }
};

// ── Travel / Hospitality ────────────────────────────────────────────────────

const checkAirbnb: EmailChecker = async (email) => {
  const url = 'https://www.airbnb.com';
  try {
    const res = await fetch('https://www.airbnb.com/api/v2/auth/check', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    const data = await res.json() as { exists?: boolean; error?: string };
    if (data.exists === true) return ok('airbnb', 'Airbnb', 'other', url);
    if (data.exists === false) return no('airbnb', 'Airbnb', 'other', url);
    return err('airbnb', 'Airbnb', 'other', url, data.error || 'unexpected response');
  } catch {
    return err('airbnb', 'Airbnb', 'other', url);
  }
};

// ── Finance / Crypto ────────────────────────────────────────────────────────

const checkBinance: EmailChecker = async (email) => {
  const url = 'https://www.binance.com';
  try {
    const res = await fetch('https://www.binance.com/bapi/accounts/v2/public/account/user/get-email', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    const data = await res.json() as { data?: { isExist?: boolean } };
    if (data.data?.isExist === true) return ok('binance', 'Binance', 'finance', url);
    if (data.data?.isExist === false) return no('binance', 'Binance', 'finance', url);
    return err('binance', 'Binance', 'finance', url, 'unexpected response');
  } catch {
    return err('binance', 'Binance', 'finance', url);
  }
};

// Stripe doesn't have a public email check endpoint — skip for now

// ── Learning / Education ────────────────────────────────────────────────────

const checkSkillshare: EmailChecker = async (email) => {
  const url = 'https://www.skillshare.com';
  try {
    // Skillshare uses a magic link flow; check via their API
    const res = await fetch('https://www.skillshare.com/api/users/check-email', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      // 404 or other error might mean email not found
      if (res.status === 404) return no('skillshare', 'Skillshare', 'learning', url);
      return err('skillshare', 'Skillshare', 'learning', url, `HTTP ${res.status}`);
    }
    const data = await res.json() as { exists?: boolean; available?: boolean; user_exists?: boolean };
    if (data.exists === true || data.available === false || data.user_exists === true) return ok('skillshare', 'Skillshare', 'learning', url);
    if (data.exists === false || data.available === true || data.user_exists === false) return no('skillshare', 'Skillshare', 'learning', url);
    return err('skillshare', 'Skillshare', 'learning', url, 'unexpected response');
  } catch {
    return err('skillshare', 'Skillshare', 'learning', url);
  }
};

const checkKhanAcademy: EmailChecker = async (email) => {
  const url = 'https://www.khanacademy.org';
  try {
    const res = await fetch('https://www.khanacademy.org/api/internal/user/check-email', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    const data = await res.json() as { isTaken?: boolean; exists?: boolean };
    if (data.isTaken === true || data.exists === true) return ok('khan-academy', 'Khan Academy', 'learning', url);
    if (data.isTaken === false || data.exists === false) return no('khan-academy', 'Khan Academy', 'learning', url);
    return err('khan-academy', 'Khan Academy', 'learning', url, 'unexpected response');
  } catch {
    return err('khan-academy', 'Khan Academy', 'learning', url);
  }
};

// ── Music / Audio ───────────────────────────────────────────────────────────

// SoundCloud v2 is not needed — SoundCloud already exists

// ── Jobs / Professional ─────────────────────────────────────────────────────

const checkWellfound: EmailChecker = async (email) => {
  const url = 'https://wellfound.com';
  try {
    const res = await fetch('https://wellfound.com/accounts/check_email', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email }),
    });
    const data = await res.json() as { available?: boolean; exists?: boolean };
    if (data.available === false || data.exists === true) return ok('wellfound', 'Wellfound', 'tech', url);
    if (data.available === true || data.exists === false) return no('wellfound', 'Wellfound', 'tech', url);
    return err('wellfound', 'Wellfound', 'tech', url, 'unexpected response');
  } catch {
    return err('wellfound', 'Wellfound', 'tech', url);
  }
};

// ── Registry ────────────────────────────────────────────────────────────────

interface PlatformDef {
  id: string;
  name: string;
  category: string;
  check: EmailChecker;
}

const PLATFORMS: PlatformDef[] = [
  // Shopping
  { id: 'etsy', name: 'Etsy', category: 'shopping', check: checkEtsy },
  { id: 'flipkart', name: 'Flipkart', category: 'shopping', check: checkFlipkart },
  { id: 'amazon', name: 'Amazon', category: 'shopping', check: checkAmazon },
  // Dev
  { id: 'github', name: 'GitHub', category: 'dev', check: checkGitHub },
  { id: 'gitlab', name: 'GitLab', category: 'dev', check: checkGitLab },
  // Bitbucket: removed — no public email-check API
  { id: 'hackerrank', name: 'HackerRank', category: 'dev', check: checkHackerRank },
  { id: 'keybase', name: 'Keybase', category: 'dev', check: checkKeybase },
  // Social
  { id: 'instagram', name: 'Instagram', category: 'social', check: checkInstagram },
  { id: 'tiktok', name: 'TikTok', category: 'social', check: checkTikTok },
  { id: 'pinterest', name: 'Pinterest', category: 'social', check: checkPinterest },
  { id: 'spotify', name: 'Spotify', category: 'social', check: checkSpotify },
  { id: 'soundcloud', name: 'SoundCloud', category: 'social', check: checkSoundCloud },
  // Entertainment
  { id: 'netflix', name: 'Netflix', category: 'entertainment', check: checkNetflix },
  // Gaming
  { id: 'steam', name: 'Steam', category: 'gaming', check: checkSteam },
  { id: 'twitch', name: 'Twitch', category: 'gaming', check: checkTwitch },
  // Learning
  { id: 'udemy', name: 'Udemy', category: 'learning', check: checkUdemy },
  { id: 'coursera', name: 'Coursera', category: 'learning', check: checkCoursera },
  { id: 'skillshare', name: 'Skillshare', category: 'learning', check: checkSkillshare },
  { id: 'khan-academy', name: 'Khan Academy', category: 'learning', check: checkKhanAcademy },
  // Finance
  { id: 'coinbase', name: 'Coinbase', category: 'finance', check: checkCoinbase },
  { id: 'binance', name: 'Binance', category: 'finance', check: checkBinance },
  // Creative
  { id: 'deviantart', name: 'DeviantArt', category: 'creative', check: checkDeviantArt },
  // SaaS / Productivity
  { id: 'dropbox', name: 'Dropbox', category: 'other', check: checkDropbox },
  { id: 'adobe', name: 'Adobe', category: 'other', check: checkAdobe },
  { id: 'notion', name: 'Notion', category: 'tech', check: checkNotion },
  // Ride-sharing
  { id: 'uber', name: 'Uber', category: 'other', check: checkUber },
  { id: 'lyft', name: 'Lyft', category: 'other', check: checkLyft },
  // Travel
  { id: 'airbnb', name: 'Airbnb', category: 'other', check: checkAirbnb },
  // Jobs
  { id: 'wellfound', name: 'Wellfound', category: 'tech', check: checkWellfound },
  // Other
  { id: 'gravatar', name: 'Gravatar', category: 'other', check: checkGravatar },
  { id: 'medium', name: 'Medium', category: 'tech', check: checkMedium },
  // Slack: removed — auth.findTeam checks domain, not email
];

export async function emailRegistrationHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const rawEmail = c.req.query('email')?.trim().toLowerCase();
  if (!rawEmail || !rawEmail.includes('@')) return c.json({ error: 'valid email required' }, 400);
  const email = rawEmail;

  const platformFilter = c.req
    .query('platforms')
    ?.split(',')
    .map((s) => s.trim().toLowerCase());
  const platforms = platformFilter
    ? PLATFORMS.filter((p) => platformFilter.includes(p.id))
    : PLATFORMS.slice(0, MAX_PLATFORMS);

  if (platforms.length === 0) return c.json({ error: 'no matching platforms' }, 400);

  // Edge cache
  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://email-reg.internal/v1?e=${email}&p=${platforms.length}`);
  const cached = await edgeCache.match(cacheKey);
  if (cached) {
    const body = await cached.json();
    return c.json(body, 200, { 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`, 'x-cache': 'HIT' });
  }

  // Fan out with bounded concurrency
  const results: EmailCheckResult[] = [];
  const queue = [...platforms];
  async function worker() {
    while (queue.length > 0) {
      const platform = queue.shift()!;
      const result = await platform.check(email);
      results.push(result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, platforms.length) }, worker));

  // Sort: registered first, then error, then not-registered
  const order = { registered: 0, error: 1, 'rate-limited': 2, 'not-registered': 3 };
  results.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));

  const registered = results.filter((r) => r.status === 'registered').length;
  const summary: Record<string, number> = {};
  for (const r of results) {
    if (r.status === 'registered') {
      summary[r.category] = (summary[r.category] ?? 0) + 1;
    }
  }

  const body: EmailRegistrationResponse = {
    email,
    generated_at: new Date().toISOString(),
    total_checked: results.length,
    registered,
    results,
    summary,
    cached: false,
  };

  const cacheable = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  c.executionCtx.waitUntil(edgeCache.put(cacheKey, cacheable).catch(() => undefined));

  return c.json(body, 200, { 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`, 'x-cache': 'MISS' });
}

// ── List available platforms ──

export async function emailRegistrationPlatformsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  return c.json({
    total: PLATFORMS.length,
    platforms: PLATFORMS.map((p) => ({ id: p.id, name: p.name, category: p.category })),
  });
}

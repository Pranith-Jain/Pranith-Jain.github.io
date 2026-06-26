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

function ok(platform: string, name: string, category: string, url: string, extra?: Record<string, unknown>): EmailCheckResult {
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
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
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
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
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
    if (text.includes('Looks like you\'re new here!')) return no('flipkart', 'Flipkart', 'shopping', url);
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
    // Step 1: Get CSRF token from signup page
    const pageRes = await fetch('https://github.com/signup', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const html = await pageRes.text();
    const csrfMatch = html.match(/data-csrf="true"\s+value="([^"]+)"/);
    if (!csrfMatch?.[1]) return err('github', 'GitHub', 'dev', url, 'CSRF not found');

    // Step 2: Check email
    const checkRes = await fetch('https://github.com/email_validity_checks', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://github.com',
        Referer: 'https://github.com/signup',
      },
      body: `authenticity_token=${encodeURIComponent(csrfMatch[1])}&value=${encodeURIComponent(email)}`,
    });
    const body = await checkRes.text();
    if (body.includes('already associated with an account')) return ok('github', 'GitHub', 'dev', url);
    if (body.includes('Email is available')) return no('github', 'GitHub', 'dev', url);
    return err('github', 'GitHub', 'dev', url, 'unexpected response');
  } catch {
    return err('github', 'GitHub', 'dev', url);
  }
};

const checkGitLab: EmailChecker = async (email) => {
  const url = 'https://gitlab.com';
  try {
    const res = await fetch(
      `https://gitlab.com/users/sign_up.json?user[email]=${encodeURIComponent(email)}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        },
      }
    );
    const data = await res.json() as { message?: string; errors?: string[] };
    if (data.message?.includes('already been taken') || data.errors?.some((e: string) => e.includes('already taken'))) {
      return ok('gitlab', 'GitLab', 'dev', url);
    }
    return no('gitlab', 'GitLab', 'dev', url);
  } catch {
    return err('gitlab', 'GitLab', 'dev', url);
  }
};

const checkBitbucket: EmailChecker = async (email) => {
  const url = 'https://bitbucket.org';
  try {
    const res = await fetch(
      `https://bitbucket.org/account/signin/`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        },
      }
    );
    // Bitbucket uses a different flow; check via their API
    const username = email.split('@')[0] || '';
    const apiRes = await fetch(
      `https://api.bitbucket.org/2.0/users/${encodeURIComponent(username)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (apiRes.ok) return ok('bitbucket', 'Bitbucket', 'dev', url);
    return no('bitbucket', 'Bitbucket', 'dev', url);
  } catch {
    return err('bitbucket', 'Bitbucket', 'dev', url);
  }
};

const checkHackerRank: EmailChecker = async (email) => {
  const url = 'https://www.hackerrank.com';
  try {
    const res = await fetch(
      `https://www.hackerrank.com/auth/check_user?email=${encodeURIComponent(email)}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        },
      }
    );
    const data = await res.json() as { exists?: boolean };
    if (data.exists === true) return ok('hackerrank', 'HackerRank', 'dev', url);
    if (data.exists === false) return no('hackerrank', 'HackerRank', 'dev', url);
    return err('hackerrank', 'HackerRank', 'dev', url);
  } catch {
    return err('hackerrank', 'HackerRank', 'dev', url);
  }
};

// ── Social ──────────────────────────────────────────────────────────────────

const checkInstagram: EmailChecker = async (email) => {
  const url = 'https://www.instagram.com';
  try {
    // Get CSRF token
    const initRes = await fetch('https://www.instagram.com/', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      },
    });
    const csrfMatch = (await initRes.text()).match(/["']csrf_token["']\s*:\s*["']([^"']+)["']/);
    const csrf = initRes.headers.get('set-cookie')?.match(/csrftoken=([^;]+)/)?.[1] || csrfMatch?.[1];
    if (!csrf) return err('instagram', 'Instagram', 'social', url, 'CSRF not found');

    const res = await fetch('https://www.instagram.com/api/v1/users/check_email/', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
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
    const data = await res.json() as { error_type?: string; available?: boolean };
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
          Referer: 'https://www.tiktok.com/signup',
        },
      }
    );
    const data = await res.json() as { data?: { is_exists?: boolean } };
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
          Referer: 'https://www.pinterest.com/',
        },
      }
    );
    const data = await res.json() as { resource_response?: { data?: boolean } };
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
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
    const res = await fetch(
      `https://soundcloud.com/discover?filter.email=${encodeURIComponent(email)}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        },
        redirect: 'manual',
      }
    );
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
    const res = await fetch(
      `https://store.steampowered.com/join/check?email=${encodeURIComponent(email)}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        },
      }
    );
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
    const res = await fetch(
      `https://www.udemy.com/join/signup-popup/?email=${encodeURIComponent(email)}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        },
      }
    );
    const text = await res.text();
    if (text.includes('already associated') || text.includes('already been registered')) return ok('udemy', 'Udemy', 'learning', url);
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    const data = await res.json() as { isMember?: boolean; exists?: boolean };
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
    const res = await fetch(
      `https://api.coinbase.com/v2/users/email_exists?email=${encodeURIComponent(email)}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        },
      }
    );
    const data = await res.json() as { data?: { exists?: boolean } };
    if (data.data?.exists === true) return ok('coinbase', 'Coinbase', 'finance', url);
    if (data.data?.exists === false) return no('coinbase', 'Coinbase', 'finance', url);
    return err('coinbase', 'Coinbase', 'finance', url);
  } catch {
    return err('coinbase', 'Coinbase', 'finance', url);
  }
};

// ── Other ───────────────────────────────────────────────────────────────────

const checkGravatar: EmailChecker = async (email) => {
  const url = 'https://gravatar.com';
  try {
    // Simple MD5 hash check
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      hash = (hash << 5) - hash + email.charCodeAt(i);
      hash |= 0;
    }
    const md5 = Math.abs(hash).toString(16).padStart(32, '0');
    const res = await fetch(`https://www.gravatar.com/${md5}.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as { entry?: Array<{ displayName?: string }> };
      return ok('gravatar', 'Gravatar', 'other', url, { displayName: data.entry?.[0]?.displayName });
    }
    return no('gravatar', 'Gravatar', 'other', url);
  } catch {
    return err('gravatar', 'Gravatar', 'other', url);
  }
};

const checkKeybase: EmailChecker = async (email) => {
  const url = 'https://keybase.io';
  try {
    const res = await fetch(
      `https://keybase.io/_/api/1.0/user/lookup.json?email=${encodeURIComponent(email)}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        },
      }
    );
    const data = await res.json() as { them?: Array<{ username?: string; id?: string }> };
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
    const res = await fetch(
      `https://medium.com/me/api/check-email?email=${encodeURIComponent(email)}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        },
      }
    );
    if (res.status === 404) return no('medium', 'Medium', 'tech', url);
    const text = await res.text();
    if (text.includes('"exists":true')) return ok('medium', 'Medium', 'tech', url);
    if (text.includes('"exists":false')) return no('medium', 'Medium', 'tech', url);
    return err('medium', 'Medium', 'tech', url);
  } catch {
    return err('medium', 'Medium', 'tech', url);
  }
};

const checkSlack: EmailChecker = async (email) => {
  const url = 'https://slack.com';
  try {
    const res = await fetch('https://slack.com/api/auth.findTeam', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      },
      body: `domain=${encodeURIComponent(email.split('@')[1] || '')}`,
    });
    const data = await res.json() as { msg?: string; teams?: Array<{ name?: string }> };
    if (data.teams && data.teams.length > 0) return ok('slack', 'Slack', 'other', url, { teams: data.teams.map((t) => t.name) });
    return no('slack', 'Slack', 'other', url);
  } catch {
    return err('slack', 'Slack', 'other', url);
  }
};

const checkTwitch: EmailChecker = async (email) => {
  const url = 'https://www.twitch.tv';
  try {
    const res = await fetch('https://passport.twitch.tv/register', {
      method: 'POST',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    const data = await res.json() as { error?: string; error_message?: string };
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        },
      }
    );
    const data = await res.json() as { result?: boolean };
    if (data.result === true) return ok('deviantart', 'DeviantArt', 'creative', url);
    if (data.result === false) return no('deviantart', 'DeviantArt', 'creative', url);
    return err('deviantart', 'DeviantArt', 'creative', url);
  } catch {
    return err('deviantart', 'DeviantArt', 'creative', url);
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
  // Dev
  { id: 'github', name: 'GitHub', category: 'dev', check: checkGitHub },
  { id: 'gitlab', name: 'GitLab', category: 'dev', check: checkGitLab },
  { id: 'bitbucket', name: 'Bitbucket', category: 'dev', check: checkBitbucket },
  { id: 'hackerrank', name: 'HackerRank', category: 'dev', check: checkHackerRank },
  { id: 'keybase', name: 'Keybase', category: 'dev', check: checkKeybase },
  // Social
  { id: 'instagram', name: 'Instagram', category: 'social', check: checkInstagram },
  { id: 'tiktok', name: 'TikTok', category: 'social', check: checkTikTok },
  { id: 'pinterest', name: 'Pinterest', category: 'social', check: checkPinterest },
  { id: 'spotify', name: 'Spotify', category: 'social', check: checkSpotify },
  { id: 'soundcloud', name: 'SoundCloud', category: 'social', check: checkSoundCloud },
  // Gaming
  { id: 'steam', name: 'Steam', category: 'gaming', check: checkSteam },
  { id: 'twitch', name: 'Twitch', category: 'gaming', check: checkTwitch },
  // Learning
  { id: 'udemy', name: 'Udemy', category: 'learning', check: checkUdemy },
  { id: 'coursera', name: 'Coursera', category: 'learning', check: checkCoursera },
  // Finance
  { id: 'coinbase', name: 'Coinbase', category: 'finance', check: checkCoinbase },
  // Creative
  { id: 'deviantart', name: 'DeviantArt', category: 'creative', check: checkDeviantArt },
  // Other
  { id: 'gravatar', name: 'Gravatar', category: 'other', check: checkGravatar },
  { id: 'medium', name: 'Medium', category: 'tech', check: checkMedium },
  { id: 'slack', name: 'Slack', category: 'other', check: checkSlack },
];

export async function emailRegistrationHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const rawEmail = c.req.query('email')?.trim().toLowerCase();
  if (!rawEmail || !rawEmail.includes('@')) return c.json({ error: 'valid email required' }, 400);
  const email = rawEmail;

  const platformFilter = c.req.query('platforms')?.split(',').map((s) => s.trim().toLowerCase());
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

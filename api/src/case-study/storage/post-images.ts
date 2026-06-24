import type { KVNamespace } from '@cloudflare/workers-types';
import { kv } from '../kv-keys';

/** Store AI-generated illustration bytes for a post. */
export async function putPostImage(ns: KVNamespace, slug: string, name: string, bytes: Uint8Array): Promise<void> {
  // KV value is the raw bytes; the public route serves them as image/jpeg.
  await ns.put(kv.postImage(slug, name), bytes as unknown as ArrayBuffer);
}

/** Read AI-generated illustration bytes for a post (null when absent). */
export async function getPostImage(ns: KVNamespace, slug: string, name: string): Promise<ArrayBuffer | null> {
  return (await ns.get(kv.postImage(slug, name), 'arrayBuffer')) as ArrayBuffer | null;
}

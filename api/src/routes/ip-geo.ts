import type { Context } from 'hono';
import type { Env } from '../env';
import { createIpGeoController } from '../controllers';

export async function ipGeoHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const controller = createIpGeoController();
  return controller.lookup(c);
}

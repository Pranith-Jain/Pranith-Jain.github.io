import type { Context } from 'hono';
import type { Env } from '../env';
import { createIocController } from '../controllers';

export async function iocCheckHandler(c: Context<{ Bindings: Env }>) {
  const controller = createIocController();
  return controller.check(c);
}

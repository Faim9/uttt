import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { Store } from './store.ts';

const production = process.env.NODE_ENV === 'production';
const webRoot = fileURLToPath(new URL('../../web/build', import.meta.url));
if (production && !existsSync(webRoot)) throw new Error('Run `pnpm build` before starting');

const store = new Store(process.env.DATABASE_PATH ?? 'uttt.db');
const app = await buildApp({ store, webRoot: production ? webRoot : undefined, logger: true });
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });

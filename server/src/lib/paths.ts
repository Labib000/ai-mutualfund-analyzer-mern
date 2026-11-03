import path from 'node:path';

/** Repo root: this file is server/{src,dist}/lib/paths.*. */
export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

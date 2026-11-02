import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const projectRoot=fs.realpathSync(path.resolve(fileURLToPath(new URL('../',import.meta.url))));
export const workspaceId=crypto.createHash('sha256').update(projectRoot.toLowerCase()).digest('hex');

// Offline verification. Never prints secret values.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {projectRoot} from './workspace-id.mjs';
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const baseline=JSON.parse(fs.readFileSync(path.join(projectRoot,'data/processed/phase3c_baseline.json')));
const preserved=Object.entries(baseline.hashes).map(([file,hash])=>({file,unchanged:crypto.createHash('sha256').update(fs.readFileSync(path.resolve(projectRoot,file))).digest('hex')===hash}));
assert(preserved.every(p=>p.unchanged),'Protected offline logic/data changed');
const sentinel=process.env.NOTEPICK_BUILD_SENTINEL;
const files=walk(path.join(projectRoot,'frontend/dist')).filter(f=>/\.(js|css|html|map)$/.test(f));
for(const file of files){const text=fs.readFileSync(file,'utf8');assert(!text.includes('DEEPSEEK_API_KEY'),'Server-only variable appeared in frontend bundle');assert(!text.includes('api.deepseek.com'),'Frontend must call local backend only');if(sentinel)assert(!text.includes(sentinel),'Build secret appeared in frontend bundle');}
const ignore=fs.readFileSync(path.join(projectRoot,'.gitignore'),'utf8');assert(ignore.includes('**/.env')&&ignore.includes('**/.env.*')&&ignore.includes('!**/.env.example'));
assert(!walk(path.join(projectRoot,'frontend/src')).some(f=>/\.(jsx?|json)$/.test(f)&&/DEEPSEEK_API_KEY|Authorization\s*:/.test(fs.readFileSync(f,'utf8'))));
const result={status:'passed',bundleFiles:files.length,buildSentinelChecked:!!sentinel,clientCallsLocalBackendOnly:true,environmentIgnorePatternsPresent:true,protectedFiles:preserved};
fs.writeFileSync(path.join(projectRoot,'data/processed/deepseek_security_report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,bundleFiles:files.length,buildSentinelChecked:!!sentinel,protectedFiles:preserved.length}));

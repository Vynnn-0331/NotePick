// One local command; no shell interpolation and no secrets passed to Vite.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {projectRoot,workspaceId} from './workspace-id.mjs';
const frontendPort=Number(process.env.NOTEPICK_FRONTEND_PORT??5173),apiPort=Number(process.env.NOTEPICK_API_PORT??8787);
if(![frontendPort,apiPort].every(p=>Number.isInteger(p)&&p>=1024&&p<=65535))throw Error('Invalid local ports');
const children=[];let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const c of children)c.kill('SIGTERM');}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
async function probe(port,url){try{const response=await fetch(`http://127.0.0.1:${port}${url}`,{signal:AbortSignal.timeout(1000)});return {occupied:true,data:await response.json().catch(()=>null)};}catch(e){return {occupied:!['ECONNREFUSED','ENOTFOUND'].includes(e.cause?.code),data:null};}}
function start(file,args,cwd,env){const child=spawn(process.execPath,[file,...args],{cwd,env,stdio:'inherit',windowsHide:true});children.push(child);child.once('error',()=>{console.error('NotePick子进程无法启动。');process.exitCode=1;stop();});child.once('exit',code=>{if(!stopping){process.exitCode=code||1;stop();}});return child;}
try{
 const buildEnv={...process.env};for(const k of Object.keys(buildEnv))if(/DEEPSEEK/i.test(k))delete buildEnv[k];
 await new Promise((resolve,reject)=>{const compiler=spawn(process.execPath,[path.join(projectRoot,'scripts/build_recommendation_knowledge.mjs')],{cwd:projectRoot,env:buildEnv,stdio:'inherit',windowsHide:true});compiler.once('error',reject);compiler.once('exit',code=>code===0?resolve():reject(Error('离线硬件资料校验失败，请先检查数据生成步骤。')));});
 const dataVersion=crypto.createHash('sha256').update(['frontend/src/data/catalog.json','frontend/src/data/performanceRuntime.json'].map(f=>JSON.stringify(JSON.parse(fs.readFileSync(path.join(projectRoot,f))))).join('')).digest('hex');
 const backend=await probe(apiPort,'/api/health'),frontend=await probe(frontendPort,'/_notepick/dev');
 if(backend.occupied&&(backend.data?.service!=='notepick-ai'||backend.data.workspaceId!==workspaceId))throw Error(`${apiPort}端口已被其他服务占用，请关闭冲突服务或更换NOTEPICK_API_PORT。`);
 if(backend.occupied&&backend.data.dataVersion!==dataVersion)throw Error('现有AI服务版本或数据已变化，请先在原终端停止AI服务，再运行本启动命令。');
 if(frontend.occupied&&(frontend.data?.service!=='notepick-vite'||frontend.data.workspaceId!==workspaceId))throw Error(`${frontendPort}端口已被其他项目占用，请关闭旧服务后再启动。`);
 if(!fs.existsSync(path.join(projectRoot,'frontend/node_modules/vite/bin/vite.js')))throw Error('请先运行 npm --prefix frontend install 安装已有依赖。');
 if(!backend.occupied)start(path.join(projectRoot,'backend/server.mjs'),[],projectRoot,process.env);else console.log('复用本项目现有AI服务；backend/.env修改后下次点击生效，修改进程环境变量需重启。');
 if(!frontend.occupied){const env={...process.env};for(const k of Object.keys(env))if(/DEEPSEEK/i.test(k))delete env[k];start(path.join(projectRoot,'frontend/node_modules/vite/bin/vite.js'),['--host','127.0.0.1','--port',String(frontendPort),'--strictPort'],path.join(projectRoot,'frontend'),env);}else console.log('复用本项目现有Vite服务。');
 console.log(`NotePick网页：http://127.0.0.1:${frontendPort}/；AI本地服务：http://127.0.0.1:${apiPort}。Ctrl+C停止本命令启动的服务。`);
}catch(e){console.error(e.message);process.exitCode=1;stop();}

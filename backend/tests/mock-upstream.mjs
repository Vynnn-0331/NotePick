// Test-only HTTP upstream. Production never imports this file or accepts a mock URL.
import http from 'node:http';
import {once} from 'node:events';
import {mockAnswer} from './mock-fixture.mjs';
export async function startMockUpstream(){
 const state={status:200,delay:0,empty:false,unsafe:false,network:false,html:false},requests=[];let aborted=0;
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(req.headers.authorization!=='Bearer mock-only-not-a-real-key'||req.url!=='/chat/completions'){res.writeHead(403);res.end();return;}
  const entry={payload,kind:JSON.parse(payload.messages.at(-1).content).mode};requests.push(entry);const s={...state};
  if(s.network){res.destroy();return;}
  const timer=setTimeout(()=>{
   if(res.destroyed)return;
   res.setHeader('Content-Type','application/json');res.statusCode=s.status;
   if(s.status!==200){res.end(JSON.stringify({error:{message:'mock upstream private details should not surface'}}));return;}
   const context=JSON.parse(payload.messages[1].content).trustedContext,answer=mockAnswer(context,entry.kind==='followup');
   if(s.unsafe&&answer.products)answer.products[0].meaning='游戏表现120FPS，显存8GB。';
   if(s.html&&entry.kind==='followup')answer.answer='<img src=x onerror="window.__aiUnsafe=true">【接口模拟】HTML应作为普通文字显示。';
   entry.answer=answer;res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:s.empty?'':JSON.stringify(answer)}}]}));
  },s.delay);
  res.on('close',()=>{if(!res.writableFinished){aborted++;clearTimeout(timer);}});
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 return {state,requests,get aborted(){return aborted;},url:`http://127.0.0.1:${server.address().port}/chat/completions`,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}

import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
export const imageDirectory=fileURLToPath(new URL('./public/product-images/',import.meta.url));
export function readLocalImages(dir=imageDirectory){
 let mapping={};try{mapping=JSON.parse(fs.readFileSync(path.join(dir,'mapping.json'),'utf8'));}catch{}const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>/\.(?:jpe?g|png|webp|avif)$/i.test(n)):[];const result={};
 for(const name of files){const id=path.parse(name).name;if(/^np-[a-f0-9]+$/.test(id)&&!result[id])result[id]='/product-images/'+encodeURIComponent(name);}
 for(const [id,name]of Object.entries(mapping))if(/^np-[a-f0-9]+$/.test(id)&&typeof name==='string'&&files.includes(name)&&path.basename(name)===name)result[id]='/product-images/'+encodeURIComponent(name);
 return result;
}
export function localImagesPlugin(){const virtual='virtual:notepick-local-images',resolved='\0'+virtual;return {name:'notepick-local-product-images',resolveId(id){if(id===virtual)return resolved;},load(id){if(id===resolved)return 'export default '+JSON.stringify(readLocalImages());},configureServer(server){server.watcher.add(imageDirectory);const update=file=>{if(path.resolve(file).startsWith(path.resolve(imageDirectory)+path.sep)){const mod=server.moduleGraph.getModuleById(resolved);if(mod)server.moduleGraph.invalidateModule(mod);server.ws.send({type:'full-reload'});}};server.watcher.on('add',update).on('unlink',update).on('change',update);}};}

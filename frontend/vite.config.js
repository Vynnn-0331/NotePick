import {localImagesPlugin} from './local-images.mjs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {localApiProxy} from './dev-proxy.mjs';
import {workspaceId} from '../scripts/workspace-id.mjs';
export default defineConfig({
 envDir:false,
 plugins:[localImagesPlugin(),react(),tailwindcss(),{name:'notepick-local-identity',config(){
  if(Object.keys(process.env).some(k=>/^VITE_.*(?:DEEPSEEK|API_KEY|SECRET|TOKEN)/i.test(k)))throw new Error('Do not put secrets in VITE_* variables; use backend/.env.');
 },configureServer(server){server.middlewares.use('/_notepick/dev',(req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:'notepick-vite',workspaceId}));});}}],
 server:{host:'127.0.0.1',port:Number(process.env.NOTEPICK_FRONTEND_PORT??5173),strictPort:true,proxy:{'/api':localApiProxy(`http://127.0.0.1:${process.env.NOTEPICK_API_PORT??8787}`)}}
});

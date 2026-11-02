// Development-only HTTP proxy: propagate browser cancellation to the backend connection.
export function localApiProxy(target){
 return {target,changeOrigin:false,configure(proxy){proxy.on('proxyReq',(upstream,_req,res)=>{res.on('close',()=>{if(!res.writableFinished)upstream.destroy();});});}};
}

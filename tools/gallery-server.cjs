const http=require('http'),fs=require('fs'),path=require('path');
const {syncImages,source,dist}=require('./image-sync.cjs');
let items=[],clients=new Set(),timer,running=false,again=false;
async function rebuild(){if(running){again=true;return;}running=true;try{const r=await syncImages();items=r.items;r.errors.forEach(console.error);for(const c of clients)c.write(`event: images\ndata: ${JSON.stringify(items)}\n\n`);console.log(`Gallery updated: ${items.length} images`);}catch(e){console.error(e);}finally{running=false;if(again){again=false;rebuild();}}}
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml'};
async function start(){
 await rebuild();
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/__gallery/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({project:'zygleb-gallery',images:items.length}));return;}
  if(url.pathname==='/__gallery/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(`event: images\ndata: ${JSON.stringify(items)}\n\n`);clients.add(res);req.on('close',()=>clients.delete(res));return;}
  let file;try{file=path.resolve(dist,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));}catch{res.writeHead(400);res.end();return;}
  if(!file.startsWith(dist+path.sep)){res.writeHead(403);res.end();return;}
  fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
 });
 server.on('error',e=>{console.error(e.message);process.exit(1);});server.listen(8787,'127.0.0.1',()=>console.log('Gallery ready http://127.0.0.1:8787/'));
 const watcher=fs.watch(source,{recursive:true},()=>{clearTimeout(timer);timer=setTimeout(rebuild,700);});
 const heartbeat=setInterval(()=>{for(const c of clients)c.write(': heartbeat\n\n');},20000);
 function stop(){watcher.close();clearInterval(heartbeat);for(const c of clients)c.end();server.close(()=>process.exit());}
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
start();

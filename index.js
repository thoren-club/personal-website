const http = require('http');
const fs = require('fs');
const path = require('path');
const port = Number(process.env.PORT || 3000);
const root = path.resolve(__dirname, 'dist');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
http.createServer((request, response) => {
  if(request.method !== 'GET' && request.method !== 'HEAD') {response.writeHead(405,{Allow:'GET, HEAD'});response.end();return;}
  let filename;
  try {const url=new URL(request.url,'http://localhost');filename=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));}
  catch {response.writeHead(400);response.end();return;}
  if(!filename.startsWith(root+path.sep)){response.writeHead(403);response.end();return;}
  fs.stat(filename,(error,stat)=>{
    if(error||!stat.isFile()){response.writeHead(404);response.end('Not found');return;}
    response.writeHead(200,{'Content-Type':types[path.extname(filename).toLowerCase()]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if(request.method==='HEAD'){response.end();return;}
    const stream=fs.createReadStream(filename);stream.on('error',()=>response.destroy());stream.pipe(response);
  });
}).listen(port,'0.0.0.0',()=>console.log(`personal-website is listening on ${port}`));

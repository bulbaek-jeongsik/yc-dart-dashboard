import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const handlers={'/api/data':require('./api/data.js'),'/api/disclosures':require('./api/disclosures.js'),'/api/document':require('./api/document.js')};
if(existsSync('.env')) {
  const raw=await readFile('.env','utf8');
  for (const line of raw.split(/\r?\n/)) {
    const match=line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');
  }
}
const port=process.env.PORT || 3000;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml'};
createServer(async (req,res)=>{
  const route=new URL(req.url,'http://localhost');
  if(handlers[route.pathname]) {
    const parsed=route;
    const response={
      status(n){res.statusCode=n;return this;},
      setHeader(k,v){res.setHeader(k,v);return this;},
      json(body){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(body));},
      send(body){res.end(body);}
    };
    await handlers[route.pathname]({method:req.method,query:Object.fromEntries(parsed.searchParams)},response);
    return;
  }
  const path=req.url.split('?')[0];
  const normalized=path==='/'?'/index.html':path;
  if(!['/index.html','/style.css','/app.js','/archive.js'].includes(normalized)) {res.writeHead(404);res.end('Not found');return;}
  try {const content=await readFile(resolve('.'+normalized));res.writeHead(200,{'Content-Type':types[extname(normalized)]});res.end(content);}
  catch{res.writeHead(404);res.end('Not found');}
}).listen(port,()=>console.log(`YC dashboard: http://localhost:${port}`));

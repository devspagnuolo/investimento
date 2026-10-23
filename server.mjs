import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Map([['/', ['index.html','text/html']], ['/app.js',['app.js','text/javascript']], ['/engine.js',['engine.js','text/javascript']], ['/style.css',['style.css','text/css']]]);
http.createServer(async (req,res) => {
  const entry = files.get(new URL(req.url, 'http://localhost').pathname);
  if (!entry) { res.writeHead(404).end('Não encontrado'); return; }
  try { const body = await readFile(new URL(entry[0], import.meta.url)); res.writeHead(200, {'Content-Type': `${entry[1]}; charset=utf-8`, 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"}).end(body); }
  catch { res.writeHead(500).end('Falha ao carregar arquivo'); }
}).listen(4173, '127.0.0.1', () => console.log('InvestAI: http://127.0.0.1:4173'));

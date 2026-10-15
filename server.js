import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = {'/':'index.html','/app.js':'app.js','/model.js':'model.js','/drive.js':'drive.js','/drive-ui.js':'drive-ui.js','/style.css':'style.css'};
const types = {html:'text/html',js:'text/javascript',css:'text/css'};
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}
const server = http.createServer(async (req,res) => {
  const file = files[new URL(req.url,'http://localhost').pathname];
  if (!file) { res.writeHead(404); return res.end('Not found'); }
  try { const data = await readFile(new URL(file,import.meta.url)); res.writeHead(200,{'Content-Type':types[file.split('.').pop()]+'; charset=utf-8'}); res.end(data); }
  catch { res.writeHead(500); res.end('Unable to load app'); }
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. If Time Tracker is already running, open http://localhost:${port}. Otherwise stop the existing server and run npm start again.`);
    console.error('To use another port in PowerShell: $env:PORT=3001; npm start');
    console.error('Use the same port for your saved tasks: browser storage is separate for each port.');
  } else {
    console.error(`Unable to start Time Tracker: ${error.message}`);
  }
  process.exitCode = 1;
});
server.listen(port,'127.0.0.1',()=>console.log(`Time Tracker: http://localhost:${port}`));

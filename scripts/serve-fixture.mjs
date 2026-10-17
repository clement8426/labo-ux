import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const body = await readFile(new URL('../fixtures/web-showcase/index.html', import.meta.url));
createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(body); }).listen(4178, '127.0.0.1', () => process.stderr.write('Fixture : http://127.0.0.1:4178\n'));

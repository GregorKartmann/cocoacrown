import http from 'node:http';
const sandbox = process.argv[2] ?? 'allow-scripts';
http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(`<!doctype html><html><body style="margin:0"><iframe id="f" sandbox="${sandbox}" src="http://127.0.0.1:4190/" style="width:390px;height:844px;border:0"></iframe></body></html>`);
}).listen(4180);

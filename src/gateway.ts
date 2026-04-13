import http from 'node:http';
import { GATEWAY_TOKEN, BOT_NAME } from './config.js';
import { getMemoryCount, getAllScheduledTasks, getRecentMemoriesDetailed, deleteMemory } from './db.js';
import { logger } from './logger.js';

function json(res: http.ServerResponse, data: any, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function unauthorized(res: http.ServerResponse): void {
  json(res, { error: 'Unauthorized' }, 401);
}

export function startGateway(port: number): http.Server {
  const server = http.createServer((req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      });
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const path = url.pathname;

    // Auth check (skip for root)
    if (path !== '/') {
      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${GATEWAY_TOKEN}`) {
        unauthorized(res);
        return;
      }
    }

    // Routes
    if (path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body><h1>${BOT_NAME} Dashboard</h1><p>API available at /api/*</p></body></html>`);
      return;
    }

    if (path === '/api/status') {
      json(res, {
        name: BOT_NAME,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage().rss,
      });
      return;
    }

    if (path === '/api/tasks') {
      const tasks = getAllScheduledTasks();
      json(res, { tasks });
      return;
    }

    json(res, { error: 'Not found' }, 404);
  });

  server.listen(port, () => {
    logger.info(`Dashboard running at http://localhost:${port}`);
  });

  return server;
}

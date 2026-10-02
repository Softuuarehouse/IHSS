import http from 'node:http';
import mongoose from 'mongoose';
import { config } from './config.js';
import { createApp } from './app.js';
import { initRealtime } from './lib/realtime.js';

mongoose.set('strictQuery', true);
await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
console.log('[db] connected');

const server = http.createServer(createApp());
initRealtime(server);
server.listen(config.port, () => console.log(`[http] IHSS listening on :${config.port} (${config.isProd ? 'production' : 'development'})`));

const shutdown = async (sig) => {
  console.log(`[${sig}] shutting down`);
  server.close(async () => { await mongoose.disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
};
['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => shutdown(s)));

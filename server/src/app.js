import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { config } from './config.js';
import { sanitizeBody, csrfGuard } from './lib/http.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admins.js';
import studentRoutes from './routes/students.js';
import feeRoutes from './routes/fees.js';
import accountRoutes from './routes/accounts.js';
import registrationRoutes from './routes/registration.js';
import hrRoutes from './routes/hr.js';
import assessmentRoutes, { subjectsRouter } from './routes/assessments.js';
import auditRoutes from './routes/audit.js';
import dashboardRoutes from './routes/dashboard.js';
import metaRoutes from './routes/meta.js';
import exportRoutes from './routes/exports.js';
import importRoutes from './routes/imports.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Caddy / nginx / a load balancer
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        scriptSrc: ["'self'"],
        // Helmet includes "upgrade-insecure-requests" in its defaults, which tells the browser to
        // silently rewrite every http:// asset on the page to https:// — correct once you're actually
        // behind HTTPS (a real domain deployment), but it breaks plain-HTTP setups (LAN testing, a
        // reverse proxy that already terminates TLS) by making every JS/CSS/image request fail with
        // ERR_SSL_PROTOCOL_ERROR, even though the page itself loaded fine. Tie it to the same signal
        // the app already uses for "is HTTPS actually in front of us" (COOKIE_SECURE).
        ...(config.cookieSecure ? {} : { 'upgrade-insecure-requests': null }),
      },
    },
  }));
  app.use(compression());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(sanitizeBody);
  if (!config.isProd) app.use(morgan('dev'));

  app.get('/healthz', (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

  const api = express.Router();
  api.use(csrfGuard);
  api.use('/auth', authRoutes);
  api.use('/meta', metaRoutes);
  api.use('/admins', adminRoutes);
  api.use('/students', studentRoutes);
  api.use('/fees', feeRoutes);
  api.use('/accounts', accountRoutes);
  api.use('/registration', registrationRoutes);
  api.use('/hr', hrRoutes);
  api.use('/assessments', assessmentRoutes);
  api.use('/subjects', subjectsRouter);
  api.use('/audit', auditRoutes);
  api.use('/dashboard', dashboardRoutes);
  api.use('/export', exportRoutes);
  api.use('/import', importRoutes);
  api.use((_req, res) => res.status(404).json({ error: 'not_found', message: 'Unknown API route' }));
  app.use('/api', api);

  // Serve the built React app (single-domain deployment) with SPA fallback.
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ZodError) return res.status(400).json({ error: 'validation', message: err.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ') });
    if (err?.name === 'ValidationError') return res.status(400).json({ error: 'validation', message: Object.values(err.errors).map((e) => e.message).join('; ') });
    if (err?.name === 'CastError') return res.status(400).json({ error: 'validation', message: `Invalid ${err.path}` });
    if (err?.name === 'MulterError') return res.status(400).json({ error: 'upload', message: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 8 MB)' : err.message });
    if (err?.code === 11000) return res.status(409).json({ error: 'duplicate', message: 'A record with the same unique value already exists' });
    if (err?.status) return res.status(err.status).json({ error: err.extra?.code || 'error', message: err.message, ...err.extra });
    console.error(err);
    res.status(500).json({ error: 'server', message: config.isProd ? 'Internal server error' : err.message });
  });
  return app;
}
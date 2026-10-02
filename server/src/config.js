import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ihss',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || (isProd ? '' : 'dev-only-secret-do-not-use-in-production-0123456789'),
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  cookieName: 'ihss_token',
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd,
  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME || 'System Owner',
    email: (process.env.SUPER_ADMIN_EMAIL || 'owner@ihss.local').toLowerCase(),
    password: process.env.SUPER_ADMIN_PASSWORD || '',
  },
};

if (isProd && (config.jwtSecret.length < 32 || config.jwtSecret.startsWith('change-me'))) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}

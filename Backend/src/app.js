const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();

// gzip-compress all API responses (big win for the full leads list over the wire).
// Defensive require so the server still boots if the module is not installed yet.
let compression; try { compression = require('compression'); } catch (e) { compression = null; }
if (compression) app.use(compression());

// Allow the local dev frontends, the Expo mobile app (web + native), and any origins
// listed in CLIENT_URL (comma-separated).
const defaultOrigins = [
  'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
  // Expo / Sales Head mobile app (web preview + Metro):
  'http://localhost:8081', 'http://localhost:19006', 'http://localhost:19000',
];
const envOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const allowedOrigins = new Set([...defaultOrigins, ...envOrigins]);

// Reflect known dev/LAN origins so the mobile app can call the same backend.
// Native (React Native) requests send no Origin header and are always allowed.
const corsOrigin = (origin, cb) => {
  if (!origin) return cb(null, true); // native app / same-origin / curl
  if (allowedOrigins.has(origin)) return cb(null, true);
  // Any localhost / private-LAN origin (covers Expo on a phone via the PC's LAN IP).
  if (/^https?:\/\/(localhost|127\.0\.0\.1|(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.[\d.]+)(?::\d+)?$/.test(origin)) {
    return cb(null, true);
  }
  return cb(null, false);
};

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);
// Raise the body limit so uploaded PDFs (stored as base64 in fileData) can be saved/synced
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

app.use('/api', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

module.exports = app;

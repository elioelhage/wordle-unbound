/**
 * WORDSHIFT BACKEND API
 * Purpose: Serve Supabase credentials securely to frontend
 * The frontend uses these keys to access Supabase directly
 * Keys are protected in Render environment variables (not in code)
 */

const express = require('express');
const cors = require('cors');

// ============================================================
// ENVIRONMENT VARIABLES (set in Render dashboard)
// ============================================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const port = process.env.PORT || 3000;

// Validate env vars are set
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERROR: Missing Supabase credentials!');
  console.error('Set SUPABASE_URL and SUPABASE_KEY in Render Environment variables');
  process.exit(1);
}

const app = express();

// ============================================================
// MIDDLEWARE
// ============================================================
// Enable CORS for all origins (frontend needs to fetch the keys)
app.use(cors());
app.use(express.json());

// ============================================================
// API ENDPOINTS
// ============================================================

// Root route (useful for Render URL checks)
app.get('/', (req, res) => {
  res.json({
    service: 'WordShift backend',
    status: 'online',
    endpoints: ['/health', '/api/keys']
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve Supabase credentials to frontend (safe to expose from backend)
// Frontend will use these keys to connect to Supabase directly
app.get('/api/keys', (req, res) => {
  res.json({
    supabaseUrl: supabaseUrl,
    supabaseKey: supabaseKey
  });
});

// Fallback for unknown routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'Use /health or /api/keys'
  });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(port, () => {
  console.log(`✅ WordShift API running on port ${port}`);
  console.log(`   Health check: http://localhost:${port}/health`);
  console.log(`   Get keys: http://localhost:${port}/api/keys`);
});

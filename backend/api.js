/**
 * WORDSHIFT BACKEND API
 * Hosted on Render - calls Supabase securely server-side
 * Frontend never has direct access to Supabase credentials
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');

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

// Initialize Supabase client (server-side only)
const supabase = createClient(supabaseUrl, supabaseKey);
const app = express();

// Middleware
app.use(express.json());

// ============================================================
// API ENDPOINTS
// ============================================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Get leaderboard (lifetime)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leaderboards')
      .select('username, games_played, total_guesses, created_at, saved_state')
      .order('games_played', { ascending: false });
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get player stats by username
app.get('/api/player/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { data, error } = await supabase
      .from('leaderboards')
      .select('*')
      .eq('username', username)
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Player stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// START SERVER
// ============================================================
app.listen(port, () => {
  console.log(`✅ WordShift API running on port ${port}`);
  console.log(`   Health check: http://localhost:${port}/health`);
  console.log(`   Leaderboard: http://localhost:${port}/api/leaderboard`);
});

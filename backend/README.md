# WordShift Backend

This folder contains backend code that should NOT be deployed to GitHub or GitHub Pages.

## Security Warning ⚠️

Your Supabase credentials are stored here (`config.js`). 

**NEVER commit this folder to public GitHub repos.**

## Files in this folder:

1. **config.js** - Your Supabase URL and API key (SERVER ONLY)
2. **api.js** - Template for your Express backend server

## Deployment to Render

1. Create a new Web Service on Render.com
2. Connect your GitHub repo
3. Set the build and start commands to run your backend
4. Upload `config.js` as an environment variable on Render
5. The frontend will call your backend API instead of using keys directly

## Current Status

Your frontend files currently have Supabase keys exposed:
- `script.js` - Has direct key access
- `race.js` - Has direct key access  
- `leaderboard.html` - Has direct key access

## Next Steps

1. Move all Supabase calls to the backend
2. Have frontend call `/api/...` endpoints instead
3. Deploy backend to Render
4. Update frontend to use `https://your-render-backend.onrender.com/api/...`

This way, your keys stay safe on the server and never reach the browser.

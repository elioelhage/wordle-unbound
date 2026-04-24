# Deploying WordShift to Render 🚀

Complete guide to deploy your WordShift game to Render for production.

## Overview

- **Frontend** (HTML/CSS/JS) → GitHub Pages or Render Static Site
- **Backend** (Node.js API) → Render Web Service
- **Database** → Supabase (managed, no setup needed)

## Step 1: Prepare Your Repository

### 1.1 Create GitHub Repository

```bash
# If not already a repo
git init

# Add all files
git add .

# Commit
git commit -m "Initial WordShift setup"

# Add your GitHub repo as remote
git remote add origin https://github.com/yourusername/wordshift.git

# Push to GitHub
git push -u origin main
```

### 1.2 Create `.gitignore`

Create a `.gitignore` file in the root directory to protect sensitive files:

```
# Don't commit backend config with exposed keys
backend/config.js

# Environment variables
.env
.env.local
.env*.local

# Node modules (if using)
node_modules/

# System files
.DS_Store
Thumbs.db
```

Commit this file:
```bash
git add .gitignore
git commit -m "Add .gitignore to protect secrets"
git push
```

## Step 2: Deploy Frontend (GitHub Pages)

### 2.1 Enable GitHub Pages

1. Go to your GitHub repo settings
2. Scroll to **Pages** section
3. Select **Deploy from a branch**
4. Choose branch: `main` (or `master`)
5. Choose folder: `/ (root)`
6. Click **Save**

Your site will be live at: `https://yourusername.github.io/wordshift`

### 2.2 Update API URLs (if using backend)

When you deploy your backend to Render, you'll get a URL like:
```
https://wordshift-api.onrender.com
```

Update these files to call your backend instead of Supabase directly:

**In `leaderboard.html`:**
```javascript
// OLD (exposes key):
const supabaseUrl = "https://hcehsxnudbwjydvenlfz.supabase.co";
const supabaseKey = "...exposed key...";

// NEW (calls backend):
const API_URL = "https://wordshift-api.onrender.com";
// Then call: fetch(`${API_URL}/api/leaderboard`)
```

## Step 3: Deploy Backend to Render

### 3.1 Create Render Account

1. Go to https://render.com
2. Sign up with GitHub (recommended)
3. Authorize Render to access your repos

### 3.2 Create a New Web Service

1. Click **New +** → **Web Service**
2. Connect your GitHub repository
3. Fill in the details:

| Field | Value |
|-------|-------|
| **Name** | `wordshift-api` |
| **Environment** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node backend/api.js` |
| **Instance Type** | `Free` |

4. Click **Create Web Service**

### 3.3 Add Environment Variables

⚠️ **IMPORTANT**: Never commit `backend/config.js` to GitHub!

Instead, add environment variables in Render:

1. In your Render Web Service dashboard
2. Go to **Environment** tab
3. Add these variables:

```
SUPABASE_URL=https://hcehsxnudbwjydvenlfz.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZWhzeG51ZGJ3anlkdmVubGZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NzAsImV4cCI6MjA5MDY1Mjg3MH0.dPawhX90yZrme7nftMTq6A1j-KGqfHZJ8QnbBeFurl8
```

4. Click **Save Changes**

### 3.4 Update Backend to Use Environment Variables

Modify `backend/api.js`:

```javascript
// Load from environment variables (Render provides these)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Never hardcode keys!
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in environment variables");
  process.exit(1);
}
```

### 3.5 Wait for Deployment

1. Render will automatically build and deploy
2. You'll get a URL like: `https://wordshift-api.onrender.com`
3. Wait for the green "Live" indicator

## Step 4: Connect Frontend to Backend

Update your frontend files to call the backend API:

### 4.1 Update `leaderboard.html`

```javascript
// At the top of the <script> tag:
const API_BASE_URL = "https://wordshift-api.onrender.com";

// Replace direct Supabase calls with:
const { data, error } = await fetch(`${API_BASE_URL}/api/leaderboard`)
  .then(r => r.json());
```

### 4.2 Update `script.js`

```javascript
// Replace direct Supabase access with API calls
const API_BASE_URL = "https://wordshift-api.onrender.com";

// Example: Register user
fetch(`${API_BASE_URL}/api/auth/register`, {
  method: 'POST',
  body: JSON.stringify({ username, password })
})
```

## Step 5: Publish Directory Structure

Your Render deployment uses this structure:

```
wordshift/
├── backend/
│   ├── api.js              # Entry point (run by: node backend/api.js)
│   └── config.js           # Loaded from env vars
├── index.html
├── leaderboard.html
├── script.js
├── style.css
├── package.json            # If you add npm dependencies
└── README.md
```

### Create `package.json` (in root)

```json
{
  "name": "wordshift",
  "version": "1.0.0",
  "description": "WordShift game with secure backend",
  "main": "backend/api.js",
  "scripts": {
    "start": "node backend/api.js",
    "dev": "node backend/api.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "@supabase/supabase-js": "^2.0.0"
  }
}
```

Then push to GitHub:
```bash
git add package.json
git commit -m "Add package.json for Render deployment"
git push
```

## Step 6: Custom Domain (Optional)

### 6.1 Add Custom Domain to Render

1. In Render Web Service settings
2. Go to **Custom Domains**
3. Add: `api.yourdomain.com`
4. Follow DNS instructions for your domain registrar

### 6.2 Update Frontend

Change all API calls from:
```javascript
const API_BASE_URL = "https://wordshift-api.onrender.com";
```

To:
```javascript
const API_BASE_URL = "https://api.yourdomain.com";
```

## Step 7: Environment Variables Checklist

Make sure these are set in Render:

| Variable | Where to Get | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase → Settings → API | ✅ Yes |
| `SUPABASE_KEY` | Supabase → Settings → API | ✅ Yes |
| `NODE_ENV` | Set to `production` | Optional |

## Step 8: Testing

### 8.1 Test Frontend

1. Visit: `https://yourusername.github.io/wordshift`
2. Play a game
3. Check leaderboard

### 8.2 Test Backend API

```bash
# Test leaderboard endpoint
curl https://wordshift-api.onrender.com/api/leaderboard

# Should return JSON with player data
```

### 8.3 Check Logs

In Render dashboard:
1. Click your Web Service
2. Go to **Logs** tab
3. Look for errors or startup messages

## Troubleshooting

### "Build failed" error

- Check `package.json` exists in root
- Check `backend/api.js` has no syntax errors
- View Render logs for specific error

### "Cannot find module" error

- Make sure all dependencies are in `package.json`
- Run `npm install` locally to test
- Check import statements

### Frontend can't reach backend

- Verify `API_BASE_URL` is correct
- Check CORS is enabled in backend
- Use browser DevTools → Network tab to see requests

### Database connection fails

- Verify `SUPABASE_URL` and `SUPABASE_KEY` in Render env vars
- Test connection locally with same credentials
- Check Supabase is still running

## Security Checklist

- ✅ Never commit `backend/config.js` with keys
- ✅ Use `.gitignore` to prevent accidental commits
- ✅ Store all secrets as Render environment variables
- ✅ Use HTTPS for all connections
- ✅ Enable GitHub authentication on Render
- ✅ Keep dependencies updated

## Next Steps

1. **Monitor logs** - Check Render logs regularly for errors
2. **Set up alerts** - Enable Render notifications for failures
3. **Backup database** - Enable Supabase backups
4. **Scale up** - Upgrade from Free tier if needed

## Support

- **Render Docs**: https://render.com/docs
- **Supabase Docs**: https://supabase.com/docs
- **JavaScript**: https://developer.mozilla.org/en-US/docs/Web/JavaScript

---

**Deployment successful?** 🎉 Share your game with the world!

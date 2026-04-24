# Quick Start: Deploy to Render in 5 Minutes ⚡

## Prerequisites
- GitHub account with WordShift repo
- Render account (https://render.com - sign up with GitHub)

## Step 1: Add `.gitignore` (Protect Your Keys!)

In your repo root, create `.gitignore`:

```
backend/config.js
.env
.env.local
node_modules/
```

```bash
git add .gitignore
git commit -m "Protect secrets"
git push
```

## Step 2: Create `package.json`

In your repo root:

```json
{
  "name": "wordshift",
  "main": "backend/api.js",
  "scripts": {
    "start": "node backend/api.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "@supabase/supabase-js": "^2.0.0"
  }
}
```

```bash
git add package.json
git commit -m "Add package.json"
git push
```

## Step 3: Create Web Service on Render

1. Go to https://render.com/dashboard
2. Click **New +** → **Web Service**
3. Choose your GitHub repo
4. Fill in:

| Setting | Value |
|---------|-------|
| **Name** | `wordshift-api` |
| **Environment** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node backend/api.js` |
| **Region** | Pick closest to you |
| **Instance Type** | `Free` |

5. Click **Create Web Service**

## Step 4: Add Environment Variables

⚠️ DO NOT paste keys into code - use Render env vars!

1. In Render dashboard, go to **Environment** tab
2. Click **Add Environment Variable**
3. Add these one by one:

```
Name: SUPABASE_URL
Value: https://hcehsxnudbwjydvenlfz.supabase.co
```

```
Name: SUPABASE_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZWhzeG51ZGJ3anlkdmVubGZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NzAsImV4cCI6MjA5MDY1Mjg3MH0.dPawhX90yZrme7nftMTq6A1j-KGqfHZJ8QnbBeFurl8
```

4. Click **Save Changes**

## Step 5: Update Backend to Use Env Vars

Modify `backend/api.js`:

```javascript
// Use environment variables instead of hardcoding
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials!");
}
```

Push to GitHub:
```bash
git add backend/api.js
git commit -m "Use environment variables"
git push
```

## Step 6: Wait for Build

In Render:
1. Render auto-deploys when you push
2. Watch the **Logs** tab
3. Wait for green ✅ **Live** indicator
4. Copy your service URL: `https://wordshift-api.onrender.com`

## Step 7: Enable GitHub Pages (Frontend)

1. Go to GitHub repo **Settings** → **Pages**
2. Select **Deploy from a branch**
3. Choose `main` branch, `/` root folder
4. Click **Save**
5. Your frontend is live at: `https://yourusername.github.io/wordshift`

## Step 8: Connect Frontend to Backend

Update `leaderboard.html` and `script.js`:

```javascript
// Change from direct Supabase:
// OLD: const supabaseKey = "...exposed...";

// NEW: Call backend instead:
const API_URL = "https://wordshift-api.onrender.com";

// Example: Fetch leaderboard
fetch(`${API_URL}/api/leaderboard`)
  .then(r => r.json())
  .then(data => console.log(data));
```

Commit and push:
```bash
git add .
git commit -m "Update API URLs to use backend"
git push
```

## ✅ Done!

Your WordShift is now deployed:

- **Frontend**: `https://yourusername.github.io/wordshift` (GitHub Pages)
- **Backend API**: `https://wordshift-api.onrender.com` (Render)
- **Database**: Supabase (no setup needed)

## 🔒 Security Notes

- ✅ Your keys are safe in Render environment variables
- ✅ They never appear in code or GitHub
- ✅ Frontend can't see your database credentials
- ✅ All calls go through your backend API

## 🐛 Debugging

**Backend not deploying?**
```bash
# Check locally first
npm install
node backend/api.js
```

**Check Render logs:**
1. Render dashboard → Your service
2. Click **Logs** tab
3. Look for red error messages

**Backend returns 500 error?**
```bash
# Verify env vars are set in Render
# Go to Environment tab and check both are present
```

## 📚 Full Guide

For detailed instructions, see `DEPLOYMENT.md`

---

**Issues?** Check the troubleshooting section in `DEPLOYMENT.md` 🆘

# WordShift 🎮

A word-guessing game inspired by Wordle, built with vanilla JavaScript and powered by Supabase.

## 🎯 How to Play

1. **Guess the 5-letter word** in 6 tries
2. **Color feedback** tells you if letters are:
   - 🟩 **Green** - Correct letter in correct position
   - 🟨 **Yellow** - Correct letter in wrong position
   - ⬜ **Gray** - Letter not in the word
3. **Win** by guessing the word before you run out of tries
4. **Compete** on the leaderboard with other players

## 🏆 Features

- **Daily word puzzle** - A new word every day
- **Leaderboard system** - Compare your stats with other players
  - **This Week**: Who has the lowest average guesses this week?
  - **Lifetime**: Who has played the most games?
- **Game stats** - Track your win streak, best games, and more
- **Hints system** - Get help when you're stuck (limited per day)
- **Theme support** - Light and dark mode

## 🚀 Getting Started

### Play Online
1. Visit the game at `https://yourdomain.com` (once deployed)
2. Create an account with a username and password
3. Start playing!

### Run Locally
1. Clone this repository
2. Open `index.html` in your web browser
3. That's it! No installation needed

## 📁 Project Structure

```
WordShift/
├── index.html              # Main game page
├── leaderboard.html        # Leaderboard page
├── script.js               # Main game logic
├── race.js                 # Race/challenge mode
├── style.css               # Styling
├── race.css                # Race mode styling
├── backend/                # Server-side code (deploy to Render)
│   ├── config.js           # ⚠️ Contains API keys (never commit)
│   ├── api.js              # Backend API template
│   └── README.md           # Backend setup guide
└── README.md               # This file
```

## 💾 Save Your Progress

- Your game saves automatically to your browser
- Your account stats are stored in our database
- You can play on different devices with the same account

## 🔧 Technologies Used

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js + Express (optional, for secure deployments)
- **Database**: Supabase (PostgreSQL)
- **Hosting**: GitHub Pages (frontend) + Render (backend, optional)

## 📊 Leaderboard

### This Week's Lowest Average
See who has the best average guesses for games played this week. Resets every Sunday.

### Lifetime Most Games
See who's played the most games of all time.

## 🐛 Reporting Issues

Found a bug? Here's how to help:
1. Try clearing your browser cache
2. Try a different browser
3. Check the browser console (F12) for error messages
4. Contact the developer with details

## ✨ Tips for Better Scores

- Start with common letters like E, A, R, O, T
- Use yellow letters in different positions
- Think about common word patterns
- Remember: uppercase and lowercase don't matter

## 📝 Terms & Privacy

- Your username and game stats are public on the leaderboard
- Your password is encrypted and never stored in plain text
- We don't sell or share your data
- We collect minimal analytics to improve the game

## 🎓 Learn More

- **Wordle** (the original): https://www.nytimes.com/games/wordle/
- **Supabase** (our database): https://supabase.com
- **JavaScript**: https://developer.mozilla.org/en-US/docs/Web/JavaScript

## 📄 License

This project is for educational and personal use.

---

**Enjoying WordShift?** Share your scores with friends! 🎉

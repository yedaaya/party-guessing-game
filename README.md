# 🎭 מי אמר מה? - Party Guessing Game

A real-time multiplayer Hebrew party game where players answer personal questions about themselves, then compete to match anonymous answers to the correct players.

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.

## How to Play

1. **Host** creates a room and shares the 4-character code
2. **Players** join using the code + their name
3. **Host** picks which questions to include (from a preset Hebrew bank or custom)
4. **Everyone** answers the questions about themselves
5. **Game rounds**: each round shows one question's answers shuffled - players match answers to names
6. **Scoring**: 100 pts per correct match + accuracy bonus + optional speed bonus
7. **Final podium** with fun statistics

## Features

- Hebrew RTL interface
- PWA installable (add to home screen from Chrome)
- Real-time WebSocket communication
- Drag-and-drop + tap-to-assign matching UI
- Image upload support for creative questions
- Configurable timer per round
- Fun statistics (Mind Reader, Mystery Person, Soulmates, etc.)
- Sound effects
- Responsive mobile-first design

## Deployment

### Render

1. Push to a Git repository
2. Create a new **Web Service** on [render.com](https://render.com)
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Deploy

### Railway

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Environment Variables

- `PORT` - Server port (default: 3000)

## Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **State**: In-memory (no database)
- **Font**: Heebo (Google Fonts)

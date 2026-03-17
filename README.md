# Misar Ticketing App

Queue management system for the Misar shop (Saif & Khanjar). Customers join a queue via a join page or QR code; admins view and manage the queue in real time with Socket.IO.

## Tech stack

- **Backend:** Node.js, Express 5, Socket.IO
- **Frontend:** React 19, Vite 8, React Router, Socket.IO client
- **Data:** In-memory queue (no database)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set values (required for production):
   - `ADMIN_PASSWORD` — admin dashboard password
   - `JWT_SECRET` — secret for signing auth tokens (use a long random string)
   - `PORT` — server port (default `3001`)
   - `FRONTEND_ORIGIN` — allowed CORS/Socket.IO origin (default `http://localhost:5173`)

3. Add `public/logo.png` if you want the logo to appear in the UI (optional).

## Development

Run the backend and frontend separately:

- **Backend:** `node server.js` or `npm start` (serves API and Socket.IO on port 3001).
- **Frontend:** `npm run dev` (Vite dev server on port 5173, proxies `/api` and `/socket.io` to the backend).

In development, the default password is `saif` if `ADMIN_PASSWORD` is not set. Set `ADMIN_PASSWORD` and `JWT_SECRET` in `.env` for a more secure local setup.

## Production

1. Set all variables in `.env` (especially `ADMIN_PASSWORD` and `JWT_SECRET`).
2. Build the frontend:
   ```bash
   npm run build
   ```
3. Start the server:
   ```bash
   npm start
   ```
   The server serves the built app from `dist/` and handles SPA routing. Use `PORT` to bind (e.g. `PORT=80`).

## Deploy on Render (one place, free tier)

Host the whole app (frontend + backend) on [Render](https://render.com) in one step:

1. Push this repo to GitHub (you already have `misar-ticketing-app`).
2. Go to [dashboard.render.com](https://dashboard.render.com) → **New** → **Web Service**.
3. Connect your GitHub account and select the **misar-ticketing-app** repository.
4. Render will pick up `render.yaml` if present, or set manually:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
5. In **Environment**, add:
   - `ADMIN_PASSWORD` — your admin dashboard password (required).
   - `JWT_SECRET` — a long random string (e.g. generate one; required for production).
   - `FRONTEND_ORIGIN` is optional: on Render it defaults to your service URL so CORS and Socket.IO work.
6. Click **Create Web Service**. After the first deploy you’ll get a URL like `https://misar-ticketing-app.onrender.com`.

**Note:** On the free tier the service may spin down after inactivity; the first request after a while can be slow. The queue is in-memory, so it resets when the service restarts.

## Scripts

| Script     | Description                          |
|-----------|--------------------------------------|
| `npm run dev`   | Start Vite dev server (frontend only) |
| `npm run build` | Build frontend to `dist/`             |
| `npm start`     | Start Express + Socket.IO server     |
| `npm run lint`  | Run ESLint                            |
| `npm run preview` | Preview production build (Vite)     |

# Hearthwork

A Gather.town-inspired metaverse platform with customizable spaces, proximity-based video chat, and an on-chain prediction market protocol built on Solana.

Features:

- Customizable spaces using tilesets
- Proximity video chat
- Private area video chat
- Multiplayer networking
- Tile-based movement
- On-chain prediction markets (Solana / Anchor)

Built with Next.js, PostgreSQL, Socket.io, TailwindCSS, Pixi.js, Agora for video chat, and Anchor (Rust) for the Solana smart contract.

## Project Structure

- `/frontend` - Next.js frontend application (Pixi.js game, Agora video, Tailwind UI)
- `/backend` - Express.js backend server with Socket.io and JWT auth
- `/backend/schema.sql` - PostgreSQL database schema
- `/gather` - Solana smart contract (Anchor/Rust) — prediction market protocol

## Prerequisites

- Node.js 18+
- PostgreSQL database
- Agora account (for video chat)
- Rust + Anchor CLI (for Solana program, optional)

## Installation

Clone the repo:
```bash
git clone https://github.com/CHAKRADHAR98/Hearthwork.git
cd Hearthwork
```

Install frontend dependencies:
```bash
cd frontend
npm install
```

Install backend dependencies:
```bash
cd backend
npm install
```

## Database Setup

1. Create a PostgreSQL database (e.g., `hearthwork`)
2. Run the schema file to create tables:
```bash
psql -U postgres -d hearthwork -f backend/schema.sql
```

## Environment Variables

Create a `.env` file in the `backend` directory:
```
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:your-password@localhost:5432/hearthwork
JWT_SECRET=your-secret-key-change-in-production
```

Create a `.env.local` file in the `frontend` directory:
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_AGORA_APP_ID=your-agora-app-id
```

For video chat, create an account at [Agora](https://www.agora.io/) and get an App ID.

## Running the Application

Start the backend server:
```bash
cd backend
npm run dev
```

In a new terminal, start the frontend:
```bash
cd frontend
npm run dev
```

Open http://localhost:3000 in your browser.

## Authentication

The application uses username/password authentication. Register a new account through the UI. Video chat requires Agora setup.

## Solana Program (Optional)

The `gather/` directory contains an Anchor program implementing a prediction market protocol on Solana. To build and deploy:

```bash
cd gather
anchor build
anchor deploy
```

Requires Rust, Solana CLI, and Anchor CLI installed.

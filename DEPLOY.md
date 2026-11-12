# Deploying Hearthwork for free

| Part | Service | Cost |
|---|---|---|
| Website (Next.js, `frontend/`) | Vercel Hobby | free |
| Game server (Express + Socket.io, `backend/`) | Render free web service | free |
| Database (users, offices, game state) | Neon Postgres | free |
| Keep the game server awake | cron-job.org | free |

The game server saves everything in Postgres (table `game_state`), so it loses nothing when the free host
restarts. It creates its own tables on first start: the database can be completely empty.

## 1. Database: Neon
1. Sign up at https://neon.tech and create a project (any name, region close to you).
2. On the project dashboard click **Connect** and copy the connection string. It looks like
   `postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`.
   Keep it private: you paste it only into Render in step 2.

## 2. Game server: Render
1. Sign up at https://render.com with GitHub and allow access to the `Hearthwork` repo.
2. **New → Blueprint**, pick the repo. Render reads `render.yaml` and asks for these values:
   - `DATABASE_URL`: the Neon connection string from step 1.
   - `NEAR_PRIVATE_KEY`: the private key of `hearthwork.testnet`. Print it on your computer with
     `python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.near-credentials/testnet/hearthwork.testnet.json')))['private_key'])"`
     and paste it straight into Render. Never share it anywhere else.
   - `FRONTEND_URL`: leave as `http://localhost:3000` for now; you change it after step 3.
   - `NEARAI_API_KEY` and `GOOGLE_CLIENT_ID`: copy them from `backend/.env`.
3. Click **Apply**. The first build takes a few minutes. When it's live, open
   `https://<your-service>.onrender.com/`. It should show `{"status":"ok"}`.
4. Copy that URL; it is your **backend URL**.

## 3. Website: Vercel
1. Sign in at https://vercel.com with GitHub. **Add New → Project**, import `Hearthwork`.
2. Set **Root Directory** to `frontend` (Framework: Next.js is detected).
3. Under **Environment Variables** add `NEXT_PUBLIC_BACKEND_URL` = your backend URL from step 2 (no trailing slash).
4. **Deploy**. Copy the site URL, e.g. `https://hearthwork.vercel.app`.

## 4. Connect them
1. Render → your service → **Environment** → set `FRONTEND_URL` to the Vercel URL → **Save** (it redeploys).
   To also allow local development: `https://hearthwork.vercel.app,http://localhost:3000`.
2. Google sign-in: Google Cloud Console → **Google Auth Platform → Clients → your client** → add the Vercel URL to
   **Authorised JavaScript origins** → Save. While the Google app is in *Testing*, only listed test users can sign
   in with Google; everyone can still register with a username and password.

## 5. Keep the server awake
Render's free servers sleep after 15 minutes without visitors, which would pause the village clock.
1. Sign up at https://cron-job.org (free) → **Create cronjob**.
2. URL: your backend URL. Schedule: **every 10 minutes**. Save.

## Check it works
Open the Vercel URL → register → create an office → join → walk onto the glowing Market Square tile → gather and
sell. In **Board → On NEAR** a `trade` transaction appears within a few seconds.

## Good to know
- Run only **one** game server against a database. Two servers on the same database overwrite each other's saves,
  and two servers using the same NEAR key compete for transaction nonces. Stop the local backend while the hosted
  one is live, or give the local one its own database.
- Each new player gets a 0.05 testnet NEAR welcome grant from `hearthwork.testnet`. Top it up from the faucet when
  it runs low (see `HANDOFF.md`).
- If the free server is ever unreliable, Railway (about $5/month) runs the same `backend/` with no code changes.

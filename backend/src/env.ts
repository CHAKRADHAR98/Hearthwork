// Load .env (local development) and tidy every setting. Imported first by index.ts, before anything reads
// process.env. Values pasted into a hosting dashboard often carry a stray newline or space, which would
// silently break things like the Google client ID or the NEAR key.
import 'dotenv/config'

for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string' && v !== v.trim()) process.env[k] = v.trim()
}

/*
 * progress.mjs — the family account endpoint.
 *
 * GET  /api/progress?code=CODE   → { version, savedAt, data }  (404 if new)
 * POST /api/progress             → { code, baseVersion, data }
 *                                  200 with the new version, or 409 with the
 *                                  server's copy if someone else wrote first.
 * GET  /api/progress?health=1    → whether durable storage is really working
 *
 * Compare-and-set only: the server never merges. Merging lives in the client
 * (js/merge.js) so there is exactly one implementation of it to get right.
 *
 * The code IS the credential. It is long and random, and the only thing behind
 * it is practice statistics — no names beyond what a parent typed, no email,
 * no way to contact anybody.
 */
import { read, write, health } from './store.mjs'

const MAX_BYTES = 512 * 1024
const CODE = /^[a-z0-9][a-z0-9-]{5,63}$/

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      // Same-origin app; no other site should be able to read a family's code.
      'access-control-allow-origin': 'null',
    },
  })

export default async function handler(req) {
  const url = new URL(req.url)

  if (req.method === 'GET' && url.searchParams.get('health')) {
    return json(await health())
  }

  if (req.method === 'GET') {
    const code = (url.searchParams.get('code') || '').toLowerCase()
    if (!CODE.test(code)) return json({ error: 'bad code' }, 400)
    const record = await read(code)
    if (!record) return json({ error: 'no such family yet' }, 404)
    return json(record)
  }

  if (req.method === 'POST') {
    let body
    try {
      const text = await req.text()
      if (text.length > MAX_BYTES) return json({ error: 'too big' }, 413)
      body = JSON.parse(text)
    } catch (err) {
      return json({ error: 'unreadable body' }, 400)
    }
    const code = String(body.code || '').toLowerCase()
    if (!CODE.test(code)) return json({ error: 'bad code' }, 400)
    if (!body.data || !Array.isArray(body.data.profiles)) return json({ error: 'no progress in that' }, 400)

    const current = await read(code)
    const currentVersion = current ? current.version : 0
    if (current && Number(body.baseVersion) !== currentVersion) {
      // Stale writer: hand back what we have so the client can merge and retry.
      return json(current, 409)
    }

    const record = {
      version: currentVersion + 1,
      savedAt: Date.now(),
      data: body.data,
    }
    await write(code, record)
    return json({ version: record.version, savedAt: record.savedAt })
  }

  return json({ error: 'method not allowed' }, 405)
}

/*
 * store.mjs — where a family's progress actually lives.
 *
 * Netlify Blobs in production. The import is deliberately soft: if the package
 * or the runtime is not there (a local test, a preview without Blobs enabled),
 * we fall back to an in-process Map so the endpoint still answers and says so
 * on /api/progress?health=1 rather than 500ing in a child's face.
 */
const memory = new Map()

let blobs = null
let blobsError = null

async function getBlobStore() {
  if (blobs || blobsError) return blobs
  try {
    const mod = await import('@netlify/blobs')
    blobs = mod.getStore({ name: 'ara-progress', consistency: 'strong' })
  } catch (err) {
    blobsError = String(err && err.message ? err.message : err)
    blobs = null
  }
  return blobs
}

export async function health() {
  const store = await getBlobStore()
  return {
    ok: true,
    backend: store ? 'netlify-blobs' : 'memory-only',
    durable: !!store,
    note: store
      ? 'Progress is stored in Netlify Blobs and survives deploys.'
      : 'Netlify Blobs is unavailable, so nothing here is durable: ' + blobsError,
  }
}

export async function read(key) {
  const store = await getBlobStore()
  if (!store) return memory.get(key) || null
  const raw = await store.get(key, { type: 'json' })
  return raw || null
}

export async function write(key, record) {
  const store = await getBlobStore()
  if (!store) {
    memory.set(key, record)
    return record
  }
  await store.setJSON(key, record)
  return record
}

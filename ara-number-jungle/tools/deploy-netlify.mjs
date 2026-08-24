/*
 * deploy-netlify.mjs — build the site and push it to Netlify.
 *
 *   NETLIFY_AUTH_TOKEN=... node tools/deploy-netlify.mjs [--site ara-number-jungle]
 *
 * Uses Netlify's zip-deploy API directly: no CLI, no login prompt, nothing
 * interactive. Bundles the family-account function (and its dependency) into
 * the manual-deploy layout, so a single zip carries the app and the API.
 *
 * Needs two things this script cannot provide for itself:
 *   - a personal access token in NETLIFY_AUTH_TOKEN
 *   - network access to api.netlify.com
 * Both are reported plainly rather than as a stack trace.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const siteName = (args[args.indexOf('--site') + 1] || 'ara-number-jungle').replace(/[^a-z0-9-]/g, '')
const token = process.env.NETLIFY_AUTH_TOKEN
const API = 'https://api.netlify.com/api/v1'

const say = (...m) => console.log(...m)

function build() {
  const out = join(root, 'build')
  rmSync(out, { recursive: true, force: true })
  mkdirSync(join(out, 'functions'), { recursive: true })

  // The app itself.
  for (const f of ['index.html', 'manifest.webmanifest', 'sw.js']) cpSync(join(root, f), join(out, f))
  for (const d of ['css', 'js', 'icons']) cpSync(join(root, d), join(out, d), { recursive: true })

  // The function, bundled with its dependency so the zip needs no install.
  execFileSync(
    'npx',
    [
      'esbuild',
      join(root, 'netlify/functions/progress.mjs'),
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--target=node20',
      `--outfile=${join(out, 'functions/progress.mjs')}`,
    ],
    { stdio: 'pipe' },
  )

  // Redirect /api/* at the function, the same as netlify.toml does for a
  // build-time deploy.
  const redirects = '/api/*  /.netlify/functions/:splat  200\n'
  execFileSync('bash', ['-c', `printf '%s' ${JSON.stringify(redirects)} > ${JSON.stringify(join(out, '_redirects'))}`])

  execFileSync('bash', ['-c', `cd ${JSON.stringify(out)} && zip -qr ../build.zip .`])
  return join(root, 'build.zip')
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text.slice(0, 300) }
  }
  if (!res.ok) {
    const denied = res.headers.get('x-deny-reason')
    if (denied === 'host_not_allowed') {
      throw new Error(
        'This environment is not allowed to reach api.netlify.com. Add it to the ' +
          'network egress settings for this environment, then run this again.',
      )
    }
    throw new Error(`${opts.method || 'GET'} ${path} → ${res.status} ${JSON.stringify(body).slice(0, 300)}`)
  }
  return body
}

async function main() {
  if (!token) {
    say('No NETLIFY_AUTH_TOKEN set.')
    say('Create one at https://app.netlify.com/user/applications#personal-access-tokens')
    say('and set it as an environment variable — not on the command line, so it stays out of shell history.')
    process.exit(2)
  }

  say('Building…')
  const zip = build()
  say(`  ${(readFileSync(zip).length / 1024).toFixed(0)}kb zipped`)

  const me = await api('/user')
  say(`Signed in as ${me.email || me.full_name || me.id}`)

  const sites = await api('/sites?per_page=100')
  let site = sites.find((s) => s.name === siteName)
  if (site) say(`Using existing site ${site.name} (${site.ssl_url || site.url})`)
  else {
    site = await api('/sites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: siteName }),
    })
    say(`Created site ${site.name}`)
  }

  say('Deploying…')
  let deploy = await api(`/sites/${site.id}/deploys`, {
    method: 'POST',
    headers: { 'content-type': 'application/zip' },
    body: readFileSync(zip),
  })

  // Netlify processes the upload asynchronously.
  for (let i = 0; i < 60 && deploy.state !== 'ready'; i++) {
    if (deploy.state === 'error') throw new Error('Netlify reported: ' + (deploy.error_message || 'deploy failed'))
    await new Promise((r) => setTimeout(r, 2000))
    deploy = await api(`/deploys/${deploy.id}`)
  }

  const url = site.ssl_url || site.url
  say(`\nLive: ${url}`)
  say(`State: ${deploy.state}`)

  // Does the family account actually have durable storage?
  try {
    const health = await fetch(`${url}/api/progress?health=1`).then((r) => r.json())
    say(`Family account: ${health.durable ? 'durable ✅' : 'NOT durable ⚠️'} — ${health.note}`)
  } catch (err) {
    say(`Could not check the family account from here: ${err.message}`)
    say(`Open ${url}/api/progress?health=1 in a browser to confirm.`)
  }
}

main().catch((err) => {
  console.error('\nDeploy failed: ' + err.message)
  process.exit(1)
})

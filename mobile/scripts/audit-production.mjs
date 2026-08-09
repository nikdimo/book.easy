import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import './apply-image-size-security-patch.mjs'

const mobileRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const npmCli = process.env.npm_execpath

const audit = spawnSync(npmCli ? process.execPath : 'npm', [
  ...(npmCli ? [npmCli] : []),
  'audit',
  '--omit=dev',
  '--json',
], {
  cwd: mobileRoot,
  encoding: 'utf8',
})

if (audit.error) throw audit.error

let report
try {
  report = JSON.parse(audit.stdout)
} catch {
  process.stderr.write(audit.stdout ?? '')
  process.stderr.write(audit.stderr ?? '')
  throw new Error('npm audit did not return a valid JSON report.')
}

const allowedAdvisories = new Set([
  'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
  'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
])
const vulnerabilities = report.vulnerabilities ?? {}
const advisoryCauses = Object.values(vulnerabilities).flatMap((vulnerability) =>
  vulnerability.via.filter((cause) => typeof cause !== 'string'),
)
const unexpected = advisoryCauses.filter(
  (cause) => cause.name !== 'image-size' || !allowedAdvisories.has(cause.url),
)

if (
  unexpected.length > 0 ||
  (Object.keys(vulnerabilities).length > 0 && advisoryCauses.length === 0)
) {
  process.stderr.write(audit.stdout ?? '')
  process.stderr.write(audit.stderr ?? '')
  console.error(
    `Unexpected production advisories: ${unexpected.map((cause) => cause.url).join(', ')}`,
  )
  process.exit(1)
}

if (Object.keys(vulnerabilities).length > 0) {
  console.warn(
    'npm reports the two acknowledged image-size advisories through Metro. ' +
      'The installed parser is locally hardened because no patched upstream release exists.',
  )
} else {
  console.log('No production vulnerabilities found.')
}

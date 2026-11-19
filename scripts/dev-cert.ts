// Makes a self-signed HTTPS certificate for testing on a phone over Wi-Fi.
// Phones need HTTPS for the camera flow and for crypto.subtle (photo hashing).
// The certificate covers localhost and this computer's current LAN addresses,
// and is remade when those change. Files go in .cert/ (git-ignored).

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join, resolve } from 'node:path'

export const CERT_DIR = resolve(import.meta.dirname, '..', '.cert')
export const KEY_FILE = join(CERT_DIR, 'dev-key.pem')
export const CERT_FILE = join(CERT_DIR, 'dev-cert.pem')
const HOSTS_FILE = join(CERT_DIR, 'hosts.txt')

export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address)
}

export function ensureDevCert(): { key: string; cert: string; ips: string[] } {
  const ips = lanAddresses()
  const hosts = ['localhost', '127.0.0.1', ...ips].join(',')
  const fresh = existsSync(CERT_FILE) && existsSync(KEY_FILE) && existsSync(HOSTS_FILE) && readFileSync(HOSTS_FILE, 'utf8') === hosts
  if (!fresh) {
    mkdirSync(CERT_DIR, { recursive: true })
    const san = ['DNS:localhost', 'IP:127.0.0.1', ...ips.map((ip) => `IP:${ip}`)].join(',')
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '365',
        '-keyout', KEY_FILE, '-out', CERT_FILE, '-subj', '/CN=Deposit Kit local test', '-addext', `subjectAltName=${san}`],
      { stdio: 'ignore' },
    )
    writeFileSync(HOSTS_FILE, hosts)
  }
  return { key: readFileSync(KEY_FILE, 'utf8'), cert: readFileSync(CERT_FILE, 'utf8'), ips }
}

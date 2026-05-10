import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { app } from 'electron'
import { execSync } from 'child_process'
import { machineIdSync } from 'node-machine-id'
import { getLicenseDoc, claimLicense } from './supabase'

// AppData cache (lost on uninstall if user deletes AppData)
const licenseFile = path.join(app.getPath('userData'), 'license.json')

// Registry key — survives uninstall/reinstall on the same PC
const REG_KEY = 'HKCU\\Software\\TomWhatsBulk'
const REG_VALUE = 'ActivatedKey'

interface LicenseCache {
  firstLaunch: number
  activatedKey?: string
  machineId?: string
}

// ── Registry helpers (Windows only) ──────────────────────────────────────────

function regRead(): string | null {
  try {
    const out = execSync(`reg query "${REG_KEY}" /v ${REG_VALUE} 2>nul`, {
      encoding: 'utf8',
      windowsHide: true
    })
    const match = out.match(/REG_SZ\s+(.+)/)
    return match ? match[1].trim() : null
  } catch (_) {
    return null
  }
}

function regWrite(value: string): void {
  try {
    execSync(`reg add "${REG_KEY}" /v ${REG_VALUE} /t REG_SZ /d "${value}" /f 2>nul`, {
      encoding: 'utf8',
      windowsHide: true
    })
  } catch (_) {}
}

// ── File cache helpers ────────────────────────────────────────────────────────

function readCache(): LicenseCache {
  try {
    if (fs.existsSync(licenseFile)) return JSON.parse(fs.readFileSync(licenseFile, 'utf-8'))
  } catch (_) {}
  const data: LicenseCache = { firstLaunch: Date.now() }
  fs.writeFileSync(licenseFile, JSON.stringify(data))
  return data
}

function saveCache(data: LicenseCache) {
  fs.writeFileSync(licenseFile, JSON.stringify(data))
}

// ── Machine ID ────────────────────────────────────────────────────────────────

export function getMachineId(): string {
  try {
    return machineIdSync(true)
  } catch (_) {
    return crypto.createHash('md5').update(process.env.COMPUTERNAME || 'unknown').digest('hex')
  }
}

// ── License check ─────────────────────────────────────────────────────────────

export async function checkLicense(): Promise<{
  valid: boolean
  trialExpired: boolean
  hoursLeft: number
  machineId: string
}> {
  const machineId = getMachineId()
  const cache = readCache()

  // 1. Check file cache first (fastest)
  if (cache.activatedKey && cache.machineId === machineId) {
    return { valid: true, trialExpired: false, hoursLeft: 0, machineId }
  }

  // 2. Check registry — survives uninstall/reinstall
  const regKey = regRead()
  if (regKey) {
    // Restore into file cache so future checks are instant
    cache.activatedKey = regKey
    cache.machineId = machineId
    saveCache(cache)
    return { valid: true, trialExpired: false, hoursLeft: 0, machineId }
  }

  // 3. No activation found — check trial
  const elapsed = Date.now() - cache.firstLaunch
  const hoursLeft = Math.max(0, 24 - elapsed / (1000 * 60 * 60))

  if (hoursLeft === 0) {
    return { valid: false, trialExpired: true, hoursLeft: 0, machineId }
  }

  return { valid: true, trialExpired: false, hoursLeft, machineId }
}

// ── Activate key ──────────────────────────────────────────────────────────────

export async function activateKey(key: string): Promise<{ success: boolean; error?: string }> {
  const machineId = getMachineId()
  const normalizedKey = key.toUpperCase().trim()

  try {
    const doc = await getLicenseDoc(normalizedKey)

    if (!doc) return { success: false, error: 'Key not found. Check the key and try again.' }
    if (!doc.active) return { success: false, error: 'This key has been disabled.' }

    // Key already claimed by a different machine
    if (doc.machine_id && doc.machine_id !== machineId) {
      return { success: false, error: 'This key is already activated on another machine.' }
    }

    // Claim on Supabase
    await claimLicense(normalizedKey, machineId)

    // Save to file cache
    const cache = readCache()
    cache.activatedKey = normalizedKey
    cache.machineId = machineId
    saveCache(cache)

    // Save to registry — persists across uninstall/reinstall
    regWrite(normalizedKey)

    return { success: true }
  } catch (e: any) {
    return { success: false, error: 'Network error. Check your internet connection.' }
  }
}

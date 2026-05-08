import { Client, LocalAuth } from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { executablePath } from 'puppeteer';
import { app } from 'electron';

function findChromeExe(dir: string): string | null {
  if (!fs.existsSync(dir)) return null
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isFile() && entry.name.toLowerCase() === 'chrome.exe') return full
      if (entry.isDirectory()) {
        const found = findChromeExe(full)
        if (found) return found
      }
    }
  } catch (_) {}
  return null
}

function getChromiumPath(): string {
  if (app.isPackaged) {
    const base = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'puppeteer')
    const found = findChromeExe(base)
    if (found) {
      console.log('[WA] Found bundled Chrome at:', found)
      return found
    }
    console.warn('[WA] Bundled Chrome not found, falling back to puppeteer default')
  }
  const p = executablePath()
  console.log('[WA] Using puppeteer default Chrome:', p)
  return p
}

// Use userData path so session survives across installs/updates
function getSessionPath(): string {
  return path.join(app.getPath('userData'), '.wwebjs_auth')
}

export class WhatsAppClient extends EventEmitter {
  private client!: Client;
  private qrCode: string | null = null;
  private isAuthenticated = false;
  private isReady = false;
  private isInitializing = false;
  private initAttempts = 0;

  private createClient() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'whatsapp-bulk-session',
        dataPath: getSessionPath()
      }),
      puppeteer: {
        headless: true,
        executablePath: getChromiumPath(),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--disable-extensions',
          '--disable-default-apps',
          '--disable-background-networking',
          '--disable-sync',
          '--disable-translate',
          '--disable-features=site-per-process,TranslateUI',
          '--disable-site-isolation-trials',
          '--disable-web-security',
          '--mute-audio',
          '--no-default-browser-check',
          '--metrics-recording-only',
          '--safebrowsing-disable-auto-update',
          '--js-flags=--max-old-space-size=512',
        ],
        timeout: 120000, // 2 min timeout for slow PCs
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1017198850-alpha.html'
      },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      bypassCSP: true
    });
    this.setupEventListeners();
  }

  constructor() {
    super();
    this.createClient();
  }

  private setupEventListeners() {
    this.client.on('qr', async (qr) => {
      console.log('[WA] QR Received');
      this.qrCode = await QRCode.toDataURL(qr);
      this.emit('qr', this.qrCode);
    });

    this.client.on('authenticated', () => {
      console.log('[WA] Authenticated');
      this.isAuthenticated = true;
      this.qrCode = null;
      this.emit('authenticated');
    });

    this.client.on('ready', () => {
      console.log('[WA] Ready');
      this.isReady = true;
      this.isInitializing = false; // clear flag so re-init works if needed
      this.emit('ready');
    });

    this.client.on('auth_failure', (msg) => {
      console.error('[WA] Auth Failure:', msg);
      this.isInitializing = false;
      this.emit('error', 'Authentication failed: ' + msg);
    });

    this.client.on('disconnected', (reason) => {
      console.warn('[WA] Disconnected:', reason);
      this.isReady = false;
      this.isAuthenticated = false;
      this.isInitializing = false;
      this.emit('disconnected', reason);
    });
  }

  async initialize() {
    if (this.isReady || this.isAuthenticated || this.isInitializing) {
      console.log('[WA] Already initializing or initialized — skipping.');
      return;
    }
    this.isInitializing = true;
    try {
      console.log(`[WA] Starting initialization (attempt ${this.initAttempts + 1})...`);
      await this.client.initialize();
      this.initAttempts = 0;
    } catch (err: any) {
      console.error('[WA] Initialization error:', err);
      this.isInitializing = false;
      const msg = err.message || 'Unknown error';

      // Retry on known transient browser crashes (up to 3 times)
      const isTransient =
        msg.includes('Navigating frame was detached') ||
        msg.includes('Execution context was destroyed') ||
        msg.includes('Session closed') ||
        msg.includes('Target closed') ||
        msg.includes('Protocol error') ||
        msg.includes('net::ERR_')

      if (isTransient && this.initAttempts < 3) {
        this.initAttempts++
        const delay = this.initAttempts * 4000 // 4s, 8s, 12s
        console.warn(`[WA] Transient error — retrying (${this.initAttempts}/3) in ${delay / 1000}s...`)
        try { await this.client.destroy() } catch (_) {}
        this.createClient()
        setTimeout(() => this.initialize(), delay)
        return
      }

      this.initAttempts = 0
      this.emit('error', 'WhatsApp failed to start: ' + msg)
    }
  }

  async isRegistered(number: string) {
    if (!this.isReady) throw new Error('WhatsApp not connected');
    const sanitized = number.replace(/\D/g, '');
    const final = sanitized.includes('@c.us') ? sanitized : `${sanitized}@c.us`;
    console.log(`[WA] Checking: ${final}`);
    const result = await this.client.isRegisteredUser(final);
    console.log(`[WA] ${final}: ${result ? 'REGISTERED' : 'NOT FOUND'}`);
    return result;
  }

  async logout() {
    try { await this.client.destroy() } catch (_) {}
    this.isReady = false;
    this.isAuthenticated = false;
    this.isInitializing = false;
    this.qrCode = null;

    // Delete saved session so QR is shown on next init
    try {
      const sessionPath = path.join(getSessionPath(), 'session-whatsapp-bulk-session')
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true })
        console.log('[WA] Session deleted')
      }
    } catch (e) {
      console.error('[WA] Failed to delete session:', e)
    }

    this.createClient()
    this.emit('disconnected', 'logout')
  }

  async sendMessage(number: string, message: string) {
    if (!this.isReady) throw new Error('WhatsApp not connected');
    const sanitized = number.replace(/\D/g, '');
    const final = sanitized.includes('@c.us') ? sanitized : `${sanitized}@c.us`;
    return await this.client.sendMessage(final, message);
  }

  getStatus() {
    return {
      isAuthenticated: this.isAuthenticated,
      isReady: this.isReady,
      qrCode: this.qrCode
    };
  }
}

export const whatsappClient = new WhatsAppClient();

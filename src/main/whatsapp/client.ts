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
    // Search inside bundled app
    const base = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'puppeteer')
    const found = findChromeExe(base)
    if (found) {
      console.log('[WA] Found bundled Chrome at:', found)
      return found
    }
    console.warn('[WA] Bundled Chrome not found, falling back to system puppeteer path')
  }
  // Dev or fallback
  const p = executablePath()
  console.log('[WA] Using puppeteer default Chrome:', p)
  return p
}

export class WhatsAppClient extends EventEmitter {
  private client!: Client;
  private qrCode: string | null = null;
  private isAuthenticated = false;
  private isReady = false;

  private createClient() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'whatsapp-bulk-session'
      }),
      puppeteer: {
        headless: true,
        executablePath: getChromiumPath(),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-default-apps',
          '--mute-audio',
          '--no-default-browser-check',
          '--disable-features=site-per-process',
          '--disable-site-isolation-trials'
        ],
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
      },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
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
      this.emit('ready');
    });

    this.client.on('auth_failure', (msg) => {
      console.error('[WA] Auth Failure:', msg);
      this.emit('error', 'Authentication failure: ' + msg);
    });

    this.client.on('disconnected', (reason) => {
      console.warn('[WA] Disconnected:', reason);
      this.isReady = false;
      this.isAuthenticated = false;
      this.emit('disconnected', reason);
    });
  }

  private isInitializing = false;
  private initAttempts = 0;

  async initialize() {
    if (this.isReady || this.isAuthenticated || this.isInitializing) {
        console.log('[WA] Engine is already initializing or initialized.');
        return;
    }
    this.isInitializing = true;
    try {
      console.log(`[WA] Starting initialization (Attempt ${this.initAttempts + 1})...`);
      await this.client.initialize();
      this.initAttempts = 0; // Reset on successful init
    } catch (err: any) {
      console.error('[WA] Initialization failed:', err);
      this.isInitializing = false;
      const errMsg = err.message || 'Unknown error';
      
      // Auto-retry for frame detaching and context destruction network errors
      if ((errMsg.includes('Navigating frame was detached') || errMsg.includes('Execution context was destroyed')) && this.initAttempts < 3) {
        this.initAttempts++;
        console.warn(`[WA] Browser background frame crash detected. Retrying ${this.initAttempts}/3 in 3s...`);
        
        try { await this.client.destroy(); } catch (_) { /* ignore */ }
        this.createClient();
        
        setTimeout(() => {
          this.initialize();
        }, 3000);
        return;
      }

      this.initAttempts = 0; // Reset after max retries
      this.emit('error', 'Initialization error: ' + errMsg);
    }
  }

  async isRegistered(number: string) {
    if (!this.isReady) throw new Error('WhatsApp client not ready');
    // Format number: remove +, spaces, etc.
    const sanitizedNumber = number.replace(/\D/g, '');
    const finalNumber = sanitizedNumber.includes('@c.us') ? sanitizedNumber : `${sanitizedNumber}@c.us`;
    
    console.log(`[WA] Checking registration for: ${finalNumber}`);
    const isRegistered = await this.client.isRegisteredUser(finalNumber);
    console.log(`[WA] Result for ${finalNumber}: ${isRegistered ? 'REGISTERED' : 'NOT FOUND'}`);
    
    return isRegistered;
  }

  async logout() {
    try {
      await this.client.destroy()
    } catch (_) { /* ignore */ }
    this.isReady = false
    this.isAuthenticated = false
    this.isInitializing = false
    this.qrCode = null

    // Wipe saved session so QR is required on next init
    try {
      const authPath = path.join(process.cwd(), '.wwebjs_auth', 'session-whatsapp-bulk-session')
      if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true })
        console.log('[WA] Session folder deleted')
      }
    } catch (e) {
      console.error('[WA] Failed to delete session folder:', e)
    }

    // Recreate a fresh client instance ready for next init
    this.createClient()
    this.emit('disconnected', 'logout')
  }

  async sendMessage(number: string, message: string) {
    if (!this.isReady) throw new Error('WhatsApp client not ready');
    const sanitizedNumber = number.replace(/\D/g, '');
    const finalNumber = sanitizedNumber.includes('@c.us') ? sanitizedNumber : `${sanitizedNumber}@c.us`;
    return await this.client.sendMessage(finalNumber, message);
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

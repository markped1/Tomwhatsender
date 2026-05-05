import { useState, useEffect, useRef } from 'react'
import { 
  MessageCircle, 
  History,
  LayoutDashboard,
  Settings,
  X,
  Plus,
  ShieldCheck,
  UserPlus,
  CheckCheck,
  AlertCircle,
  LogOut
} from 'lucide-react'
import { twistMessage } from './utils/twister'

const RATE_PRESETS = [
  { label: '1 / min',   id: '1min',   min: 55,  max: 65  },
  { label: '1 / 3 min', id: '3min',   min: 170, max: 190 },
  { label: '1 / 5 min', id: '5min',   min: 290, max: 310 },
  { label: '1 / 10 min',id: '10min',  min: 590, max: 610 },
  { label: 'Custom',    id: 'custom', min: null, max: null },
]

const AppLogo = () => (
  <div className="flex items-center gap-1">
    <div className="w-4 h-4 bg-[#25D366] rounded flex items-center justify-center">
      <MessageCircle className="w-3 h-3 text-white fill-current" />
    </div>
    <span className="text-[10px] font-black text-[#128C7E] tracking-tighter uppercase leading-none">TOM<span className="text-[#25D366]">WHATS</span></span>
  </div>
)

function App() {
  // 1. State
  const [activeTab, setActiveTab] = useState('campaign')
  const [status, setStatus] = useState<any>({ isReady: false, isAuthenticated: false, qrCode: null })
  const [contacts, setContacts] = useState<any[]>([])
  const [extractionResults, setExtractionResults] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [messageTemplate, setMessageTemplate] = useState('')
  const [isSmartTwistEnabled, setIsSmartTwistEnabled] = useState(true)
  const [countryCode, setCountryCode] = useState('234')
  const [startNumber, setStartNumber] = useState('')
  const [quantity, setQuantity] = useState(100)
  const [isVerifying, setIsVerifying] = useState(false)
  const isVerifyingRef = useRef(false)
  const [isSending, setIsSending] = useState(false)
  const isSendingRef = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const [contactStatuses, setContactStatuses] = useState<Record<string, 'pending' | 'sending' | 'sent' | 'failed'>>({})
  const [dailyLimit, setDailyLimit] = useState(300)
  const [minDelay, setMinDelay] = useState(45)
  const [maxDelay, setMaxDelay] = useState(120)
  const [sendRatePreset, setSendRatePreset] = useState<string>('custom')
  const [license, setLicense] = useState<{ valid: boolean; trialExpired: boolean; hoursLeft: number } | null>(null)
  const [licenseKey, setLicenseKey] = useState('')
  const [licenseError, setLicenseError] = useState('')
  // 2. Helpers (Defined BEFORE useEffect to avoid hoisting issues)
  const loadData = async () => {
    const api = (window as any).api;
    if (!api) return;
    try {
      const c = await api.getContacts()
      const l = await api.getLogs()
      setContacts(c || [])
      setLogs(l || [])
      const lic = await api.checkLicense()
      setLicense(lic)
    } catch (e) { console.error('Data Load Fail') }
  }

  const loadStatus = async () => {
    const api = (window as any).api;
    if (!api) return;
    try {
      const s = await api.getStatus()
      if (s) {
        setStatus((prev: any) => ({ 
           ...prev, 
           isAuthenticated: s.isAuthenticated, 
           isReady: s.isReady, 
           qrCode: s.qrCode ? s.qrCode : prev.qrCode 
        }))
      }
    } catch (e) {
      console.error('Poll Error')
    }
  }

  // 3. Effects
  useEffect(() => {
    const api = (window as any).api

    // Check license immediately on mount
    if (api) api.checkLicense().then(setLicense)

    loadData()
    const timer = setInterval(loadStatus, 2000)

    // Re-check license every minute to update countdown
    const licTimer = setInterval(async () => {
      if (api) {
        const lic = await api.checkLicense()
        setLicense(lic)
      }
    }, 60000)

    // Setup WhatsApp Event Listener for real-time QR updates
    let cleanup = () => {}
    if (api && typeof api.onWhatsAppEvent === 'function') {
      cleanup = api.onWhatsAppEvent((event: any) => {
        if (event.type === 'qr') {
          setStatus((prev: any) => ({ ...prev, qrCode: event.data }))
        } else if (event.type === 'authenticated' || event.type === 'ready') {
          setStatus((prev: any) => ({ ...prev, isAuthenticated: true, isReady: true, qrCode: null }))
          setIsConnectModalOpen(false)
        } else if (event.type === 'disconnected') {
           setStatus({ isReady: false, isAuthenticated: false, qrCode: null })
        } else if (event.type === 'error') {
           setError(`WhatsApp Error: ${event.data}`)
        }
      })
    }

    return () => {
      clearInterval(timer)
      clearInterval(licTimer)
      cleanup()
    }
  }, [])

  useEffect(() => {
    if (status.isReady && isConnectModalOpen) setIsConnectModalOpen(false)
  }, [status.isReady, isConnectModalOpen])

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // 4. Handlers
  const handleConnect = async () => {
    setIsConnectModalOpen(true)
    const api = (window as any).api
    if (api) {
      if (typeof api.init === 'function') await api.init()
      else if (typeof api.initWhatsApp === 'function') await api.initWhatsApp()
    }
  }

  const handleGenerateNumbers = async () => {
    const api = (window as any).api;
    if (!api) return;
    setIsVerifying(true)
    isVerifyingRef.current = true
    setError(null)
    setExtractionResults([])
    const base = parseInt(startNumber)
    if (!base) { setError("Set Start Num"); setIsVerifying(false); isVerifyingRef.current = false; return; }

    for (let i = 0; i < quantity; i++) {
       if (!isVerifyingRef.current) break
       const num = (base + i).toString()
       const fullNum = `${countryCode}${num}`
       try {
         const isReg = await api.isRegistered(fullNum)
         if (isReg) {
           const lead = { phone: fullNum, name: `Lead ${i+1}` }
           setExtractionResults(prev => [lead, ...prev])
           await api.addContacts([lead])
         }
       } catch (e: any) { console.error(e) }
       // Randomized delay 3–8s between checks to avoid detection
       const delay = 3000 + Math.random() * 5000
       await new Promise(r => setTimeout(r, delay))
    }
    setIsVerifying(false)
    isVerifyingRef.current = false
    await loadData()
  }

  const handleStopVerification = () => {
    setIsVerifying(false)
    isVerifyingRef.current = false
  }

  const handleExportLeads = () => {
    if (extractionResults.length === 0) {
      setError("No leads to export");
      return;
    }
    const csvContent = "data:text/csv;charset=utf-8,Phone,Name\n" 
      + extractionResults.map(e => `${e.phone},${e.name}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "whatsapp_active_leads.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const handleTransferToCampaign = async () => {
    const api = (window as any).api;
    if (!api || extractionResults.length === 0) return;
    try {
      await api.addContacts(extractionResults);
      await loadData();
      setSuccess("Leads Transferred to Campaign!");
      setError(null);
    } catch(e) { console.error(e) }
  }

  const handleImportContacts = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;
      
      const lines = text.split('\n');
      const api = (window as any).api;
      if (!api) return;
      
      const newContacts: any[] = [];
      lines.forEach((line, i) => {
        const parts = line.split(',');
        let phone = parts[0]?.trim() || '';
        phone = phone.replace(/\D/g, ''); // Extract only digits
        
        if (phone.length > 5) {
          newContacts.push({ phone, name: parts[1]?.trim() || `Imported ${i+1}` });
        }
      });
      
      if (newContacts.length > 0) {
        await api.addContacts(newContacts);
        await loadData();
        setSuccess(`Imported ${newContacts.length} numbers successfully!`);
        setError(null);
      } else {
        setError('No valid numbers found in file.');
      }
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = '';
  }


  const [quickPhone, setQuickPhone] = useState('')
  const [isSendingQuick, setIsSendingQuick] = useState(false)

  const handleQuickSend = async () => {
    const api = (window as any).api
    if (!api || !status.isReady) { setError('Connect WhatsApp first'); return }
    if (!quickPhone.trim()) { setError('Enter a phone number'); return }
    if (!messageTemplate.trim()) { setError('Type a message first'); return }
    setIsSendingQuick(true)
    try {
      let finalMessage = messageTemplate.replace('{name}', '')
      if (isSmartTwistEnabled) finalMessage = twistMessage(finalMessage, 0.3)
      await api.sendMessage({ phone: quickPhone.replace(/\D/g, ''), message: finalMessage })
      setSuccess(`Sent to ${quickPhone}`)
      setQuickPhone('')
      await loadData()
    } catch (e: any) {
      setError(`Failed: ${e.message}`)
    }
    setIsSendingQuick(false)
  }

  const handleActivateLicense = async () => {
    const api = (window as any).api
    if (!licenseKey.trim()) { setLicenseError('Enter your serial key'); return }
    const result = await api.activateLicense(licenseKey)
    if (result.success) {
      const lic = await api.checkLicense()
      setLicense(lic)
      setLicenseError('')
    } else {
      setLicenseError(result.error || 'Activation failed.')
    }
  }

  const handleStopSending = () => {
    setIsSending(false)
    isSendingRef.current = false
  }

  const handleStartCampaign = async () => {
    const api = (window as any).api;
    if (!api || !status.isReady) { setError("Connect WhatsApp"); return; }
    if (contacts.length === 0) { setError("No leads"); return; }
    if (!messageTemplate.trim()) { setError("Type a message first"); return; }

    setIsSending(true)
    isSendingRef.current = true

    const initial: Record<string, 'pending' | 'sending' | 'sent' | 'failed'> = {}
    contacts.forEach(c => { initial[c.phone] = 'pending' })
    setContactStatuses(initial)

    const DAILY_LIMIT = dailyLimit
    let sentToday = 0

    for (const contact of contacts) {
      if (!isSendingRef.current) break
      if (sentToday >= DAILY_LIMIT) {
        setError(`Daily limit of ${DAILY_LIMIT} messages reached.`)
        break
      }

      setContactStatuses(prev => ({ ...prev, [contact.phone]: 'sending' }))
      try {
        let finalMessage = messageTemplate.replace('{name}', contact.name || '')
        if (isSmartTwistEnabled) finalMessage = twistMessage(finalMessage, 0.3)
        await api.sendMessage({ phone: contact.phone, message: finalMessage })
        setContactStatuses(prev => ({ ...prev, [contact.phone]: 'sent' }))
        sentToday++
        await loadData()
      } catch (e) {
        console.error(e)
        setContactStatuses(prev => ({ ...prev, [contact.phone]: 'failed' }))
      }

      // Randomized delay between messages using user-configured range
      const delay = (minDelay * 1000) + Math.random() * ((maxDelay - minDelay) * 1000)
      await new Promise(r => setTimeout(r, delay))
    }

    setIsSending(false)
    isSendingRef.current = false
  }

  return (
    <div className="flex flex-col h-screen bg-[#F0F2F5] text-[#3b4a54] font-sans selection:bg-[#25D366]/30 text-[9px] overflow-hidden">
      
      {/* Header */}
      <header className="bg-[#00A884] shrink-0 z-30 shadow-sm">
        <div className="h-9 flex items-center px-2 justify-between">
          <div className="bg-white px-1 py-0.5 rounded shadow-sm"><AppLogo /></div>
          <div className="flex items-center gap-1.5">
            <div className={`px-1.5 py-0.5 rounded-full flex items-center gap-1 bg-white/20 text-white font-black text-[7px] uppercase`}>
               <div className={`w-1 h-1 rounded-full ${status.isReady ? 'bg-[#25D366]' : 'bg-white'}`} />
               {status.isReady ? 'LIVE' : 'OFF'}
            </div>
            {!status.isReady && (
              <button onClick={handleConnect} className="bg-white text-[#00A884] px-2 py-0.5 rounded font-black text-[8px] active:scale-95 transition-all shadow-sm">LINK</button>
            )}
          </div>
        </div>
        {license && !license.trialExpired && license.hoursLeft > 0 && (
          <div className="bg-yellow-400 text-black px-2 py-0.5 flex items-center justify-between text-[7px] font-black">
            <span>⏳ TRIAL: {Math.floor(license.hoursLeft)}h {Math.floor((license.hoursLeft % 1) * 60)}m remaining</span>
            <span className="opacity-60 uppercase tracking-wider">Enter serial key to unlock</span>
          </div>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        
        {/* Sidebar */}
        <aside className="w-8 bg-white border-r flex flex-col items-center py-2 gap-3 shrink-0 z-20">
          <button onClick={() => setActiveTab('campaign')} className={`p-1 rounded ${activeTab === 'campaign' ? 'text-[#00A884] bg-[#F0F2F5]' : 'text-gray-300'}`}><LayoutDashboard className="w-4 h-4" /></button>
          <button onClick={() => setActiveTab('generator')} className={`p-1 rounded ${activeTab === 'generator' ? 'text-[#00A884] bg-[#F0F2F5]' : 'text-gray-300'}`}><UserPlus className="w-4 h-4" /></button>
          <button onClick={() => setActiveTab('history')} className={`p-1 rounded ${activeTab === 'history' ? 'text-[#00A884] bg-[#F0F2F5]' : 'text-gray-300'}`}><History className="w-4 h-4" /></button>
          <div className="mt-auto flex flex-col items-center gap-3 w-full">
            <button onClick={() => setActiveTab('settings')} className={`p-1 rounded ${activeTab === 'settings' ? 'text-[#00A884] bg-[#F0F2F5]' : 'text-gray-300 hover:text-gray-500'}`}><Settings className="w-4 h-4" /></button>
            <button className="p-1 text-red-300 hover:text-red-500" onClick={async () => {
              await (window as any).api?.logout()
              setStatus({ isReady: false, isAuthenticated: false, qrCode: null })
            }}><LogOut className="w-4 h-4" /></button>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          
          <div className="flex-1 flex overflow-hidden p-1.5 gap-1.5">
             
             {/* Dynamic Main View based on activeTab */}
             {activeTab === 'campaign' && (
               <section className="flex-1 flex flex-col gap-1.5 min-w-0 overflow-hidden">
                  {/* Message Editor */}
                  <div className="bg-white rounded border p-1.5 flex flex-col shadow-sm" style={{height: '45%'}}>
                     <div className="flex justify-between items-center mb-1">
                        <span className="font-black text-gray-300 text-[10px] uppercase">EDITOR</span>
                        <ShieldCheck className="w-3 h-3 text-[#00A884]" />
                     </div>
                     <div className="relative flex-1">
                        <textarea 
                          value={messageTemplate}
                          onChange={(e) => setMessageTemplate(e.target.value)}
                          placeholder="Type message..."
                          className="w-full h-full p-2 bg-[#F8F9FA] border rounded outline-none text-[10px] font-bold resize-none"
                        />
                        <div className="absolute bottom-1 right-1 flex items-center gap-1 bg-white border p-0.5 rounded scale-75 origin-bottom-right">
                           <span className="text-[7px] font-black text-gray-400 uppercase">Twist</span>
                           <button onClick={() => setIsSmartTwistEnabled(!isSmartTwistEnabled)} className={`w-5 h-2.5 rounded-full relative ${isSmartTwistEnabled ? 'bg-[#00A884]' : 'bg-gray-300'}`}>
                              <div className={`absolute top-0.5 w-1.5 h-1.5 bg-white rounded-full transition-transform ${isSmartTwistEnabled ? 'left-3' : 'left-0.5'}`} />
                           </button>
                        </div>
                     </div>
                     <div className="mt-1.5 flex items-center gap-1 shrink-0">
                        <input
                          value={quickPhone}
                          onChange={e => setQuickPhone(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleQuickSend()}
                          placeholder="Quick send: +2348..."
                          className="flex-1 p-1 border rounded text-[9px] font-bold outline-none focus:border-[#00A884] bg-[#F8F9FA]"
                        />
                        <button
                          onClick={handleQuickSend}
                          disabled={!status.isReady || isSendingQuick}
                          className="px-2 py-1 bg-[#128C7E] text-white rounded font-black text-[8px] uppercase disabled:opacity-40 active:scale-95 transition-all shrink-0"
                        >
                          {isSendingQuick ? '...' : 'SEND'}
                        </button>
                     </div>
                     <div className="mt-1 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-1.5 bg-gray-50 border rounded px-1.5 py-0.5 shadow-sm">
                           <label className="cursor-pointer flex items-center gap-1 text-[8px] font-black text-[#00A884] uppercase tracking-wider hover:text-[#009272] transition-colors">
                              <Plus className="w-2.5 h-2.5" /> IMPORT
                              <input type="file" accept=".csv,.txt" className="hidden" onChange={handleImportContacts} />
                           </label>
                           <div className="w-px h-3 bg-gray-200 mx-0.5" />
                           <span className="text-[7px] font-black text-gray-400">QUEUED: {contacts.length}</span>
                        </div>
                        <button 
                          onClick={isSending ? handleStopSending : handleStartCampaign}
                          disabled={!status.isReady}
                          className={`px-4 py-1 rounded font-black text-[10px] uppercase tracking-tighter shadow ${isSending ? 'bg-red-500 text-white' : 'bg-[#00A884] text-white active:scale-95'}`}
                        >
                           {isSending ? 'STOP' : 'SEND'}
                        </button>
                     </div>
                  </div>

                  {/* Contact Queue List */}
                  <div className="bg-white rounded border flex flex-col overflow-hidden shadow-sm flex-1">
                     <div className="px-1.5 py-1 border-b bg-[#F0F2F5] shrink-0 flex items-center justify-between">
                        <span className="font-black text-[7px] text-gray-500 uppercase tracking-widest">QUEUE</span>
                        <div className="flex items-center gap-1.5">
                           <span className="text-[7px] font-black text-[#00A884] bg-[#00A884]/10 px-1 py-0.5 rounded">
                             {sendRatePreset !== 'custom'
                               ? RATE_PRESETS.find(p => p.id === sendRatePreset)?.label
                               : `${minDelay}–${maxDelay}s`}
                           </span>
                           <span className="text-[7px] font-black text-gray-400">{contacts.filter(c => contactStatuses[c.phone] === 'sent').length}/{contacts.length}</span>
                           <button
                             onClick={async () => { await (window as any).api?.clearContacts(); setContactStatuses({}); loadData(); }}
                             className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 border border-red-200 text-red-400 hover:bg-red-100 hover:text-red-600 rounded text-[7px] font-black uppercase tracking-wider transition-colors"
                           >
                             <X className="w-2 h-2" /> CLEAR
                           </button>
                        </div>
                     </div>
                     <div className="flex-1 overflow-y-auto custom-scroll">
                        {contacts.length === 0 ? (
                           <div className="flex items-center justify-center h-full text-[8px] text-gray-300 font-black uppercase">No contacts queued</div>
                        ) : (
                           contacts.map((contact, i) => {
                              const st = contactStatuses[contact.phone] || contact.status || 'pending'
                              return (
                                 <div key={i} className="flex items-center gap-1.5 px-1.5 py-1 border-b border-black/[0.04] last:border-0">
                                    {/* Status indicator */}
                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                       st === 'sent' ? 'bg-[#25D366]' :
                                       st === 'failed' ? 'bg-red-400' :
                                       st === 'sending' ? 'bg-yellow-400 animate-pulse' :
                                       'bg-gray-200'
                                    }`} />
                                    <span className="text-[8px] font-bold text-[#128C7E] truncate flex-1">+{contact.phone}</span>
                                    <span className="text-[7px] text-gray-300 truncate max-w-[40px]">{contact.name}</span>
                                    <span className={`text-[7px] font-black shrink-0 ${
                                       st === 'sent' ? 'text-[#25D366]' :
                                       st === 'failed' ? 'text-red-400' :
                                       st === 'sending' ? 'text-yellow-500' :
                                       'text-gray-300'
                                    }`}>
                                       {st === 'sent' ? '✓' : st === 'failed' ? '✗' : st === 'sending' ? '...' : '–'}
                                    </span>
                                 </div>
                              )
                           })
                        )}
                     </div>
                  </div>
               </section>
             )}

             {activeTab !== 'campaign' && activeTab !== 'generator' && activeTab !== 'history' && activeTab !== 'settings' && (
               <section className="flex-1 flex flex-col bg-white rounded border p-3 items-center justify-center text-gray-400">
                  <span className="font-black text-[10px] uppercase tracking-widest">{activeTab} MODULE</span>
               </section>
             )}

             {activeTab === 'settings' && (
               <section className="flex-1 flex flex-col gap-1.5 min-w-0 overflow-hidden">
                 <div className="bg-white rounded border p-3 flex flex-col gap-3 shadow-sm overflow-y-auto">
                   <span className="font-black text-[10px] text-gray-400 uppercase tracking-widest">Send Settings</span>

                   {/* Send Rate Presets */}
                   <div className="flex flex-col gap-1.5">
                     <span className="text-[7px] font-black text-gray-400 uppercase">Send Rate</span>
                     <div className="grid grid-cols-2 gap-1">
                       {RATE_PRESETS.map(preset => (
                         <button
                           key={preset.id}
                           onClick={() => {
                             setSendRatePreset(preset.id)
                             if (preset.min !== null && preset.max !== null) {
                               setMinDelay(preset.min)
                               setMaxDelay(preset.max)
                             }
                           }}
                           className={`py-1.5 px-2 rounded border text-[8px] font-black uppercase tracking-wide transition-all ${
                             sendRatePreset === preset.id
                               ? 'bg-[#00A884] text-white border-[#00A884] shadow-sm'
                               : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-[#00A884] hover:text-[#00A884]'
                           }`}
                         >
                           {preset.label}
                         </button>
                       ))}
                     </div>
                     <span className="text-[6px] text-gray-300">
                       {sendRatePreset !== 'custom'
                         ? `≈ 1 message every ${RATE_PRESETS.find(p => p.id === sendRatePreset)?.label.split('/ ')[1]} — delay auto-set`
                         : 'Set your own min/max delay below'}
                     </span>
                   </div>

                   <div className="flex flex-col gap-1">
                     <span className="text-[7px] font-black text-gray-400 uppercase">Daily Send Limit</span>
                     <div className="flex items-center gap-2">
                       <input
                         type="number"
                         value={dailyLimit}
                         onChange={e => setDailyLimit(parseInt(e.target.value) || 300)}
                         className="w-full p-1.5 border rounded text-[9px] font-bold outline-none focus:border-[#00A884]"
                       />
                       <span className="text-[7px] text-gray-400 shrink-0">msgs/day</span>
                     </div>
                     <span className="text-[6px] text-gray-300">Recommended: 200–500 for aged numbers</span>
                   </div>

                   <div className="flex gap-2">
                     <div className="flex flex-col gap-1 flex-1">
                       <span className="text-[7px] font-black text-gray-400 uppercase">Min Delay</span>
                       <div className="flex items-center gap-1">
                         <input
                           type="number"
                           value={minDelay}
                           onChange={e => { setMinDelay(parseInt(e.target.value) || 30); setSendRatePreset('custom') }}
                           className="w-full p-1.5 border rounded text-[9px] font-bold outline-none focus:border-[#00A884]"
                         />
                         <span className="text-[7px] text-gray-400 shrink-0">sec</span>
                       </div>
                     </div>
                     <div className="flex flex-col gap-1 flex-1">
                       <span className="text-[7px] font-black text-gray-400 uppercase">Max Delay</span>
                       <div className="flex items-center gap-1">
                         <input
                           type="number"
                           value={maxDelay}
                           onChange={e => { setMaxDelay(parseInt(e.target.value) || 120); setSendRatePreset('custom') }}
                           className="w-full p-1.5 border rounded text-[9px] font-bold outline-none focus:border-[#00A884]"
                         />
                         <span className="text-[7px] text-gray-400 shrink-0">sec</span>
                       </div>
                     </div>
                   </div>
                   <span className="text-[6px] text-gray-300">Random delay between {minDelay}–{maxDelay}s per message. Higher = safer.</span>

                   <div className="border-t pt-3 flex flex-col gap-1">
                     <span className="font-black text-[9px] text-gray-500 uppercase">Anti-Ban Tips</span>
                     <ul className="text-[7px] text-gray-400 space-y-1 list-disc pl-3">
                       <li>Use numbers at least 3 months old</li>
                       <li>Start with 50/day, increase gradually</li>
                       <li>Keep Smart Twist ON always</li>
                       <li>Avoid sending same message twice</li>
                       <li>Don&apos;t run 24/7 — take breaks</li>
                     </ul>
                   </div>
                 </div>
               </section>
             )}

             {activeTab === 'history' && (
               <section className="flex-1 flex flex-col gap-1.5 min-w-0 overflow-hidden">
                  <div className="bg-white rounded border flex flex-col overflow-hidden shadow-sm flex-1">
                     <div className="px-1.5 py-1 border-b bg-[#F0F2F5] shrink-0 flex items-center justify-between">
                        <span className="font-black text-[7px] text-gray-500 uppercase tracking-widest">SEND HISTORY</span>
                        <div className="flex items-center gap-1.5">
                           <span className="text-[7px] font-black text-gray-400">{logs.length} entries</span>
                           <button
                             onClick={async () => { await (window as any).api?.clearLogs(); loadData(); }}
                             className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 border border-red-200 text-red-400 hover:bg-red-100 rounded text-[7px] font-black uppercase transition-colors"
                           >
                             <X className="w-2 h-2" /> CLEAR
                           </button>
                        </div>
                     </div>

                     {/* Stats bar */}
                     {logs.length > 0 && (
                        <div className="px-2 py-1 border-b bg-[#F8F9FA] shrink-0 flex items-center gap-3">
                           <div className="flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#25D366]" />
                              <span className="text-[7px] font-black text-gray-500">SENT: {logs.filter((l: any) => l.status === 'sent').length}</span>
                           </div>
                           <div className="flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                              <span className="text-[7px] font-black text-gray-500">FAILED: {logs.filter((l: any) => l.status === 'failed').length}</span>
                           </div>
                           <div className="ml-auto text-[7px] font-black text-[#00A884]">
                              {logs.length > 0 ? Math.round((logs.filter((l: any) => l.status === 'sent').length / logs.length) * 100) : 0}% success
                           </div>
                        </div>
                     )}

                     <div className="flex-1 overflow-y-auto custom-scroll">
                        {logs.length === 0 ? (
                           <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-1">
                              <History className="w-6 h-6" />
                              <span className="text-[8px] font-black uppercase">No history yet</span>
                              <span className="text-[7px]">Send a campaign to see logs here</span>
                           </div>
                        ) : (
                           logs.map((log: any, i: number) => (
                              <div key={i} className="flex items-center gap-1.5 px-2 py-1.5 border-b border-black/[0.04] last:border-0">
                                 <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${log.status === 'sent' ? 'bg-[#25D366]' : 'bg-red-400'}`} />
                                 <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-[9px] font-bold text-[#128C7E] truncate">+{log.phone}</span>
                                    {log.error && <span className="text-[7px] text-red-400 truncate">{log.error}</span>}
                                 </div>
                                 <div className="flex flex-col items-end shrink-0 gap-0.5">
                                    <span className={`text-[7px] font-black ${log.status === 'sent' ? 'text-[#25D366]' : 'text-red-400'}`}>
                                       {log.status === 'sent' ? '✓ SENT' : '✗ FAIL'}
                                    </span>
                                    <span className="text-[6px] text-gray-300 font-mono">
                                       {new Date(log.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                 </div>
                              </div>
                           ))
                        )}
                     </div>
                  </div>
               </section>
             )}

             {activeTab === 'generator' && (
               <section className="flex-1 flex flex-col gap-1.5 min-w-0 overflow-hidden">
                  {/* Controls */}
                  <div className="bg-white rounded border p-2 shadow-sm shrink-0">
                     <div className="flex items-center justify-between mb-1.5">
                        <span className="font-black text-[10px] text-gray-400 uppercase tracking-widest">Lead Extractor</span>
                        <span className="text-[8px] font-black text-[#00A884]">{extractionResults.length} found</span>
                     </div>
                     <div className="flex gap-1 mb-1">
                        <div className="flex flex-col gap-0.5 flex-1">
                           <span className="text-[7px] font-black text-gray-400 uppercase">Country Code</span>
                           <input value={countryCode} onChange={e => setCountryCode(e.target.value)} className="w-full p-1 border text-[9px] rounded font-bold outline-none focus:border-[#00A884]" placeholder="234" />
                        </div>
                        <div className="flex flex-col gap-0.5 flex-1">
                           <span className="text-[7px] font-black text-gray-400 uppercase">Quantity</span>
                           <input type="number" value={quantity} onChange={e => setQuantity(parseInt(e.target.value))} className="w-full p-1 border text-[9px] rounded font-bold outline-none focus:border-[#00A884]" />
                        </div>
                     </div>
                     <div className="flex flex-col gap-0.5 mb-1.5">
                        <span className="text-[7px] font-black text-gray-400 uppercase">Start Number</span>
                        <input value={startNumber} onChange={e => setStartNumber(e.target.value)} placeholder="e.g. 8031234567" className="w-full p-1 border text-[9px] rounded font-bold outline-none focus:border-[#00A884]" />
                     </div>
                     <div className="flex gap-1">
                        <button
                          onClick={isVerifying ? handleStopVerification : handleGenerateNumbers}
                          className={`flex-1 py-1.5 rounded text-[9px] font-black uppercase tracking-widest text-white ${isVerifying ? 'bg-red-500' : 'bg-[#2563EB] hover:bg-[#1d4ed8]'} transition-colors`}
                        >
                          {isVerifying ? 'STOP' : 'EXTRACT'}
                        </button>
                        {extractionResults.length > 0 && (
                          <>
                            <button onClick={handleExportLeads} className="px-2 py-1.5 rounded bg-gray-100 text-gray-500 font-black text-[8px] uppercase hover:bg-gray-200 transition-colors">CSV</button>
                            <button onClick={handleTransferToCampaign} className="px-2 py-1.5 rounded bg-[#00A884] text-white font-black text-[8px] uppercase hover:bg-[#009272] transition-colors">→ Campaign</button>
                          </>
                        )}
                     </div>
                     {isVerifying && (
                        <div className="mt-1.5 w-full bg-gray-100 rounded-full h-1 overflow-hidden">
                           <div className="h-full bg-[#2563EB] animate-pulse rounded-full" style={{width: `${Math.min((extractionResults.length / quantity) * 100, 100)}%`}} />
                        </div>
                     )}
                  </div>

                  {/* Results List */}
                  <div className="bg-white rounded border flex flex-col overflow-hidden shadow-sm flex-1">
                     <div className="px-1.5 py-1 border-b bg-[#F0F2F5] shrink-0 flex items-center justify-between">
                        <span className="font-black text-[7px] text-gray-500 uppercase tracking-widest">ACTIVE LEADS</span>
                        {extractionResults.length > 0 && (
                           <button onClick={() => setExtractionResults([])} className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 border border-red-200 text-red-400 hover:bg-red-100 rounded text-[7px] font-black uppercase transition-colors">
                              <X className="w-2 h-2" /> CLEAR
                           </button>
                        )}
                     </div>
                     <div className="flex-1 overflow-y-auto custom-scroll">
                        {extractionResults.length === 0 ? (
                           <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-1">
                              <UserPlus className="w-6 h-6" />
                              <span className="text-[8px] font-black uppercase">No leads yet</span>
                              <span className="text-[7px]">Set params and hit EXTRACT</span>
                           </div>
                        ) : (
                           extractionResults.map((lead, i) => (
                              <div key={i} className="flex items-center gap-2 px-2 py-1 border-b border-black/[0.04] last:border-0">
                                 <CheckCheck className="w-2.5 h-2.5 text-[#25D366] shrink-0" />
                                 <span className="text-[9px] font-bold text-[#128C7E] flex-1">+{lead.phone}</span>
                                 <span className="text-[7px] text-gray-300">{lead.name}</span>
                              </div>
                           ))
                        )}
                     </div>
                  </div>
               </section>
             )}

             {/* Lead Results sidebar — only show on campaign tab */}
             {activeTab === 'campaign' && (
               <aside className="w-[110px] bg-white rounded border flex flex-col overflow-hidden shrink-0 shadow-sm">
                <div className="p-1 px-1.5 border-b bg-[#F0F2F5] shrink-0 flex items-center justify-between text-[7px] font-black">
                   <span className="text-gray-500 uppercase">LEADS</span>
                   <span className="text-[#00A884]">{extractionResults.length}</span>
                </div>
                <div className="p-1 border-b bg-[#F8F9FA] space-y-1 shrink-0">
                   <div className="flex gap-1">
                      <input value={countryCode} onChange={e => setCountryCode(e.target.value)} className="w-1/2 p-0.5 border text-[9px] rounded font-bold outline-none" placeholder="234" />
                      <input type="number" value={quantity} onChange={e => setQuantity(parseInt(e.target.value))} className="w-1/2 p-0.5 border text-[9px] rounded font-bold outline-none" />
                   </div>
                   <input value={startNumber} onChange={e => setStartNumber(e.target.value)} placeholder="0803..." className="w-full p-0.5 border text-[9px] rounded font-bold outline-none" />
                   <button onClick={isVerifying ? handleStopVerification : handleGenerateNumbers} className="w-full py-1 bg-[#2563EB] text-white rounded text-[8px] font-black uppercase tracking-widest">{isVerifying ? 'STOP' : 'EXTRACT'}</button>
                   {extractionResults.length > 0 && (
                      <div className="flex gap-1 mt-1">
                         <button onClick={handleExportLeads} className="flex-1 py-1 rounded bg-gray-200 text-gray-500 font-black text-[7px] uppercase tracking-widest cursor-pointer hover:bg-gray-300 transition-colors">CSV</button>
                         <button onClick={handleTransferToCampaign} className="flex-1 py-1 rounded bg-[#00A884] text-white font-black text-[7px] uppercase tracking-widest cursor-pointer hover:bg-[#009272] transition-colors">Transfer</button>
                      </div>
                   )}
                </div>
                <div className="flex-1 overflow-y-auto p-1 space-y-1 bg-[#F8F9FA] custom-scroll">
                   {extractionResults.map((lead, i) => (
                      <div key={i} className="bg-white p-1 rounded border border-black/5 flex items-center justify-between text-[8px] font-bold">
                         <span className="truncate">+{lead.phone}</span>
                         <CheckCheck className="w-2 h-2 text-[#25D366]" />
                      </div>
                   ))}
                </div>
             </aside>
             )}
          </div>

          {/* Delivery Feed */}
          <div className="h-28 bg-white border-t mt-auto flex flex-col overflow-hidden shrink-0 shadow-md">
             <div className="px-2 py-0.5 border-b bg-[#F0F2F5]/50 flex items-center justify-between shrink-0 font-black text-[7px] text-gray-400 tracking-widest uppercase">
                <span>FEED</span>
                <button onClick={async () => { await (window as any).api.clearLogs(); loadData(); }} className="text-red-400 scale-90">X</button>
             </div>
             <div className="flex-1 overflow-y-auto p-1.5 space-y-1 bg-[#F8F9FA] custom-scroll">
                {logs.map((log: any, i: number) => (
                   <div key={i} className="flex items-center gap-1.5 border-b border-black/[0.02] pb-0.5 last:border-0 text-[8px] font-bold">
                      <span className="text-gray-300 flex-shrink-0 font-mono text-[7px]">{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      <span className="text-[#128C7E] flex-shrink-0">+{log.phone}</span>
                      <span className="text-gray-400 italic truncate flex-1">&ldquo;{log.message || '...'}&rdquo;</span>
                      <span className={`${log.status === 'sent' ? 'text-[#00A884]' : 'text-red-500'} flex-shrink-0 text-[7px]`}>{log.status === 'sent' ? 'OK' : 'FAIL'}</span>
                   </div>
                ))}
                <div ref={logEndRef} />
             </div>
          </div>
        </div>
      </div>

      {/* License Gate — shown when trial expires */}
      {license?.trialExpired && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-[200px] overflow-hidden shadow-2xl">
            <div className="p-2 bg-[#128C7E] text-white text-center font-black text-[9px] uppercase tracking-widest">LICENSE REQUIRED</div>
            <div className="p-4 flex flex-col gap-3">
              <div className="text-center">
                <div className="text-2xl mb-1">🔒</div>
                <p className="text-[8px] font-black text-gray-500 uppercase tracking-wide">Trial period expired</p>
                <p className="text-[7px] text-gray-400 mt-0.5">Enter your serial key to continue</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <input
                  value={licenseKey}
                  onChange={e => setLicenseKey(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleActivateLicense()}
                  placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                  className="w-full p-1.5 border rounded text-[9px] font-bold outline-none focus:border-[#00A884] font-mono"
                />
                {licenseError && <p className="text-[7px] text-red-500 font-black">{licenseError}</p>}
                <button
                  onClick={handleActivateLicense}
                  className="w-full py-1.5 bg-[#00A884] text-white rounded font-black text-[9px] uppercase tracking-widest hover:bg-[#009272] transition-colors"
                >
                  ACTIVATE
                </button>
                <p className="text-[6px] text-gray-300 text-center">Contact your vendor for a serial key</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Connection Modal */}
      {isConnectModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl w-[180px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="p-2 bg-[#00A884] text-white text-center font-black text-[9px] uppercase tracking-widest">WHATSAPP LINK</div>
              <div className="p-4 flex flex-col items-center gap-4">
                 {status.qrCode ? (
                    <div className="p-1 border rounded bg-white shadow-inner animate-in fade-in zoom-in-50">
                      <img src={status.qrCode} alt="QR" className="w-32 h-32" />
                    </div>
                 ) : (
                    <div className="w-32 h-32 flex flex-col items-center justify-center gap-2">
                      <div className="w-8 h-8 border-2 border-[#00A884] border-t-transparent rounded-full animate-spin" />
                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest text-center">Generating<br/>QR Code...</span>
                    </div>
                 )}
                 <button onClick={() => setIsConnectModalOpen(false)} className="w-full py-1.5 bg-gray-50 text-gray-400 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-gray-100 transition-colors">Cancel</button>
              </div>
           </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-2 left-2 right-2 bg-red-600 text-white p-1.5 rounded shadow-xl flex items-center gap-2 z-[60] text-[8px] font-black animate-in slide-in-from-bottom-2">
           <AlertCircle className="w-2.5 h-2.5 shrink-0" />
           <p className="flex-1 truncate uppercase tracking-tighter">{error}</p>
           <button onClick={() => setError(null)}><X className="w-2.5 h-2.5" /></button>
        </div>
      )}

      {success && (
        <div className="fixed bottom-2 left-2 right-2 bg-[#00A884] text-white p-1.5 rounded shadow-xl flex items-center gap-2 z-[60] text-[8px] font-black animate-in slide-in-from-bottom-2">
           <CheckCheck className="w-2.5 h-2.5 shrink-0" />
           <p className="flex-1 truncate uppercase tracking-tighter">{success}</p>
           <button onClick={() => setSuccess(null)}><X className="w-2.5 h-2.5" /></button>
        </div>
      )}

    </div>
  )
}

export default App

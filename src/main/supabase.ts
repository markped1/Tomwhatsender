const SUPABASE_URL = 'https://lcjrzupdwanyzuyshqul.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjanJ6dXBkd2FueXp1eXNocXVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDEwMjcsImV4cCI6MjA5MDM3NzAyN30.GUVYLkK2691gIeV9s2Wfs1gEzY-KXjQxn1dcdm9Q_uA'

const headers = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
}

export async function getLicenseDoc(key: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/licenses?id=eq.${encodeURIComponent(key)}&select=*`,
    { headers }
  )
  if (!res.ok) return null
  const rows = await res.json()
  return rows.length > 0 ? rows[0] : null
}

export async function claimLicense(key: string, machineId: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/licenses?id=eq.${encodeURIComponent(key)}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ machine_id: machineId, claimed_at: new Date().toISOString() })
    }
  )
  return res.ok
}

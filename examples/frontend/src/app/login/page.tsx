'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail]       = useState('customer@example.com')
  const [password, setPassword] = useState('password789')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { email, password })
      const { token, userId, email: em, name, role } = res.data
      login(token, { userId, email: em, name, role })
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'var(--bg)' }}>
      <div style={{ width: 380, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:14, fontWeight:700, color:'var(--text)' }}>
          <span style={{ color:'var(--blue)' }}>planetmoondrop</span> · Customer Support Portal
        </div>

        {/* Credentials hint */}
        <div style={{ margin:'16px 16px 0', background:'var(--blue-bg)', border:'1px solid var(--blue)', borderRadius:6, padding:'10px 14px', fontSize:12, lineHeight:1.8, color:'var(--blue)' }}>
          <b style={{ color:'#79c0ff' }}>Demo credentials</b><br/>
          admin@example.com / password123<br/>
          agent@example.com / password456<br/>
          customer@example.com / password789
        </div>

        {/* Form */}
        <div style={{ padding:16 }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:12 }}>
              <label style={{ display:'block', color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:'.4px', marginBottom:5 }}>Email</label>
              <input
                type="email" value={email} required
                onChange={e => setEmail(e.target.value)}
                style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 12px', color:'var(--text)', fontFamily:'inherit', fontSize:13, outline:'none' }}
              />
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ display:'block', color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:'.4px', marginBottom:5 }}>Password</label>
              <input
                type="password" value={password} required
                onChange={e => setPassword(e.target.value)}
                style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 12px', color:'var(--text)', fontFamily:'inherit', fontSize:13, outline:'none' }}
              />
            </div>

            {error && (
              <div style={{ background:'var(--red-bg)', border:'1px solid var(--red)', borderRadius:6, padding:'8px 12px', color:'var(--red)', fontSize:12, marginBottom:12 }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              style={{ width:'100%', background:'#1f6feb', color:'#fff', border:'none', borderRadius:6, padding:'8px 16px', fontFamily:'inherit', fontSize:13, fontWeight:600, cursor:'pointer', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

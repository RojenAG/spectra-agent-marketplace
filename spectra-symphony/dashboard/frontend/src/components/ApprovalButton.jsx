import React, { useState } from 'react'

export default function ApprovalButton({ sprint }) {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  const handleApprove = async () => {
    if (loading || sent) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/approve', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || 'Failed to send')
      setSent(true)
      setTimeout(() => setSent(false), 5000)
    } catch (e) {
      setError(e.message)
      setTimeout(() => setError(null), 4000)
    } finally {
      setLoading(false)
    }
  }

  if (error) return (
    <button className="px-3 py-2 rounded-lg bg-red-500/20 text-red-400 text-xs border border-red-500/30">
      ⚠️ {error}
    </button>
  )

  if (sent) return (
    <button className="px-3 py-2 rounded-lg bg-green-500/20 text-green-400 text-xs border border-green-500/30">
      ✅ Sent to PO
    </button>
  )

  const ready = sprint?.progress_pct >= 100

  return (
    <button
      onClick={handleApprove}
      disabled={loading}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
        ${ready
          ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/40'
          : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
        }
        ${loading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span>📱</span>
      <span>{loading ? 'Sending…' : 'Request Approval'}</span>
    </button>
  )
}

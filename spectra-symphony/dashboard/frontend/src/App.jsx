import React, { useState, useEffect } from 'react'
import SprintHeader from './components/SprintHeader'
import ActiveRuns from './components/ActiveRuns'
import PipelineQueue from './components/PipelineQueue'
import RecentCompletions from './components/RecentCompletions'
import ApprovalButton from './components/ApprovalButton'

const POLL_MS = 3000

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        setData(json)
        setLastUpdated(new Date())
        setError(null)
      } catch (e) {
        setError(e.message)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, POLL_MS)
    return () => clearInterval(interval)
  }, [])

  if (error) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-red-400 font-mono">{error}</p>
        <p className="text-gray-500 text-sm mt-2">Check that dashboard.py is running on port 8044</p>
      </div>
    </div>
  )

  if (!data) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">🔮</div>
        <p className="text-gray-400">Connecting to Spectra...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔮</span>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Spectra Dashboard</h1>
            <p className="text-gray-500 text-xs">
              Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'} · polling every 3s
            </p>
          </div>
        </div>
        <ApprovalButton sprint={data.sprint} />
      </div>

      {/* Sprint progress */}
      <SprintHeader sprint={data.sprint} />

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ActiveRuns runs={data.active_runs} />
        <PipelineQueue pipeline={data.pipeline} />
      </div>

      {/* Recent completions */}
      <div className="mt-4">
        <RecentCompletions completions={data.recent_completions} />
      </div>
    </div>
  )
}

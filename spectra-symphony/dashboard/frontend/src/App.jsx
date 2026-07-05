import React, { useState, useEffect } from 'react'
import SprintHeader from './components/SprintHeader'
import ActiveRuns from './components/ActiveRuns'
import PipelineQueue from './components/PipelineQueue'
import RecentCompletions from './components/RecentCompletions'
import ApprovalButton from './components/ApprovalButton'
import MyAgentsPanel from './components/MyAgentsPanel'
import AnalyticsPanel from './components/AnalyticsPanel'
import MarketplacePanel from './components/MarketplacePanel'
import AgentDetailPage from './components/AgentDetailPage'

const POLL_MS = 3000
const TABS = [
  { id: 'sprint', label: '🔮 Sprint Ops' },
  { id: 'my-agents', label: '🤖 My Agents' },
  { id: 'marketplace', label: '🔍 Marketplace' },
]

export default function App() {
  const [tab, setTab] = useState('sprint')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [analyticsAgent, setAnalyticsAgent] = useState(null)
  const [detailAgentId, setDetailAgentId] = useState(null)

  useEffect(() => {
    if (tab !== 'sprint') return
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
  }, [tab])

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      {/* Header + tab switcher */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔮</span>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Spectra Dashboard</h1>
            <p className="text-gray-500 text-xs">
              {tab === 'sprint'
                ? `Last updated: ${lastUpdated ? lastUpdated.toLocaleTimeString() : '—'} · polling every 3s`
                : 'Author self-serve tools'}
            </p>
          </div>
        </div>
        {tab === 'sprint' && data && <ApprovalButton sprint={data.sprint} />}
      </div>

      <div style={styles.tabBar}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id)
              if (t.id !== 'my-agents') setAnalyticsAgent(null)
              if (t.id !== 'marketplace') setDetailAgentId(null)
            }}
            style={{
              ...styles.tabBtn,
              ...(tab === t.id ? styles.tabBtnActive : {}),
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sprint' && (
        error ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <p className="text-red-400 font-mono">{error}</p>
              <p className="text-gray-500 text-sm mt-2">Check that dashboard.py is running on port 8044</p>
            </div>
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="text-4xl mb-4 animate-pulse">🔮</div>
              <p className="text-gray-400">Connecting to Spectra...</p>
            </div>
          </div>
        ) : (
          <>
            <SprintHeader sprint={data.sprint} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <ActiveRuns runs={data.active_runs} />
              <PipelineQueue pipeline={data.pipeline} />
            </div>
            <div className="mt-4">
              <RecentCompletions completions={data.recent_completions} />
            </div>
          </>
        )
      )}

      {tab === 'my-agents' && (
        analyticsAgent ? (
          <AnalyticsPanel agent={analyticsAgent} onBack={() => setAnalyticsAgent(null)} />
        ) : (
          <MyAgentsPanel onSelectAgentForAnalytics={setAnalyticsAgent} />
        )
      )}

      {tab === 'marketplace' && (
        detailAgentId ? (
          <AgentDetailPage agentListingId={detailAgentId} onBack={() => setDetailAgentId(null)} />
        ) : (
          <MarketplacePanel onSelectAgent={setDetailAgentId} />
        )
      )}
    </div>
  )
}

const styles = {
  tabBar: { display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #1f2937', paddingBottom: 0 },
  tabBtn: {
    background: 'none', border: 'none', color: '#6b7280', fontSize: 13, fontWeight: 600,
    padding: '10px 14px', cursor: 'pointer', borderBottom: '2px solid transparent',
  },
  tabBtnActive: { color: '#a78bfa', borderBottom: '2px solid #7c3aed' },
}

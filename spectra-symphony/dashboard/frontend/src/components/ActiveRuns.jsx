import React, { useState, useEffect } from 'react'

const AGENT_EMOJI = {
  architect: '🏗️',
  backend:   '⚙️',
  frontend:  '🎨',
  qa:        '🧪',
  security:  '🔒',
  data:      '📊',
  devops:    '🚀',
  orchestrator: '🔮',
}

function RunCard({ run }) {
  const [elapsed, setElapsed] = useState(run.elapsed)

  // Tick the timer locally every second for smooth updates
  useEffect(() => {
    const startStr = run.started_at
    if (!startStr) return
    const interval = setInterval(() => {
      const start = new Date(startStr)
      const sec = Math.floor((Date.now() - start.getTime()) / 1000)
      const mm = String(Math.floor(sec / 60)).padStart(2, '0')
      const ss = String(sec % 60).padStart(2, '0')
      setElapsed(`${mm}:${ss}`)
    }, 1000)
    return () => clearInterval(interval)
  }, [run.started_at])

  const emoji = AGENT_EMOJI[run.agent_type?.toLowerCase()] || '🤖'

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 flex items-center gap-3">
      <div className="text-2xl">{emoji}</div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{run.issue_title}</p>
        <p className="text-gray-400 text-xs capitalize">{run.agent_type}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
          <span className="text-green-400 text-xs font-mono">{elapsed}</span>
        </div>
        <p className="text-gray-500 text-xs mt-0.5">{run.status}</p>
      </div>
    </div>
  )
}

export default function ActiveRuns({ runs }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <h3 className="text-white font-semibold text-sm uppercase tracking-wider">Active Runs</h3>
        <span className="ml-auto text-gray-500 text-xs">{runs.length} running</span>
      </div>

      {runs.length === 0 ? (
        <div className="text-center py-8 text-gray-600">
          <div className="text-3xl mb-2">💤</div>
          <p className="text-sm">No agents running right now</p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map(run => <RunCard key={run.id} run={run} />)}
        </div>
      )}
    </div>
  )
}

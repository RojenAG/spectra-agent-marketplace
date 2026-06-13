import React from 'react'

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

export default function RecentCompletions({ completions }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-white font-semibold text-sm uppercase tracking-wider">Recent Completions</h3>
        <span className="ml-auto text-gray-500 text-xs">last {completions.length}</span>
      </div>

      {completions.length === 0 ? (
        <p className="text-gray-600 text-sm text-center py-4">No completions yet this sprint</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {completions.map(c => (
            <div key={c.id} className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 min-w-0">
              <span className="text-green-400">✅</span>
              <span className="text-base">{AGENT_EMOJI[c.agent_type?.toLowerCase()] || '🤖'}</span>
              <div className="min-w-0">
                <p className="text-gray-200 text-xs font-medium truncate max-w-48">{c.issue_title}</p>
                <p className="text-gray-500 text-xs">
                  {c.duration_seconds > 0 ? `${c.duration_seconds}s · ` : ''}{c.elapsed}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

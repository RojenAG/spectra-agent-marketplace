import React from 'react'

const STATUS_COLORS = {
  planning:    'bg-yellow-500/20 text-yellow-300',
  in_progress: 'bg-blue-500/20 text-blue-300',
  completed:   'bg-green-500/20 text-green-300',
  approved:    'bg-emerald-500/20 text-emerald-300',
}

export default function SprintHeader({ sprint }) {
  if (!sprint) return null

  const { name, status, goal, total_issues, done_issues, progress_pct } = sprint

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-white font-semibold text-lg">{name}</h2>
          {goal && <p className="text-gray-400 text-sm mt-0.5">{goal}</p>}
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[status] || 'bg-gray-700 text-gray-300'}`}>
          {status}
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-gray-800 rounded-full h-2.5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-purple-400 rounded-full transition-all duration-500"
            style={{ width: `${progress_pct}%` }}
          />
        </div>
        <span className="text-gray-300 text-sm font-mono whitespace-nowrap">
          {done_issues}/{total_issues} · {progress_pct}%
        </span>
      </div>
    </div>
  )
}

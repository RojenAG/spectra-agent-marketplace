import React from 'react'

const STATUS_DOT = {
  in_progress: 'bg-blue-400',
  backlog:     'bg-gray-600',
  todo:        'bg-gray-500',
}

const PRIORITY_BADGE = {
  high:   'text-red-400 bg-red-500/10',
  medium: 'text-yellow-400 bg-yellow-500/10',
  low:    'text-gray-400 bg-gray-700',
}

const TYPE_EMOJI = {
  spike:   '🔬',
  feature: '✨',
  bug:     '🐛',
  chore:   '🔧',
}

export default function PipelineQueue({ pipeline }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-white font-semibold text-sm uppercase tracking-wider">Pipeline Queue</h3>
        <span className="ml-auto text-gray-500 text-xs">{pipeline.length} remaining</span>
      </div>

      {pipeline.length === 0 ? (
        <div className="text-center py-8 text-gray-600">
          <div className="text-3xl mb-2">🎉</div>
          <p className="text-sm">All issues complete!</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {pipeline.map(issue => (
            <div key={issue.id} className="flex items-center gap-2.5 py-2 px-3 rounded-lg bg-gray-800/40 hover:bg-gray-800/70 transition-colors">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[issue.status] || 'bg-gray-600'}`} />
              <span className="text-base flex-shrink-0">{TYPE_EMOJI[issue.type] || '📋'}</span>
              <p className="text-gray-200 text-xs flex-1 truncate">{issue.title}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${PRIORITY_BADGE[issue.priority] || 'text-gray-400 bg-gray-700'}`}>
                {issue.priority}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

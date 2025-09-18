import React from 'react'

export default function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-4">
          <div>
            <div className="text-2xl font-semibold text-gray-900">{title}</div>
            {subtitle ? <p className="text-sm text-gray-600">{subtitle}</p> : null}
          </div>
        </div>
      </div>
      <div>
        {right}
      </div>
    </div>
  )
} 
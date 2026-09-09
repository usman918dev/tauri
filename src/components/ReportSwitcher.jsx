import React from 'react'
import { ROUTES } from '../config/routes'

export function ReportSwitcher({ currentRoute, onSelectReport }) {
  const reports = [
    {
      route: ROUTES.clean,
      label: 'Clean Punjab',
      icon: '📊',
      desc: 'Plots Cleaning-Activity',
    },
    {
      route: ROUTES.compliance,
      label: 'Compliance Report',
      icon: '🛡️',
      desc: 'Suthra Punjab Compliance',
    },
    {
      route: ROUTES.desilting,
      label: 'Desilting Report',
      icon: '💧',
      desc: '3-Stage Sector Desilting',
    },
    {
      route: ROUTES.dailyPlot,
      label: 'OTC Plot Report',
      icon: '📍',
      desc: 'Daily Plot Clearance',
    },
  ]

  const isReportRoute = reports.some(r => r.route === currentRoute)
  if (!isReportRoute) return null

  return (
    <div
      className="report-switcher"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        background: 'var(--surface, #1e293b)',
        borderRadius: '12px',
        border: '1px solid var(--border, rgba(255,255,255,0.1))',
        marginBottom: '20px',
        overflowX: 'auto',
        maxWidth: '100%',
      }}
    >
      <span
        style={{
          fontSize: '12px',
          fontWeight: 700,
          color: 'var(--muted-foreground, #94a3b8)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginRight: '4px',
          whiteSpace: 'nowrap',
        }}
      >
        Select Report:
      </span>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
        {reports.map((report) => {
          const isActive = currentRoute === report.route
          return (
            <button
              key={report.route}
              type="button"
              onClick={() => onSelectReport(report.route)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: isActive ? 'var(--primary, #3b82f6)' : 'transparent',
                background: isActive
                  ? 'rgba(59, 130, 246, 0.15)'
                  : 'rgba(255, 255, 255, 0.04)',
                color: isActive ? '#60a5fa' : 'var(--foreground, #e2e8f0)',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseOver={(e) => {
                if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
              }}
              onMouseOut={(e) => {
                if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
              }}
            >
              <span>{report.icon}</span>
              <span>{report.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default ReportSwitcher

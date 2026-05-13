// components/NotificationBell.jsx
'use client'
/**
 * NotificationBell — ProSynk
 * Uses NotificationContext (no Redux).
 *
 * Props:
 *   onOpenChat(channelId)  – called when user clicks a chat notification
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  useNotificationState,
  useNotificationDispatch,
  notifActions,
} from '@/context/NotificationContext'

// ─── Inline SVG icons ─────────────────────────────────────────────────────────
const Ico = {
  Bell: ({ dot }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      {dot && <circle cx="18.5" cy="5.5" r="3.5" fill="#ef4444" stroke="#fff" strokeWidth="1.5"/>}
    </svg>
  ),
  Chat: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  Risk: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  Rec: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 8v4"/><path d="M12 16h.01"/>
    </svg>
  ),
  X: () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Check: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
}

// ─── Colour tokens per notification type/priority ─────────────────────────────
const C = {
  chat:           { bg: '#eef2ff', border: '#818cf8', icon: '#6366f1', label: '#4f46e5', tag: 'Chat'      },
  risk_high:      { bg: '#fef2f2', border: '#fca5a5', icon: '#ef4444', label: '#dc2626', tag: 'High Risk' },
  risk_medium:    { bg: '#fff7ed', border: '#fdba74', icon: '#f97316', label: '#ea580c', tag: 'Risk'      },
  risk_low:       { bg: '#eff6ff', border: '#93c5fd', icon: '#3b82f6', label: '#2563eb', tag: 'Low Risk'  },
  recommendation: { bg: '#f0fdf4', border: '#86efac', icon: '#22c55e', label: '#16a34a', tag: 'AI Tip'    },
}

function getColors(notif) {
  if (notif.type === 'chat')           return C.chat
  if (notif.type === 'recommendation') return C.recommendation
  if (notif.priority === 'high')       return C.risk_high
  if (notif.priority === 'low')        return C.risk_low
  return C.risk_medium
}

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// ─── Single notification row ──────────────────────────────────────────────────
function NotifRow({ notif, onRead, onRemove, onAction }) {
  const c = getColors(notif)
  const TypeIcon = notif.type === 'chat' ? Ico.Chat
                 : notif.type === 'recommendation' ? Ico.Rec
                 : Ico.Risk

  return (
    <div
      onClick={() => { onRead(notif.id); onAction(notif) }}
      style={{
        position: 'relative',
        display: 'flex', gap: 11,
        padding: '11px 14px 11px 12px',
        background: notif.read ? '#fff' : c.bg,
        borderLeft: `3px solid ${notif.read ? '#e2e8f0' : c.border}`,
        borderBottom: '1px solid #f1f5f9',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = notif.read ? '#f8fafc' : c.bg }}
      onMouseLeave={e => { e.currentTarget.style.background = notif.read ? '#fff' : c.bg }}
    >
      {/* Icon */}
      <div style={{
        flexShrink: 0, width: 30, height: 30, borderRadius: '50%',
        background: `${c.icon}1a`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: c.icon, marginTop: 1,
      }}>
        <TypeIcon />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: c.label,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            background: `${c.icon}18`, padding: '1px 6px', borderRadius: 4,
          }}>
            {c.tag}
          </span>
          {notif.projectName && (
            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
              · {notif.projectName}
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }}>
            {timeAgo(notif.timestamp)}
          </span>
        </div>

        <p style={{
          margin: 0, fontSize: 13, lineHeight: 1.35,
          fontWeight: notif.read ? 500 : 700, color: '#0f172a',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {notif.title}
        </p>

        <p style={{
          margin: '3px 0 0', fontSize: 12, color: '#475569', lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {notif.body}
        </p>

        {notif.actionLabel && notif.actionUrl && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            marginTop: 6, padding: '2px 8px', borderRadius: 4,
            background: `${c.icon}15`, color: c.label,
            fontSize: 11, fontWeight: 600, border: `1px solid ${c.icon}30`,
          }}>
            {notif.actionLabel} →
          </span>
        )}
      </div>

      {/* Unread dot */}
      {!notif.read && (
        <div style={{
          position: 'absolute', top: 13, right: 32,
          width: 7, height: 7, borderRadius: '50%', background: c.icon,
        }} />
      )}

      {/* Dismiss */}
      <button
        onClick={e => { e.stopPropagation(); onRemove(notif.id) }}
        title="Dismiss"
        style={{
          position: 'absolute', top: 8, right: 8,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#cbd5e1', padding: 3, borderRadius: 4,
          display: 'flex', alignItems: 'center', transition: 'color 0.1s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#64748b' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#cbd5e1' }}
      >
        <Ico.X />
      </button>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'all',            label: 'All'     },
  { key: 'chat',           label: 'Chat'    },
  { key: 'risk',           label: 'Risks'   },
  { key: 'recommendation', label: 'AI Tips' },
]

// ─── Main component ───────────────────────────────────────────────────────────
export default function NotificationBell({ onOpenChat }) {
  const dispatch = useNotificationDispatch()
  const { items, unreadCount } = useNotificationState()
  const router  = useRouter()

  const [open, setOpen] = useState(false)
  const [tab,  setTab]  = useState('all')
  const wrapRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered  = tab === 'all' ? items : items.filter(n => n.type === tab)
  const unreadIn  = useCallback((key) => {
    const src = key === 'all' ? items : items.filter(n => n.type === key)
    return src.filter(n => !n.read).length
  }, [items])

  const handleRead   = id    => dispatch(notifActions.markRead(id))
  const handleRemove = id    => dispatch(notifActions.remove(id))

  const handleAction = notif => {
  // mark as read
  dispatch(notifActions.markRead(notif.id))

  // CHAT NOTIFICATIONS
  if (notif.type === 'chat' && notif.channelId) {

  // mark read
  dispatch(notifActions.markRead(notif.id))

  // optional callback
  if (onOpenChat) {
    onOpenChat(notif.channelId, notif.senderId)
  }

  // navigate with sender info
  router.push(
    `/chat/${notif.channelId}?user=${notif.senderId}`
  )

  setOpen(false)
  return
}

  // OTHER NOTIFICATIONS
  if (notif.actionUrl) {
    router.push(notif.actionUrl)
    setOpen(false)
  }
}

  return (
    <>
      <style>{`
        @keyframes ps-notif-in {
          from { opacity:0; transform:translateY(-8px) scale(0.97); }
          to   { opacity:1; transform:translateY(0)   scale(1); }
        }
        .ps-notif-scroll::-webkit-scrollbar { width: 4px; }
        .ps-notif-scroll::-webkit-scrollbar-track { background: transparent; }
        .ps-notif-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
      `}</style>

      <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>

        {/* Bell button */}
        <button
          onClick={() => setOpen(o => !o)}
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
          style={{
            position: 'relative',
            background: open ? '#f1f5f9' : 'transparent',
            border: 'none', cursor: 'pointer',
            padding: '7px 8px', borderRadius: 9,
            color: unreadCount > 0 ? '#6366f1' : '#64748b',
            display: 'flex', alignItems: 'center',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { if (!open) e.currentTarget.style.background = '#f8fafc' }}
          onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}
        >
          <Ico.Bell dot={unreadCount > 0} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: 2, right: 2,
              minWidth: 16, height: 16, padding: '0 3px',
              background: '#ef4444', color: '#fff',
              fontSize: 9.5, fontWeight: 800,
              borderRadius: 8, border: '1.5px solid #fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown panel */}
        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 370, maxHeight: 530,
            background: '#fff', borderRadius: 14,
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 10px 40px -5px rgba(0,0,0,0.13), 0 0 0 1px rgba(0,0,0,0.05)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden', zIndex: 9999,
            animation: 'ps-notif-in 0.18s cubic-bezier(.22,1,.36,1)',
          }}>

            {/* Header */}
            <div style={{ padding: '14px 16px 0', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 800, fontSize: 14.5, color: '#0f172a', letterSpacing: '-0.01em' }}>
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <span style={{
                    marginLeft: 8, padding: '1px 7px', borderRadius: 10,
                    background: '#6366f115', color: '#6366f1',
                    fontSize: 11, fontWeight: 700,
                  }}>
                    {unreadCount} new
                  </span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  {unreadCount > 0 && (
                    <button onClick={() => dispatch(notifActions.markAllRead())} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 12, color: '#6366f1', fontWeight: 600, padding: 0,
                      display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                      <Ico.Check /> All read
                    </button>
                  )}
                  {items.length > 0 && (
                    <button onClick={() => dispatch(notifActions.clear())} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 12, color: '#94a3b8', fontWeight: 500, padding: 0,
                    }}>
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
                {TABS.map(t => {
                  const cnt    = unreadIn(t.key)
                  const active = tab === t.key
                  return (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{
                      flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                      padding: '7px 4px 9px',
                      fontSize: 12, fontWeight: active ? 700 : 500,
                      color: active ? '#6366f1' : '#64748b',
                      borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
                      marginBottom: -1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      transition: 'color 0.12s',
                    }}>
                      {t.label}
                      {cnt > 0 && (
                        <span style={{
                          padding: '0 5px', borderRadius: 8,
                          background: active ? '#6366f1' : '#e2e8f0',
                          color: active ? '#fff' : '#475569',
                          fontSize: 9.5, fontWeight: 800, lineHeight: '16px',
                        }}>
                          {cnt}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* List */}
            <div className="ps-notif-scroll" style={{ overflowY: 'auto', flex: 1 }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>
                    {tab === 'risk' ? '🛡️' : tab === 'recommendation' ? '💡' : '🔔'}
                  </div>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: '#475569' }}>All clear!</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                    {tab === 'all'            ? 'No notifications yet.'       :
                     tab === 'chat'           ? 'No new messages.'            :
                     tab === 'risk'           ? 'No risk alerts detected.'    :
                                               'No AI suggestions yet.'      }
                  </p>
                </div>
              ) : (
                filtered.map(n => (
                  <NotifRow key={n.id} notif={n}
                    onRead={handleRead} onRemove={handleRemove} onAction={handleAction} />
                ))
              )}
            </div>

            {/* Footer */}
            {filtered.length > 0 && (
              <div style={{
                padding: '9px 14px', borderTop: '1px solid #f1f5f9',
                fontSize: 11, color: '#94a3b8', textAlign: 'center', background: '#fafafa',
              }}>
                {filtered.length} notification{filtered.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, AlertTriangle, Activity, Zap, X } from 'lucide-react'
import { useNotificationState, useNotificationDispatch, notifActions } from '@/context/NotificationContext'

const TYPE_CONFIG = {
  chat: { icon: MessageSquare, color: 'text-blue-400', bg: 'from-blue-900/90 to-slate-900/90', border: 'border-blue-500/40', accent: 'bg-blue-400' },
  risk: { icon: AlertTriangle, color: 'text-red-400', bg: 'from-red-900/90 to-slate-900/90', border: 'border-red-500/40', accent: 'bg-red-400' },
  activity: { icon: Activity, color: 'text-purple-400', bg: 'from-purple-900/90 to-slate-900/90', border: 'border-purple-500/40', accent: 'bg-purple-400' },
  ai: { icon: Zap, color: 'text-yellow-400', bg: 'from-yellow-900/90 to-slate-900/90', border: 'border-yellow-500/40', accent: 'bg-yellow-400' },
}

function Toast({ toast, onDismiss }) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const cfg = TYPE_CONFIG[toast.type] || TYPE_CONFIG.activity
  const Icon = cfg.icon


  const handleDismiss = () => {
    setLeaving(true)
    setTimeout(() => onDismiss(toast.id), 300)
  }

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 20)

    const t2 = setTimeout(() => {
      handleDismiss()
    }, 3000) // 👈 auto disappear after 3 sec

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  return (
    <div
      style={{
        transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        transform: visible && !leaving ? 'translateX(0)' : 'translateX(110%)',
        opacity: visible && !leaving ? 1 : 0,
      }}
      className={`w-[320px] rounded-xl border ${cfg.border} shadow-2xl overflow-hidden bg-gradient-to-br ${cfg.bg}`}
    >
      <div className={`h-[3px] w-full ${cfg.accent}`} />

      <div className="flex items-start gap-3 p-3.5">
        <Icon className={`w-4 h-4 ${cfg.color}`} />
        <div className="flex-1">
          <p className="text-white text-sm font-semibold">{toast.title}</p>
          <p className="text-slate-300 text-xs">{toast.body}</p>
        </div>
        <button onClick={handleDismiss}>
          <X className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  )
}

export default function ToastContainer() {
  const { toasts } = useNotificationState()
  const dispatch = useNotificationDispatch()

  const dismissToast = (id) => {
    dispatch(notifActions.remove(id))
  }

  return (
  <div className="fixed bottom-6 right-6 z-[500] flex flex-col gap-2">
    {toasts.map((toast) => (
      <Toast
        key={toast.toastId}
        toast={toast}
        onDismiss={dismissToast}
      />
    ))}
  </div>
)
}
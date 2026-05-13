// context/NotificationContext.js
'use client'
import { createContext, useContext, useReducer, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

// ─── State ────────────────────────────────────────────────────────────────────
const initialState = {
  items: [],
  unreadCount: 0,
  toasts: [],
  loaded: false,   // true after initial DB fetch completes
}

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {

    case 'LOAD': {
      // Called once on mount with all rows from DB
      const items = action.payload
      return {
        ...state,
        items,
        unreadCount: items.filter(n => !n.read).length,
        loaded: true,
      }
    }

    case 'ADD': {
      if (state.items.find(n => n.id === action.payload.id)) return state
      const toast = {
        toastId:  `toast-${action.payload.id}-${Date.now()}`,
        type:     action.payload.type === 'recommendation' ? 'ai'
                : action.payload.type === 'risk'           ? 'risk'
                : 'chat',
        title:    action.payload.title,
        body:     action.payload.body,
      }
      return {
        ...state,
        items:       [action.payload, ...state.items],
        unreadCount: action.payload.read ? state.unreadCount : state.unreadCount + 1,
        toasts:      [...state.toasts, toast].slice(-5),
      }
    }

    case 'MARK_READ': {
      const n = state.items.find(n => n.id === action.id)
      if (!n || n.read) return state
      return {
        ...state,
        items:       state.items.map(n => n.id === action.id ? { ...n, read: true } : n),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }
    }

    case 'MARK_ALL_READ':
      return {
        ...state,
        items:       state.items.map(n => ({ ...n, read: true })),
        unreadCount: 0,
      }

    case 'REMOVE': {
      const target = state.items.find(n => n.id === action.id)
      if (!target) return state
      return {
        ...state,
        items:       state.items.filter(n => n.id !== action.id),
        unreadCount: target.read ? state.unreadCount : Math.max(0, state.unreadCount - 1),
      }
    }

    case 'DISMISS_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.toastId !== action.toastId) }

    case 'CLEAR':
      return { ...initialState, loaded: true }

    default:
      return state
  }
}

// ─── DB row → notification object ────────────────────────────────────────────
function rowToNotif(row) {
  return {
    id:          row.id,
    type:        row.type,
    priority:    row.priority,
    title:       row.title,
    body:        row.body,
    read:        row.read,
    urgent:      row.urgent,
    timestamp:   row.created_at,
    channelId:   row.channel_id   || null,
    channelSlug: row.channel_slug || null,
    senderId:    row.sender_id    || null,
    senderName:  row.sender_name  || null,
    projectId:   row.project_id   || null,
    projectName: row.project_name || null,
    taskId:      row.task_id      || null,
    taskTitle:   row.task_title   || null,
    actionLabel: row.action_label || null,
    actionUrl:   row.action_url   || null,
  }
}

// ─── Contexts ─────────────────────────────────────────────────────────────────
const StateContext    = createContext(initialState)
const DispatchContext = createContext(null)

// ─── Provider ─────────────────────────────────────────────────────────────────
export function NotificationProvider({ children, userId }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Load existing notifications from DB on mount
  useEffect(() => {
    if (!userId) return

    async function loadNotifications() {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('Failed to load notifications:', error.message)
        return
      }
      dispatch({ type: 'LOAD', payload: data.map(rowToNotif) })
    }

    loadNotifications()
  }, [userId])

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  )
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
export function useNotificationState()    { return useContext(StateContext)    }
export function useNotificationDispatch() { return useContext(DispatchContext) }

export function useNotifications() {
  const state    = useContext(StateContext)
  const dispatch = useContext(DispatchContext)

  const dismissToast = useCallback((toastId) => {
    dispatch({ type: 'DISMISS_TOAST', toastId })
  }, [dispatch])

  // Mark one as read — update DB + local state
  const markRead = useCallback(async (id) => {
    dispatch({ type: 'MARK_READ', id })
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
  }, [dispatch])

  // Mark all as read — update DB + local state
  const markAllRead = useCallback(async (userId) => {
    dispatch({ type: 'MARK_ALL_READ' })
    if (userId) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false)
    }
  }, [dispatch])

  // Remove one — delete from DB + local state
  const remove = useCallback(async (id) => {
    dispatch({ type: 'REMOVE', id })
    await supabase.from('notifications').delete().eq('id', id)
  }, [dispatch])

  // Clear all — delete from DB + local state
  const clear = useCallback(async (userId) => {
    dispatch({ type: 'CLEAR' })
    if (userId) {
      await supabase.from('notifications').delete().eq('user_id', userId)
    }
  }, [dispatch])

  return {
    items:        state.items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    unreadCount:  state.unreadCount,
    toasts:       state.toasts,
    loaded:       state.loaded,
    dismissToast,
    markRead,
    markAllRead,
    remove,
    clear,
  }
}

// ─── Action creators ──────────────────────────────────────────────────────────
export const notifActions = {
  add:         (notif) => ({ type: 'ADD',          payload: notif }),
  markRead:    (id)    => ({ type: 'MARK_READ',    id }),
  markAllRead: ()      => ({ type: 'MARK_ALL_READ' }),
  remove:      (id)    => ({ type: 'REMOVE',       id }),
  clear:       ()      => ({ type: 'CLEAR'         }),
}
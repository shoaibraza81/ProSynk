// store/notificationsSlice.js
import { createSlice } from '@reduxjs/toolkit'

/**
 * Notification shape:
 * {
 *   id:          string          – unique, e.g. "chat-<msg-id>"
 *   type:        'chat' | 'risk' | 'recommendation'
 *   priority:    'high' | 'medium' | 'low'   (risk only)
 *   title:       string
 *   body:        string
 *   read:        boolean
 *   urgent:      boolean          – triggers sound + browser push
 *   timestamp:   ISO string
 *   // chat extras
 *   channelId:   string | null
 *   channelSlug: string | null
 *   senderId:    string | null
 *   senderName:  string | null
 *   // risk / rec extras
 *   projectId:   string | null
 *   projectName: string | null
 *   taskId:      string | null
 *   taskTitle:   string | null
 *   actionLabel: string | null
 *   actionUrl:   string | null
 * }
 */

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState: {
    items: [],
    unreadCount: 0,
  },
  reducers: {
    addNotification(state, { payload }) {
      // Deduplicate by id
      if (state.items.find(n => n.id === payload.id)) return
      state.items.unshift(payload)
      if (!payload.read) state.unreadCount += 1
    },
    markAsRead(state, { payload: id }) {
      const n = state.items.find(n => n.id === id)
      if (n && !n.read) { n.read = true; state.unreadCount = Math.max(0, state.unreadCount - 1) }
    },
    markAllAsRead(state) {
      state.items.forEach(n => { n.read = true })
      state.unreadCount = 0
    },
    removeNotification(state, { payload: id }) {
      const idx = state.items.findIndex(n => n.id === id)
      if (idx === -1) return
      if (!state.items[idx].read) state.unreadCount = Math.max(0, state.unreadCount - 1)
      state.items.splice(idx, 1)
    },
    clearAll(state) {
      state.items = []
      state.unreadCount = 0
    },
  },
})

export const { addNotification, markAsRead, markAllAsRead, removeNotification, clearAll } =
  notificationsSlice.actions
export default notificationsSlice.reducer
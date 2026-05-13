'use client'
import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'

export function useChatNotifications(currentUserId, activeChannelId) {
  // Use refs so the realtime callback always has the latest values
  // without needing to re-subscribe every time they change
  const userIdRef = useRef(currentUserId)
  const channelIdRef = useRef(activeChannelId)

  useEffect(() => { userIdRef.current = currentUserId }, [currentUserId])
  useEffect(() => { channelIdRef.current = activeChannelId }, [activeChannelId])

  useEffect(() => {
    if (!currentUserId) return

    // Subscribe once — refs handle latest values inside callback
    const sub = supabase
      .channel(notif-hook-$,{currentUserId})
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, (payload) => {
        const msg = payload.new
        const myId = userIdRef.current
        const activeCh = channelIdRef.current

        // Ignore own messages and messages in currently open channel
        if (msg.user_id === myId) return
        if (msg.channel_id === activeCh) return

        // Only fire if permission already granted
        // (permission must be requested via user gesture — see Step 2)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('💬 New Message - ProSynk', {
            body: msg.message || '📎 Sent a file',
            icon: '/favicon.ico',
          })
        }
      })
      .subscribe((status) => {
        console.log('useChatNotifications status:', status)
      })

    return () => supabase.removeChannel(sub)
  }, [currentUserId]) // only re-subscribe when user changes
}
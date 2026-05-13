'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export function useMessages(channelId) {
  const [messages, setMessages] = useState([])

  useEffect(() => {
    if (!channelId) return

    // Fetch existing messages
    supabase
      .from('messages')
      .select('*, profiles(email, role)')
      .eq('channel_id', channelId)
      .order('inserted_at', { ascending: true })
      .then(({ data }) => setMessages(data || []))

    // Subscribe to new messages in realtime
    const channel = supabase
      .channel(messages:${channelId})
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: channel_id=eq.${channelId}
      }, (payload) => {
        setMessages(prev => [...prev, payload.new])
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [channelId])

  return messages
}
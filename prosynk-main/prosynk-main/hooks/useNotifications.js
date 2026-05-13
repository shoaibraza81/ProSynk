// hooks/useNotifications.js
'use client'
import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useNotificationDispatch, notifActions } from '@/context/NotificationContext'

function playChime(urgent = false) {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = urgent ? 960 : 660
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (urgent ? 0.5 : 0.3))
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + (urgent ? 0.5 : 0.3))
  } catch (_) {}
}

function browserPush(title, body) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try { new Notification(title, { body, icon: '/favicon.ico' }) } catch (_) {}
}

function senderLabel(profile) {
  return profile?.full_name || profile?.email || 'Someone'
}

export function useNotifSubscription(currentUserId, activeChannelId) {
  const dispatch     = useNotificationDispatch()
  const userIdRef    = useRef(currentUserId)
  const channelIdRef = useRef(activeChannelId)

  useEffect(() => { userIdRef.current = currentUserId }, [currentUserId])
  useEffect(() => { channelIdRef.current = activeChannelId }, [activeChannelId])

  // ─────────────────────────────────────────────
  // ✅ CENTRAL DB SAVE FUNCTION (NEW)
  // ─────────────────────────────────────────────
  const saveToDb = async (notif) => {
    try {
      const { data } = await supabase
        .from('notifications')
        .insert({
          user_id: currentUserId,
          type: notif.type,
          priority: notif.priority,
          title: notif.title,
          body: notif.body,
          read: false,
          urgent: notif.urgent || false,

          channel_id: notif.channelId || null,
          channel_slug: notif.channelSlug || null,
          sender_id: notif.senderId || null,
          sender_name: notif.senderName || null,

          project_id: notif.projectId || null,
          project_name: notif.projectName || null,

          task_id: notif.taskId || null,
          task_title: notif.taskTitle || null,

          action_label: notif.actionLabel || null,
          action_url: notif.actionUrl || null,
        })
        .select()
        .single()

      return data || notif
    } catch (err) {
      console.error("DB save failed:", err.message)
      return notif
    }
  }
   const loadExistingNotifications = async () => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', currentUserId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error || !data) return

  data.forEach((n) => {
    dispatch(notifActions.add({
      id: n.id,
      type: n.type,
      priority: n.priority,
      title: n.title,
      body: n.body,
      read: n.read,
      urgent: n.urgent,
      timestamp: n.created_at,

      channelId: n.channel_id,
      channelSlug: n.channel_slug,
      senderId: n.sender_id,
      senderName: n.sender_name,

      projectId: n.project_id,
      projectName: n.project_name,

      taskId: n.task_id,
      taskTitle: n.task_title,

      actionLabel: n.action_label,

      actionUrl: n.action_url,
    }))
  })
}

  useEffect(() => {
    
    if (!currentUserId) return
    loadExistingNotifications()

    const subs = []

    

    // ─────────────────────────────────────────────
    // 1. CHAT NOTIFICATIONS
    // ─────────────────────────────────────────────
    const chatSub = supabase
      .channel(`notif-chat-${currentUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, async (payload) => {

        const msg = payload.new

        if (msg.user_id === userIdRef.current) return
        if (msg.channel_id === channelIdRef.current) return

        const { data: membership } = await supabase
          .from('channel_members')
          .select('id')
          .eq('channel_id', msg.channel_id)
          .eq('user_id', userIdRef.current)
          .maybeSingle()

        if (!membership) return

        const [{ data: senderProfile }, { data: channelRow }] = await Promise.all([
          supabase.from('profiles').select('full_name, email').eq('id', msg.user_id).maybeSingle(),
          supabase.from('channels').select('slug').eq('id', msg.channel_id).maybeSingle(),
        ])

        const fromName = senderLabel(senderProfile)

const isDM =
  channelRow?.slug?.startsWith('dm-') ||
  channelRow?.slug?.includes(currentUserId)

const notifTitle = isDM
  ? `New message from ${fromName}`
  : `${fromName} in #${channelRow?.slug || 'channel'}`

const msgBody = msg.file_url
  ? `📎 ${msg.file_name || 'Sent a file'}`
  : (msg.message || '…')

const notif = {
  id: `chat-${msg.id}`,
  type: 'chat',
  priority: 'low',

  title: notifTitle,
  body: msgBody,

  read: false,
  urgent: false,
  timestamp: msg.created_at ||new Date().toISOString(),

  channelId: msg.channel_id,
  channelSlug: channelRow?.slug || null,

  senderId: msg.user_id,
  senderName: fromName,

  projectId: null,
  projectName: null,
  taskId: null,
  taskTitle: null,

  actionLabel: 'Open Chat',
  actionUrl: `/chat/${msg.channel_id}`,
}
        // 🔥 SAVE TO DB FIRST
        const saved = await saveToDb(notif)

        dispatch(notifActions.add(saved))
        browserPush(`💬 ${saved.title}`, notif.body)
      })
      .subscribe()

    subs.push(chatSub)

    // ─────────────────────────────────────────────
    // 2. AI NOTIFICATIONS
    // ─────────────────────────────────────────────
    const aiSub = supabase
      .channel(`notif-ai-${currentUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ai_logs',
        filter: `user_id=eq.${currentUserId}`,
      }, async (payload) => {

        const log = payload.new
        const isRisk = log.action === 'risk_alert'
        const isRec  = log.action === 'recommendation'
        if (!isRisk && !isRec) return

        const notif = {
          id: `ai-${log.id}`,
          type: isRisk ? 'risk' : 'recommendation',
          priority: 'medium',
          title: isRisk ? `⚠ AI Risk` : `💡 AI Suggestion`,
          body: log.ai_output || '',
          read: false,
          urgent: isRisk,
          timestamp: log.created_at || new Date().toISOString(),

          channelId: null,
          senderId: null,
        }

        const saved = await saveToDb(notif)

        dispatch(notifActions.add(saved))
        browserPush(saved.title, notif.body)
      })
      .subscribe()

    subs.push(aiSub)

    // ─────────────────────────────────────────────
    // 3. ACTIVITY LOGS
    // ─────────────────────────────────────────────
    const activitySub = supabase
      .channel(`notif-activity-${currentUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'activity_logs',
      }, async (payload) => {

        const log = payload.new
        if (log.user_id === userIdRef.current) return
        if (!log.action?.toLowerCase().includes('assign')) return
        if (!log.task_id) return

        const notif = {
          id: `activity-${log.id}`,
          type: 'task',
          priority: 'medium',
          title: `Task assigned`,
          body: log.action,
          read: false,
          urgent: false,
          timestamp: log.created_at || new Date().toISOString(),

          taskId: log.task_id,
          senderId: log.user_id,
        }

        const saved = await saveToDb(notif)

        dispatch(notifActions.add(saved))
        browserPush(saved.title, notif.body)
      })
      .subscribe()

    subs.push(activitySub)

    return () => subs.forEach(s => supabase.removeChannel(s))
  }, [currentUserId, dispatch])
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  return Notification.requestPermission()
}
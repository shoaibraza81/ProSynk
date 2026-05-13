'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import {
  Send, Plus, ArrowLeft, Users, User, X, Check, CheckCheck,
  Paperclip, Image as ImageIcon, FileText, Download, Trash2,
  MoreVertical, Eye, Bell, BellOff, MessageSquare
} from 'lucide-react'

export default function ChatPage() {
  const router = useRouter()

  // ── State ─────────────────────────────────────────────────────────────────
  const [user, setUser] = useState(null)
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [channelNames, setChannelNames] = useState({})
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [employees, setEmployees] = useState([])
  const [allProfiles, setAllProfiles] = useState([])
  const [showNewChat, setShowNewChat] = useState(false)
  const [chatMode, setChatMode] = useState(null)
  const [selectedMembers, setSelectedMembers] = useState([])
  const [groupName, setGroupName] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msgMenu, setMsgMenu] = useState(null)
  const [seenModal, setSeenModal] = useState(null)
  const [chMenu, setChMenu] = useState(false)
  const [notifEnabled, setNotifEnabled] = useState(false)
  const [unreadMap, setUnreadMap] = useState({})

  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)
  const activeChannelRef = useRef(null)
  const allProfilesRef = useRef([])
  const userRef = useRef(null)
  const notifSubRef = useRef(null)

  useEffect(() => { activeChannelRef.current = activeChannel }, [activeChannel])
  useEffect(() => { allProfilesRef.current = allProfiles }, [allProfiles])
  useEffect(() => { userRef.current = user }, [user])

  // ── Helper ────────────────────────────────────────────────────────────────
  const getNameById = (id) => {
    if (id === userRef.current?.id) return 'You'
    const p = allProfilesRef.current.find(p => p.id === id)
    return p?.full_name || p?.email || 'Unknown'
  }

  const showNotification = (title, body) => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' })
    }
  }

  // ── 1. AUTH ───────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data?.session?.user
      if (!u) { router.replace('/login'); return }
      setUser(u)
      userRef.current = u
    })
  }, [])

  // ── 2. NOTIFICATION PERMISSION ───────────────────────────────────────────
  const requestNotifPermission = async () => {
    if (typeof Notification === 'undefined') return
    const perm = await Notification.requestPermission()
    setNotifEnabled(perm === 'granted')
    if (perm === 'granted') showNotification('✅ ProSynk', 'Notifications enabled!')
  }

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotifEnabled(Notification.permission === 'granted')
    }
  }, [])

  // ── 3. LOAD PROFILES + CHANNELS ───────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    const load = async () => {
      setLoading(true)
      const { data: profiles } = await supabase.from('profiles').select('id, email, full_name, role')
      const profileList = profiles || []
      setAllProfiles(profileList)
      allProfilesRef.current = profileList
      setEmployees(profileList.filter(p => p.id !== user.id))

      const { data: memberRows } = await supabase.from('channel_members').select('channel_id').eq('user_id', user.id)
      const memberChannelIds = (memberRows || []).map(r => r.channel_id)

      const { data: chData } = await supabase.from('channels').select('*').order('inserted_at', { ascending: false })
      const allCh = chData || []
      const myCh = allCh.filter(ch => ch.created_by === user.id || memberChannelIds.includes(ch.id))

      const seen = new Set()
      const uniqueCh = myCh.filter(ch => { if (seen.has(ch.id)) return false; seen.add(ch.id); return true })

      setChannels(uniqueCh)
      setChannelNames(buildNames(uniqueCh, profileList, user.id))
      setLoading(false)
    }
    load()
  }, [user])

  // ── 4. BUILD CHANNEL NAMES ────────────────────────────────────────────────
  const buildNames = (channelList, profileList, uid) => {
    const names = {}
    for (const ch of channelList) {
      if (ch.type === 'group') {
        names[ch.id] = ch.slug
      } else {
        const withoutPrefix = ch.slug.replace(/^dm--/, '')
        const idx = withoutPrefix.indexOf('--')
        const id1 = withoutPrefix.slice(0, idx)
        const id2 = withoutPrefix.slice(idx + 2)
        const otherId = id1 === uid ? id2 : id1
        const other = profileList.find(p => p.id === otherId)
        names[ch.id] = other?.full_name || other?.email || ch.slug
      }
    }
    return names
  }

  // ── 5. MESSAGES + REALTIME ────────────────────────────────────────────────
  useEffect(() => {
    if (!activeChannel || !user) return
    setMessages([])
    setMsgMenu(null)

    const fetchMsgs = async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, message, user_id, inserted_at, seen_by, channel_id, file_url, file_name, file_type')
        .eq('channel_id', activeChannel.id)
        .order('inserted_at', { ascending: true })

      const msgs = data || []
      setMessages(msgs)
      const unread = msgs.filter(m => m.user_id !== user.id && !(m.seen_by || []).includes(user.id))
      for (const m of unread) markAsSeen(m)
      setUnreadMap(prev => ({ ...prev, [activeChannel.id]: 0 }))
    }
    fetchMsgs()

    const chId = activeChannel.id
    const sub = supabase
      .channel(`room-${chId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${chId}` }, (payload) => {
        const msg = payload.new
        if (msg.channel_id !== chId) return
        setMessages(prev => {
          const tempIdx = prev.findIndex(m => m._optimistic && m.message === msg.message && m.user_id === msg.user_id)
          if (tempIdx !== -1) { const u = [...prev]; u[tempIdx] = msg; return u }
          if (prev.find(m => m.id === msg.id)) return prev
          return [...prev, msg]
        })
        if (msg.user_id !== user.id) markAsSeen(msg)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `channel_id=eq.${chId}` }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `channel_id=eq.${chId}` }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id))
      })
      .subscribe()

    return () => supabase.removeChannel(sub)
  }, [activeChannel?.id, user?.id])

  // ── 6. GLOBAL NOTIFICATION LISTENER ──────────────────────────────────────
  useEffect(() => {
    if (!user) return
    if (notifSubRef.current) supabase.removeChannel(notifSubRef.current)

    const sub = supabase
      .channel(`notif-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new
        const me = userRef.current
        const activeCh = activeChannelRef.current
        if (!me || msg.user_id === me.id) return
        setUnreadMap(prev => ({ ...prev, [msg.channel_id]: (prev[msg.channel_id] || 0) + 1 }))
        if (msg.channel_id === activeCh?.id) return
        const senderName = getNameById(msg.user_id)
        const body = msg.message || (msg.file_name ? `📎 ${msg.file_name}` : 'Sent a message')
        showNotification(`💬 ${senderName}`, body)
      })
      .subscribe()

    notifSubRef.current = sub
    return () => { supabase.removeChannel(sub); notifSubRef.current = null }
  }, [user?.id])

  // ── 7. AUTO SCROLL ────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── 8. MARK AS SEEN ───────────────────────────────────────────────────────
  const markAsSeen = async (msg) => {
    const me = userRef.current
    if (!me || !msg || (msg.seen_by || []).includes(me.id)) return
    await supabase.from('messages').update({ seen_by: [...(msg.seen_by || []), me.id] }).eq('id', msg.id)
  }

  // ── 9. SEND TEXT ──────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!newMessage.trim() || !activeChannel || sending) return
    const chId = activeChannel.id
    const text = newMessage.trim()
    setSending(true)
    setNewMessage('')

    const opt = {
      id: `temp-${Date.now()}`, message: text, user_id: user.id,
      channel_id: chId, inserted_at: new Date().toISOString(),
      seen_by: [], file_url: null, file_name: null, file_type: null, _optimistic: true
    }
    setMessages(prev => [...prev, opt])

    const { error } = await supabase.from('messages').insert([{ message: text, user_id: user.id, channel_id: chId, seen_by: [] }])
    if (error) { console.error('send error:', error); setMessages(prev => prev.filter(m => m.id !== opt.id)) }
    setSending(false)
  }

  // ── 10. UPLOAD FILE ───────────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !activeChannel) return
    const chId = activeChannel.id
    setUploading(true)

    const ext = file.name.split('.').pop()
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('chat-files').upload(path, file)
    if (upErr) { console.error('upload error:', upErr); setUploading(false); return }

    const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(path)
    const fileType = file.type.startsWith('image/') ? 'image' : 'file'

    const opt = {
      id: `temp-${Date.now()}`, message: null, user_id: user.id, channel_id: chId,
      inserted_at: new Date().toISOString(), seen_by: [], file_url: urlData?.publicUrl,
      file_name: file.name, file_type: fileType, _optimistic: true,
      _localFile: URL.createObjectURL(file)
    }
    setMessages(prev => [...prev, opt])

    const { error: msgErr } = await supabase.from('messages').insert([{
      message: null, user_id: user.id, channel_id: chId, seen_by: [],
      file_url: urlData?.publicUrl, file_name: file.name, file_type: fileType
    }])
    if (msgErr) { console.error('file msg error:', msgErr); setMessages(prev => prev.filter(m => m.id !== opt.id)) }
    if (fileInputRef.current) fileInputRef.current.value = ''
    setUploading(false)
  }

  // ── 11. DELETE MESSAGE ────────────────────────────────────────────────────
  const deleteMessage = async (msgId) => {
    setMsgMenu(null)
    const { error } = await supabase.from('messages').delete().eq('id', msgId)
    if (error) console.error('delete msg error:', error)
    else setMessages(prev => prev.filter(m => m.id !== msgId))
  }

  // ── 12. DELETE CHAT ───────────────────────────────────────────────────────
  const deleteChat = async () => {
    if (!activeChannel) return
    const confirmed = window.confirm(`Delete this ${activeChannel.type === 'group' ? 'group chat' : 'conversation'} and all its messages? This cannot be undone.`)
    if (!confirmed) return
    setChMenu(false)
    const { error } = await supabase.from('channels').delete().eq('id', activeChannel.id)
    if (error) { console.error('delete channel error:', error); return }
    setChannels(prev => prev.filter(ch => ch.id !== activeChannel.id))
    setActiveChannel(null)
    setMessages([])
  }

  // ── 13. START DIRECT CHAT ─────────────────────────────────────────────────
  const startDirectChat = async (employee) => {
    const sorted = [user.id, employee.id].sort()
    const slug = `dm--${sorted[0]}--${sorted[1]}`
    const { data: existing } = await supabase.from('channels').select('*').eq('slug', slug).maybeSingle()
    let ch = existing
    if (!ch) {
      const { data: newCh, error } = await supabase.from('channels').insert([{ slug, created_by: user.id, type: 'one-on-one' }]).select().single()
      if (error) { console.error(error); return }
      ch = newCh
      await supabase.from('channel_members').insert([{ channel_id: ch.id, user_id: user.id }, { channel_id: ch.id, user_id: employee.id }])
      setChannels(prev => prev.find(c => c.id === ch.id) ? prev : [ch, ...prev])
    }
    setChannelNames(prev => ({ ...prev, [ch.id]: employee.full_name || employee.email }))
    setActiveChannel(ch)
    setShowNewChat(false); setChatMode(null); setSelectedMembers([])
  }

  // ── 14. CREATE GROUP ──────────────────────────────────────────────────────
  const createGroupChat = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return
    const { data: newCh, error } = await supabase.from('channels').insert([{ slug: groupName.trim(), created_by: user.id, type: 'group' }]).select().single()
    if (error) { console.error(error); return }
    const memberRows = [user.id, ...selectedMembers.map(e => e.id)].map(uid => ({ channel_id: newCh.id, user_id: uid }))
    await supabase.from('channel_members').insert(memberRows)
    setChannels(prev => [newCh, ...prev])
    setChannelNames(prev => ({ ...prev, [newCh.id]: groupName.trim() }))
    setActiveChannel(newCh)
    setShowNewChat(false); setChatMode(null); setSelectedMembers([]); setGroupName('')
  }

  const toggleMember = (emp) => setSelectedMembers(prev =>
    prev.find(e => e.id === emp.id) ? prev.filter(e => e.id !== emp.id) : [...prev, emp]
  )

  // ── AVATAR INITIALS ───────────────────────────────────────────────────────
  const Avatar = ({ name, size = 'sm' }) => {
    const initial = (name || '?').charAt(0).toUpperCase()
    const sizeClass = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
    return (
      <div className={`${sizeClass} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
        style={{ backgroundColor: '#3a5779' }}>
        {initial}
      </div>
    )
  }

  // ── SEEN MODAL ────────────────────────────────────────────────────────────
  const SeenByModal = ({ msg }) => {
    if (!msg) return null
    const seenIds = (msg.seen_by || []).filter(id => id !== user?.id)
    const allOtherIds = allProfiles.filter(p => p.id !== user?.id && p.id !== msg.user_id).map(p => p.id)
    const notSeenIds = allOtherIds.filter(id => !seenIds.includes(id))

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={() => setSeenModal(null)}>
        <div className="border border-white/10 rounded-2xl w-80 shadow-2xl overflow-hidden"
          style={{ backgroundColor: '#111f2e' }}
          onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between"
            style={{ backgroundColor: 'rgba(58,87,121,0.3)' }}>
            <h3 className="font-bold text-white">Message Info</h3>
            <button onClick={() => setSeenModal(null)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {seenIds.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCheck className="w-4 h-4" style={{ color: '#5a8ab0' }} />
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#a8c4e0' }}>Seen by</p>
                </div>
                <div className="space-y-1.5">
                  {seenIds.map(id => (
                    <div key={id} className="flex items-center gap-3 p-2.5 rounded-lg border border-white/10"
                      style={{ backgroundColor: 'rgba(58,87,121,0.2)' }}>
                      <Avatar name={getNameById(id)} />
                      <p className="text-sm text-white">{getNameById(id)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notSeenIds.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Check className="w-4 h-4 text-slate-500" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Not seen</p>
                </div>
                <div className="space-y-1.5">
                  {notSeenIds.map(id => (
                    <div key={id} className="flex items-center gap-3 p-2.5 rounded-lg border border-white/5"
                      style={{ backgroundColor: 'rgba(58,87,121,0.1)' }}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-slate-400"
                        style={{ backgroundColor: 'rgba(58,87,121,0.3)' }}>
                        {getNameById(id).charAt(0).toUpperCase()}
                      </div>
                      <p className="text-sm text-slate-400">{getNameById(id)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {seenIds.length === 0 && notSeenIds.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-2">No info available</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── SEEN RECEIPT ──────────────────────────────────────────────────────────
  const SeenReceipt = ({ msg }) => {
    if (msg.user_id !== user?.id) return null
    if (msg._optimistic) return <span className="text-xs text-slate-500 mt-0.5 mr-1">Sending…</span>
    const seenBy = (msg.seen_by || []).filter(id => id !== user.id)
    if (activeChannel?.type === 'one-on-one') {
      return seenBy.length > 0
        ? <CheckCheck className="w-3.5 h-3.5 mt-0.5 mr-1 cursor-pointer" style={{ color: '#5a8ab0' }} title="Seen" onClick={() => setSeenModal(msg)} />
        : <Check className="w-3.5 h-3.5 text-slate-500 mt-0.5 mr-1" title="Delivered" />
    }
    return (
      <span className="flex items-center gap-0.5 mt-0.5 mr-1 cursor-pointer" onClick={() => setSeenModal(msg)}>
        {seenBy.length > 0
          ? <><CheckCheck className="w-3 h-3" style={{ color: '#5a8ab0' }} /><span className="text-xs text-slate-400">{seenBy.length}</span></>
          : <Check className="w-3 h-3 text-slate-500" />}
      </span>
    )
  }

  // ── MESSAGE BUBBLE ────────────────────────────────────────────────────────
  const MessageBubble = ({ msg }) => {
    const isMe = msg.user_id === user?.id
    const isImage = msg.file_type === 'image'
    const isFile = msg.file_type === 'file'
    const preview = msg._localFile || msg.file_url

    return (
      <div className={`flex flex-col group ${isMe ? 'items-end' : 'items-start'}`}
        onClick={() => setMsgMenu(null)}>
        {activeChannel?.type === 'group' && !isMe && (
          <p className="text-xs mb-1 ml-1" style={{ color: '#a8c4e0' }}>{getNameById(msg.user_id)}</p>
        )}

        <div className="flex items-end gap-1.5">
          {/* Menu — left of my messages */}
          {isMe && !msg._optimistic && (
            <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={e => { e.stopPropagation(); setMsgMenu(msgMenu === msg.id ? null : msg.id) }}
                className="p-1 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
              {msgMenu === msg.id && (
                <div className="absolute bottom-7 right-0 rounded-xl shadow-2xl z-10 overflow-hidden w-40 border border-white/10"
                  style={{ backgroundColor: '#111f2e' }}
                  onClick={e => e.stopPropagation()}>
                  <button onClick={() => setSeenModal(msg)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/10 text-sm text-slate-300 transition-colors">
                    <Eye className="w-4 h-4" style={{ color: '#5a8ab0' }} /> Seen by
                  </button>
                  <button onClick={() => deleteMessage(msg.id)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-red-500/20 text-sm text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              )}
            </div>
          )}

          <div className={`max-w-xs lg:max-w-sm rounded-2xl text-sm overflow-hidden shadow-lg ${
            isMe ? 'rounded-br-none' : 'rounded-bl-none'
          }`}
            style={isMe
              ? { background: 'linear-gradient(135deg, #3a5779, #5a8ab0)' }
              : { backgroundColor: 'rgba(58,87,121,0.35)', border: '1px solid rgba(255,255,255,0.08)' }
            }>
            {isImage && preview && (
              <a href={msg.file_url} target="_blank" rel="noopener noreferrer">
                <img src={preview} alt={msg.file_name || 'image'}
                  className="max-w-full max-h-60 object-cover cursor-pointer hover:opacity-90 transition-opacity" />
              </a>
            )}
            {isFile && (
              <a href={msg.file_url} target="_blank" rel="noopener noreferrer" download={msg.file_name}
                className="flex items-center gap-3 p-3 hover:opacity-80 transition-opacity text-white">
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{msg.file_name}</p>
                  <p className="text-xs opacity-60">Tap to download</p>
                </div>
                <Download className="w-4 h-4 opacity-60 shrink-0" />
              </a>
            )}
            {msg.message && <p className="px-4 py-2.5 text-white leading-relaxed">{msg.message}</p>}
            <p className={`text-xs opacity-50 pb-1.5 text-white ${msg.message ? 'px-4' : 'px-3'} ${isMe ? 'text-right' : 'text-left'}`}>
              {new Date(msg.inserted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        {isMe && (
          <div className="flex items-center mt-0.5">
            <SeenReceipt msg={msg} />
          </div>
        )}
      </div>
    )
  }

  // ── INPUT STYLE HELPERS ───────────────────────────────────────────────────
  const inputCls = "w-full p-3 rounded-xl text-white placeholder-slate-500 border border-white/10 focus:border-[#5a8ab0] focus:outline-none transition-colors text-sm"
  const inputBg = { backgroundColor: '#1a2f42' }

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen text-white"
      style={{ backgroundColor: '#1a2a3a' }}
      onClick={() => { setMsgMenu(null); setChMenu(false) }}>

      {/* ── SIDEBAR ── */}
      <div className="w-72 flex flex-col h-screen sticky top-0 border-r border-white/10 shadow-2xl"
        style={{ backgroundColor: 'rgba(30,50,70,0.75)', backdropFilter: 'blur(20px)' }}>

        {/* Sidebar header */}
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <button onClick={() => router.back()}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: '#3a5779' }}>
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-lg font-bold text-white">Messages</h2>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={requestNotifPermission}
                title={notifEnabled ? 'Notifications on' : 'Enable notifications'}
                className={`p-2 rounded-lg transition-colors ${notifEnabled ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                style={notifEnabled ? { backgroundColor: 'rgba(58,87,121,0.6)' } : {}}>
                {notifEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              </button>
              <button
                onClick={() => { setShowNewChat(!showNewChat); setChatMode(null); setSelectedMembers([]) }}
                className="p-2 rounded-lg transition-all hover:opacity-90 shadow-md"
                style={{ backgroundColor: '#3a5779' }}>
                {showNewChat ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* New Chat Panel */}
        {showNewChat && (
          <div className="border-b border-white/10" style={{ backgroundColor: 'rgba(17,31,46,0.8)' }}>
            {!chatMode && (
              <div className="p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Start a new chat</p>
                <button onClick={() => setChatMode('direct')}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/10 hover:border-[#5a8ab0] transition-all text-sm font-medium text-slate-300 hover:text-white"
                  style={{ backgroundColor: 'rgba(58,87,121,0.2)' }}>
                  <div className="p-1.5 rounded-lg" style={{ backgroundColor: '#3a5779' }}>
                    <User className="w-3.5 h-3.5 text-white" />
                  </div>
                  Direct Message
                </button>
                <button onClick={() => setChatMode('group')}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/10 hover:border-[#5a8ab0] transition-all text-sm font-medium text-slate-300 hover:text-white"
                  style={{ backgroundColor: 'rgba(58,87,121,0.2)' }}>
                  <div className="p-1.5 rounded-lg" style={{ backgroundColor: '#3a5779' }}>
                    <Users className="w-3.5 h-3.5 text-white" />
                  </div>
                  Group Chat
                </button>
              </div>
            )}

            {chatMode === 'direct' && (
              <div className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setChatMode(null)}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Select employee</p>
                </div>
                <div className="max-h-52 overflow-y-auto space-y-1">
                  {employees.length === 0 && <p className="text-xs text-slate-500 p-2">No employees found.</p>}
                  {employees.map(emp => (
                    <button key={emp.id} onClick={() => startDirectChat(emp)}
                      className="w-full text-left p-3 rounded-xl hover:border-[#5a8ab0] border border-transparent transition-all"
                      style={{ backgroundColor: 'rgba(58,87,121,0.15)' }}>
                      <p className="text-sm font-semibold text-white">{emp.full_name || emp.email}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{emp.role} · {emp.email}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatMode === 'group' && (
              <div className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setChatMode(null)}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Create group</p>
                </div>
                <input value={groupName} onChange={e => setGroupName(e.target.value)}
                  placeholder="Group name..."
                  className={inputCls + ' mb-3'}
                  style={inputBg} />
                <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Select members</p>
                <div className="max-h-36 overflow-y-auto space-y-1 mb-3">
                  {employees.map(emp => {
                    const sel = selectedMembers.find(e => e.id === emp.id)
                    return (
                      <button key={emp.id} onClick={() => toggleMember(emp)}
                        className={`w-full text-left p-2.5 rounded-xl flex items-center justify-between transition-all border ${sel ? 'border-[#5a8ab0]' : 'border-transparent hover:border-white/10'}`}
                        style={{ backgroundColor: sel ? 'rgba(58,87,121,0.4)' : 'rgba(58,87,121,0.15)' }}>
                        <div>
                          <p className="text-sm font-semibold text-white">{emp.full_name || emp.email}</p>
                          <p className="text-xs text-slate-500">{emp.role}</p>
                        </div>
                        {sel && <Check className="w-4 h-4 shrink-0" style={{ color: '#a8c4e0' }} />}
                      </button>
                    )
                  })}
                </div>
                <button onClick={createGroupChat}
                  disabled={!groupName.trim() || selectedMembers.length === 0}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 shadow-lg"
                  style={{ backgroundColor: '#3a5779' }}>
                  Create Group ({selectedMembers.length} members)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {loading && (
            <div className="text-center mt-8">
              <div className="w-5 h-5 border-2 border-[#5a8ab0] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-slate-500">Loading chats…</p>
            </div>
          )}
          {!loading && channels.length === 0 && (
            <div className="text-center mt-10 px-4">
              <MessageSquare className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-500 leading-relaxed">No conversations yet.<br />Click + to start one.</p>
            </div>
          )}
          {channels.map(ch => (
            <button key={ch.id} onClick={() => setActiveChannel(ch)}
              className={`w-full text-left p-3 rounded-xl transition-all border ${
                activeChannel?.id === ch.id
                  ? 'border-[#5a8ab0]/50'
                  : 'border-transparent hover:border-white/10'
              }`}
              style={{
                backgroundColor: activeChannel?.id === ch.id
                  ? 'rgba(58,87,121,0.6)'
                  : 'transparent'
              }}
              onMouseEnter={e => { if (activeChannel?.id !== ch.id) e.currentTarget.style.backgroundColor = 'rgba(58,87,121,0.2)' }}
              onMouseLeave={e => { if (activeChannel?.id !== ch.id) e.currentTarget.style.backgroundColor = 'transparent' }}>
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg shrink-0"
                  style={{ backgroundColor: 'rgba(58,87,121,0.5)' }}>
                  {ch.type === 'group'
                    ? <Users className="w-3.5 h-3.5" style={{ color: '#a8c4e0' }} />
                    : <User className="w-3.5 h-3.5" style={{ color: '#a8c4e0' }} />}
                </div>
                <p className="font-semibold text-sm truncate flex-1 text-white">{channelNames[ch.id] || ch.slug}</p>
                {(unreadMap[ch.id] || 0) > 0 && activeChannel?.id !== ch.id && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0 animate-pulse">
                    {unreadMap[ch.id] > 9 ? '9+' : unreadMap[ch.id]}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 ml-8 mt-0.5">
                {ch.type === 'group' ? 'Group chat' : 'Direct message'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── CHAT WINDOW ── */}
      <div className="flex-1 flex flex-col">
        {activeChannel ? (
          <>
            {/* Chat header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shadow-lg"
              style={{ backgroundColor: 'rgba(30,50,70,0.6)', backdropFilter: 'blur(20px)' }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl" style={{ backgroundColor: 'rgba(58,87,121,0.5)' }}>
                  {activeChannel.type === 'group'
                    ? <Users className="w-5 h-5" style={{ color: '#a8c4e0' }} />
                    : <User className="w-5 h-5" style={{ color: '#a8c4e0' }} />}
                </div>
                <div>
                  <h3 className="font-bold text-white">{channelNames[activeChannel.id] || activeChannel.slug}</h3>
                  <p className="text-xs text-slate-400">{activeChannel.type === 'group' ? 'Group Chat' : 'Direct Message'}</p>
                </div>
              </div>

              <div className="relative">
                <button onClick={e => { e.stopPropagation(); setChMenu(!chMenu) }}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
                  <MoreVertical className="w-5 h-5" />
                </button>
                {chMenu && (
                  <div className="absolute right-0 top-11 rounded-xl shadow-2xl z-20 overflow-hidden w-44 border border-white/10"
                    style={{ backgroundColor: '#111f2e' }}
                    onClick={e => e.stopPropagation()}>
                    <button onClick={deleteChat}
                      className="w-full flex items-center gap-2 px-4 py-3 hover:bg-red-500/20 text-sm text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                      Delete {activeChannel.type === 'group' ? 'Group' : 'Chat'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {messages.length === 0 && (
                <div className="text-center mt-16">
                  <MessageSquare className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">No messages yet. Say hello! 👋</p>
                </div>
              )}
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
              <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div className="px-6 py-4 border-t border-white/10"
              style={{ backgroundColor: 'rgba(30,50,70,0.6)', backdropFilter: 'blur(20px)' }}>
              {uploading && (
                <div className="mb-3 text-xs flex items-center gap-2" style={{ color: '#a8c4e0' }}>
                  <div className="w-3 h-3 border border-[#a8c4e0] border-t-transparent rounded-full animate-spin" />
                  Uploading file…
                </div>
              )}
              <div className="flex gap-2 items-center">
                <input ref={fileInputRef} type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                  className="hidden" onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  title="Attach file"
                  className="p-2.5 rounded-xl transition-all text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-40">
                  <Paperclip className="w-5 h-5" />
                </button>
                <button
                  onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = 'image/*'; fileInputRef.current.click() } }}
                  disabled={uploading} title="Send image"
                  className="p-2.5 rounded-xl transition-all text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-40">
                  <ImageIcon className="w-5 h-5" />
                </button>
                <input
                  value={newMessage} onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder={`Message ${channelNames[activeChannel.id] || ''}…`}
                  className="flex-1 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 border border-white/10 focus:border-[#5a8ab0] focus:outline-none text-sm transition-colors"
                  style={{ backgroundColor: '#1a2f42' }} />
                <button onClick={sendMessage}
                  disabled={!newMessage.trim() || sending}
                  className="p-2.5 rounded-xl transition-all hover:opacity-90 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#3a5779' }}>
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="p-5 rounded-2xl border border-white/10" style={{ backgroundColor: 'rgba(58,87,121,0.2)' }}>
              <MessageSquare className="w-10 h-10" style={{ color: '#5a8ab0' }} />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-white">Your Messages</p>
              <p className="text-sm text-slate-500 mt-1">Select a conversation or click + to start one</p>
            </div>
            {!notifEnabled && (
              <button onClick={requestNotifPermission}
                className="mt-1 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 shadow-lg border border-white/10"
                style={{ backgroundColor: 'rgba(58,87,121,0.4)', color: '#a8c4e0' }}>
                <Bell className="w-4 h-4" /> Enable Notifications
              </button>
            )}
          </div>
        )}
      </div>

      {/* Seen By Modal */}
      {seenModal && <SeenByModal msg={seenModal} />}
    </div>
  )
}
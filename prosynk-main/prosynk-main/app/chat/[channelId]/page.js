'use client'
import { useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'

// This route just redirects to /chat with the channel pre-selected
// The main chat UI lives in /chat/page.js
export default function ChannelRedirect() {
  const router = useRouter()
  const { channelId } = useParams()
  const searchParams = useSearchParams() 
  const selectedUser = searchParams.get('user')

  useEffect(() => {
    router.replace(`/chat?channel=${channelId}`)
  }, [channelId])

  return (
    <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
      Loading chat...
    </div>
  )
}
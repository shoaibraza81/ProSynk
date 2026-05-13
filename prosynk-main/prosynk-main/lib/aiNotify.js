// lib/aiNotify.js
/**
 * aiNotify — ProSynk
 *
 * Server-side helpers to write AI Risk Alerts and AI Recommendations
 * into your EXISTING ai_logs table so they appear as notifications.
 *
 * Uses the existing schema:
 *   ai_logs: id, user_id, task_id, action, ai_output, created_at
 *
 * Convention:
 *   action = 'risk_alert'      → shows as ⚠ Risk Alert in the bell
 *   action = 'recommendation'  → shows as 💡 AI Tip in the bell
 *
 *   ai_output format: optionally prefix with [HIGH], [MEDIUM], or [LOW]
 *   to control the priority colour.
 *   e.g. "[HIGH] Sprint 4 is at 12% progress with 2 days remaining."
 *
 * Call these from:
 *   - Next.js API routes / server actions
 *   - Your AI agent cron job
 *   - Edge functions
 */

import { createClient } from '@supabase/supabase-js'

// Service-role client so RLS doesn't block inserts
const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY     // server-only — never expose to browser
)

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send an AI Risk Alert to one or more users.
 *
 * @param {Object} params
 * @param {string|string[]} params.userId    – user ID(s) to notify
 * @param {string}          params.message   – alert detail (what the AI found)
 * @param {'high'|'medium'|'low'} [params.priority='medium']
 * @param {string}          [params.taskId]  – link to specific task (optional)
 *
 * @example
 * await sendRiskAlert({
 *   userId: managerId,
 *   message: 'Sprint 4 has only 12% progress with 2 days remaining.',
 *   priority: 'high',
 *   taskId: task.id,
 * })
 */
export async function sendRiskAlert({ userId, message, priority = 'medium', taskId }) {
  const supabase = adminClient()
  const userIds  = Array.isArray(userId) ? userId : [userId]
  const prefix   = `[${priority.toUpperCase()}] `

  const rows = userIds.map(uid => ({
    user_id:   uid,
    task_id:   taskId || null,
    action:    'risk_alert',
    ai_output: prefix + message,
  }))

  const { error } = await supabase.from('ai_logs').insert(rows)
  if (error) {
    console.error('[ProSynk] sendRiskAlert error:', error.message)
    return false
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send an AI Recommendation to one or more users.
 *
 * @param {Object} params
 * @param {string|string[]} params.userId
 * @param {string}          params.message   – recommendation text
 * @param {string}          [params.taskId]  – link to specific task (optional)
 *
 * @example
 * await sendRecommendation({
 *   userId: managerId,
 *   message: 'Reallocating 3 tasks from Ali to Ahmed could prevent the Sprint 4 delay.',
 *   taskId: blockedTask.id,
 * })
 */
export async function sendRecommendation({ userId, message, taskId }) {
  const supabase = adminClient()
  const userIds  = Array.isArray(userId) ? userId : [userId]

  const rows = userIds.map(uid => ({
    user_id:   uid,
    task_id:   taskId || null,
    action:    'recommendation',
    ai_output: message,
  }))

  const { error } = await supabase.from('ai_logs').insert(rows)
  if (error) {
    console.error('[ProSynk] sendRecommendation error:', error.message)
    return false
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience batch: analyse a project and fire multiple alerts at once
// (useful to call from your AI agent after running a project health check)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fire multiple risk alerts for a project's members.
 *
 * @param {Object} params
 * @param {string}   params.projectId
 * @param {string[]} params.memberUserIds  – all PM/member IDs who should see alerts
 * @param {Array}    params.alerts         – [{ message, priority, taskId? }]
 *
 * @example
 * await sendProjectRiskAlerts({
 *   projectId: project.id,
 *   memberUserIds: [pm.id, lead.id],
 *   alerts: [
 *     { message: 'Budget overrun probability: 72%', priority: 'high' },
 *     { message: 'Team workload exceeds threshold this week', priority: 'medium' },
 *   ],
 * })
 */
export async function sendProjectRiskAlerts({ projectId: _pid, memberUserIds, alerts }) {
  const results = await Promise.all(
    alerts.flatMap(a =>
      memberUserIds.map(uid =>
        sendRiskAlert({ userId: uid, message: a.message, priority: a.priority, taskId: a.taskId })
      )
    )
  )
  return results.every(Boolean)
}
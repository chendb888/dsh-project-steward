// M6 · Ops：指标/事件/提醒（07 M6）。
import { MetricSnapshot, OpsEvent, Reminder } from './schemas.js'
import { genId, storeError } from './store.js'

const now = () => new Date().toISOString()

export class Ops {
  constructor(service) { this.service = service; this.store = service.store }

  async addMetric({ projectId, channelId, date, metrics, overwrite }, actor = 'agent', source = 'manual') {
    if (!this.service.getProject(projectId)) throw storeError('NOT_FOUND', `项目 ${projectId} 不存在`)
    const existing = this.store.list('metrics').find(m => m.projectId === projectId && (m.channelId || null) === (channelId || null) && m.date === date)
    if (existing) {
      if (source === 'collector') {
        return this.store.update('metrics', existing.id, d => { d.metrics = { ...d.metrics, ...metrics }; d.source = 'collector'; d.createdAt = now() }, actor, 'metric-collect-overwrite')
      }
      if (!overwrite) throw storeError('DUPLICATE', `同日同键指标已存在（需 overwrite）`)
      return this.store.update('metrics', existing.id, d => { d.metrics = metrics; d.createdAt = now() }, actor, 'metric-overwrite')
    }
    const m = { id: genId('m'), projectId, channelId, date, metrics, source, createdAt: now() }
    return this.store.create('metrics', MetricSnapshot.parse(m), actor, 'metric-add')
  }

  listMetrics(projectId, channelId, range) {
    let arr = this.store.list('metrics').filter(m => m.projectId === projectId)
    if (channelId) arr = arr.filter(m => m.channelId === channelId)
    if (range?.from) arr = arr.filter(m => m.date >= range.from)
    if (range?.to) arr = arr.filter(m => m.date <= range.to)
    return arr.sort((a, b) => a.date.localeCompare(b.date))
  }

  async addEvent({ projectId, kind, severity, text, listingId }, actor = 'agent') {
    const e = { id: genId('ev'), projectId, listingId, kind, severity, text, at: now() }
    return this.store.create('events', OpsEvent.parse(e), actor, 'event-add')
  }

  commentList({ projectId, listingId, limit = 50 } = {}) {
    let arr = this.store.list('events').filter(e => e.kind === 'comment')
    if (projectId) arr = arr.filter(e => e.projectId === projectId)
    if (listingId) arr = arr.filter(e => e.listingId === listingId)
    return arr.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
  }

  async addReminder({ projectId, kind, dueAt, leadDays = 3, note }, actor = 'agent') {
    if (Date.parse(dueAt) <= Date.now()) throw storeError('INVALID_INPUT', 'dueAt 须为未来时间')
    if (leadDays < 0 || leadDays > 30) throw storeError('INVALID_INPUT', 'leadDays 须 0–30')
    const r = { id: genId('rm'), projectId, kind, dueAt, leadDays, note, status: 'active' }
    const created = await this.store.create('reminders', Reminder.parse(r), actor, 'reminder-add')
    const fireAt = new Date(Date.parse(dueAt) - leadDays * 86400000).toISOString()
    const suggestedSchedule = {
      title: `项目管家提醒：${note}`.slice(0, 120),
      prompt: `项目管家到期提醒：项目 ${projectId} 的「${note}」将于 ${dueAt} 到期（提前 ${leadDays} 天）。请检查并处理。`,
      rrule: `DTSTART:${fireAt.replace(/[-:]/g, '').replace(/\.\d{3}/, '')}\nRRULE:FREQ=DAILY;COUNT=1`,
      target: 'this_session',
    }
    return { reminder: created, suggestedSchedule }
  }

  async bindSchedule(reminderId, scheduleId, actor = 'agent') {
    return this.store.update('reminders', reminderId, d => { d.scheduleId = scheduleId }, actor, 'reminder-bind')
  }
  async dismissReminder(reminderId, actor = 'agent') {
    return this.store.update('reminders', reminderId, d => { d.status = 'dismissed' }, actor, 'reminder-dismiss')
  }
}
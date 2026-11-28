// M6/M13 · ops/collect Agent 工具（06§2）。集成时由 lead 并入 buildTools。
import { inputs } from './schemas.js'

const ok = data => ({ ok: true, data })
const fail = e => ({ ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } })
const guard = (schema, args, fn) => {
  const p = schema.safeParse(args || {})
  if (!p.success) return fail({ code: 'INVALID_INPUT', message: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') })
  return Promise.resolve(fn(p.data)).then(ok, fail)
}

export function buildOpsTools(service) {
  const ops = () => { if (!service.ops) throw { code: 'NOT_READY', message: 'ops 未挂载' }; return service.ops }
  const col = () => { if (!service.collector) throw { code: 'NOT_READY', message: 'collector 未挂载' }; return service.collector }
  return [
    {
      name: 'steward_metric_add',
      description: '录入运营指标快照（同日同键冲突需 overwrite）。',
      parameters: { type: 'object', properties: { projectId: { type: 'string' }, channelId: { type: 'string' }, date: { type: 'string' }, metrics: { type: 'object' }, overwrite: { type: 'boolean' } }, required: ['projectId', 'date', 'metrics'], additionalProperties: false },
      execute: async args => guard(inputs.metricAdd, args, d => ops().addMetric(d, 'agent')),
    },
    {
      name: 'steward_event_add',
      description: '记录运营事件（incident/notice/complaint/milestone/comment/payment）。',
      parameters: { type: 'object', properties: { projectId: { type: 'string' }, kind: { type: 'string' }, severity: { type: 'string' }, text: { type: 'string' }, listingId: { type: 'string' } }, required: ['projectId', 'kind', 'severity', 'text'], additionalProperties: false },
      execute: async args => guard(inputs.eventAdd, args, d => ops().addEvent(d, 'agent')),
    },
    {
      name: 'steward_reminder_add',
      description: '创建到期提醒，返回 suggestedSchedule（由 Agent 调 schedule_create 后 bind）。',
      parameters: { type: 'object', properties: { projectId: { type: 'string' }, kind: { type: 'string' }, dueAt: { type: 'string' }, leadDays: { type: 'integer' }, note: { type: 'string' } }, required: ['projectId', 'kind', 'dueAt', 'note'], additionalProperties: false },
      execute: async args => guard(inputs.reminderAdd, args, d => ops().addReminder(d, 'agent')),
    },
    {
      name: 'steward_reminder_bind',
      description: '把 DSH schedule 任务 id 绑定到提醒。',
      parameters: { type: 'object', properties: { reminderId: { type: 'string' }, scheduleId: { type: 'string' } }, required: ['reminderId', 'scheduleId'], additionalProperties: false },
      execute: async args => guard(inputs.reminderBind, args, d => ops().bindSchedule(d.reminderId, d.scheduleId, 'agent')),
    },
    {
      name: 'steward_comment_list',
      description: '查看留言（kind=comment 事件）。只读。',
      parameters: { type: 'object', properties: { projectId: { type: 'string' }, listingId: { type: 'string' }, limit: { type: 'integer' } }, additionalProperties: false },
      execute: async args => ok(ops().commentList(args || {})),
    },
    {
      name: 'steward_collect',
      description: '手动触发运营数据采集（默认全 active 渠道）。',
      parameters: { type: 'object', properties: { channelId: { type: 'string' } }, additionalProperties: false },
      execute: async args => Promise.resolve(col().collectNow(args?.channelId)).then(ok, fail),
    },
    {
      name: 'steward_collect_interval',
      description: '调整定时采集间隔（分钟，5–1440）。',
      parameters: { type: 'object', properties: { minutes: { type: 'integer' } }, required: ['minutes'], additionalProperties: false },
      execute: async args => {
        const m = args.minutes
        if (!Number.isInteger(m) || m < 5 || m > 1440) return fail({ code: 'INVALID_INPUT', message: 'minutes 须 5–1440' })
        col().start(m)
        return ok({ intervalMinutes: m })
      },
    },
    {
      name: 'steward_store_summary',
      description: '全店经营汇总：总下载/浏览/留言/收入 + 逐商品。只读。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => ok(service.storeSummary()),
    },
  ]
}
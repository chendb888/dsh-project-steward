// M14 · market_* Agent 工具（06§2）。集成时由 lead 并入 buildTools。
import { inputs } from '../schemas.js'

const ok = data => ({ ok: true, data })
const fail = e => ({ ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } })
const guard = (schema, args, fn) => {
  const p = schema.safeParse(args || {})
  if (!p.success) return fail({ code: 'INVALID_INPUT', message: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') })
  return Promise.resolve(fn(p.data)).then(ok, fail)
}
const need = service => { if (!service.market) throw { code: 'NOT_READY', message: 'market 未挂载' }; return service.market }

export function buildMarketTools(service) {
  return [
    {
      name: 'steward_market_scan',
      description: '竞品发现+对比（缺省全项目）。',
      parameters: { type: 'object', properties: { projectId: { type: 'string' } }, additionalProperties: false },
      execute: async args => guard(inputs.marketScan, args, d => need(service).scan(d.projectId, 'agent')),
    },
    {
      name: 'steward_market_compare',
      description: '单项目竞品对比+优势研判（worth-continuing/needs-differentiation/red-ocean-caution）。',
      parameters: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false },
      execute: async args => guard(inputs.marketCompare, args, d => need(service).compare(d.projectId, 'agent')),
    },
    {
      name: 'steward_market_gaps',
      description: '市场空白发现（供给×需求→gapScore 排序）。',
      parameters: { type: 'object', properties: { channelIds: { type: 'array', items: { type: 'string' } } }, additionalProperties: false },
      execute: async args => guard(inputs.marketGaps, args, d => need(service).gaps(d.channelIds, 'agent')),
    },
  ]
}
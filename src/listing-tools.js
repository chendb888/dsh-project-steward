// M5 · listing_*/channel_* Agent 工具（06§2）。集成时由 lead 并入 buildTools。
import { inputs } from './schemas.js'

const ok = data => ({ ok: true, data })
const fail = e => ({ ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } })
const guard = (schema, args, fn) => {
  const p = schema.safeParse(args || {})
  if (!p.success) return fail({ code: 'INVALID_INPUT', message: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') })
  return Promise.resolve(fn(p.data)).then(ok, fail)
}
const need = service => { if (!service.listing) throw { code: 'NOT_READY', message: 'listing 未挂载' }; return service.listing }

export function buildListingTools(service, opts = {}) {
  const candidatesPath = opts.candidatesPath || 'E:\\项目管家\\data\\channel-candidates.json'
  return [
    {
      name: 'steward_listing_create',
      description: '创建上架记录（project×channel×release → draft）。',
      parameters: { type: 'object', properties: { projectId: { type: 'string' }, channelId: { type: 'string' }, releaseId: { type: 'string' } }, required: ['projectId', 'channelId', 'releaseId'], additionalProperties: false },
      execute: async args => guard(inputs.listingCreate, args, d => need(service).createListing(d, 'agent')),
    },
    {
      name: 'steward_listing_check',
      description: '核对上架材料齐备性。只读核对并写回。',
      parameters: { type: 'object', properties: { listingId: { type: 'string' } }, required: ['listingId'], additionalProperties: false },
      execute: async args => guard(inputs.listingUpdate.pick({ listingId: true }), args, d => need(service).checkMaterials(d.listingId, 'agent')),
    },
    {
      name: 'steward_listing_update',
      description: '迁移上架状态（draft→submitted→reviewing→listed/rejected→delisted）。',
      parameters: { type: 'object', properties: { listingId: { type: 'string' }, to: { type: 'string' }, note: { type: 'string' }, platformUrl: { type: 'string' } }, required: ['listingId', 'to'], additionalProperties: false },
      execute: async args => guard(inputs.listingUpdate, args, d => need(service).transitionListing(d.listingId, d.to, { actor: 'agent', note: d.note, platformUrl: d.platformUrl })),
    },
    {
      name: 'steward_channel_add',
      description: '注册发布渠道。',
      parameters: { type: 'object', properties: { name: { type: 'string' }, category: { type: 'string' }, url: { type: 'string' } }, required: ['name', 'category'], additionalProperties: false },
      execute: async args => guard(inputs.channelAdd, args, d => need(service).registerChannel(d, 'agent')),
    },
    {
      name: 'steward_channel_update',
      description: '修改渠道（类别变更触发材料重核）。',
      parameters: { type: 'object', properties: { channelId: { type: 'string' }, patch: { type: 'object' } }, required: ['channelId', 'patch'], additionalProperties: false },
      execute: async args => guard(inputs.channelUpdate, args, d => need(service).updateChannel(d.channelId, d.patch, 'agent')),
    },
    {
      name: 'steward_channel_remove',
      description: '软删除渠道（G4，必填 reason；有 active 上架须先 delist）。',
      parameters: { type: 'object', properties: { channelId: { type: 'string' }, reason: { type: 'string' } }, required: ['channelId', 'reason'], additionalProperties: false },
      execute: async args => guard(inputs.channelRemove, args, d => need(service).removeChannel(d.channelId, d.reason, 'agent')),
    },
    {
      name: 'steward_channel_get',
      description: '查询渠道（含关联上架计数）。只读。',
      parameters: { type: 'object', properties: { channelId: { type: 'string' } }, required: ['channelId'], additionalProperties: false },
      execute: async args => {
        const ch = need(service).getChannel(args.channelId)
        if (!ch) return fail({ code: 'NOT_FOUND', message: `渠道 ${args.channelId} 不存在` })
        const listings = service.store.list('listings').filter(l => l.channelId === args.channelId)
        return ok({ ...ch, listingCount: listings.length, activeListings: listings.filter(l => ['submitted', 'reviewing', 'listed'].includes(l.status)).length })
      },
    },
    {
      name: 'steward_channel_import',
      description: '从全球候选库导入渠道（grade=X 内容类拒绝；幂等）。',
      parameters: { type: 'object', properties: { candidateIds: { type: 'array', items: { type: 'string' } } }, required: ['candidateIds'], additionalProperties: false },
      execute: async args => guard(inputs.channelImport, args, d => need(service).importCandidates(d.candidateIds, candidatesPath, 'agent')),
    },
  ]
}
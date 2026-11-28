// M15 · 项目说明 Agent 工具（FR7.5）。
import { z } from 'zod'
const ok = data => ({ ok: true, data })
const fail = e => ({ ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } })
const guard = (schema, args, fn) => { const p = schema.safeParse(args || {}); if (!p.success) return fail({ code: 'INVALID_INPUT', message: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }); return Promise.resolve(fn(p.data)).then(ok, fail) }
const need = service => { if (!service.docs) throw { code: 'NOT_READY', message: 'docs 未挂载' }; return service.docs }

const idSchema = z.object({ projectId: z.string() })
const channelSchema = z.object({ projectId: z.string(), channelId: z.string() })

export function buildDocsTools(service) {
  return [
    {
      name: 'steward_doc_check',
      description: '核对项目说明齐备性（README/CHANGELOG/description/版本说明）。只读。',
      parameters: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false },
      execute: async args => guard(idSchema, args, d => need(service).docCheck(d.projectId)),
    },
    {
      name: 'steward_doc_scaffold',
      description: '生成项目 README+CHANGELOG 模板（仅补缺失，不覆盖已有）。',
      parameters: { type: 'object', properties: { projectId: { type: 'string' }, force: { type: 'boolean' } }, required: ['projectId'], additionalProperties: false },
      execute: async args => guard(idSchema.extend({ force: z.boolean().optional() }), args, d => need(service).docScaffold(d.projectId, { force: d.force })),
    },
    {
      name: 'steward_doc_complete',
      description: '按对应商店规则完成项目说明（npm README/description；GitHub description+topics；DSH市场 locale meta+DETAIL+icon）。',
      parameters: { type: 'object', properties: { projectId: { type: 'string' }, channelId: { type: 'string' } }, required: ['projectId', 'channelId'], additionalProperties: false },
      execute: async args => guard(channelSchema, args, d => need(service).docCompleteChannel(d.projectId, d.channelId)),
    },
    {
      name: 'steward_maintenance_report',
      description: '维护巡检报告：所有项目说明齐备性+版本一致性。只读。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => ok(need(service).maintenanceReport()),
    },
    {
      name: 'steward_doc_update_image',
      description: '生成某版本更新位置标注图（界面示意+红框标注+图例，SVG→PNG，推GitHub）。FR7.7 全项目文档标准。',
      parameters: { type: 'object', properties: { projectId: { type: 'string' }, version: { type: 'string' } }, required: ['projectId', 'version'], additionalProperties: false },
      execute: async args => guard(z.object({ projectId: z.string(), version: z.string() }), args, d => need(service).generateUpdateImage(d.projectId, d.version)),
    },
    {
      name: 'steward_doc_cover',
      description: '为项目设计应用封面+图标（按类型/品牌色生成 icon 256 与 cover 1200x630，SVG→PNG，本地项目更新 icon.svg）。FR7.8。',
      parameters: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false },
      execute: async args => guard(idSchema, args, d => need(service).generateCover(d.projectId)),
    },
  ]
}
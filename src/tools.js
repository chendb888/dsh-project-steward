// 项目管家 · M9 Agent Tools（06§2）。三面共用 schemas.inputs 校验。
// 后续任务（release/listing/channel/ops/market）向 buildTools 追加。
import { inputs } from './schemas.js'
import { buildPipelineTools } from './pipeline-tools.js'
import { buildListingTools } from './listing-tools.js'
import { buildOpsTools } from './ops-tools.js'
import { buildMarketTools } from './market/tools.js'
import { buildDocsTools } from './docs-tools.js'
import { buildWebsiteTools } from './website-tools.js'

const ok = data => ({ ok: true, data })
const fail = e => ({ ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } })
const guard = (schema, args, fn) => {
  const parsed = schema.safeParse(args || {})
  if (!parsed.success) return fail({ code: 'INVALID_INPUT', message: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') })
  return Promise.resolve(fn(parsed.data)).then(ok, fail)
}

export function buildTools(service) {
  return [
    {
      name: 'steward_list',
      description: '列出纳管的项目（可按 type/stage/tag 筛选）。只读。',
      parameters: { type: 'object', properties: { type: { type: 'string' }, stage: { type: 'string' }, tag: { type: 'string' } }, additionalProperties: false },
      execute: async args => ok(service.listProjects(args || {})),
    },
    {
      name: 'steward_get',
      description: '获取单个项目详情。只读。',
      parameters: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false },
      execute: async args => {
        const p = service.getProject(args.projectId)
        return p ? ok(p) : fail({ code: 'NOT_FOUND', message: `项目 ${args.projectId} 不存在` })
      },
    },
    {
      name: 'steward_register',
      description: '登记一个本地项目进管家（扫描后由用户自选纳管）。',
      parameters: { type: 'object', properties: { name: { type: 'string' }, rootPath: { type: 'string' }, type: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' }, remote: { type: 'string' } }, required: ['name', 'rootPath', 'type'], additionalProperties: false },
      execute: async args => guard(inputs.registerProject, args, d => service.registerProject(d, 'agent')),
    },
    {
      name: 'steward_scan',
      description: '扫描用户选定的目录，提出候选项目（不落盘，由用户勾选纳管）。只读。',
      parameters: { type: 'object', properties: { roots: { type: 'array', items: { type: 'string' } }, exclude: { type: 'array', items: { type: 'string' } } }, required: ['roots'], additionalProperties: false },
      execute: async args => ok(service.scanCandidates(args.roots, { exclude: args.exclude })),
    },
    {
      name: 'steward_overview',
      description: '全店概览：项目计数/阶段分布/异常聚合/最近活动。只读。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => ok(service.overview()),
    },
    ...buildPipelineTools(service),
    ...buildListingTools(service),
    ...buildOpsTools(service),
    ...buildMarketTools(service),
    ...buildDocsTools(service),
    ...buildWebsiteTools(service),
  ]
}

export function registerStewardTools(ctx, service) {
  const disposers = []
  const defaultOutput = {
    schema: { type: 'object' },
    render: (_args, value) => {
      const v = value && value.ok === false ? `❌ ${value.error?.code || 'ERROR'}: ${value.error?.message || ''}` : JSON.stringify(value?.data ?? value, null, 2)
      return [{ type: 'text', text: String(v).slice(0, 4000) }]
    },
  }
  for (const tool of buildTools(service)) {
    disposers.push(ctx.tools.register({ output: defaultOutput, ...tool }))
  }
  return () => { for (const d of disposers) { try { d() } catch {} } }
}
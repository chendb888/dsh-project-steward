// M17 · 个人网站维护 Agent 工具（FR8）。域名可配置，他人可替换。
import { z } from 'zod'
const ok = data => ({ ok: true, data })
const fail = e => ({ ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } })
const guard = (schema, args, fn) => { const p = schema.safeParse(args || {}); if (!p.success) return fail({ code: 'INVALID_INPUT', message: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }); return Promise.resolve(fn(p.data)).then(ok, fail) }
const need = s => { if (!s.website) throw { code: 'NOT_READY', message: 'website 未挂载' }; return s.website }

export function buildWebsiteTools(service) {
  return [
    {
      name: 'steward_website_list',
      description: '列出纳管的个人网站（域名可配置）。只读。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => ok(need(service).list()),
    },
    {
      name: 'steward_website_add',
      description: '登记一个个人网站用于维护监控（url/domain 可配置，他人可替换自己的域名）。',
      parameters: { type: 'object', properties: { name: { type: 'string' }, url: { type: 'string' }, domain: { type: 'string' }, owner: { type: 'string' }, certWarnDays: { type: 'number' } }, required: ['url'], additionalProperties: false },
      execute: async args => guard(z.object({ name: z.string().optional(), url: z.string(), domain: z.string().optional(), owner: z.string().optional(), certWarnDays: z.number().optional() }), args, d => need(service).add(d)),
    },
    {
      name: 'steward_website_check',
      description: '检查网站 SSL 证书到期+可用性，生成状态/异常事件/续期提醒。',
      parameters: { type: 'object', properties: { websiteId: { type: 'string' } }, additionalProperties: false },
      execute: async args => guard(z.object({ websiteId: z.string().optional() }), args, d => need(service).check(d.websiteId)),
    },
    {
      name: 'steward_website_remove',
      description: '移除网站（G4，必填 reason）。',
      parameters: { type: 'object', properties: { websiteId: { type: 'string' }, reason: { type: 'string' } }, required: ['websiteId', 'reason'], additionalProperties: false },
      execute: async args => guard(z.object({ websiteId: z.string(), reason: z.string() }), args, d => need(service).remove(d.websiteId, d.reason)),
    },
    {
      name: 'steward_website_showcase',
      description: '宣传·作品展示：从货架已上架公开商品生成个人网站「作品展示」专栏（HTML+数据）。format=html 返回可嵌入网页的 HTML。',
      parameters: { type: 'object', properties: { format: { type: 'string', enum: ['data', 'html'] } }, additionalProperties: false },
      execute: async args => guard(z.object({ format: z.enum(['data', 'html']).optional() }), args, d => d.format === 'html' ? ok({ html: need(service).showcaseHtml() }) : ok(need(service).showcase())),
    },
    {
      name: 'steward_website_sync',
      description: '把已上架公开商品同步到个人网站作品展示专栏（GEO/AIO 宣传）。按网站 deploy 配置适配（nextjs-json/static-html/manual），可触发构建+重启。',
      parameters: { type: 'object', properties: { websiteId: { type: 'string' }, build: { type: 'boolean' } }, required: ['websiteId'], additionalProperties: false },
      execute: async args => guard(z.object({ websiteId: z.string(), build: z.boolean().optional() }), args, d => need(service).deployShowcase(d.websiteId, { build: d.build })),
    },
  ]
}
// 项目管家 · M10 Inspect Provider（06§4）：严格只读，供 Agent 写扩展代码前探查。
import { collections, SCHEMA_VERSION } from './schemas.js'

export function buildInspect(service) {
  return {
    id: 'steward',
    description: '项目管家只读探查：项目/模板/run/渠道/市场报告/台账 schema。',
    methods: {
      listProjects: {
        description: '项目摘要目录（可按 type/stage 筛选）',
        inputSchema: { type: 'object', properties: { type: { type: 'string' }, stage: { type: 'string' } }, additionalProperties: false },
        query: (input = {}) => service.listProjects(input),
      },
      getProject: {
        description: '单项目完整实体',
        inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false },
        query: (input) => service.getProject(input.projectId) ?? null,
      },
      listTemplates: {
        description: '流水线模板含 steps',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        query: () => service.store.list('templates'),
      },
      getRun: {
        description: '发布 run 全量',
        inputSchema: { type: 'object', properties: { runId: { type: 'string' } }, required: ['runId'], additionalProperties: false },
        query: (input) => service.store.readRun(input.runId) ?? null,
      },
      listChannels: {
        description: '渠道 + 材料模板',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        query: () => service.store.list('channels'),
      },
      getMarketReport: {
        description: '项目竞品研判报告',
        inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false },
        query: (input) => service.store.readMarketReport(input.projectId) ?? null,
      },
      listMarketGaps: {
        description: '市场空白机会清单',
        inputSchema: { type: 'object', properties: { channelIds: { type: 'array', items: { type: 'string' } } }, additionalProperties: false },
        query: (input = {}) => {
          const gaps = service.store.list('market-gaps')
          return input.channelIds ? gaps.filter(g => g.channelIds.some(c => input.channelIds.includes(c))) : gaps
        },
      },
      storeSchema: {
        description: '当前 schemaVersion + 实体/集合目录',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        query: () => ({ schemaVersion: SCHEMA_VERSION, collections: Object.keys(collections) }),
      },
    },
  }
}
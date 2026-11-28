// 项目管家 · Host 入口（apply 形式）。M1 组装 service + tools + inspect。
// 后续任务在此挂载 pipeline/listing/ops/collector/market 与 @Remote。
import { join } from 'node:path'
import { StewardService } from './src/service.js'
import { registerStewardTools } from './src/tools.js'
import { buildInspect } from './src/inspect.js'
import { registerRoutes } from './src/routes.js'

export const inject = ['tools', 'webServer']

export function apply(ctx, config = {}) {
  const dataDir = config.dataDir || join(process.cwd(), 'data')
  const service = new StewardService({ dataDir, collectIntervalMinutes: config.collectIntervalMinutes ?? 60, confirmGates: config.confirmGates ?? false })

  const disposers = []
  disposers.push(registerStewardTools(ctx, service))
  registerRoutes(ctx, service)

  // R50：注入 fetch 拦截器，强制插件 bundle 走 no-store，破解浏览器一年 immutable 缓存致界面陈旧
  try {
    disposers.push(ctx.webServer.tapIndex(html => html.replace('<head>', '<head><script>(function(){var of=window.fetch;window.fetch=function(u,o){try{if(typeof u==="string"&&u.indexOf("/plugins/")>=0){o=Object.assign({},o,{cache:"no-store"});}}catch(e){}return of.call(this,u,o);};})();</script>')))
  } catch {}

  // 定时运营采集（R9/R13：默认 60min）
  service.collector.start(config.collectIntervalMinutes ?? 60)
  disposers.push(() => service.collector.stop())

  return () => { for (const d of disposers) { try { d() } catch {} } }
}
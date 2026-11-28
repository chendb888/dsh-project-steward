// 项目管家 · M1 Store：唯一写入口的一致性核心（07 M1）
// journal append-only 先行 → 集合 tmp+rename 原子替换 → 内存缓存 → 事件。
// 集合文件是 journal 的物化视图，损坏可重放重建。凭据脱敏。
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, appendFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { collections, Meta, SCHEMA_VERSION } from './schemas.js'

const SENSITIVE = /token|secret|password|apikey|api_key|auth/i
const REDACTED = '[redacted]'

export function genId(prefix) {
  const t = Date.now().toString(36)
  const r = randomBytes(2).toString('hex').slice(0, 4)
  return `${prefix}-${t}-${r}`
}

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE.test(k) && typeof v === 'string') out[k] = REDACTED
      else out[k] = redact(v)
    }
    return out
  }
  return value
}

export class Store {
  constructor(dataDir, opts = {}) {
    this.dataDir = dataDir
    this.emit = opts.emit || (() => {})
    this.queue = Promise.resolve()
    this.data = {}        // name -> Map(id -> item)
    this.meta = null
    this.lastSeq = 0
    this.dirty = new Set()
    mkdirSync(dataDir, { recursive: true })
    mkdirSync(join(dataDir, 'runs'), { recursive: true })
    mkdirSync(join(dataDir, 'market'), { recursive: true })
    this._load()
  }

  _path(name) { return join(this.dataDir, `${name}.json`) }
  _journalPath() { return join(this.dataDir, 'journal.jsonl') }

  _load() {
    // meta
    const mp = join(this.dataDir, 'meta.json')
    if (existsSync(mp)) {
      try { this.meta = Meta.parse(JSON.parse(readFileSync(mp, 'utf8'))) }
      catch { this.meta = { schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(), lastJournalSeq: 0 } }
    } else {
      this.meta = { schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(), lastJournalSeq: 0 }
    }
    // collections
    for (const name of Object.keys(collections)) {
      this.data[name] = new Map()
      const p = this._path(name)
      if (!existsSync(p)) continue
      try {
        const arr = collections[name].parse(JSON.parse(readFileSync(p, 'utf8')))
        for (const item of arr) this.data[name].set(item.id, item)
      } catch (e) {
        // 隔离损坏文件，标记 dirty 待重放
        const iso = `${name}.corrupt-${Date.now()}.json`
        try { renameSync(p, join(this.dataDir, iso)) } catch {}
        this.dirty.add(name)
        this.emit({ type: 'store/corrupt', name, isolated: iso, error: String(e.message || e) })
      }
    }
    // journal lastSeq
    this.lastSeq = this._readJournalLastSeq()
    if (this.dirty.size) this.rebuildFromJournal()
  }

  _readJournalLastSeq() {
    const p = this._journalPath()
    if (!existsSync(p)) return 0
    const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean)
    let max = 0
    for (const line of lines) {
      try { const e = JSON.parse(line); if (e.seq > max) max = e.seq } catch {}
    }
    return max
  }

  _readJournal() {
    const p = this._journalPath()
    if (!existsSync(p)) return []
    const out = []
    const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean)
    for (let i = 0; i < lines.length; i++) {
      try { out.push(JSON.parse(lines[i])) }
      catch (e) { throw new Error(`journal 第 ${i + 1} 行损坏，停止重放：${e.message}`) }
    }
    return out
  }

  _appendJournal(entry) {
    appendFileSync(this._journalPath(), JSON.stringify(entry) + '\n', 'utf8')
  }

  _writeCollection(name) {
    const arr = [...this.data[name].values()]
    const p = this._path(name)
    const tmp = `${p}.tmp-${process.pid}-${Date.now()}`
    writeFileSync(tmp, JSON.stringify(arr, null, 2), 'utf8')
    renameSync(tmp, p)
  }

  _writeMeta() {
    this.meta.lastJournalSeq = this.lastSeq
    const p = join(this.dataDir, 'meta.json')
    const tmp = `${p}.tmp`
    writeFileSync(tmp, JSON.stringify(this.meta, null, 2), 'utf8')
    renameSync(tmp, p)
  }

  _itemSchema(name) { return collections[name].element }

  // 串行写队列：保证 journal 先行 + 原子替换不被并发打断
  _enqueue(fn) {
    const run = this.queue.then(fn, fn)
    this.queue = run.then(() => {}, () => {})
    return run
  }

  get(name, id) { return this.data[name]?.get(id) }
  list(name, filter) {
    const arr = [...(this.data[name]?.values() || [])]
    return filter ? arr.filter(filter) : arr
  }

  create(name, item, actor = 'system', action = 'create') {
    return this._enqueue(() => {
      const parsed = this._itemSchema(name).parse(item)
      if (this.data[name].has(parsed.id)) throw storeError('DUPLICATE', `${name} ${parsed.id} 已存在`)
      const seq = ++this.lastSeq
      this._appendJournal({ seq, at: new Date().toISOString(), actor, entity: name, entityId: parsed.id, action, after: redact(parsed) })
      this.data[name].set(parsed.id, parsed)
      this._writeCollection(name)
      this._writeMeta()
      this.emit({ type: 'steward/changed', entity: name, entityId: parsed.id, action, seq })
      return parsed
    })
  }

  // updater: (draft) => void 或返回新对象；在克隆上操作
  update(name, id, updater, actor = 'system', action = 'update', reason) {
    return this._enqueue(() => {
      const before = this.data[name].get(id)
      if (!before) throw storeError('NOT_FOUND', `${name} ${id} 不存在`)
      const draft = structuredClone(before)
      const ret = updater(draft)
      const next = this._itemSchema(name).parse(ret === undefined ? draft : ret)
      next.id = id
      const seq = ++this.lastSeq
      const entry = { seq, at: new Date().toISOString(), actor, entity: name, entityId: id, action, before: redact(before), after: redact(next) }
      if (reason) entry.reason = reason
      this._appendJournal(entry)
      this.data[name].set(id, next)
      this._writeCollection(name)
      this._writeMeta()
      this.emit({ type: 'steward/changed', entity: name, entityId: id, action, seq })
      return next
    })
  }

  // 软删除（status=removed 等）由调用方经 update 实现；此处提供物理移除仅供重建内部使用
  _set(name, id, item) { this.data[name].set(id, item) }

  rebuildFromJournal() {
    const entries = this._readJournal()
    for (const name of Object.keys(collections)) this.data[name].clear()
    let maxSeq = 0
    for (const e of entries) {
      maxSeq = Math.max(maxSeq, e.seq)
      const name = e.entity
      if (!this.data[name]) continue
      if (e.action === 'create' && e.after) {
        try { const item = this._itemSchema(name).parse(e.after); this.data[name].set(item.id, item) } catch {}
      } else if (e.after) {
        try { const item = this._itemSchema(name).parse(e.after); this.data[name].set(item.id, item) } catch {}
      }
    }
    this.lastSeq = maxSeq
    for (const name of Object.keys(collections)) this._writeCollection(name)
    this._writeMeta()
    this.dirty.clear()
    this.emit({ type: 'store/rebuilt', seq: maxSeq })
    return { seq: maxSeq, collections: Object.fromEntries(Object.keys(collections).map(n => [n, this.data[n].size])) }
  }

  // run / market-report 单文件存取
  writeRun(run) {
    const p = join(this.dataDir, 'runs', `${run.id}.json`)
    const tmp = `${p}.tmp`
    writeFileSync(tmp, JSON.stringify(run, null, 2), 'utf8')
    renameSync(tmp, p)
  }
  readRun(id) {
    const p = join(this.dataDir, 'runs', `${id}.json`)
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : undefined
  }
  listRuns() {
    const dir = join(this.dataDir, 'runs')
    return readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  }
  writeMarketReport(report) {
    const p = join(this.dataDir, 'market', `${report.projectId}.json`)
    const tmp = `${p}.tmp`
    writeFileSync(tmp, JSON.stringify(report, null, 2), 'utf8')
    renameSync(tmp, p)
  }
  readMarketReport(projectId) {
    const p = join(this.dataDir, 'market', `${projectId}.json`)
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : undefined
  }
}

export function storeError(code, message, details) {
  const e = new Error(message)
  e.code = code
  e.details = details
  return e
}
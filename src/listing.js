// M5 · Listing 上架状态机 + 渠道 CRUD（03§7.3/§7.4 / 17§7）。
import { listingTransitions, channelTransitions, Listing, Channel } from './schemas.js'
import { genId, storeError } from './store.js'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const now = () => new Date().toISOString()
const ACTIVE = ['submitted', 'reviewing', 'listed']

export class ListingMgr {
  constructor(service) { this.service = service; this.store = service.store }

  // ---- listing ----
  async createListing({ projectId, channelId, releaseId }, actor = 'agent') {
    const project = this.service.getProject(projectId)
    if (!project) throw storeError('NOT_FOUND', `项目 ${projectId} 不存在`)
    const channel = this.store.get('channels', channelId)
    if (!channel) throw storeError('NOT_FOUND', `渠道 ${channelId} 不存在`)
    // R38：定制私有项目（给保险公司等客户，非对外）不得上架公共渠道
    const PUBLIC_CATEGORIES = ['npm-registry', 'mirror', 'source-repo', 'plugin-market', 'game-store']
    if (project.distribution === 'custom-private' && PUBLIC_CATEGORIES.includes(channel.category)) {
      throw storeError('CUSTOM_NOT_PUBLIC', `「${project.name}」是定制私有项目（非对外），不能上架公共渠道 ${channel.name}；仅可私有交付`)
    }
    const release = this.store.get('releases', releaseId)
    if (!release || release.projectId !== projectId) throw storeError('INVALID_INPUT', 'release 不存在或不属于该项目')
    if (this.store.list('listings').some(l => l.projectId === projectId && l.channelId === channelId && l.releaseId === releaseId)) throw storeError('DUPLICATE', '该 project×channel×release 已有上架记录')
    const listing = {
      id: genId('lst'), projectId, channelId, releaseId, status: 'draft',
      materials: (channel.materialTemplate || []).map(m => ({ key: m.key, ok: false })),
      history: [], createdAt: now(), updatedAt: now(),
    }
    return this.store.create('listings', Listing.parse(listing), actor, 'listing-create')
  }

  async checkMaterials(listingId, actor = 'agent') {
    const l = this.store.get('listings', listingId)
    if (!l) throw storeError('NOT_FOUND', `listing ${listingId} 不存在`)
    const channel = this.store.get('channels', l.channelId)
    const project = this.service.getProject(l.projectId)
    const tpl = channel?.materialTemplate || []
    const states = tpl.map(m => {
      const prev = l.materials.find(x => x.key === m.key)
      const ref = prev?.ref
      let ok = false
      if (m.kind === 'file') ok = !!ref && existsSync(join(project.rootPath, ref))
      else if (m.kind === 'text' || m.kind === 'url') ok = !!ref && String(ref).trim().length > 0
      else if (m.kind === 'bool') ok = ref === true || ref === 'true'
      return { key: m.key, ok, ref, checkedAt: now() }
    })
    return this.store.update('listings', listingId, d => { d.materials = states; d.updatedAt = now() }, actor, 'materials-check')
  }

  async transitionListing(listingId, to, { actor = 'agent', note, platformUrl, waive } = {}) {
    const l = this.store.get('listings', listingId)
    if (!l) throw storeError('NOT_FOUND', `listing ${listingId} 不存在`)
    const allowed = listingTransitions[l.status] || []
    if (!allowed.includes(to)) throw storeError('ILLEGAL_TRANSITION', `上架不允许 ${l.status} → ${to}`)
    if (to === 'submitted') {
      const channel = this.store.get('channels', l.channelId)
      const required = (channel?.materialTemplate || []).filter(m => m.required)
      const missing = required.filter(m => !l.materials.find(x => x.key === m.key && x.ok))
      if (missing.length && !waive) throw storeError('INVALID_INPUT', `required 材料缺项：${missing.map(m => m.key).join(',')}（或 waive）`)
    }
    if ((to === 'delisted') && !note) throw storeError('INVALID_INPUT', '下架需 note（G3）')
    const from = l.status
    const updated = await this.store.update('listings', listingId, d => {
      d.status = to; d.updatedAt = now()
      if (platformUrl) d.platformUrl = platformUrl
      d.history.push({ from, to, at: now(), actor, note })
    }, actor, 'listing-transition', note)
    if (to === 'listed') {
      await this.service.transitionStage(l.projectId, 'listed', actor, '首次上架').catch(() => {})
      await this.store.create('events', { id: genId('ev'), projectId: l.projectId, listingId, kind: 'milestone', severity: 'info', text: `上架成功：${l.channelId}`, at: now() }, actor, 'milestone').catch(() => {})
      this.service._broadcast({ type: 'steward/listing-listed', listingId, projectId: l.projectId, channelId: l.channelId })
    }
    return updated
  }

  // ---- channel CRUD ----
  listChannels(filter) {
    let arr = this.store.list('channels')
    if (filter?.category) arr = arr.filter(c => c.category === filter.category)
    if (filter?.status) arr = arr.filter(c => c.status === filter.status)
    if (filter?.appliesToType) arr = arr.filter(c => (c.appliesToTypes || []).includes(filter.appliesToType))
    return arr
  }
  getChannel(id) { return this.store.get('channels', id) }

  async registerChannel(input, actor = 'user') {
    if (this.store.list('channels').some(c => c.name === input.name)) throw storeError('DUPLICATE', `渠道名已存在：${input.name}`)
    const ch = { id: genId('ch'), name: input.name, category: input.category, status: 'active', source: 'user', materialTemplate: input.materialTemplate || [], credentialRef: input.credentialRef || null, url: input.url, appliesToTypes: input.appliesToTypes || [], activatedAt: now() }
    return this.store.create('channels', Channel.parse(ch), actor, 'channel-add')
  }

  async updateChannel(id, patch, actor = 'user') {
    const before = this.store.get('channels', id)
    if (!before) throw storeError('NOT_FOUND', `渠道 ${id} 不存在`)
    const categoryChanged = patch.category && patch.category !== before.category
    const updated = await this.store.update('channels', id, d => { Object.assign(d, patch) }, actor, 'channel-update')
    if (categoryChanged) this.service._broadcast({ type: 'steward/channel-category-changed', channelId: id, recheck: true })
    return updated
  }

  async removeChannel(id, reason, actor = 'user') {
    if (!reason) throw storeError('INVALID_INPUT', '软删除需 reason（G4）')
    const ch = this.store.get('channels', id)
    if (!ch) throw storeError('NOT_FOUND', `渠道 ${id} 不存在`)
    const active = this.store.list('listings').filter(l => l.channelId === id && ACTIVE.includes(l.status))
    if (active.length) throw storeError('ILLEGAL_TRANSITION', `渠道有 ${active.length} 个 active 上架，须先 delist 再删除`)
    return this.store.update('channels', id, d => { d.status = 'removed'; d.removedAt = now(); d.removeReason = reason }, actor, 'channel-remove', reason)
  }

  async importCandidates(candidateIds, candidatesPath, actor = 'user') {
    let candidates = []
    try { candidates = JSON.parse(readFileSync(candidatesPath, 'utf8')).candidates || [] } catch { throw storeError('NOT_FOUND', '候选库不可读') }
    const imported = []
    for (const cid of candidateIds) {
      const cand = candidates.find(c => c.id === cid)
      if (!cand) throw storeError('NOT_FOUND', `候选 ${cid} 不存在`)
      if (cand.grade === 'X') throw storeError('INVALID_INPUT', `候选 ${cid} 超出范围（内容类），拒绝导入`)
      if (this.store.list('channels').some(c => c.name === cand.name)) continue // 幂等
      const ch = { id: genId('ch'), name: cand.name, category: cand.category, status: 'candidate', source: 'catalog', grade: cand.grade, activationCondition: cand.activationCondition, url: cand.url, appliesToTypes: cand.appliesToTypes || [], materialTemplate: [] }
      imported.push(await this.store.create('channels', Channel.parse(ch), actor, 'channel-import'))
    }
    return imported
  }
}
/** Client 半：项目管家 · 商家后台风格（参考淘宝商家后台）+ 真实货架视觉。
 *  仅 require('react')。容器继承宿主 --dsw-alias-* 令牌；店铺品牌色用固定橙（ artwork 自有色）。
 *  conversation.view 货架页签 + conversation.input.dock 常驻迷你条。 */
window.__ModuleLoader__.load({
  id: '@local/dsh-project-steward',
  factory(require) {
    const React = require('react')
    const { useState, useEffect, useCallback } = React
    const h = React.createElement

    const BRAND = '#ff5000'           // 淘宝橙
    const BRAND_SOFT = 'rgba(255,80,0,.1)'
    const WOOD = '#c9a06a'            // 货架木板
    const WOOD_DARK = '#a97e44'
    const C = {
      listed: '#22a06b', reviewing: '#f5a623', submitted: '#f5a623',
      draft: '#8c8c8c', rejected: '#e5484d', delisted: '#b0b0b0',
    }
    const TYPE_META = {
      'dsh-plugin': { icon: '🧩', label: '插件区', color: '#5b6cff' },
      game: { icon: '🎮', label: '游戏区', color: '#22a06b' },
      'web-app': { icon: '🖥️', label: '应用区', color: '#0ea5e9' },
      'business-system': { icon: '🏢', label: '应用区', color: '#0ea5e9' },
      engine: { icon: '⚙️', label: '引擎工具区', color: '#a855f7' },
      research: { icon: '🔬', label: '引擎工具区', color: '#a855f7' },
      host: { icon: '🏠', label: '宿主专区', color: '#8c8c8c' },
    }
    const STATUS_LABEL = { listed: '出售中', reviewing: '审核中', submitted: '审核中', draft: '待上架', rejected: '审核拒绝', delisted: '已下架' }
    const fmt = n => n == null ? '0' : (n >= 10000 ? (n / 10000).toFixed(1) + 'w' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n))
    const count = n => n == null ? '—' : n.toLocaleString('zh-CN')
    const money = n => '¥' + (n == null ? '0' : Number(n).toLocaleString())
    const bg = 'var(--dsw-alias-bg-base)', layer = 'var(--dsw-alias-bg-layer-1)', layer2 = 'var(--dsw-alias-bg-layer-2)'
    const border = 'var(--dsw-alias-border-l1)', text = 'var(--dsw-alias-label-primary)', sub = 'var(--dsw-alias-label-secondary)'

    const T = {
      app: { display: 'flex', height: '100%', background: bg, color: text, fontSize: '13px', fontFamily: '-apple-system,"Segoe UI","Microsoft YaHei",sans-serif' },
      side: { width: '200px', flexShrink: 0, background: layer, borderRight: '1px solid ' + border, display: 'flex', flexDirection: 'column', padding: '12px 8px' },
      shop: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', marginBottom: '12px' },
      shopAvatar: { width: '36px', height: '36px', borderRadius: '8px', background: BRAND, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 },
      navItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', marginBottom: '2px', color: text },
      body: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
      header: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', borderBottom: '1px solid ' + border, background: layer },
      hTitle: { fontSize: '16px', fontWeight: 700 },
      search: { flex: 1, maxWidth: '320px', padding: '7px 12px', borderRadius: '18px', border: '1px solid ' + border, background: bg, color: text, fontSize: '12px', outline: 'none' },
      btn: { padding: '7px 16px', borderRadius: '18px', background: BRAND, color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600, border: 'none', whiteSpace: 'nowrap' },
      btnGhost: { padding: '6px 14px', borderRadius: '18px', border: '1px solid ' + border, background: layer, color: text, cursor: 'pointer', fontSize: '12px' },
      content: { flex: 1, overflowY: 'auto', padding: '20px' },
      cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '14px', marginBottom: '20px' },
      stat: { background: layer, border: '1px solid ' + border, borderRadius: '12px', padding: '16px' },
      statNum: { fontSize: '26px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 },
      statLabel: { fontSize: '12px', color: sub, marginTop: '4px' },
      statIcon: { fontSize: '20px', float: 'right', opacity: .8 },
      panel: { background: layer, border: '1px solid ' + border, borderRadius: '12px', padding: '16px', marginBottom: '16px' },
      panelTitle: { fontSize: '14px', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' },
      tabs: { display: 'flex', gap: '4px', borderBottom: '1px solid ' + border, marginBottom: '16px' },
      tab: { padding: '8px 16px', cursor: 'pointer', fontSize: '13px', borderBottom: '2px solid transparent', color: sub, marginBottom: '-1px' },
      tabActive: { color: BRAND, borderBottomColor: BRAND, fontWeight: 600 },
      toolbar: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' },
      select: { padding: '6px 10px', borderRadius: '8px', border: '1px solid ' + border, background: layer, color: text, fontSize: '12px' },
      // 真实货架
      shelfUnit: { marginBottom: '24px' },
      shelfSign: { display: 'inline-flex', alignItems: 'center', gap: '8px', background: layer2, padding: '5px 14px', borderRadius: '6px 6px 0 0', fontSize: '13px', fontWeight: 700, border: '1px solid ' + border, borderBottom: 'none' },
      shelfBody: { border: '1px solid ' + border, borderRadius: '0 8px 8px 8px', background: 'linear-gradient(180deg,' + layer + ',' + layer2 + ')', padding: '0 16px' },
      plank: { display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'flex-end', padding: '18px 8px 0', position: 'relative', borderBottom: '7px solid ' + WOOD, boxShadow: '0 6px 8px -4px rgba(0,0,0,.35)', marginBottom: '10px', background: 'repeating-linear-gradient(90deg,transparent,transparent 60px,rgba(0,0,0,.02) 60px,rgba(0,0,0,.02) 61px)' },
      plankEdge: { position: 'absolute', left: 0, right: 0, bottom: '-7px', height: '7px', background: 'linear-gradient(180deg,' + WOOD + ',' + WOOD_DARK + ')' },
      product: { width: '132px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '2px' },
      thumb: { width: '104px', height: '104px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '44px', boxShadow: '0 3px 6px rgba(0,0,0,.25)', border: '1px solid rgba(255,255,255,.15)', position: 'relative' },
      pName: { fontSize: '12px', fontWeight: 600, marginTop: '8px', textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      priceTag: { fontSize: '13px', fontWeight: 800, color: BRAND, marginTop: '2px' },
      pMeta: { fontSize: '10px', color: sub, marginTop: '1px' },
      statusDot: { position: 'absolute', top: '6px', right: '6px', width: '10px', height: '10px', borderRadius: '50%', border: '2px solid #fff' },
      // 列表
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
      th: { textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid ' + border, color: sub, fontWeight: 600, background: layer2 },
      td: { padding: '10px 12px', borderBottom: '1px solid ' + border, verticalAlign: 'middle' },
      badge: { display: 'inline-block', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 },
      mini: { display: 'flex', alignItems: 'center', gap: '14px', padding: '6px 16px', borderTop: '1px solid ' + border, background: layer, fontSize: '12px', color: sub, cursor: 'pointer', width: '100%', boxSizing: 'border-box' },
      miniNum: { fontWeight: 800, color: text, fontVariantNumeric: 'tabular-nums' },
      empty: { padding: '50px', textAlign: 'center', color: sub },
      overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
      modal: { width: '600px', maxWidth: '92vw', maxHeight: '82vh', overflowY: 'auto', background: bg, border: '1px solid ' + border, borderRadius: '12px', padding: '20px' },
      drawer: { width: '440px', maxWidth: '92vw', height: '100%', background: bg, borderLeft: '1px solid ' + border, padding: '20px', overflowY: 'auto' },
      input: { padding: '7px 10px', borderRadius: '8px', border: '1px solid ' + border, background: layer, color: text, fontSize: '12px', outline: 'none' },
    }

    async function api(path) {
      for (let i = 0; i < 4; i++) {
        try { const r = await fetch(path, { cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (j && (j.ok !== false)) return j } } catch {}
        await new Promise(res => setTimeout(res, 500 * (i + 1)))
      }
      return {}
    }
    async function post(path, body) { const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); return r.json() }

    function useData() {
      const [data, setData] = useState({ projects: null, channels: [], summary: null, overview: null, gaps: [] })
      const reload = useCallback(async () => {
        try {
          const [pj, sum, ov, gaps] = await Promise.all([api('/project-steward/api/projects'), api('/project-steward/api/summary'), api('/project-steward/api/overview'), api('/project-steward/api/market/gaps')])
          setData(previous => ({
            projects: Array.isArray(pj.projects) ? pj.projects : previous.projects,
            channels: Array.isArray(pj.channels) ? pj.channels : previous.channels,
            summary: Array.isArray(sum.perProject) ? sum : previous.summary,
            overview: ov.counts || Array.isArray(ov.anomalies) ? ov : previous.overview,
            gaps: Array.isArray(gaps.gaps) ? gaps.gaps : previous.gaps,
          }))
        } catch {}
      }, [])
      useEffect(() => { reload(); const id = setInterval(reload, 30000); const onFocus = () => reload(); window.addEventListener('focus', onFocus); return () => { clearInterval(id); window.removeEventListener('focus', onFocus) } }, [reload])
      return { data, reload }
    }

    const statusOf = p => { const ls = p.listings || []; if (ls.some(l => l.status === 'listed')) return 'listed'; if (ls.some(l => l.status === 'reviewing' || l.status === 'submitted')) return 'reviewing'; if (ls.some(l => l.status === 'rejected')) return 'rejected'; if (ls.some(l => l.status === 'delisted')) return 'delisted'; return 'draft' }
    const Thumb = ({ p, size }) => { const m = TYPE_META[p.type] || { icon: '📦', color: '#8c8c8c' }; const st = statusOf(p); return h('div', { style: { ...T.thumb, width: size || 104, height: size || 104, background: 'linear-gradient(135deg,' + m.color + ',' + m.color + 'cc)' } }, m.icon, h('span', { style: { ...T.statusDot, background: C[st] } })) }

    // ---- 店铺概况 ----
    // ---- 各商品运营情况（列表 + 点击打开详情）----
    function BreakdownPanel({ summary }) {
      const pp = summary?.perProject || []
      const [sel, setSel] = useState(null)
      const chLabel = { 'ch-npmjs': 'npm', 'ch-npmmirror': '镜像', 'ch-github': 'GitHub', 'ch-dsh-market': 'DSH市场', 'ch-itch-io': 'itch', 'ch-steam': 'Steam' }
      const sorted = [...pp].sort((a, b) => (b.downloadsCumulative || 0) - (a.downloadsCumulative || 0))
      const cell = (v, color) => h('td', { style: { ...T.td, color: color || text, fontWeight: 600 } }, count(v))
      const detail = sel && h('div', { style: T.overlay, onClick: () => setSel(null) }, h('div', { style: T.drawer, onClick: e => e.stopPropagation() },
        h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '14px' } }, h('div', { style: { fontWeight: 700, fontSize: '16px' } }, sel.name), h('span', { style: { ...T.btnGhost, marginLeft: 'auto' }, onClick: () => setSel(null) }, '✕')),
        h('div', { style: { display: 'flex', gap: '22px', marginBottom: '16px' } },
          [['下载', sel.downloadsCumulative, BRAND], ['浏览', sel.views, '#0ea5e9'], ['克隆', sel.clones, '#22a06b'], ['留言', sel.comments, '#f5a623']].map(([l, v, c]) => h('div', { key: l }, h('div', { style: { fontSize: '22px', fontWeight: 800, color: c } }, count(v)), h('div', { style: { fontSize: '11px', color: sub } }, l)))),
        h('div', { style: T.panelTitle }, '分渠道明细'),
        h('table', { style: T.table },
          h('thead', null, h('tr', null, ['渠道', '下载', '昨日', '浏览', '克隆', '留言'].map(x => h('th', { key: x, style: T.th }, x)))),
          h('tbody', null, (sel.channels || []).map((c, i) => h('tr', { key: i },
            h('td', { style: T.td }, h('span', { style: { ...T.badge, background: '#333', color: '#ddd' } }, chLabel[c.channelId] || c.channelId)),
            h('td', { style: { ...T.td, fontWeight: 700 } }, count(c.downloads)),
            cell(c.downloadsYesterday, c.downloadsYesterday > 0 ? C.listed : sub),
            cell(c.views), cell(c.clones), cell(c.comments)))))))
      return h('div', { style: T.panel },
        h('div', { style: T.panelTitle }, '📊 各商品运营情况', h('span', { style: { fontSize: '11px', color: sub, marginLeft: 'auto' } }, '点击商品行打开详情')),
        sorted.length === 0 ? h('div', { style: { color: sub, fontSize: '12px' } }, '暂无采集数据。') :
        h('table', { style: T.table },
          h('thead', null, h('tr', null, ['商品', '下载', '浏览', '克隆', '留言', ''].map((x, i) => h('th', { key: i, style: T.th }, x)))),
          h('tbody', null, sorted.map((p, i) => h('tr', { key: p.projectId, style: { cursor: 'pointer', ...(i === 0 ? { background: BRAND_SOFT } : {}) }, onClick: () => setSel(p) },
            h('td', { style: { ...T.td, fontWeight: 700 } }, p.name, i === 0 ? ' 🏆' : ''),
            h('td', { style: { ...T.td, fontWeight: 800, color: BRAND } }, count(p.downloadsCumulative)),
            cell(p.views), cell(p.clones), cell(p.comments),
            h('td', { style: T.td }, h('span', { style: { color: BRAND, fontSize: '12px' } }, '详情 →')))))),
        detail)
    }

    function dashboardMetric(summary, field, channelField = field) {
      const reported = summary?.totals?.[field]
      if (Number.isFinite(reported)) return reported
      if (!Array.isArray(summary?.perProject)) return

      let total = 0
      for (const project of summary.perProject) {
        const subtotal = project[field]
        if (Number.isFinite(subtotal)) {
          total += subtotal
          continue
        }
        if (!Array.isArray(project.channels)) return
        for (const channel of project.channels) {
          const value = channel[channelField]
          if (!Number.isFinite(value)) return
          total += value
        }
      }
      return total
    }

    function dashboardListingCounts(projects) {
      if (!projects) return {}
      let listed = 0, listedListings = 0
      for (const project of projects) {
        const listings = project.listings ?? project.channels
        if (!Array.isArray(listings) || listings.some(l => typeof l.status !== 'string')) return {}
        const active = listings.filter(l => l.status === 'listed').length
        if (active > 0) listed++
        listedListings += active
      }
      return { listed, listedListings }
    }

    function Dashboard({ data, goShelf }) {
      const metric = (field, channelField) => dashboardMetric(data.summary, field, channelField)
      const ov = data.overview || {}
      const fallback = dashboardListingCounts(data.projects)
      const listed = ov.counts?.listed ?? fallback.listed
      const listedListings = ov.counts?.listedListings ?? fallback.listedListings
      const change = n => n == null ? '—' : '+' + count(n)
      const revenue = metric('revenue')
      const stats = [
        { label: '在售商品', value: count(listed), note: count(listedListings) + ' 条渠道上架记录', icon: '🏪', color: BRAND },
        { label: '下载', period: '近 30 天', value: count(metric('downloadsCumulative', 'downloads') ?? data.summary?.totals?.downloads), delta: metric('downloadsYesterday') ?? null, deltaLabel: '最近报告日', note: 'npm 下载量（含命令行安装）', icon: '⬇️', color: '#5b6cff' },
        { label: '浏览', period: '近 14 天', value: count(metric('views')), delta: metric('viewsYesterday') ?? null, deltaLabel: '昨日增加', icon: '👁️', color: '#0ea5e9' },
        { label: '留言', value: count(metric('comments')), note: '克隆 ' + count(metric('clones')) + ' · 昨日 ' + change(metric('clonesYesterday')), icon: '💬', color: '#22a06b' },
        { label: '累计收入', value: revenue == null ? '—' : money(revenue), icon: '💰', color: '#f5a623' },
      ]
      const anomalies = ov.anomalies || []
      return h('div', null,
        h('div', { style: T.cards }, stats.map(s => h('div', { key: s.label, style: T.stat },
          h('span', { style: T.statIcon }, s.icon),
          h('div', { style: T.statLabel }, s.label),
          s.delta !== undefined
            ? h('div', { style: { display: 'flex', gap: '14px', marginTop: '4px' } },
                h('div', null, h('div', { style: { ...T.statNum, color: s.color } }, s.value), h('div', { style: { fontSize: '10px', color: sub } }, s.period)),
                h('div', { style: { borderLeft: '1px solid ' + border, paddingLeft: '14px' } }, h('div', { style: { ...T.statNum, color: s.delta > 0 ? C.listed : sub } }, change(s.delta)), h('div', { style: { fontSize: '10px', color: sub } }, s.deltaLabel)))
            : h('div', { style: { ...T.statNum, color: s.color } }, s.value),
          s.note ? h('div', { style: { fontSize: '10px', color: sub, marginTop: '3px' } }, s.note) : null))),
        h(BreakdownPanel, { summary: data.summary }),
        h('div', { style: T.panel }, h('div', { style: T.panelTitle }, '⚠️ 待处理异常', anomalies.length ? h('span', { style: { ...T.badge, background: 'rgba(229,72,77,.12)', color: C.rejected } }, anomalies.length) : null),
          anomalies.length === 0 ? h('div', { style: { color: sub, fontSize: '12px' } }, '一切正常，暂无异常 🎉') :
          anomalies.map((a, i) => h('div', { key: i, style: { display: 'flex', gap: '8px', padding: '6px 0', borderBottom: '1px solid ' + border, fontSize: '12px' } }, h('span', { style: { color: C.rejected } }, '●'), h('span', null, { 'blocked-run': '发布阻断', 'rejected-listing': '上架被拒', 'expired-reminder': '提醒过期' }[a.kind] || a.kind), h('span', { style: { color: sub, marginLeft: 'auto' } }, a.projectId)))),
        h('div', { style: T.panel }, h('div', { style: T.panelTitle }, '📦 商品分类'),
          h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } }, Object.entries(ov.counts?.byType || {}).map(([type, n]) => { const m = TYPE_META[type] || { icon: '📦', label: type }; return h('div', { key: type, style: { ...T.stat, flex: '1', minWidth: '120px', cursor: 'pointer' }, onClick: goShelf }, h('div', { style: { fontSize: '22px' } }, m.icon), h('div', { style: { fontWeight: 700, marginTop: '4px' } }, m.label), h('div', { style: T.statLabel }, n + ' 件商品')) }))))
    }

    // ---- 真实货架视图 ----
    function ShelfVisual({ projects, channels, onOpen }) {
      const groups = {}
      for (const p of projects) { const key = (TYPE_META[p.type] || {}).label || '其他区'; (groups[key] = groups[key] || []).push(p) }
      if (!Object.keys(groups).length) return h('div', { style: T.empty }, '货架空空如也。点右上角「＋ 扫描纳管」把项目摆上货架。')
      return h('div', null, Object.entries(groups).map(([name, ps]) => {
        const m = Object.values(TYPE_META).find(x => x.label === name) || { icon: '📦' }
        // 每层货架放 6 件
        const planks = []
        for (let i = 0; i < ps.length; i += 6) planks.push(ps.slice(i, i + 6))
        return h('div', { key: name, style: T.shelfUnit },
          h('div', { style: T.shelfSign }, m.icon + ' ' + name, h('span', { style: { color: sub, fontWeight: 400, fontSize: '11px' } }, ps.length + ' 件')),
          h('div', { style: T.shelfBody }, planks.map((plank, pi) => h('div', { key: pi, style: T.plank },
            plank.map(p => h('div', { key: p.id, style: T.product, onClick: () => onOpen(p), title: p.name },
              h(Thumb, { p }),
              h('div', { style: T.pName }, p.name),
              h('div', { style: T.priceTag }, money(p.metrics?.revenue)),
              h('div', { style: T.pMeta }, '⬇' + fmt(p.metrics?.downloads) + ' · 👁' + fmt(p.metrics?.views)),
              h('div', { style: { ...T.badge, background: (C[statusOf(p)] || C.draft) + '22', color: C[statusOf(p)] || C.draft, marginTop: '3px' } }, STATUS_LABEL[statusOf(p)]))),
            h('div', { style: T.plankEdge })))))
      }))
    }

    // ---- 列表视图（淘宝商品管理风格）----
    function ListView({ projects, channels, onOpen }) {
      const chName = id => (channels.find(c => c.id === id) || {}).name || id
      if (!projects.length) return h('div', { style: T.empty }, '暂无商品')
      return h('table', { style: T.table }, h('thead', null, h('tr', null, ['商品', '类型', '版本', '渠道', '⬇下载', '👁浏览', '💬留言', '💰收入', '状态', '操作'].map(x => h('th', { key: x, style: T.th }, x)))),
        h('tbody', null, projects.map(p => { const st = statusOf(p); const m = TYPE_META[p.type] || { icon: '📦', label: p.type }; return h('tr', { key: p.id },
          h('td', { style: T.td }, h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, h(Thumb, { p, size: 40 }), h('span', { style: { fontWeight: 600 } }, p.name))),
          h('td', { style: T.td }, m.icon + ' ' + m.label),
          h('td', { style: T.td }, (p.lastRelease && p.lastRelease.version) || '—'),
          h('td', { style: T.td }, (p.channels || []).map(c => chName(c.channelId)).join(', ') || '—'),
          h('td', { style: T.td }, fmt(p.metrics?.downloads)),
          h('td', { style: T.td }, fmt(p.metrics?.views)),
          h('td', { style: T.td }, fmt(p.metrics?.comments)),
          h('td', { style: { ...T.td, color: BRAND, fontWeight: 700 } }, money(p.metrics?.revenue)),
          h('td', { style: T.td }, h('span', { style: { ...T.badge, background: (C[st] || C.draft) + '22', color: C[st] || C.draft } }, STATUS_LABEL[st])),
          h('td', { style: T.td }, h('span', { style: { color: BRAND, cursor: 'pointer' }, onClick: () => onOpen(p) }, '管理'))) })))
    }

    // ---- 商品货架页 ----
    function ProductsPage({ data, onOpen, onScan }) {
      const [tab, setTab] = useState('all')
      const [mode, setMode] = useState('shelf')
      const [q, setQ] = useState('')
      const [cat, setCat] = useState('all')
      const all = data.projects || []
      const counts = { all: all.length, listed: 0, reviewing: 0, draft: 0, delisted: 0, rejected: 0 }
      for (const p of all) counts[statusOf(p)] = (counts[statusOf(p)] || 0) + 1
      let ps = all
      if (tab !== 'all') ps = ps.filter(p => tab === 'reviewing' ? (statusOf(p) === 'reviewing') : statusOf(p) === tab)
      if (cat !== 'all') ps = ps.filter(p => (TYPE_META[p.type] || {}).label === cat)
      if (q) ps = ps.filter(p => p.name.toLowerCase().includes(q.toLowerCase()))
      const cats = [...new Set(all.map(p => (TYPE_META[p.type] || {}).label || '其他区'))]
      const TABS = [['all', '全部'], ['listed', '出售中'], ['reviewing', '审核中'], ['draft', '待上架'], ['rejected', '审核拒绝'], ['delisted', '已下架']]
      return h('div', null,
        h('div', { style: T.tabs }, TABS.map(([k, label]) => h('div', { key: k, style: { ...T.tab, ...(tab === k ? T.tabActive : {}) }, onClick: () => setTab(k) }, label + (counts[k] ? ' ' + counts[k] : '')))),
        h('div', { style: T.toolbar },
          h('input', { style: { ...T.search, maxWidth: '240px' }, placeholder: '搜索商品名称…', value: q, onChange: e => setQ(e.target.value) }),
          h('select', { style: T.select, value: cat, onChange: e => setCat(e.target.value) }, h('option', { value: 'all' }, '全部分类'), cats.map(c => h('option', { key: c, value: c }, c))),
          h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '6px' } },
            h('span', { style: { ...T.btnGhost, ...(mode === 'shelf' ? { borderColor: BRAND, color: BRAND } : {}) }, onClick: () => setMode('shelf') }, '🛒 货架视图'),
            h('span', { style: { ...T.btnGhost, ...(mode === 'list' ? { borderColor: BRAND, color: BRAND } : {}) }, onClick: () => setMode('list') }, '☰ 列表视图'))),
        mode === 'shelf' ? h(ShelfVisual, { projects: ps, channels: data.channels, onOpen }) : h(ListView, { projects: ps, channels: data.channels, onOpen }))
    }

    // ---- 雷达图（多维对比形状图）----
    function RadarChart({ radar }) {
      if (!radar || !radar.dimensions?.length) return null
      const dims = radar.dimensions, N = dims.length
      const cx = 150, cy = 150, R = 105
      const pt = (i, v) => { const a = (-90 + i * 360 / N) * Math.PI / 180; return [cx + v * R * Math.cos(a), cy + v * R * Math.sin(a)] }
      const poly = vals => vals.map((v, i) => pt(i, Math.max(0.02, v)).join(',')).join(' ')
      const grid = [0.25, 0.5, 0.75, 1].map(l => h('polygon', { key: l, points: poly(dims.map(() => l)), fill: 'none', stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 1 }))
      const axes = dims.map((d, i) => { const [x, y] = pt(i, 1); const [lx, ly] = pt(i, 1.18); return h('g', { key: i }, h('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 1 }), h('text', { x: lx, y: ly, fontSize: 11, fill: 'var(--dsw-alias-label-secondary)', textAnchor: 'middle', dominantBaseline: 'middle' }, d)) })
      const colors = ['#ff5000', '#5b6cff', '#22a06b', '#a855f7', '#0ea5e9', '#f5a623']
      const series = (radar.series || []).slice(0, 6).map((s, si) => h('polygon', { key: si, points: poly(s.values), fill: colors[si] + (s.isMine ? '55' : '22'), stroke: colors[si], strokeWidth: s.isMine ? 2.5 : 1.5 }))
      const legend = (radar.series || []).slice(0, 6).map((s, si) => h('span', { key: si, style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', marginRight: '10px', fontWeight: s.isMine ? 700 : 400 } }, h('span', { style: { width: 10, height: 10, borderRadius: 2, background: colors[si], display: 'inline-block' } }), s.name + (s.isMine ? '（我的）' : '')))
      return h('div', null, h('svg', { viewBox: '0 0 300 300', style: { width: '100%', maxWidth: '340px', display: 'block', margin: '0 auto' } }, grid, axes, series), h('div', { style: { textAlign: 'center', marginTop: '6px' } }, legend))
    }

    // ---- 功能逐项对比矩阵 ----
    function FeatureMatrix({ fc }) {
      if (!fc || !fc.matrix?.length) return null
      const rows = fc.rows?.length ? fc.rows : Object.keys(fc.matrix[0].caps || {})
      return h('table', { style: T.table },
        h('thead', null, h('tr', null, h('th', { style: T.th }, '功能（按我的插件逐项）'), fc.matrix.map((m, i) => h('th', { key: i, style: { ...T.th, textAlign: 'center', color: m.isMine ? BRAND : sub, fontWeight: m.isMine ? 800 : 600 } }, m.isMine ? '★ ' + m.name : m.name)))),
        h('tbody', null, rows.map(cap => h('tr', { key: cap },
          h('td', { style: { ...T.td, fontWeight: 600 } }, cap),
          fc.matrix.map((m, i) => h('td', { key: i, style: { ...T.td, textAlign: 'center', background: m.isMine ? BRAND_SOFT : 'transparent' } }, m.caps?.[cap] ? h('span', { style: { color: C.listed, fontWeight: 800 } }, '✓') : h('span', { style: { color: sub } }, '—')))))))
    }

    // ---- 市场空白表（多因子）----
    function GapTable({ gaps }) {
      if (!gaps.length) return h('div', { style: { color: sub, fontSize: '12px' } }, '暂无空白数据。点「刷新空白」实搜各细分市场的供给/需求/竞争。')
      const head = ['细分市场', '市场供给', '需求(star)', '竞争强度', '空白分', '研判与依据']
      const rows = gaps.map(g => {
        const evText = g.evidence && g.evidence.length ? '头部: ' + g.evidence.slice(0, 3).map(e => e.name).join(', ') : ''
        const scoreColor = g.gapScore >= 25 ? C.listed : g.gapScore >= 10 ? C.reviewing : sub
        return h('tr', { key: g.id },
          h('td', { style: { ...T.td, fontWeight: 600 } }, g.niche || g.category),
          h('td', { style: T.td }, g.supplyCount),
          h('td', { style: T.td }, g.demandSignal),
          h('td', { style: T.td }, g.competition ?? '—'),
          h('td', { style: { ...T.td, fontWeight: 800, color: scoreColor } }, g.gapScore),
          h('td', { style: { ...T.td, fontSize: '11px' } }, g.opportunity, evText ? h('div', { style: { color: sub, marginTop: '2px' } }, evText) : null))
      })
      return h('div', null,
        h('div', { style: { fontSize: '11px', color: sub, marginBottom: '8px' } }, '多因子研判：空白分 = 需求强度 × 供给稀缺度 × 竞争弱度（实搜 npm+GitHub，非简单比值）。头部产品 star 为需求代理。'),
        h('table', { style: T.table }, h('thead', null, h('tr', null, head.map(x => h('th', { key: x, style: T.th }, x)))), h('tbody', null, rows)))
    }

    // ---- 市场情报（竞品对比 + 市场空白）----
    function MarketPage({ data, reload }) {
      const projects = data.projects || []
      const [pid, setPid] = useState(projects[0]?.id || '')
      const [report, setReport] = useState(null)
      const [busy, setBusy] = useState(false)
      const gaps = data.gaps || []
      useEffect(() => { if (pid) api('/project-steward/api/market/report?id=' + encodeURIComponent(pid)).then(j => setReport(j.report)).catch(() => {}) }, [pid])
      const scan = async () => { if (!pid) return; setBusy(true); try { await post('/project-steward/api/market/scan', { projectId: pid }); const j = await api('/project-steward/api/market/report?id=' + encodeURIComponent(pid)); setReport(j.report); await post('/project-steward/api/market/gaps', {}); await reload() } finally { setBusy(false) } }
      const vl = { 'worth-continuing': ['🟢 值得继续', C.listed], 'needs-differentiation': ['🟡 需差异化', C.reviewing], 'red-ocean-caution': ['🔴 红海慎入', C.rejected] }
      const scanGaps = async () => { setBusy(true); try { await post('/project-steward/api/market/gaps', {}); await reload() } finally { setBusy(false) } }
      return h('div', null,
        h('div', { style: T.panel },
          h('div', { style: T.panelTitle }, '🔍 竞品扫描对比',
            h('select', { style: { ...T.select, marginLeft: 'auto' }, value: pid, onChange: e => setPid(e.target.value) }, projects.map(p => h('option', { key: p.id, value: p.id }, p.name))),
            h('span', { style: T.btn, onClick: scan }, busy ? '扫描中…' : '扫描对比竞品')),
          !report ? h('div', { style: { color: sub, fontSize: '12px', padding: '12px 0' } }, projects.length ? '选择商品后点「扫描对比竞品」，发现同类并研判比较优势。' : '请先纳管项目。') :
          h('div', null,
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' } },
              h('span', { style: { ...T.badge, fontSize: '14px', padding: '4px 12px', background: (vl[report.verdict]?.[1] || C.draft) + '22', color: vl[report.verdict]?.[1] || C.draft } }, vl[report.verdict]?.[0] || report.verdict),
              h('span', { style: { fontSize: '12px', color: sub } }, '对比 ' + (report.competitors?.length || 0) + ' 个同类竞品'),
              h('span', { style: { fontSize: '11px', color: sub, marginLeft: 'auto' } }, '生成于 ' + (report.generatedAt || '').slice(0, 16).replace('T', ' '))),
            h('div', { style: { fontSize: '12px', color: sub, marginBottom: '12px' } }, report.summary),
            (report.strengths?.length || report.weaknesses?.length) ? h('div', { style: { display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' } },
              report.strengths?.length ? h('div', { style: { flex: 1, minWidth: '200px' } }, h('div', { style: { fontWeight: 600, color: C.listed, fontSize: '12px', marginBottom: '4px' } }, '✓ 优势'), report.strengths.map((s, i) => h('div', { key: i, style: { fontSize: '12px', padding: '2px 0' } }, '· ' + s))) : null,
              report.weaknesses?.length ? h('div', { style: { flex: 1, minWidth: '200px' } }, h('div', { style: { fontWeight: 600, color: C.rejected, fontSize: '12px', marginBottom: '4px' } }, '✗ 短板'), report.weaknesses.map((s, i) => h('div', { key: i, style: { fontSize: '12px', padding: '2px 0' } }, '· ' + s))) : null) : null,
            report.featureComparison?.radar ? h('div', { style: { marginBottom: '16px' } }, h('div', { style: { fontWeight: 600, fontSize: '12px', marginBottom: '6px' } }, '🕸️ 多维对比雷达图（我的项目 vs 竞品）'), h(RadarChart, { radar: report.featureComparison.radar })) : null,
            report.featureComparison?.matrix?.length ? h('div', { style: { marginBottom: '16px', overflowX: 'auto' } }, h('div', { style: { fontWeight: 600, fontSize: '12px', marginBottom: '6px' } }, '📋 功能逐项对比（✓ 具备 / — 未识别）'), h(FeatureMatrix, { fc: report.featureComparison })) : null,
            h('div', { style: { fontWeight: 600, fontSize: '12px', marginBottom: '6px' } }, '同类竞品（' + (report.competitors?.length || 0) + '）'),
            h('table', { style: T.table }, h('thead', null, h('tr', null, ['竞品', '⭐star', '⬇下载/fork', '最近更新', '链接'].map(x => h('th', { key: x, style: T.th }, x)))),
              h('tbody', null, (report.competitors || []).slice(0, 20).map(c => h('tr', { key: c.id },
                h('td', { style: { ...T.td, fontWeight: 600 } }, c.name),
                h('td', { style: T.td }, c.stars ?? '—'),
                h('td', { style: T.td }, c.downloads ?? '—'),
                h('td', { style: T.td }, (c.lastUpdate || '').slice(0, 10) || '—'),
                h('td', { style: T.td }, h('a', { href: c.url, target: '_blank', rel: 'noreferrer', style: { color: BRAND, fontSize: '11px' } }, '打开')))))))),
        h('div', { style: T.panel }, h('div', { style: T.panelTitle }, '📊 市场空白机会', h('span', { style: { ...T.btnGhost, marginLeft: 'auto' }, onClick: scanGaps }, '刷新空白')),
          h(GapTable, { gaps })))
    }

    // ---- 渠道管理 ----
    function ChannelsPage({ data }) {
      const chs = data.channels || []
      return h('div', { style: T.panel }, h('div', { style: T.panelTitle }, '🔌 发布渠道（' + chs.length + '）'),
        h('table', { style: T.table }, h('thead', null, h('tr', null, ['渠道', '类别', '状态', '适用类型', '只读保护'].map(x => h('th', { key: x, style: T.th }, x)))),
          h('tbody', null, chs.map(c => h('tr', { key: c.id }, h('td', { style: { ...T.td, fontWeight: 600 } }, c.name), h('td', { style: T.td }, c.category), h('td', { style: T.td }, h('span', { style: { ...T.badge, background: c.status === 'active' ? 'rgba(34,160,107,.12)' : layer2, color: c.status === 'active' ? C.listed : sub } }, c.status)), h('td', { style: T.td }, (c.appliesToTypes || []).join(', ') || '—'), h('td', { style: T.td }, c.readOnly ? '🔒 是' : '—'))))))
    }

    // ---- 扫描纳管对话框 ----
    function ScanDialog({ onClose, onDone }) {
      const [roots, setRoots] = useState('')
      const [candidates, setCandidates] = useState(null)
      const [selected, setSelected] = useState({})
      const [busy, setBusy] = useState(false)
      const [msg, setMsg] = useState('')
      const scan = async () => { if (!roots.trim()) { setMsg('请先输入要扫描的本地目录'); return } setBusy(true); setMsg(''); try { const j = await post('/project-steward/api/scan', { roots: roots.split(/[;,]/).map(s => s.trim()).filter(Boolean) }); if (j.ok) { setCandidates(j.candidates); const sel = {}; j.candidates.forEach(c => { if (!c.alreadyRegistered) sel[c.rootPath] = true }); setSelected(sel) } else setMsg(j.error?.message || '扫描失败') } catch (e) { setMsg(String(e)) } finally { setBusy(false) } }
      const register = async () => { setBusy(true); setMsg(''); const chosen = (candidates || []).filter(c => selected[c.rootPath]); let ok = 0, fail = 0; for (const c of chosen) { try { const j = await post('/project-steward/api/register', { name: c.name, rootPath: c.rootPath, type: c.suggestedType }); if (j.ok) ok++; else fail++ } catch { fail++ } } setMsg(`纳管完成：成功 ${ok}${fail ? '，失败 ' + fail : ''}`); await onDone(); setBusy(false) }
      return h('div', { style: T.overlay, onClick: onClose }, h('div', { style: T.modal, onClick: e => e.stopPropagation() },
        h('div', { style: { fontWeight: 700, fontSize: '16px', marginBottom: '6px' } }, '＋ 纳管本地项目（货源）'),
        h('div', { style: { fontSize: '12px', color: sub, marginBottom: '12px' } }, '扫描你指定的本地目录，找出项目登记成商品。发布渠道（npm/itch/GitHub 等平台）在左侧「发布渠道」页管理，与此无关。'),
        h('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } }, h('input', { style: { ...T.input, flex: 1 }, value: roots, onChange: e => setRoots(e.target.value), placeholder: '输入要扫描的本地目录，如 E:\\游戏（多个用逗号分隔）' }), h('span', { style: T.btn, onClick: scan }, busy ? '扫描中…' : '扫描')),
        msg ? h('div', { style: { fontSize: '12px', color: sub, marginBottom: '8px' } }, msg) : null,
        candidates ? (candidates.length === 0 ? h('div', { style: T.empty }, '未发现候选项目') : h('div', null, candidates.map(c => h('label', { key: c.rootPath, style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 4px', borderBottom: '1px solid ' + border, fontSize: '12px', opacity: c.alreadyRegistered ? 0.5 : 1 } }, h('input', { type: 'checkbox', checked: !!selected[c.rootPath], disabled: c.alreadyRegistered, onChange: e => setSelected({ ...selected, [c.rootPath]: e.target.checked }) }), h('span', { style: { fontWeight: 600 } }, c.name), h('span', { style: { ...T.badge, background: BRAND_SOFT, color: BRAND } }, c.suggestedType), h('span', { style: { fontSize: '11px', color: sub, marginLeft: 'auto' } }, c.alreadyRegistered ? '已纳管' : c.rootPath))))) : h('div', { style: { fontSize: '12px', color: sub } }, '输入目录后点「扫描」，勾选要纳管的项目。'),
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' } }, h('span', { style: T.btnGhost, onClick: onClose }, '关闭'), candidates && candidates.some(c => selected[c.rootPath]) ? h('span', { style: T.btn, onClick: register }, busy ? '纳管中…' : '纳管选中') : null)))
    }

    // ---- 商品详情抽屉 ----
    function DetailDrawer({ p, onClose }) {
      const [detail, setDetail] = useState(null)
      useEffect(() => { api('/project-steward/api/project?id=' + encodeURIComponent(p.id)).then(setDetail).catch(() => {}) }, [p.id])
      const vl = { 'worth-continuing': '🟢 值得继续', 'needs-differentiation': '🟡 需差异化', 'red-ocean-caution': '🔴 红海慎入' }
      const st = statusOf(p)
      return h('div', { style: { ...T.overlay, justifyContent: 'flex-end' }, onClick: onClose }, h('div', { style: T.drawer, onClick: e => e.stopPropagation() },
        h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' } }, h(Thumb, { p, size: 56 }), h('div', null, h('div', { style: { fontWeight: 700, fontSize: '16px' } }, p.name), h('div', { style: { fontSize: '12px', color: sub } }, (TYPE_META[p.type] || {}).label + ' · ' + ((p.lastRelease && p.lastRelease.version) || '未发布'))), h('span', { style: { ...T.btnGhost, marginLeft: 'auto' }, onClick: onClose }, '✕')),
        h('div', { style: { ...T.badge, background: (C[st] || C.draft) + '22', color: C[st] || C.draft, marginBottom: '16px' } }, STATUS_LABEL[st]),
        !detail ? h('div', { style: T.empty }, '加载中…') : h('div', null,
          h('div', { style: T.panelTitle }, '上架渠道'), detail.listings.length ? detail.listings.map(l => h('div', { key: l.id, style: { fontSize: '12px', padding: '4px 0' } }, l.channelId + ' · ' + (STATUS_LABEL[l.status] || l.status))) : h('div', { style: { fontSize: '12px', color: sub } }, '尚未上架'),
          h('div', { style: T.panelTitle }, '发布记录'), detail.runs.length ? detail.runs.map(r => h('div', { key: r.id, style: { fontSize: '12px', padding: '4px 0' } }, r.version + ' · ' + r.status)) : h('div', { style: { fontSize: '12px', color: sub } }, '暂无发布 run'),
          h('div', { style: T.panelTitle }, '竞品研判'), detail.marketReport ? h('div', null, h('div', { style: { fontWeight: 700 } }, vl[detail.marketReport.verdict] || detail.marketReport.verdict), h('div', { style: { fontSize: '12px', color: sub, marginTop: '4px' } }, detail.marketReport.summary)) : h('div', { style: { fontSize: '12px', color: sub } }, '尚未扫描竞品'),
          h('div', { style: T.panelTitle }, '最近事件'), detail.events.slice(0, 8).map(e => h('div', { key: e.id, style: { fontSize: '11px', padding: '3px 0', color: sub } }, e.kind + ' · ' + e.text)))))
    }

    // ---- 设置页 ----
    function SettingsPage({ data }) {
      const rows = [
        ['台账数据目录', 'E:\\项目管家\\data'],
        ['定时采集间隔', '60 分钟（R13）'],
        ['发布说明硬门禁', '✅ 启用（FR2.9：README+CHANGELOG 必备，缺失阻断发布）'],
        ['谨慎模式 confirmGates', '关闭（全自动 R8；G3/G4 仍需确认）'],
        ['常驻方式', 'conversation.view「店铺」页签（迷你条已移除 R25）'],
        ['生产实例保护', '阿里云货运险 readOnly（R6，禁止写操作）'],
        ['发布渠道数', (data.channels || []).length + ' 个'],
        ['纳管商品数', (data.projects || []).length + ' 件'],
      ]
      return h('div', null,
        h('div', { style: T.panel }, h('div', { style: T.panelTitle }, '⚙️ 店铺设置'),
          h('table', { style: T.table }, h('tbody', null, rows.map(([k, v]) => h('tr', { key: k }, h('td', { style: { ...T.td, fontWeight: 600, width: '200px' } }, k), h('td', { style: T.td }, v)))))),
        h('div', { style: T.panel }, h('div', { style: T.panelTitle }, '🔒 危险动作确认（G3/G4）'),
          h('div', { style: { fontSize: '12px', color: sub } }, '下架（delisted）、归档、豁免阻断、渠道软删除等不可逆动作需显式确认并填写理由，任何配置不可关闭此闸门。')))
    }

    // ---- 通用确认浮层（G3/G4）----
    function ConfirmDialog({ title, detail, requireReason, onConfirm, onCancel }) {
      const [reason, setReason] = useState('')
      return h('div', { style: T.overlay, onClick: onCancel }, h('div', { style: { ...T.modal, width: '440px' }, onClick: e => e.stopPropagation() },
        h('div', { style: { fontWeight: 700, fontSize: '15px', color: C.rejected, marginBottom: '10px' } }, '⚠️ ' + title),
        h('div', { style: { fontSize: '12px', color: sub, marginBottom: '12px' } }, detail),
        requireReason ? h('input', { style: { ...T.input, width: '100%', boxSizing: 'border-box', marginBottom: '12px' }, placeholder: '必填理由（G4）', value: reason, onChange: e => setReason(e.target.value) }) : null,
        h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
          h('span', { style: T.btnGhost, onClick: onCancel }, '取消'),
          h('span', { style: { ...T.btn, background: C.rejected, opacity: requireReason && !reason.trim() ? 0.5 : 1 }, onClick: () => { if (!requireReason || reason.trim()) onConfirm(reason) } }, '确认执行'))))
    }

    // ---- 从发布渠道导入对话框（扫描平台，不扫本地）----
    function ChannelImportDialog({ onClose, onDone }) {
      const [candidates, setCandidates] = useState(null)
      const [selected, setSelected] = useState({})
      const [busy, setBusy] = useState(false)
      const [msg, setMsg] = useState('')
      const scan = async () => { setBusy(true); setMsg(''); try { const j = await post('/project-steward/api/channel/scan', {}); if (j.ok) { setCandidates(j.candidates); const sel = {}; j.candidates.forEach(c => { if (!c.alreadyRegistered) sel[c.url] = true }); setSelected(sel) } else setMsg(j.error?.message || '扫描失败') } catch (e) { setMsg(String(e)) } finally { setBusy(false) } }
      const doImport = async () => { setBusy(true); setMsg(''); const chosen = (candidates || []).filter(c => selected[c.url]); let ok = 0, fail = 0; for (const c of chosen) { try { const j = await post('/project-steward/api/channel/import', { candidate: c }); if (j.ok) ok++; else fail++ } catch { fail++ } } setMsg(`导入完成：成功 ${ok}${fail ? '，失败 ' + fail : ''}`); await onDone(); setBusy(false) }
      const srcLabel = { npm: 'npm', github: 'GitHub' }
      return h('div', { style: T.overlay, onClick: onClose }, h('div', { style: T.modal, onClick: e => e.stopPropagation() },
        h('div', { style: { fontWeight: 700, fontSize: '16px', marginBottom: '6px' } }, '🔌 从发布渠道导入商品'),
        h('div', { style: { fontSize: '12px', color: sub, marginBottom: '12px' } }, '扫描你的发布渠道账号（npm/GitHub），发现已上架的商品直接导入货架——不需要选本地文件。'),
        h('div', { style: { marginBottom: '12px' } }, h('span', { style: T.btn, onClick: scan }, busy ? '扫描渠道中…' : '扫描发布渠道')),
        msg ? h('div', { style: { fontSize: '12px', color: sub, marginBottom: '8px' } }, msg) : null,
        candidates ? (candidates.length === 0 ? h('div', { style: T.empty }, '渠道上未发现商品') : h('div', { style: { maxHeight: '40vh', overflowY: 'auto' } }, candidates.map(c => h('label', { key: c.url, style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 4px', borderBottom: '1px solid ' + border, fontSize: '12px', opacity: c.alreadyRegistered ? 0.5 : 1 } }, h('input', { type: 'checkbox', checked: !!selected[c.url], disabled: c.alreadyRegistered, onChange: e => setSelected({ ...selected, [c.url]: e.target.checked }) }), h('span', { style: { ...T.badge, background: BRAND_SOFT, color: BRAND } }, srcLabel[c.source] || c.source), h('span', { style: { fontWeight: 600 } }, c.name), c.version ? h('span', { style: { color: sub } }, 'v' + c.version) : null, h('span', { style: { fontSize: '11px', color: sub, marginLeft: 'auto' } }, c.alreadyRegistered ? '已纳管' : (c.localRoot ? '有本地源' : '仅远程')))))) : h('div', { style: { fontSize: '12px', color: sub } }, '点「扫描发布渠道」发现你在 npm/GitHub 上已发布的商品。'),
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' } }, h('span', { style: T.btnGhost, onClick: onClose }, '关闭'), candidates && candidates.some(c => selected[c.url]) ? h('span', { style: T.btn, onClick: doImport }, busy ? '导入中…' : '导入选中') : null)))
    }

    // ---- 个人网站维护页（FR8，域名可配置）----
    function WebsitePage() {
      const [tab, setTab] = useState('showcase')
      const [sites, setSites] = useState([])
      const [show, setShow] = useState(null)
      const [busy, setBusy] = useState(false)
      const [url, setUrl] = useState('')
      const [msg, setMsg] = useState('')
      const load = () => api('/project-steward/api/website/list').then(j => setSites(j.websites || [])).catch(() => {})
      const loadShow = () => api('/project-steward/api/website/showcase').then(j => setShow(j.showcase)).catch(() => {})
      const sync = async () => { const w = sites[0]; if (!w) { setMsg('请先在维护监控页登记网站'); return } setBusy(true); setMsg(''); try { const j = await post('/project-steward/api/website/sync', { websiteId: w.id }); setMsg(j.ok ? (j.result.synced ? '已同步到网站：' + (j.result.log || []).join(' ') : '已生成（未配置自动部署）') : (j.error?.message || '同步失败')) } catch (e) { setMsg(String(e)) } finally { setBusy(false) } }
      useEffect(() => { load(); loadShow() }, [])
      const check = async () => { setBusy(true); setMsg(''); try { await post('/project-steward/api/website/check', {}); await load(); setMsg('检查完成') } catch (e) { setMsg(String(e)) } finally { setBusy(false) } }
      const add = async () => { if (!url.trim()) return; setBusy(true); try { const j = await post('/project-steward/api/website/add', { url: url.trim() }); if (j.ok) { setUrl(''); await load() } else setMsg(j.error?.message || '添加失败') } finally { setBusy(false) } }
      const certColor = d => d == null ? sub : d < 0 ? C.rejected : d <= 30 ? C.reviewing : C.listed
      const tabBar = h('div', { style: { display: 'flex', gap: '8px', marginBottom: '14px' } },
        [['showcase', '🎨 作品展示·宣传'], ['maint', '🛡️ 维护监控']].map(([k, label]) => h('span', { key: k, style: { ...T.btnGhost, ...(tab === k ? { background: BRAND_SOFT, color: BRAND, borderColor: BRAND, fontWeight: 700 } : {}) }, onClick: () => setTab(k) }, label)))
      const showcasePanel = h('div', { style: T.panel },
        h('div', { style: T.panelTitle }, '🎨 作品展示专栏（宣传）', h('span', { style: { ...T.btn, marginLeft: 'auto' }, onClick: sync }, busy ? '同步中…' : '⬆ 同步到网站'), h('span', { style: T.btnGhost, onClick: loadShow }, '⟳ 刷新')),
        h('div', { style: { fontSize: '11px', color: sub, marginBottom: '12px' } }, '个人网站第一专栏「作品展示」——自动从货架已上架公开商品生成，展示封面/简介/版本/下载/渠道。可同步到个人网站。'),
        !show || !show.items.length ? h('div', { style: T.empty }, '暂无已上架公开商品。先在货架上架商品。') :
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '14px' } }, show.items.map(it => h('div', { key: it.id, style: { border: '1px solid ' + border, borderRadius: '10px', overflow: 'hidden', background: '#2a2a2a' } },
          (it.icon || it.cover) ? h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px', background: '#222', borderBottom: '1px solid ' + border } }, h('img', { src: it.icon || it.cover, alt: it.name, style: { height: '88px', width: '88px', objectFit: 'contain', borderRadius: '12px' } })) : null,
          h('div', { style: { padding: '12px' } },
            h('div', { style: { fontWeight: 700, fontSize: '14px', color: '#fff' } }, it.name, it.version ? h('span', { style: { fontSize: '11px', color: sub, fontWeight: 400 } }, ' v' + it.version) : null),
            h('div', { style: { fontSize: '12px', color: sub, margin: '6px 0', minHeight: '32px' } }, (it.description || '').slice(0, 60)),
            h('div', { style: { display: 'flex', gap: '12px', fontSize: '12px', color: sub } }, h('span', null, '⬇ ' + (it.metrics?.downloads ?? it.downloads ?? 0)), h('span', null, '👁 ' + (it.metrics?.views ?? 0)), h('span', null, '💬 ' + (it.metrics?.comments ?? 0)), h('span', null, it.channels.length + ' 渠道')),
            it.url ? h('a', { href: it.url, target: '_blank', rel: 'noreferrer', style: { color: BRAND, fontSize: '12px' } }, '查看项目 →') : null)))))
      const maintPanel = h('div', { style: T.panel },
        h('div', { style: T.panelTitle }, '🛡️ 网站维护监控', h('span', { style: { ...T.btn, marginLeft: 'auto' }, onClick: check }, busy ? '检查中…' : '检查证书/可用性')),
        h('div', { style: { fontSize: '11px', color: sub, marginBottom: '10px' } }, '监控 SSL 证书到期 + 网站可用性；到期前自动生成续期提醒。域名可配置——他人使用可替换为自己的网站。'),
        msg ? h('div', { style: { fontSize: '12px', color: sub, marginBottom: '8px' } }, msg) : null,
        sites.length === 0 ? h('div', { style: T.empty }, '尚未登记网站。下方输入你的网站 URL 添加。') :
        h('table', { style: T.table }, h('thead', null, h('tr', null, ['网站', '域名', 'SSL 证书', '剩余天数', 'HTTP', '响应', '状态'].map(x => h('th', { key: x, style: T.th }, x)))),
          h('tbody', null, sites.map(w => { const l = w.latest || {}; return h('tr', { key: w.id },
            h('td', { style: { ...T.td, fontWeight: 600 } }, w.name),
            h('td', { style: T.td }, h('a', { href: w.url, target: '_blank', rel: 'noreferrer', style: { color: BRAND } }, w.domain)),
            h('td', { style: T.td }, (l.certValidTo || '').slice(0, 10) || '—'),
            h('td', { style: { ...T.td, fontWeight: 800, color: certColor(l.certDaysLeft) } }, l.certDaysLeft ?? '—'),
            h('td', { style: T.td }, l.httpStatus || '—'),
            h('td', { style: T.td }, l.responseMs != null ? l.responseMs + 'ms' : '—'),
            h('td', { style: T.td }, l.ok ? h('span', { style: { color: C.listed } }, '✓ 正常') : h('span', { style: { color: C.rejected } }, (l.issues || []).join(',')))) }))),
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } },
          h('input', { style: { ...T.search, flex: 1 }, placeholder: '添加网站 URL（如 https://example.com）', value: url, onChange: e => setUrl(e.target.value) }),
          h('span', { style: T.btnGhost, onClick: add }, '＋ 添加网站')))
      return h('div', null, tabBar, tab === 'showcase' ? showcasePanel : maintPanel)
    }

    // ---- 主页面 ----
    function ShelfPage() {
      const { data, reload } = useData()
      const [page, setPage] = useState('dashboard')
      const [open, setOpen] = useState(null)
      const [scanOpen, setScanOpen] = useState(false)
      const [chImportOpen, setChImportOpen] = useState(false)
      const NAV = [['dashboard', '🏬', '店铺概况'], ['products', '🛒', '商品货架'], ['market', '📊', '市场情报'], ['website', '🌐', '个人网站'], ['channels', '🔌', '发布渠道'], ['settings', '⚙️', '设置']]
      const titles = { dashboard: '店铺概况', products: '商品货架', market: '市场情报', website: '个人网站', channels: '发布渠道', settings: '设置' }
      // The store already renders Chinese copy. Browser translation can replace React's text nodes before metrics arrive.
      return h('div', { style: T.app, lang: 'zh-CN', translate: 'no', className: 'notranslate' },
        h('div', { style: T.side },
          h('div', { style: T.shop }, h('div', { style: T.shopAvatar }, '🏪'), h('div', null, h('div', { style: { fontWeight: 700, fontSize: '14px' } }, '我的店铺'), h('div', { style: { fontSize: '11px', color: sub } }, '项目管家'))),
          NAV.map(([k, icon, label]) => h('div', { key: k, style: { ...T.navItem, ...(page === k ? { background: BRAND_SOFT, color: BRAND, fontWeight: 700 } : {}) }, onClick: () => setPage(k) }, h('span', null, icon), label)),
          h('div', { style: { ...T.navItem, marginTop: 'auto', color: sub }, onClick: reload }, '⟳ 刷新数据')),
        h('div', { style: T.body },
          h('div', { style: T.header }, h('span', { style: T.hTitle }, titles[page]), h('input', { style: T.search, placeholder: '搜索商品…（商品货架页可用）' }), h('span', { style: { ...T.btn, marginLeft: 'auto' }, onClick: () => setChImportOpen(true) }, '🔌 从发布渠道导入'), h('span', { style: T.btnGhost, onClick: () => setScanOpen(true) }, '纳管本地项目')),
          h('div', { style: T.content },
            page === 'dashboard' ? h(Dashboard, { data, goShelf: () => setPage('products') }) :
            page === 'products' ? h(ProductsPage, { data, onOpen: setOpen, onScan: () => setScanOpen(true) }) :
            page === 'market' ? h(MarketPage, { data, reload }) :
            page === 'website' ? h(WebsitePage) :
            page === 'settings' ? h(SettingsPage, { data }) : h(ChannelsPage, { data }))),
        open ? h(DetailDrawer, { p: open, onClose: () => setOpen(null) }) : null,
        scanOpen ? h(ScanDialog, { onClose: () => setScanOpen(false), onDone: reload }) : null,
        chImportOpen ? h(ChannelImportDialog, { onClose: () => setChImportOpen(false), onDone: reload }) : null)
    }

    function MiniBar({ ctx }) {
      const [sum, setSum] = useState(null), [ov, setOv] = useState(null)
      useEffect(() => { const load = async () => { try { setSum(await api('/project-steward/api/summary')); setOv(await api('/project-steward/api/overview')) } catch {} }; load(); const id = setInterval(load, 60000); return () => clearInterval(id) }, [])
      const t = sum?.totals || {}, anomalies = (ov?.anomalies || []).length
      const go = () => { try { ctx.layout.selectPanel('steward') } catch {} }
      return h('div', { style: T.mini, onClick: go, title: '点击打开项目管家店铺' },
        h('span', { style: { color: BRAND, fontWeight: 700 } }, '🏪 我的店铺'),
        h('span', null, '在售'), h('span', { style: T.miniNum }, ov?.counts?.listed ?? 0),
        h('span', null, '⬇'), h('span', { style: T.miniNum }, fmt(t.downloads)),
        h('span', null, '👁'), h('span', { style: T.miniNum }, fmt(t.views)),
        h('span', null, '💬'), h('span', { style: T.miniNum }, fmt(t.comments)),
        h('span', null, '💰'), h('span', { style: { ...T.miniNum, color: BRAND } }, money(t.revenue)),
        anomalies ? h('span', { style: { color: C.rejected, fontWeight: 800 } }, '⚠️' + anomalies) : null,
        h('span', { style: { marginLeft: 'auto', color: BRAND } }, '进入店铺 →'))
    }

    return {
      inject: ['slots', 'layout'],
      apply(ctx) {
        // 常驻方式与看板插件一致：注册 conversation.view 视图页签（不再用 input.dock 迷你条）
        ctx.slots.inject('conversation.view', () => ctx.slots.register({ name: 'conversation.view', id: 'steward-shelf', order: 0, label: () => '店铺' }, ShelfPage))
      },
    }
  },
})

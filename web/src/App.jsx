import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, useReactFlow,
} from '@xyflow/react'
import { api } from './api.js'
import { UNIT_TEMPLATES, TYPE_META, unitFromTemplate } from './nodeTemplates.js'
import { UnitNode } from './components/UnitNode.jsx'
import ModelPanel from './components/ModelPanel.jsx'
import { UnitInspector, SignalInspector } from './components/Inspector.jsx'
import RunLog from './components/RunLog.jsx'

const nodeTypes = { unit: UnitNode }
const REPLAY_STEP_MS = 320

export default function App() {
  const { screenToFlowPosition } = useReactFlow()

  /* ---------------- 全局状态 ---------------- */
  const [models, setModels] = useState([])
  const [flows, setFlows] = useState([])
  const [flowId, setFlowId] = useState(null)
  const [flowName, setFlowName] = useState('')

  const [units, setUnits] = useState([])           // 控制单元（工作区）
  const [signals, setSignals] = useState([])       // 信号（工作区）
  const [runtimeStates, setRuntimeStates] = useState({})
  const [selection, setSelection] = useState(null) // {kind:'unit'|'signal', id}
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [triggering, setTriggering] = useState(false)

  const [logEvents, setLogEvents] = useState([])
  const [logOpen, setLogOpen] = useState(true)
  const [flashNodes, setFlashNodes] = useState(new Set())
  const [activeEdges, setActiveEdges] = useState(new Set())

  const [modelModal, setModelModal] = useState({ open: false, modelId: null })

  const initialStates = useRef(new Set()) // 本次触发中已迁移过的单元（保留迁移后状态显示）

  /* ---------------- 初始化加载 ---------------- */
  useEffect(() => {
    ;(async () => {
      try {
        const [ms, fs] = await Promise.all([api.listModels(), api.listFlows()])
        setModels(ms)
        setFlows(fs)
        if (fs.length) loadFlow(fs[0].id)
      } catch (e) {
        alert('加载失败: ' + e.message)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadFlow(id) {
    try {
      const f = await api.getFlow(id)
      setFlowId(f.id)
      setFlowName(f.name)
      setUnits(f.nodes)
      setSignals(f.signals)
      setRuntimeStates(f.runtimeStates ?? {})
      setSelection(null)
      setLogEvents([])
      setDirty(false)
    } catch (e) {
      alert('加载流程失败: ' + e.message)
    }
  }

  /* ---------------- 单元/信号编辑（松耦合：单元只管自身端口） ---------------- */

  // 单元属性变更：级联清理引用已删除端口的信号
  const applyUnitChange = useCallback((nextUnit) => {
    setUnits((us) => {
      const old = us.find((u) => u.id === nextUnit.id)
      if (old) {
        const oldPortIds = new Set([...(old.ports?.in ?? []), ...(old.ports?.out ?? [])].map((p) => p.id))
        const newPortIds = new Set([...(nextUnit.ports?.in ?? []), ...(nextUnit.ports?.out ?? [])].map((p) => p.id))
        const removed = [...oldPortIds].filter((p) => !newPortIds.has(p))
        if (removed.length) {
          setSignals((ss) => ss.filter((s) => !removed.includes(s.from.portId) && !removed.includes(s.to.portId)))
        }
        // 模型切换 -> 运行时状态复位到新模型初始态
        if (old.modelId !== nextUnit.modelId) {
          setRuntimeStates((rs) => {
            const next = { ...rs }
            const m = models.find((mm) => mm.id === nextUnit.modelId)
            const st = m?.states.find((s) => s.initial) ?? m?.states[0]
            next[nextUnit.id] = st?.id ?? null
            return next
          })
        }
      }
      return us.map((u) => (u.id === nextUnit.id ? nextUnit : u))
    })
    setDirty(true)
  }, [models])

  const applySignalChange = useCallback((next) => {
    setSignals((ss) => ss.map((s) => (s.id === next.id ? next : s)))
    setDirty(true)
  }, [])

  const removeSignal = useCallback((id) => {
    setSignals((ss) => ss.filter((s) => s.id !== id))
    setSelection(null)
    setDirty(true)
  }, [])

  /* ---------------- React Flow 画布交互 ---------------- */

  const onConnect = useCallback((params) => {
    setSignals((ss) => [
      ...ss,
      {
        id: `sg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: `信号 ${ss.length + 1}`,
        from: { nodeId: params.source, portId: params.sourceHandle },
        to: { nodeId: params.target, portId: params.targetHandle },
        message: { event: '', payload: {} },
      },
    ])
    setDirty(true)
  }, [])

  const onNodesChange = useCallback((changes) => {
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position) {
        setUnits((us) => us.map((u) => (u.id === ch.id ? { ...u, x: ch.position.x, y: ch.position.y } : u)))
        setDirty(true)
      } else if (ch.type === 'remove') {
        removeUnitsCascade([ch.id])
      }
    }
  }, [])

  const onEdgesChange = useCallback((changes) => {
    for (const ch of changes) {
      if (ch.type === 'remove') {
        setSignals((ss) => ss.filter((s) => s.id !== ch.id))
        setSelection((sel) => (sel?.kind === 'signal' && sel.id === ch.id ? null : sel))
        setDirty(true)
      }
    }
  }, [])

  function removeUnitsCascade(ids) {
    const idSet = new Set(ids)
    setUnits((us) => us.filter((u) => !idSet.has(u.id)))
    setSignals((ss) => ss.filter((s) => !idSet.has(s.from.nodeId) && !idSet.has(s.to.nodeId)))
    setSelection((sel) => (sel?.kind === 'unit' && idSet.has(sel.id) ? null : sel))
    setDirty(true)
  }

  const onDrop = useCallback((e) => {
    e.preventDefault()
    const tplIdx = e.dataTransfer.getData('application/icontroller-unit')
    if (tplIdx === '') return
    const tpl = UNIT_TEMPLATES[Number(tplIdx)]
    if (!tpl) return
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const unit = unitFromTemplate(tpl, pos.x - 110, pos.y - 40)
    setUnits((us) => [...us, unit])
    setDirty(true)
  }, [screenToFlowPosition])

  /* ---------------- 保存 / 序列化 ---------------- */

  function serializeFlow() {
    return {
      name: flowName || '未命名流程',
      nodes: units.map((u) => ({
        id: u.id, type: u.type, name: u.name, x: Math.round(u.x), y: Math.round(u.y),
        modelId: u.modelId ?? null,
        ports: u.ports,
        behavior: u.behavior ?? { autoForward: true },
      })),
      signals: signals.map((s) => {
        let payload = s.message?.payload ?? {}
        const text = s.message?.payloadText
        if (text !== undefined && text !== '') {
          try { payload = JSON.parse(text) } catch { /* 保留原值 */ }
        }
        return {
          id: s.id, name: s.name || '未命名信号',
          from: s.from, to: s.to,
          message: { event: s.message?.event ?? '', payload },
        }
      }),
    }
  }

  async function saveFlowInternal() {
    if (!flowId) return
    const f = await api.updateFlow(flowId, serializeFlow())
    setDirty(false)
    refreshFlows()
    return f
  }

  async function handleSave() {
    if (!flowId || saving) return
    setSaving(true)
    try {
      await saveFlowInternal()
    } catch (e) {
      alert('保存失败: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function refreshFlows() {
    try { setFlows(await api.listFlows()) } catch { /* 忽略 */ }
  }

  /* ---------------- 消息传递：触发 + 事件回放动画 ---------------- */

  const handleTrigger = useCallback(async (nodeId, portId) => {
    if (!flowId || triggering) return
    setTriggering(true)
    setLogOpen(true)
    try {
      await saveFlowInternal() // 触发前先保存，保证后端引擎使用最新图
      const res = await api.trigger(flowId, { nodeId, portId })
      setRuntimeStates(res.runtimeStates)
      await replayEvents(res.events)
    } catch (e) {
      alert('触发失败: ' + e.message)
    } finally {
      setTriggering(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId, triggering, flowName, units, signals])

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  async function replayEvents(events) {
    initialStates.current = new Set(Object.entries(runtimeStates).filter(([, v]) => v).map(([k]) => k))
    for (const ev of events) {
      setLogEvents((ls) => [...ls, ev])
      if (ev.type === 'transmit' && ev.signalId) {
        setActiveEdges((s) => new Set(s).add(ev.signalId))
      } else if (ev.type === 'receive' && ev.nodeId) {
        setFlashNodes((s) => new Set(s).add(ev.nodeId))
      }
      await sleep(REPLAY_STEP_MS)
    }
    await sleep(600)
    setActiveEdges(new Set())
    setFlashNodes(new Set())
  }

  async function handleResetRuntime() {
    if (!flowId) return
    try {
      const res = await api.resetRuntime(flowId)
      setRuntimeStates(res.runtimeStates)
      setLogEvents((ls) => [...ls, { type: 'trigger', ts: new Date().toISOString(), detail: '已复位所有单元的模型状态' }])
    } catch (e) {
      alert('复位失败: ' + e.message)
    }
  }

  /* ---------------- 模型导出（JSON / XML） ---------------- */

  function downloadBlob({ blob, filename }) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleExportModel = useCallback(async (modelId, format) => {
    try {
      downloadBlob(await api.exportModel(modelId, format))
    } catch (e) {
      alert('导出失败: ' + e.message)
    }
  }, [])

  const handleExportAllModels = useCallback(async (format) => {
    try {
      downloadBlob(await api.exportAllModels(format))
    } catch (e) {
      alert('导出失败: ' + e.message)
    }
  }, [])

  /* ---------------- 流程管理 ---------------- */

  async function handleNewFlow() {
    const name = prompt('新流程名称：', `流程 ${flows.length + 1}`)
    if (name === null) return
    try {
      const f = await api.createFlow({ name, nodes: [], signals: [] })
      await refreshFlows()
      loadFlow(f.id)
    } catch (e) {
      alert('创建失败: ' + e.message)
    }
  }

  /* ---------------- 派生的 React Flow 节点/边 ---------------- */

  const rfNodes = useMemo(() => {
    return units.map((u) => {
      const model = models.find((m) => m.id === u.modelId)
      const stateId = runtimeStates[u.id]
      const stateName = model ? (model.states.find((s) => s.id === stateId)?.name ?? null) : null
      return {
        id: u.id,
        type: 'unit',
        position: { x: u.x, y: u.y },
        selected: selection?.kind === 'unit' && selection.id === u.id,
        data: {
          unit: u,
          modelName: model?.name ?? null,
          stateName,
          flash: flashNodes.has(u.id),
          onTrigger: handleTrigger,
        },
      }
    })
  }, [units, models, runtimeStates, selection, flashNodes, handleTrigger])

  const rfEdges = useMemo(() => {
    return signals.map((s) => {
      const event = s.message?.event
      return {
        id: s.id,
        source: s.from.nodeId,
        sourceHandle: s.from.portId,
        target: s.to.nodeId,
        targetHandle: s.to.portId,
        animated: activeEdges.has(s.id),
        className: activeEdges.has(s.id) ? 'edge-msg' : '',
        selected: selection?.kind === 'signal' && selection.id === s.id,
        label: event ? `${s.name} [${event}]` : s.name,
        labelShowBg: true,
        labelBgPadding: [4, 2],
        data: { signal: s },
      }
    })
  }, [signals, selection, activeEdges])

  /* ---------------- 键盘快捷键 ---------------- */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const selectedUnit = selection?.kind === 'unit' ? units.find((u) => u.id === selection.id) : null
  const selectedSignal = selection?.kind === 'signal' ? signals.find((s) => s.id === selection.id) : null

  return (
    <div className="app-shell">
      {/* ---------- 顶栏 ---------- */}
      <header className="topbar">
        <div className="brand">
          <span className="logo">icontrol</span>
          <span className="sub">控制流编排 · 松耦合单元 / 控制模型 / 信号消息传递</span>
        </div>
        <div className="topbar-center">
          <select value={flowId ?? ''} onChange={(e) => loadFlow(e.target.value)} title="切换流程">
            <option value="" disabled>选择流程…</option>
            {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <input
            className="flow-name"
            value={flowName}
            onChange={(e) => { setFlowName(e.target.value); setDirty(true) }}
            placeholder="流程名称"
          />
          <button className="btn primary" onClick={handleSave} disabled={!flowId || saving}>
            {saving ? '保存中…' : dirty ? '● 保存' : '保存'}
          </button>
          <button className="btn" onClick={handleResetRuntime} disabled={!flowId} title="复位所有单元的模型状态">⟲ 复位状态</button>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={handleNewFlow}>＋ 新建流程</button>
        </div>
      </header>

      <div className="main-area">
        {/* ---------- 左侧：单元库 + 控制模型 ---------- */}
        <aside className="sidebar">
          <section>
            <div className="side-title">📦 控制单元库</div>
            <div className="hint" style={{ margin: '4px 0 8px' }}>拖拽到画布添加，端口与属性可在右侧编辑</div>
            <div className="palette">
              {UNIT_TEMPLATES.map((t, i) => (
                <div
                  key={t.type}
                  className="palette-item"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/icontroller-unit', String(i))
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                >
                  <span className="pi-emoji">{t.emoji}</span>
                  <div className="pi-text">
                    <div className="pi-label">{t.label}</div>
                    <div className="pi-desc">{t.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="side-title row">
              <span>🧩 控制模型</span>
              <button className="btn small" onClick={() => setModelModal({ open: true, modelId: '__new__' })}>＋ 新建</button>
            </div>
            <div className="hint" style={{ margin: '4px 0 8px' }}>独立于单元：状态机 + 数据结构设定</div>
            <div className="model-list">
              {models.map((m) => (
                <div key={m.id} className="model-item">
                  <div className="mi-main" onClick={() => setModelModal({ open: true, modelId: m.id })}>
                    <div className="mi-name">{m.name}</div>
                    <div className="mi-meta">{m.states.length} 状态 · {m.dataSchema.length} 字段 · {m.transitions.length} 迁移</div>
                  </div>
                  <div className="mi-export">
                    <button className="btn small ghost" title={`导出 ${m.name} 为 JSON`} onClick={() => handleExportModel(m.id, 'json')}>⬇JSON</button>
                    <button className="btn small ghost" title={`导出 ${m.name} 为 XML`} onClick={() => handleExportModel(m.id, 'xml')}>⬇XML</button>
                  </div>
                </div>
              ))}
              {!models.length && <div className="empty-tip">尚无模型，点击「新建」创建</div>}
            </div>
            {models.length > 0 && (
              <div className="export-all-row">
                <span className="hint">导出全部模型：</span>
                <button className="btn small" onClick={() => handleExportAllModels('json')}>⬇ JSON</button>
                <button className="btn small" onClick={() => handleExportAllModels('xml')}>⬇ XML</button>
              </div>
            )}
          </section>
        </aside>

        {/* ---------- 中部：画布 ---------- */}
        <div className="canvas-wrap" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelection({ kind: 'unit', id: node.id })}
            onEdgeClick={(_, edge) => setSelection({ kind: 'signal', id: edge.id })}
            onPaneClick={() => setSelection(null)}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={2}
            connectionLineStyle={{ stroke: '#7c6cf0', strokeWidth: 2 }}
            defaultEdgeOptions={{ type: 'smoothstep', style: { stroke: '#9aa4b2', strokeWidth: 2 } }}
          >
            <Background gap={18} size={1} color="#e2e6ee" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => (n.data.modelName ? '#7c6cf0' : '#c3cad6')} />
          </ReactFlow>
          {!units.length && (
            <div className="canvas-empty-hint">
              从左侧拖拽控制单元到此处 · 从输出端口拖出连线到下游输入端口即建立信号
            </div>
          )}
        </div>

        {/* ---------- 右侧：属性面板 ---------- */}
        <aside className="inspector">
          <div className="side-title">🛠 属性面板</div>
          {selectedUnit && (
            <UnitInspector
              unit={selectedUnit}
              models={models}
              runtimeStates={runtimeStates}
              onChange={applyUnitChange}
              onTrigger={handleTrigger}
            />
          )}
          {selectedSignal && (
            <SignalInspector
              signal={selectedSignal}
              units={units}
              onChange={applySignalChange}
              onDelete={() => removeSignal(selectedSignal.id)}
            />
          )}
          {!selectedUnit && !selectedSignal && (
            <div className="empty-tip" style={{ padding: 16 }}>
              点击画布中的单元或信号进行编辑。<br /><br />
              💡 一个输出端口可连接多条信号（一控多）；<br />
              💡 单元绑定控制模型后，收到消息将按事件迁移状态；<br />
              💡 点击端口 ⚡ 触发消息传递，观察日志与动画。
            </div>
          )}
        </aside>
      </div>

      {/* ---------- 底部：消息传递日志 ---------- */}
      <RunLog events={logEvents} open={logOpen} onToggle={() => setLogOpen(!logOpen)} onClear={() => setLogEvents([])} />

      {/* ---------- 模型编辑弹窗 ---------- */}
      <ModelPanel
        open={modelModal.open}
        modelId={modelModal.modelId}
        models={models}
        onClose={() => setModelModal({ open: false, modelId: null })}
        onSaved={(m) => setModels((ms) => ms.map((x) => (x.id === m.id ? m : x)))}
        onModelAdded={(m) => setModels((ms) => [...ms, m])}
        onExport={handleExportModel}
      />
    </div>
  )
}

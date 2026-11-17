import { TYPE_META, uid } from '../nodeTemplates.js'

/**
 * 右侧属性面板：选中单元 / 信号时编辑其属性
 */
export function UnitInspector({ unit, models, runtimeStates, onChange, onTrigger }) {
  if (!unit) return null
  const model = models.find((m) => m.id === unit.modelId)
  const stateName = model
    ? (model.states.find((s) => s.id === runtimeStates[unit.id])?.name ?? '未初始化')
    : null

  const patch = (p) => onChange({ ...unit, ...p })
  const patchPorts = (kind, ports) => patch({ ports: { ...unit.ports, [kind]: ports } })
  const addPort = (kind) =>
    patchPorts(kind, [...unit.ports[kind], { id: uid(kind === 'in' ? 'pin' : 'pout'), name: '新端口' }])
  const removePort = (kind, id) => {
    const ports = unit.ports[kind].filter((p) => p.id !== id)
    patchPorts(kind, ports)
  }
  const renamePort = (kind, id, name) =>
    patchPorts(kind, unit.ports[kind].map((p) => (p.id === id ? { ...p, name } : p)))

  return (
    <div className="inspector-body">
      <h4 className="insp-title">🎛 控制单元</h4>
      <div className="form-grid">
        <label>名称</label>
        <input value={unit.name} onChange={(e) => patch({ name: e.target.value })} />
        <label>类型</label>
        <span className="readonly">{TYPE_META[unit.type]?.label ?? unit.type}</span>
        <label>绑定控制模型</label>
        <select value={unit.modelId ?? ''} onChange={(e) => patch({ modelId: e.target.value || null })}>
          <option value="">（不绑定）</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {model && stateName && (
          <>
            <label>当前状态</label>
            <span className="readonly state-badge">{stateName}</span>
          </>
        )}
        <label>收到消息后转发</label>
        <label className="switch">
          <input
            type="checkbox"
            checked={unit.behavior?.autoForward !== false}
            onChange={(e) => patch({ behavior: { ...unit.behavior, autoForward: e.target.checked } })}
          />
          <span>{unit.behavior?.autoForward !== false ? '自动向下游信号广播' : '不转发（末端）'}</span>
        </label>
      </div>

      <section>
        <div className="section-head">
          <h4>输入端口</h4>
          <button className="btn small" onClick={() => addPort('in')}>+</button>
        </div>
        {unit.ports.in.map((p) => (
          <div className="port-edit-row" key={p.id}>
            <span className="port-dot in">●</span>
            <input value={p.name} onChange={(e) => renamePort('in', p.id, e.target.value)} />
            <button className="btn small danger" onClick={() => removePort('in', p.id)}>删</button>
          </div>
        ))}
        {!unit.ports.in.length && <div className="empty-tip">无输入端口</div>}
      </section>

      <section>
        <div className="section-head">
          <h4>输出端口</h4>
          <button className="btn small" onClick={() => addPort('out')}>+</button>
        </div>
        {unit.ports.out.map((p) => (
          <div className="port-edit-row" key={p.id}>
            <span className="port-dot out">●</span>
            <input value={p.name} onChange={(e) => renamePort('out', p.id, e.target.value)} />
            <button className="btn small danger" onClick={() => removePort('out', p.id)}>删</button>
          </div>
        ))}
        {!unit.ports.out.length && <div className="empty-tip">无输出端口</div>}
      </section>

      {unit.ports.out.length > 0 && (
        <section className="trigger-zone">
          <div className="section-head"><h4>触发消息传递</h4></div>
          <div className="hint">点击端口上的 ⚡ 或下方按钮，后端引擎将沿信号向所有下游单元传递消息。</div>
          <div className="trigger-btns">
            {unit.ports.out.map((p) => (
              <button key={p.id} className="btn primary small" onClick={() => onTrigger(unit.id, p.id)}>
                ⚡ 触发「{p.name}」
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export function SignalInspector({ signal, units, onChange, onDelete }) {
  if (!signal) return null
  const fromUnit = units.find((n) => n.id === signal.from.nodeId)
  const toUnit = units.find((n) => n.id === signal.to.nodeId)
  const patch = (p) => onChange({ ...signal, ...p })

  return (
    <div className="inspector-body">
      <h4 className="insp-title">🔗 信号</h4>
      <div className="signal-path">
        <span>{fromUnit?.name ?? '?'} · {signal.from.portId}</span>
        <span className="arrow">→</span>
        <span>{toUnit?.name ?? '?'} · {signal.to.portId}</span>
      </div>
      <div className="form-grid">
        <label>信号名称</label>
        <input value={signal.name} onChange={(e) => patch({ name: e.target.value })} />
        <label>传递事件(event)</label>
        <input
          value={signal.message?.event ?? ''}
          onChange={(e) => patch({ message: { ...signal.message, event: e.target.value } })}
          placeholder="如 high_temp，决定下游模型状态迁移"
        />
        <label>默认载荷(JSON)</label>
        <textarea
          rows="4"
          value={signal.message?.payloadText ?? JSON.stringify(signal.message?.payload ?? {}, null, 2)}
          onChange={(e) =>
            patch({ message: { ...signal.message, payloadText: e.target.value } })
          }
          placeholder='{"temperature": 30}'
        />
      </div>
      <div className="hint">
        事件为空时使用触发方传入的事件；载荷将在投递时合并到消息体中。
      </div>
      <div className="danger-zone">
        <button className="btn danger small" onClick={onDelete}>删除该信号</button>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { uid } from '../nodeTemplates.js'

const FIELD_TYPES = ['string', 'number', 'boolean', 'object', 'array']

/**
 * 控制模型管理：
 *  - 模型独立于控制单元存在
 *  - 状态机：一个或多个状态（含初始态）+ 事件驱动的迁移规则
 *  - 数据结构：字段名 / 类型 / 说明
 */
export default function ModelPanel({ open, modelId, models, onClose, onSaved, onModelAdded, onExport }) {
  const [form, setForm] = useState(null)
  const isNew = modelId === '__new__'

  useEffect(() => {
    if (!open) return
    const m = models.find((x) => x.id === modelId)
    setForm(
      isNew
        ? { name: '', description: '', states: [{ id: uid('st'), name: '初始态', initial: true }], transitions: [], dataSchema: [] }
        : structuredClone(m),
    )
  }, [open, modelId, models, isNew])

  if (!open || !form) return null

  const patch = (p) => setForm({ ...form, ...p })

  /* 状态操作 */
  const addState = () =>
    patch({ states: [...form.states, { id: uid('st'), name: `状态${form.states.length + 1}`, initial: false }] })
  const setState = (id, p) =>
    patch({ states: form.states.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  const removeState = (id) =>
    patch({ states: form.states.filter((s) => s.id !== id), transitions: form.transitions.filter((t) => t.from !== id && t.to !== id) })
  const setInitial = (id) => patch({ states: form.states.map((s) => ({ ...s, initial: s.id === id })) })

  /* 迁移规则操作 */
  const addTransition = () =>
    patch({
      transitions: [
        ...form.transitions,
        { id: uid('tr'), from: form.states[0]?.id ?? '', event: '', to: form.states[1]?.id ?? form.states[0]?.id ?? '' },
      ],
    })
  const setTransition = (id, p) =>
    patch({ transitions: form.transitions.map((t) => (t.id === id ? { ...t, ...p } : t)) })
  const removeTransition = (id) => patch({ transitions: form.transitions.filter((t) => t.id !== id) })

  /* 数据结构操作 */
  const addField = () => patch({ dataSchema: [...form.dataSchema, { name: '', type: 'string', desc: '' }] })
  const setField = (i, p) =>
    patch({ dataSchema: form.dataSchema.map((f, j) => (j === i ? { ...f, ...p } : f)) })
  const removeField = (i) => patch({ dataSchema: form.dataSchema.filter((_, j) => j !== i) })

  const stateName = (id) => form.states.find((s) => s.id === id)?.name ?? '?'

  const handleSave = async () => {
    const cleaned = {
      name: form.name.trim() || '未命名模型',
      description: form.description,
      states: form.states.filter((s) => s.name.trim()),
      transitions: form.transitions.filter((t) => t.event.trim() && t.from && t.to),
      dataSchema: form.dataSchema.filter((f) => f.name.trim()),
    }
    if (!cleaned.states.length) return alert('至少需要一个状态')
    try {
      const saved = isNew ? await api.createModel(cleaned) : await api.updateModel(modelId, cleaned)
      onSaved(saved)
      if (isNew) onModelAdded?.(saved)
      onClose()
    } catch (e) {
      alert('保存失败: ' + e.message)
    }
  }

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal model-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{isNew ? '新建控制模型' : '编辑控制模型'}</h3>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <label>模型名称</label>
            <input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="如：温度控制器" />
            <label>说明</label>
            <input value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder="模型职责描述" />
          </div>

          <section>
            <div className="section-head">
              <h4>状态机 <span className="hint">一个或多个状态，单元接收消息后按事件迁移</span></h4>
              <button className="btn small" onClick={addState}>+ 状态</button>
            </div>
            <div className="table-head cols-state">
              <span>状态名称</span><span>初始态</span><span></span>
            </div>
            {form.states.map((s) => (
              <div className="table-row cols-state" key={s.id}>
                <input value={s.name} onChange={(e) => setState(s.id, { name: e.target.value })} />
                <input type="radio" name="initial" checked={!!s.initial} onChange={() => setInitial(s.id)} title="设为初始状态" />
                <button className="btn small danger" onClick={() => removeState(s.id)}>删除</button>
              </div>
            ))}
          </section>

          <section>
            <div className="section-head">
              <h4>迁移规则 <span className="hint">当前状态 + 事件 → 目标状态</span></h4>
              <button className="btn small" onClick={addTransition}>+ 规则</button>
            </div>
            <div className="table-head cols-tr">
              <span>当前状态</span><span>事件(event)</span><span>目标状态</span><span></span>
            </div>
            {form.transitions.map((t) => (
              <div className="table-row cols-tr" key={t.id}>
                <select value={t.from} onChange={(e) => setTransition(t.id, { from: e.target.value })}>
                  {form.states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input value={t.event} onChange={(e) => setTransition(t.id, { event: e.target.value })} placeholder="如 high_temp" />
                <select value={t.to} onChange={(e) => setTransition(t.id, { to: e.target.value })}>
                  {form.states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button className="btn small danger" onClick={() => removeTransition(t.id)}>删除</button>
              </div>
            ))}
            {!form.transitions.length && <div className="empty-tip">暂无迁移规则：收到消息时状态保持不变</div>}
          </section>

          <section>
            <div className="section-head">
              <h4>数据结构设定 <span className="hint">模型提供的字段定义，随消息向下游传递</span></h4>
              <button className="btn small" onClick={addField}>+ 字段</button>
            </div>
            <div className="table-head cols-schema">
              <span>字段名</span><span>类型</span><span>说明</span><span></span>
            </div>
            {form.dataSchema.map((f, i) => (
              <div className="table-row cols-schema" key={i}>
                <input value={f.name} onChange={(e) => setField(i, { name: e.target.value })} placeholder="如 temperature" />
                <select value={f.type} onChange={(e) => setField(i, { type: e.target.value })}>
                  {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input value={f.desc} onChange={(e) => setField(i, { desc: e.target.value })} placeholder="字段说明" />
                <button className="btn small danger" onClick={() => removeField(i)}>删除</button>
              </div>
            ))}
            {!form.dataSchema.length && <div className="empty-tip">暂无数据结构字段</div>}
          </section>

          <div className="modal-preview">
            <span className="hint">状态流预览：</span>
            {form.transitions.filter((t) => t.event.trim()).map((t) => (
              <span key={t.id} className="tr-chip">{stateName(t.from)} —[{t.event}]→ {stateName(t.to)}</span>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          {!isNew && (
            <div className="export-group">
              <span className="hint">导出此模型：</span>
              <button className="btn small" onClick={() => onExport?.(modelId, 'json')}>⬇ JSON</button>
              <button className="btn small" onClick={() => onExport?.(modelId, 'xml')}>⬇ XML</button>
            </div>
          )}
          <div className="foot-spacer" />
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={handleSave}>保存模型</button>
        </div>
      </div>
    </div>
  )
}

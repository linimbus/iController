import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { TYPE_META } from '../nodeTemplates.js'

/**
 * 控制单元节点：
 *  - 左侧输入端口 / 右侧输出端口（端口可多个）
 *  - 绑定的控制模型 + 当前运行状态徽标
 *  - 每个输出端口可独立触发（⚡）消息传递
 */
function UnitNodeInner({ data, selected }) {
  const { unit, modelName, stateName, flash, onTrigger } = data
  const meta = TYPE_META[unit.type] ?? { label: unit.type, emoji: '🔸' }

  return (
    <div className={`unit-node type-${unit.type} ${selected ? 'is-selected' : ''} ${flash ? 'is-flash' : ''}`}>
      <div className="unit-head">
        <span className="unit-emoji">{meta.emoji}</span>
        <span className="unit-name" title={unit.name}>{unit.name}</span>
      </div>
      <div className="unit-meta">
        {modelName ? (
          <span className="unit-model" title={`控制模型: ${modelName}`}>🧩 {modelName}</span>
        ) : (
          <span className="unit-model none">未绑定模型</span>
        )}
        {modelName && stateName && <span className="unit-state">◉ {stateName}</span>}
      </div>
      <div className="unit-ports">
        {(unit.ports?.in ?? []).length === 0 && (unit.ports?.out ?? []).length === 0 && (
          <div className="port-empty">（无端口，可在属性面板添加）</div>
        )}
        {(unit.ports?.in ?? []).map((p) => (
          <div className="port-row in" key={p.id}>
            <Handle type="target" position={Position.Left} id={p.id} className="port-handle" />
            <span className="port-label">{p.name}</span>
          </div>
        ))}
        {(unit.ports?.out ?? []).map((p) => (
          <div className="port-row out" key={p.id}>
            <Handle type="source" position={Position.Right} id={p.id} className="port-handle" />
            <span className="port-label">{p.name}</span>
            <button
              className="trigger-btn"
              title={`触发「${p.name}」端口，向所有下游信号传递消息`}
              onClick={(e) => {
                e.stopPropagation()
                onTrigger?.(unit.id, p.id)
              }}
            >
              ⚡
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export const UnitNode = memo(UnitNodeInner)

import { getModel } from './store.js'

/**
 * 信号消息传递引擎
 *
 * 松耦合语义：
 *  - 控制单元之间不存在直接引用，消息只沿着「信号」实体流动
 *  - 一个输出端口可以挂多条信号（一控多），消息会同时投递到所有下游
 *  - 接收单元按其绑定的「控制模型」响应消息：
 *      1. 查询模型状态机：当前状态 + 消息事件 -> 状态迁移
 *      2. 若开启自动转发，消息（附带模型数据结构快照）继续向下游信号传播
 *
 * 防风暴：单次触发的最大跳数 / 单元最大接收次数有上限，防止信号环路。
 */

const MAX_HOPS = 16            // 单条消息最大传播跳数
const MAX_NODE_RECEIVES = 8    // 单次触发中单个单元最大接收次数
const MAX_EVENTS = 500         // 事件上限（保护前端日志）

let msgSeq = 0
let evSeq = 0

export function triggerSignal(flow, { nodeId, portId, payload = {}, event = '' }) {
  const events = []
  const nodeReceives = new Map()
  const snapshotBefore = { ...flow.runtimeStates }

  const node = flow.nodes.find((n) => n.id === nodeId)
  if (!node) {
    return { error: `控制单元不存在: ${nodeId}`, events }
  }
  const port = (node.ports?.out ?? []).find((p) => p.id === portId)
    ?? (node.ports?.in ?? []).find((p) => p.id === portId)
  if (!port) {
    return { error: `端口不存在: ${nodeId}/${portId}`, events }
  }

  emit(events, 'trigger', {
    nodeId, portId,
    detail: `手动触发 [${node.name}] 的端口「${port.name}」`,
  })

  // BFS 队列：{ 发起单元, 发起输出端口, 消息体, 跳数 }
  const queue = [{ nodeId, portId, payload, event, hops: 0 }]

  while (queue.length && events.length < MAX_EVENTS) {
    const item = queue.shift()
    // 从该输出端口出发的所有信号（一对多：全部投递）
    const outSignals = flow.signals.filter(
      (s) => s.from.nodeId === item.nodeId && s.from.portId === item.portId,
    )
    for (const signal of outSignals) {
      const toNode = flow.nodes.find((n) => n.id === signal.to.nodeId)
      if (!toNode) {
        emit(events, 'warn', { signalId: signal.id, detail: `信号「${signal.name}」的目标单元已不存在` })
        continue
      }
      const msgId = `msg_${++msgSeq}`

      emit(events, 'transmit', {
        msgId, signalId: signal.id,
        from: { nodeId: item.nodeId, portId: item.portId },
        to: { nodeId: toNode.id, portId: signal.to.portId },
        detail: `信号「${signal.name}」: [${nodeName(flow, item.nodeId)}] → [${toNode.name}]`,
      })

      // 跳数与接收次数保护
      if (item.hops >= MAX_HOPS) {
        emit(events, 'warn', { msgId, nodeId: toNode.id, detail: `已达最大跳数 ${MAX_HOPS}，停止传播` })
        continue
      }
      const recv = (nodeReceives.get(toNode.id) ?? 0) + 1
      nodeReceives.set(toNode.id, recv)
      if (recv > MAX_NODE_RECEIVES) {
        emit(events, 'warn', { msgId, nodeId: toNode.id, detail: `[${toNode.name}] 接收次数超限，疑似信号环路` })
        continue
      }

      // ---- 消息到达：按控制模型响应 ----
      const model = toNode.modelId ? getModel(toNode.modelId) : null
      const msgEvent = signal.message?.event || item.event
      const receivedPayload = { ...(signal.message?.payload ?? {}), ...item.payload }
      let stateChanged = null

      if (model) {
        const currentStateId = flow.runtimeStates[toNode.id] ?? null
        const currentState = model.states.find((s) => s.id === currentStateId)
        const transition = model.transitions.find(
          (t) => t.from === currentStateId && t.event === msgEvent,
        )
        emit(events, 'receive', {
          msgId, nodeId: toNode.id, signalId: signal.id,
          detail: `[${toNode.name}] 收到消息（事件: ${msgEvent || '(空)'}），当前状态: ${currentState?.name ?? '无'}`,
        })
        if (transition) {
          const nextState = model.states.find((s) => s.id === transition.to)
          if (nextState) {
            flow.runtimeStates[toNode.id] = nextState.id
            stateChanged = { from: currentState?.name, to: nextState.name }
            emit(events, 'state', {
              msgId, nodeId: toNode.id,
              detail: `[${toNode.name}] 状态迁移: ${currentState?.name ?? '无'} --[${msgEvent}]--> ${nextState.name}`,
            })
          }
        }
      } else {
        emit(events, 'receive', {
          msgId, nodeId: toNode.id, signalId: signal.id,
          detail: `[${toNode.name}] 收到消息（事件: ${msgEvent || '(空)'}），未绑定控制模型`,
        })
      }

      // ---- 自动转发（松耦合一控多的关键：向自己的所有输出端口广播）----
      if (toNode.behavior?.autoForward !== false) {
        const forwardPayload = enrichPayload(toNode, model, flow, receivedPayload)
        for (const outPort of toNode.ports?.out ?? []) {
          const downstream = flow.signals.some(
            (s) => s.from.nodeId === toNode.id && s.from.portId === outPort.id,
          )
          if (downstream) {
            queue.push({
              nodeId: toNode.id,
              portId: outPort.id,
              payload: forwardPayload,
              event: msgEvent,
              hops: item.hops + 1,
            })
          }
        }
      }
      void stateChanged
    }
  }

  return { events, runtimeStates: flow.runtimeStates, snapshotBefore }
}

function enrichPayload(node, model, flow, base) {
  if (!model) return base
  const state = model.states.find((s) => s.id === flow.runtimeStates[node.id])
  return {
    ...base,
    _model: model.name,
    _state: state?.name ?? null,
    _data: Object.fromEntries(
      (model.dataSchema ?? []).map((f) => [f.name, base[f.name] ?? defaultValueOf(f.type)]),
    ),
  }
}

function defaultValueOf(type) {
  switch (type) {
    case 'number': return 0
    case 'boolean': return false
    case 'object': return {}
    case 'array': return []
    default: return ''
  }
}

function nodeName(flow, id) {
  return flow.nodes.find((n) => n.id === id)?.name ?? id
}

function emit(events, type, data) {
  events.push({ seq: ++evSeq, ts: new Date().toISOString(), type, ...data })
}

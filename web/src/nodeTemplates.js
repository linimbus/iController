/**
 * 单元库模板：控制单元的类型预设
 * 端口可在右侧属性面板继续增删改
 */
export const UNIT_TEMPLATES = [
  {
    type: 'source',
    label: '数据源单元',
    emoji: '📡',
    desc: '无输入，向外发出事件（触发源头）',
    ports: { in: [], out: [{ name: '输出' }] },
  },
  {
    type: 'processor',
    label: '处理单元',
    emoji: '⚙️',
    desc: '单入单出，可绑定控制模型',
    ports: { in: [{ name: '输入' }], out: [{ name: '输出' }] },
  },
  {
    type: 'gateway',
    label: '分支网关',
    emoji: '🔀',
    desc: '一控多：向多个下游广播信号',
    ports: { in: [{ name: '输入' }], out: [{ name: '分支 A' }, { name: '分支 B' }] },
  },
  {
    type: 'aggregator',
    label: '汇聚单元',
    emoji: '➕',
    desc: '多入单出，汇聚上游信号',
    ports: { in: [{ name: '输入 A' }, { name: '输入 B' }], out: [{ name: '输出' }] },
  },
  {
    type: 'actuator',
    label: '执行单元',
    emoji: '🔌',
    desc: '仅接收，链路末端执行动作',
    ports: { in: [{ name: '输入' }], out: [] },
  },
  {
    type: 'blank',
    label: '空白单元',
    emoji: '⬜',
    desc: '自由定义端口的通用单元',
    ports: { in: [], out: [] },
  },
]

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function unitFromTemplate(tpl, x, y) {
  return {
    id: uid('unit'),
    type: tpl.type,
    name: tpl.label,
    x,
    y,
    modelId: null,
    ports: {
      in: tpl.ports.in.map((p) => ({ id: uid('pin'), name: p.name })),
      out: tpl.ports.out.map((p) => ({ id: uid('pout'), name: p.name })),
    },
    behavior: { autoForward: true },
  }
}

export const TYPE_META = Object.fromEntries(
  UNIT_TEMPLATES.map((t) => [t.type, { label: t.label, emoji: t.emoji }]),
)

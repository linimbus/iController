import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')

const EMPTY_DB = { models: [], flows: [] }

let db = load()

function load() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))
      return { models: raw.models ?? [], flows: raw.flows ?? [] }
    }
  } catch (err) {
    console.error('[store] 读取 db.json 失败，使用空库:', err.message)
  }
  return structuredClone(EMPTY_DB)
}

export function save() {
  const tmp = DB_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8')
  fs.renameSync(tmp, DB_FILE)
}

export function getDb() {
  return db
}

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function now() {
  return new Date().toISOString()
}

/* ---------------- 控制模型 ---------------- */

export function listModels() {
  return db.models
}

export function getModel(id) {
  return db.models.find((m) => m.id === id) ?? null
}

export function createModel(input) {
  const model = {
    id: uid('mdl'),
    name: input.name || '未命名模型',
    description: input.description || '',
    // 状态机：一个或多个状态
    states: Array.isArray(input.states) && input.states.length ? input.states : [
      { id: uid('st'), name: '初始态', initial: true },
    ],
    // 状态迁移规则：事件驱动
    transitions: Array.isArray(input.transitions) ? input.transitions : [],
    // 数据结构设定：字段定义
    dataSchema: Array.isArray(input.dataSchema) ? input.dataSchema : [],
    createdAt: now(),
    updatedAt: now(),
  }
  ensureSingleInitial(model)
  db.models.push(model)
  save()
  return model
}

export function updateModel(id, patch) {
  const model = getModel(id)
  if (!model) return null
  Object.assign(model, patch, { updatedAt: now() })
  ensureSingleInitial(model)
  save()
  return model
}

export function deleteModel(id) {
  const before = db.models.length
  db.models = db.models.filter((m) => m.id !== id)
  // 级联：解绑引用该模型的单元，并清理运行时状态
  for (const flow of db.flows) {
    let dirty = false
    for (const node of flow.nodes) {
      if (node.modelId === id) {
        node.modelId = null
        delete flow.runtimeStates[node.id]
        dirty = true
      }
    }
    if (dirty) flow.updatedAt = now()
  }
  save()
  return db.models.length < before
}

function ensureSingleInitial(model) {
  const initials = model.states.filter((s) => s.initial)
  if (model.states.length && initials.length === 0) model.states[0].initial = true
  if (initials.length > 1) {
    for (const s of model.states) s.initial = s.initial && s === initials[0]
  }
}

/* ---------------- 控制流程 ---------------- */

export function listFlows() {
  return db.flows.map((f) => ({
    id: f.id, name: f.name, createdAt: f.createdAt, updatedAt: f.updatedAt,
    nodeCount: f.nodes.length, signalCount: f.signals.length,
  }))
}

export function getFlow(id) {
  return db.flows.find((f) => f.id === id) ?? null
}

export function createFlow(input) {
  const flow = {
    id: uid('flow'),
    name: input.name || '未命名流程',
    // 控制单元（松耦合：只有自身端口声明，不含对其他单元的引用）
    nodes: Array.isArray(input.nodes) ? input.nodes : [],
    // 信号（独立的连接实体：from 端口 -> to 端口，支持一对多）
    signals: Array.isArray(input.signals) ? input.signals : [],
    // 运行时模型状态快照 { [nodeId]: stateId }
    runtimeStates: {},
    createdAt: now(),
    updatedAt: now(),
  }
  db.flows.push(flow)
  syncRuntimeStates(flow)
  save()
  return flow
}

export function updateFlow(id, patch) {
  const flow = getFlow(id)
  if (!flow) return null
  if (Array.isArray(patch.nodes)) flow.nodes = patch.nodes
  if (Array.isArray(patch.signals)) flow.signals = patch.signals
  if (typeof patch.name === 'string') flow.name = patch.name
  // 重新对齐运行时状态（新单元 -> 初始态；删除的单元 -> 移除）
  syncRuntimeStates(flow)
  flow.updatedAt = now()
  save()
  return flow
}

export function deleteFlow(id) {
  const before = db.flows.length
  db.flows = db.flows.filter((f) => f.id !== id)
  save()
  return db.flows.length < before
}

export function resetFlowRuntime(id) {
  const flow = getFlow(id)
  if (!flow) return null
  flow.runtimeStates = {}
  syncRuntimeStates(flow)
  save()
  return flow
}

function syncRuntimeStates(flow) {
  const nodeIds = new Set(flow.nodes.map((n) => n.id))
  for (const key of Object.keys(flow.runtimeStates)) {
    if (!nodeIds.has(key)) delete flow.runtimeStates[key]
  }
  for (const node of flow.nodes) {
    const model = node.modelId ? getModel(node.modelId) : null
    const current = flow.runtimeStates[node.id]
    const valid = model ? model.states.some((s) => s.id === current) : current == null
    if (!(node.id in flow.runtimeStates) || !valid) {
      flow.runtimeStates[node.id] = initialModelStateOf(node)
    }
  }
}

function initialModelStateOf(node) {
  if (!node.modelId) return null
  const model = getModel(node.modelId)
  if (!model) return null
  const st = model.states.find((s) => s.initial) ?? model.states[0]
  return st ? st.id : null
}

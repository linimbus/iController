import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getDb, save, uid, now,
  listModels, getModel, createModel, updateModel, deleteModel,
  listFlows, getFlow, createFlow, updateFlow, deleteFlow, resetFlowRuntime,
} from './store.js'
import { triggerSignal } from './engine.js'
import { modelToJson, modelToXml, modelsToJson, modelsToXml, safeFilename } from './exporter.js'

const app = express()
const PORT = process.env.PORT || 8788

app.use(cors())
app.use(express.json({ limit: '2mb' }))

/* ---------------- 基础 ---------------- */
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: now() }))
app.get('/api/meta', (_req, res) => {
  res.json({
    name: 'iController API',
    concepts: {
      controlUnit: '控制单元：松耦合，只声明自身端口，通过信号与其他单元通信',
      controlModel: '控制模型：独立于单元，包含状态机与数据结构设定，由单元绑定',
      signal: '信号：独立连接实体，from端口 -> to端口，支持一对多与消息传递',
    },
  })
})

/* ---------------- 控制模型 ---------------- */
app.get('/api/models', (_req, res) => res.json(listModels()))

/* ---------------- 模型导出（JSON / XML） ---------------- */
function sendExport(res, content, filename, mime) {
  res.setHeader('Content-Type', `${mime}; charset=utf-8`)
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
  res.send(content)
}

// 集合导出须在 :id 路由之前注册，避免被参数路由拦截
app.get('/api/models/export', (req, res) => {
  const format = String(req.query.format || 'json').toLowerCase()
  const ms = listModels()
  if (format === 'xml') {
    sendExport(res, modelsToXml(ms), '全部控制模型.xml', 'application/xml')
  } else if (format === 'json') {
    sendExport(res, modelsToJson(ms), '全部控制模型.json', 'application/json')
  } else {
    res.status(400).json({ error: `不支持的格式: ${format}（可选 json / xml）` })
  }
})

app.get('/api/models/:id', (req, res) => {
  const m = getModel(req.params.id)
  if (!m) return res.status(404).json({ error: '模型不存在' })
  res.json(m)
})
app.post('/api/models', (req, res) => res.status(201).json(createModel(req.body ?? {})))
app.put('/api/models/:id', (req, res) => {
  const m = updateModel(req.params.id, req.body ?? {})
  if (!m) return res.status(404).json({ error: '模型不存在' })
  res.json(m)
})
app.delete('/api/models/:id', (req, res) => {
  res.json({ deleted: deleteModel(req.params.id) })
})

app.get('/api/models/:id/export', (req, res) => {
  const m = getModel(req.params.id)
  if (!m) return res.status(404).json({ error: '模型不存在' })
  const format = String(req.query.format || 'json').toLowerCase()
  if (format === 'xml') {
    sendExport(res, modelToXml(m), safeFilename(m.name, 'model.xml'), 'application/xml')
  } else if (format === 'json') {
    sendExport(res, modelToJson(m), safeFilename(m.name, 'model.json'), 'application/json')
  } else {
    res.status(400).json({ error: `不支持的格式: ${format}（可选 json / xml）` })
  }
})

/* ---------------- 控制流程 ---------------- */
app.get('/api/flows', (_req, res) => res.json(listFlows()))
app.post('/api/flows', (req, res) => res.status(201).json(createFlow(req.body ?? {})))
app.get('/api/flows/:id', (req, res) => {
  const f = getFlow(req.params.id)
  if (!f) return res.status(404).json({ error: '流程不存在' })
  res.json(f)
})
app.put('/api/flows/:id', (req, res) => {
  const f = updateFlow(req.params.id, req.body ?? {})
  if (!f) return res.status(404).json({ error: '流程不存在' })
  res.json(f)
})
app.delete('/api/flows/:id', (req, res) => {
  res.json({ deleted: deleteFlow(req.params.id) })
})

/* ---------------- 运行时：信号触发 / 状态复位 ---------------- */
app.post('/api/flows/:id/trigger', (req, res) => {
  const flow = getFlow(req.params.id)
  if (!flow) return res.status(404).json({ error: '流程不存在' })
  const { nodeId, portId, payload, event } = req.body ?? {}
  if (!nodeId || !portId) {
    return res.status(400).json({ error: '需要 nodeId 与 portId' })
  }
  const result = triggerSignal(flow, { nodeId, portId, payload, event })
  if (result.error) return res.status(400).json({ error: result.error })
  save() // 持久化模型状态迁移结果
  res.json({ events: result.events, runtimeStates: flow.runtimeStates })
})

app.post('/api/flows/:id/reset', (req, res) => {
  const flow = resetFlowRuntime(req.params.id)
  if (!flow) return res.status(404).json({ error: '流程不存在' })
  res.json({ runtimeStates: flow.runtimeStates })
})

/* ---------------- 生产模式：托管前端构建产物（SPA） ---------------- */
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public')
if (fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))) {
  app.use(express.static(PUBLIC_DIR))
  // SPA 路由回退：非 /api 的 GET 请求返回 index.html
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'))
  })
  console.log(`[iController] 已托管前端静态资源: ${PUBLIC_DIR}`)
}

/* ---------------- API 兜底 404 ---------------- */
app.use((req, res) => res.status(404).json({ error: `未知接口: ${req.method} ${req.path}` }))

/* ---------------- 启动 ---------------- */
app.listen(PORT, process.env.HOST || '::', () => {
  const db = getDb()
  console.log(`[iController] 后端已启动: http://localhost:${PORT}（监听 ${process.env.HOST || '::'} IPv6/IPv4 双栈）`)
  console.log(`[iController] 模型 ${db.models.length} 个 / 流程 ${db.flows.length} 个`)
})

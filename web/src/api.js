const BASE = '/api'

async function fetchBlob(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `导出失败 (${res.status})`)
  }
  // 从 Content-Disposition 提取服务端建议的文件名
  const cd = res.headers.get('Content-Disposition') ?? ''
  let filename = `model.${path.includes('format=xml') ? 'xml' : 'json'}`
  const star = cd.match(/filename\*=UTF-8''([^;]+)/)
  const plain = cd.match(/filename="([^"]+)"/)
  if (star?.[1]) filename = decodeURIComponent(star[1])
  else if (plain?.[1]) filename = decodeURIComponent(plain[1])
  return { blob: await res.blob(), filename }
}

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `请求失败 (${res.status})`)
  }
  return body
}

export const api = {
  /* 控制模型 */
  listModels: () => req('/models'),
  getModel: (id) => req(`/models/${id}`),
  createModel: (data) => req('/models', { method: 'POST', body: JSON.stringify(data) }),
  updateModel: (id, data) => req(`/models/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteModel: (id) => req(`/models/${id}`, { method: 'DELETE' }),

  /* 模型导出（返回 Blob 用于下载） */
  async exportModel(id, format) {
    return fetchBlob(`/models/${id}/export?format=${format}`)
  },
  async exportAllModels(format) {
    return fetchBlob(`/models/export?format=${format}`)
  },

  /* 控制流程 */
  listFlows: () => req('/flows'),
  getFlow: (id) => req(`/flows/${id}`),
  createFlow: (data) => req('/flows', { method: 'POST', body: JSON.stringify(data) }),
  updateFlow: (id, data) => req(`/flows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFlow: (id) => req(`/flows/${id}`, { method: 'DELETE' }),

  /* 运行时 */
  trigger: (flowId, { nodeId, portId, payload, event }) =>
    req(`/flows/${flowId}/trigger`, {
      method: 'POST',
      body: JSON.stringify({ nodeId, portId, payload, event }),
    }),
  resetRuntime: (flowId) => req(`/flows/${flowId}/reset`, { method: 'POST' }),
}

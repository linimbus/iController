/**
 * 控制模型导出器：JSON / XML 两种格式
 */

const EXPORT_VERSION = '1.0'

/** 导出为结构化 JSON（含导出元信息） */
export function modelToJson(model) {
  return JSON.stringify(
    {
      type: 'controlModel',
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        id: model.id,
        name: model.name,
        description: model.description,
        states: model.states,
        transitions: model.transitions,
        dataSchema: model.dataSchema,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt,
      },
    },
    null,
    2,
  )
}

/** 导出为多个模型的集合 JSON */
export function modelsToJson(models) {
  return JSON.stringify(
    {
      type: 'controlModelCollection',
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      count: models.length,
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        states: m.states,
        transitions: m.transitions,
        dataSchema: m.dataSchema,
      })),
    },
    null,
    2,
  )
}

const ESC = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c])
}

function attr(name, value) {
  return value === undefined || value === null || value === '' ? '' : ` ${name}="${esc(value)}"`
}

/** 导出为 XML（模型状态机 + 数据结构设定） */
export function modelToXml(model) {
  const lines = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push(
    `<controlModel${attr('id', model.id)}${attr('name', model.name)}${attr('description', model.description)} version="${EXPORT_VERSION}" exportedAt="${new Date().toISOString()}">`,
  )

  lines.push('  <states>')
  for (const s of model.states) {
    lines.push(`    <state${attr('id', s.id)}${attr('name', s.name)}${s.initial ? ' initial="true"' : ''}/>`)
  }
  lines.push('  </states>')

  lines.push('  <transitions>')
  for (const t of model.transitions) {
    lines.push(`    <transition${attr('event', t.event)}${attr('from', t.from)}${attr('to', t.to)}/>`)
  }
  lines.push('  </transitions>')

  lines.push('  <dataSchema>')
  for (const f of model.dataSchema) {
    lines.push(`    <field${attr('name', f.name)}${attr('type', f.type)}${attr('desc', f.desc)}/>`)
  }
  lines.push('  </dataSchema>')

  lines.push('</controlModel>')
  return lines.join('\n')
}

/** 导出为多模型集合 XML */
export function modelsToXml(models) {
  const lines = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push(`<controlModels version="${EXPORT_VERSION}" exportedAt="${new Date().toISOString()}" count="${models.length}">`)
  for (const m of models) {
    const inner = modelToXml(m).split('\n')
    // 去掉 XML 声明行，整体缩进 2 空格
    lines.push(...inner.slice(1).map((l) => '  ' + l))
  }
  lines.push('</controlModels>')
  return lines.join('\n')
}

/** 文件名安全化 */
export function safeFilename(name, ext) {
  const base = String(name || 'model')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'model'
  return `${base}.${ext}`
}

# iController · 控制流编排系统

前后端分离的可视化控制系统编排平台：通过**拖拽**方式搭建控制流程，控制单元之间**松耦合**，由独立的**控制模型**（状态机 + 数据结构设定）定义行为，**信号**承载单元间的消息传递。

![架构](https://img.shields.io/badge/architecture-前后端分离-blue) ![前端](https://img.shields.io/badge/前端-React%2018%20%2B%20React%20Flow-61dafb) ![后端](https://img.shields.io/badge/后端-Node.js%20%2B%20Express-339933)

## 核心概念

| 概念 | 说明 |
|---|---|
| **控制单元 (Control Unit)** | 流程图中的节点。松耦合：只声明自身的输入/输出端口，不持有对其他单元的任何引用。一个输出端口可挂多条信号，实现**一控多**扇出 |
| **控制模型 (Control Model)** | 独立于单元存在的行为定义，包含**状态机**（一个或多个状态 + 事件驱动的迁移规则）和**数据结构设定**（字段名/类型/说明）。单元按需绑定模型，收到消息后按当前状态与事件迁移 |
| **信号 (Signal)** | 独立的连接实体（`from` 端口 → `to` 端口），可单独命名、定义传递事件（event）与默认载荷（payload）。单元之间唯一的通信方式 |
| **消息传递** | 点击端口 ⚡ 触发 → 后端引擎 BFS 多跳传播 → 接收单元按模型状态机迁移状态 → 自动向下游广播。前端回放动画并输出事件日志 |

## 功能特性

- 🖱 **拖拽式编辑**：单元库 6 种预设模板（数据源/处理/分支网关/汇聚/执行/空白）拖入画布，端口自由增删改名
- 🔗 **信号连接**：从输出端口拖到输入端口即建立信号；一个输出端口可连多条信号（一控多）
- 🧩 **模型管理**：可视化编辑状态机（状态、初始态、迁移规则）与数据结构（字段定义）
- ⚡ **消息引擎**：触发后实时观察信号传播、状态迁移、环路防护告警
- 📤 **模型导出**：JSON / XML 双格式，支持单模型与全量集合导出（带元信息包装、中文文件名）
- 💾 **持久化**：JSON 文件原子写入，重启不丢数据
- 🌐 **IPv6 双栈**：服务支持 IPv6 / IPv4 访问

## 目录结构

```
iController/
├── server/                  # 后端 API 服务（Express, ESM）
│   ├── src/
│   │   ├── index.js         # 路由与启动入口（端口 8788）
│   │   ├── store.js         # JSON 文件持久化 + 模型/流程 CRUD
│   │   ├── engine.js        # 信号消息传递引擎（BFS 多跳 + 状态机）
│   │   └── exporter.js      # JSON / XML 导出器
│   └── data/db.json         # 数据文件（自动创建）
└── web/                     # 前端 SPA（Vite + React 18）
    └── src/
        ├── App.jsx          # 主应用：状态管理 / 画布交互 / 触发回放
        ├── api.js           # API 客户端
        ├── nodeTemplates.js # 单元库模板
        ├── styles.css       # 全局样式（浅色主题）
        └── components/
            ├── UnitNode.jsx     # 画布节点（端口/状态徽标/⚡触发）
            ├── ModelPanel.jsx   # 模型编辑弹窗
            ├── Inspector.jsx    # 属性面板（单元/信号）
            └── RunLog.jsx       # 消息传递日志
```

## 快速开始

**环境要求**：Node.js ≥ 18

```bash
# 1. 启动后端（端口 8788）
cd server
npm install
npm start

# 2. 启动前端（端口 5173，自动代理 /api 到后端）
cd ../web
npm install
npm run dev
```

打开 <http://localhost:5173>。

- 生产构建：`cd web && npm run build`（产物在 `web/dist/`）
- IPv6 访问：前端已配置 `server.host: '::'` 双栈监听，可直接用 `http://[<本机IPv6>]:5173` 访问

## 使用指南

1. **建模型**：左侧「控制模型 → ＋ 新建」，定义状态机与数据结构（画布自带「温度控制器」演示模型）
2. **搭流程**：从单元库拖拽单元到画布，右侧属性面板绑定模型、编辑端口
3. **连信号**：从单元右侧输出端口拖到下游单元左侧输入端口；点击信号线可编辑事件与载荷
4. **传消息**：点击输出端口旁的 ⚡（或属性面板「触发」按钮），观察信号动画、状态徽标迁移与底部日志
5. **导出模型**：模型列表悬停出现 ⬇JSON / ⬇XML；支持「导出全部」

## API 摘要

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET/POST` | `/api/models` | 模型列表 / 新建 |
| `GET/PUT/DELETE` | `/api/models/:id` | 模型详情 / 更新 / 删除（删除自动解绑引用单元） |
| `GET` | `/api/models/:id/export?format=json\|xml` | 单模型导出 |
| `GET` | `/api/models/export?format=json\|xml` | 全部模型集合导出 |
| `GET/POST` | `/api/flows` | 流程列表 / 新建 |
| `GET/PUT/DELETE` | `/api/flows/:id` | 流程详情（含单元、信号、运行时状态）/ 保存 / 删除 |
| `POST` | `/api/flows/:id/trigger` | 触发消息传递，返回事件流与最新状态 |
| `POST` | `/api/flows/:id/reset` | 复位所有单元的模型状态 |

**触发示例**：

```bash
curl -X POST http://localhost:8788/api/flows/<flowId>/trigger \
  -H 'Content-Type: application/json' \
  -d '{"nodeId": "n_sensor", "portId": "po1", "payload": {"temperature": 32}}'
```

**导出的 XML 结构**：

```xml
<controlModel name="温度控制器" version="1.0" exportedAt="...">
  <states>
    <state id="st_idle" name="待机" initial="true"/>
  </states>
  <transitions>
    <transition event="high_temp" from="st_idle" to="st_cool"/>
  </transitions>
  <dataSchema>
    <field name="temperature" type="number" desc="当前温度"/>
  </dataSchema>
</controlModel>
```

## 引擎语义与防护

- 单元收到消息后：查绑定模型 → 命中迁移规则则状态迁移 → `behavior.autoForward !== false` 时向所有输出信号广播（消息体自动附带 `_model` / `_state` / `_data` 数据结构快照）
- 信号未配置事件时，沿用上游传入的事件名；载荷按「信号默认载荷 ⊕ 触发载荷」合并
- 防风暴：单条消息最大 16 跳、单单元单次触发最多接收 8 次、事件上限 500 条，环路会输出警告日志

## 技术说明

- 前端画布基于 [@xyflow/react](https://reactflow.dev/)（React Flow v12），自定义节点内嵌多端口 Handle
- 后端零数据库依赖，`data/db.json` 原子写入（临时文件 + rename）
- 开发期由 Vite 代理 `/api`，生产可独立部署前后端（后端已开 CORS）

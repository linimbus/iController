const TYPE_LABEL = {
  trigger: '触发',
  transmit: '传递',
  receive: '接收',
  state: '状态',
  warn: '警告',
}

/**
 * 底部消息传递日志：显示引擎返回的事件流
 */
export default function RunLog({ events, open, onToggle, onClear }) {
  return (
    <div className={`runlog ${open ? 'open' : ''}`}>
      <div className="runlog-head">
        <button className="btn ghost small" onClick={onToggle}>
          {open ? '▾' : '▴'} 消息传递日志（{events.length}）
        </button>
        <button className="btn ghost small" onClick={onClear}>清空</button>
      </div>
      {open && (
        <div className="runlog-body">
          {events.length === 0 && <div className="empty-tip">暂无事件。选中单元后点击 ⚡ 触发，观察信号消息传递。</div>}
          {events.map((ev, i) => (
            <div className={`log-line t-${ev.type}`} key={i}>
              <span className="log-seq">{String(i + 1).padStart(3, '0')}</span>
              <span className="log-tag">{TYPE_LABEL[ev.type] ?? ev.type}</span>
              <span className="log-detail">{ev.detail}</span>
              <span className="log-time">{new Date(ev.ts).toLocaleTimeString('zh-CN')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

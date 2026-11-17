# ---------- 阶段一：构建前端 ----------
FROM node:22-alpine AS web-builder
WORKDIR /build/web

COPY web/package.json web/package-lock.json* ./
RUN npm ci --no-fund --no-audit || npm install --no-fund --no-audit

COPY web/ ./
RUN npm run build

# ---------- 阶段二：运行时（Express 承载 API + 静态前端） ----------
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

# 后端生产依赖
COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev --no-fund --no-audit || npm install --omit=dev --no-fund --no-audit

COPY server/src ./src
# 数据目录（挂载卷持久化 db.json）
RUN mkdir -p /app/data
ENV PUBLIC_DIR=/app/public
COPY --from=web-builder /build/web/dist ./public

EXPOSE 8788
# 容器内监听所有接口（含 IPv6 双栈）
ENV HOST=::
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8788/api/health || exit 1

CMD ["node", "src/index.js"]

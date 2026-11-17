#!/usr/bin/env bash
# ============================================================
# iController Docker 镜像制作脚本
#
# 用法:
#   ./build-docker.sh              # 构建镜像 icontroller:latest
#   ./build-docker.sh v1.0.2       # 构建指定 tag（同时打 latest）
#   ./build-docker.sh --run        # 构建并在本地跑起来（端口 8788）
#   ./build-docker.sh v1.0.2 --run
#
# 镜像内容:
#   多阶段构建 —— 前端 Vite 产物 + Express 后端，单端口 8788
#   数据持久化: 容器内 /app/data（建议挂载卷）
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

IMAGE_NAME="${IMAGE_NAME:-icontroller}"
REGISTRY="${REGISTRY:-}"          # 需要推送到镜像仓库时设置，如 registry.example.com/team
TAG=""
RUN_AFTER=0

for arg in "$@"; do
  case "$arg" in
    --run) RUN_AFTER=1 ;;
    *) TAG="$arg" ;;
  esac
done
[ -z "$TAG" ] && TAG="latest"

# ---------- 前置检查 ----------
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ 未找到 docker 命令，请先安装 Docker" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker 守护进程未运行，请先启动 Docker" >&2
  exit 1
fi
for f in Dockerfile server/package.json web/package.json web/src/App.jsx; do
  [ -f "$f" ] || { echo "❌ 缺少关键文件: $f" >&2; exit 1; }
done

# ---------- 构建 ----------
echo "🔨 开始构建镜像 ${IMAGE_NAME}:${TAG} ..."
docker build -t "${IMAGE_NAME}:${TAG}" .

if [ "$TAG" != "latest" ]; then
  docker tag "${IMAGE_NAME}:${TAG}" "${IMAGE_NAME}:latest"
  echo "🏷  已同步标签 ${IMAGE_NAME}:latest"
fi

# 本地构建产物校验：镜像能否正常启动并响应健康检查
echo "🧪 启动临时容器做健康检查 ..."
CID=$(docker run -d --rm -p 18788:8788 "${IMAGE_NAME}:${TAG}")
trap 'docker rm -f "$CID" >/dev/null 2>&1 || true' EXIT

HEALTH_OK=0
for i in $(seq 1 20); do
  if curl -sf -m 3 http://127.0.0.1:18788/api/health >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done
if [ "$HEALTH_OK" -ne 1 ]; then
  echo "❌ 健康检查失败，容器日志：" >&2
  docker logs "$CID" >&2 || true
  exit 1
fi
FRONT_OK=$(curl -sf -m 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:18788/ || echo 000)
echo "✅ 健康检查通过（/api/health=200, 前端页面 HTTP=${FRONT_OK}）"

docker rm -f "$CID" >/dev/null 2>&1
trap - EXIT

# ---------- 可选：运行 ----------
if [ "$RUN_AFTER" -eq 1 ]; then
  echo "🚀 启动服务（容器名 icontroller，端口 8788，数据卷 icontroller-data）..."
  docker rm -f icontroller >/dev/null 2>&1 || true
  docker run -d --name icontroller \
    -p 8788:8788 \
    -v icontroller-data:/app/data \
    "${IMAGE_NAME}:${TAG}"
  echo "👉 访问: http://localhost:8788"
  echo "   查看日志: docker logs -f icontroller"
fi

# ---------- 可选：推送 ----------
if [ -n "$REGISTRY" ]; then
  REMOTE="${REGISTRY}/${IMAGE_NAME}:${TAG}"
  echo "📦 推送镜像到 ${REMOTE} ..."
  docker tag "${IMAGE_NAME}:${TAG}" "$REMOTE"
  docker push "$REMOTE"
  echo "✅ 推送完成: ${REMOTE}"
fi

echo ""
echo "🎉 完成！镜像信息："
docker images "${IMAGE_NAME}" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}" | head -5

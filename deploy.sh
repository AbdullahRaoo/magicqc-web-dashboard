#!/bin/bash
set -e

# ===========================================================================
# MagicQC Deployment Script
# Usage: ./deploy.sh
#
# This script safely deploys the latest code to the production server.
# It rebuilds the Docker image, does a clean restart, and verifies health.
# ===========================================================================

echo "=========================================="
echo " MagicQC Production Deploy"
echo "=========================================="

# 1. Pull latest code
echo ""
echo "[1/5] Pulling latest code..."
git pull

# 2. Rebuild the Docker image
echo ""
echo "[2/5] Building Docker image..."
docker-compose build app

# 3. Bring everything down cleanly
echo ""
echo "[3/5] Stopping containers..."
docker-compose down

# 4. Start all services
echo ""
echo "[4/5] Starting containers..."
docker-compose up -d

# 5. Wait and verify
echo ""
echo "[5/5] Waiting for containers to stabilize..."
sleep 15

echo ""
echo "=========================================="
echo " Container Status"
echo "=========================================="
docker-compose ps

echo ""
echo "=========================================="
echo " App Logs"
echo "=========================================="
docker-compose logs --tail=10 app

echo ""
echo "=========================================="
echo " Worker Logs"
echo "=========================================="
docker-compose logs --tail=10 worker

echo ""
echo "=========================================="
echo " Health Check"
echo "=========================================="
echo "Running layered HTTP checks with retry (up to ~90s)..."

APP_HTTP_CODE="000"
EDGE_HTTP_CODE="000"
for i in $(seq 1 30); do
    APP_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8081 -H "Host: magicqc.online" || true)
    EDGE_HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" https://127.0.0.1 -H "Host: magicqc.online" || true)

    if [ "$APP_HTTP_CODE" = "200" ] && [ "$EDGE_HTTP_CODE" = "200" ]; then
        echo "✓ HTTP 200 — Site is UP (docker nginx + host edge)"
        break
    fi

    echo "  attempt $i/30 -> docker-nginx:$APP_HTTP_CODE, edge-https:$EDGE_HTTP_CODE"
    sleep 3
done

if [ "$APP_HTTP_CODE" != "200" ] || [ "$EDGE_HTTP_CODE" != "200" ]; then
    echo "✗ Health check failed after retries"
    echo ""
    if [ "$APP_HTTP_CODE" != "200" ]; then
        echo "- Docker nginx path failed (http://127.0.0.1:8081 Host:magicqc.online => $APP_HTTP_CODE)"
    fi
    if [ "$EDGE_HTTP_CODE" != "200" ]; then
        echo "- Host HTTPS edge failed (https://127.0.0.1 Host:magicqc.online => $EDGE_HTTP_CODE)"
    fi
    echo ""
    echo "Debug with:"
    echo "  docker-compose logs --tail=50 app"
    echo "  docker-compose logs --tail=50 worker"
    echo "  docker-compose logs --tail=50 nginx"
    echo "  docker logs --tail=50 robionix_nginx"
    exit 1
fi

echo ""
echo "=========================================="
echo " Database Check"
echo "=========================================="
if docker-compose exec -T db sh -lc 'mysqladmin ping -h localhost -p"$MYSQL_ROOT_PASSWORD" >/dev/null'; then
    echo "✓ MySQL is reachable"
else
    echo "✗ MySQL ping failed"
    docker-compose logs --tail=30 db
    exit 1
fi

if docker-compose exec -T app php artisan migrate:status --no-interaction >/dev/null; then
    echo "✓ Laravel can access DB (migrations readable)"
else
    echo "✗ Laravel DB check failed"
    docker-compose logs --tail=30 app
    exit 1
fi

echo ""
echo "=========================================="
echo " Deploy complete!"
echo "=========================================="

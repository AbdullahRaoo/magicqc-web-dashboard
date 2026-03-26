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
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" https://127.0.0.1 -H "Host: magicqc.online")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ HTTP 200 — Site is UP"
else
    echo "✗ HTTP $HTTP_CODE — Something is wrong!"
    echo ""
    echo "Debug with:"
    echo "  docker-compose logs --tail=30 app"
    echo "  docker-compose logs --tail=30 worker"
    echo "  docker-compose logs --tail=30 nginx"
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

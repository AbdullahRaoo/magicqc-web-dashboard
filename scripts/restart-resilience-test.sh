#!/bin/bash
set -euo pipefail

CYCLES="${1:-5}"
SLEEP_SECONDS="${2:-12}"

echo "=========================================="
echo " MagicQC Restart Resilience Test"
echo " Cycles: ${CYCLES}"
echo " Sleep: ${SLEEP_SECONDS}s"
echo "=========================================="

check_http() {
    local code
    code=$(curl -sk -o /dev/null -w "%{http_code}" https://127.0.0.1 -H "Host: magicqc.online")
    if [ "$code" != "200" ]; then
        echo "[FAIL] HTTP check returned ${code}"
        return 1
    fi
    echo "[OK] HTTP 200"
}

check_db() {
    if docker-compose exec -T db sh -lc 'mysqladmin ping -h localhost -p"$MYSQL_ROOT_PASSWORD" >/dev/null'; then
        echo "[OK] MySQL reachable"
    else
        echo "[FAIL] MySQL ping failed"
        return 1
    fi

    if docker-compose exec -T app php artisan migrate:status --no-interaction >/dev/null; then
        echo "[OK] Laravel DB access"
    else
        echo "[FAIL] Laravel DB access failed"
        return 1
    fi
}

check_logs() {
    local app_logs nginx_logs
    app_logs=$(docker-compose logs --tail=80 app 2>/dev/null || true)
    nginx_logs=$(docker-compose logs --tail=80 nginx 2>/dev/null || true)

    if echo "$app_logs" | grep -Eqi 'cp: cannot create|Failed opening required|Class ".*" not found'; then
        echo "[FAIL] app logs contain startup/runtime errors"
        return 1
    fi

    if echo "$nginx_logs" | grep -Eqi 'connect\(\) failed|upstream.*failed'; then
        echo "[FAIL] nginx logs contain upstream failure patterns"
        return 1
    fi

    echo "[OK] No critical error patterns in recent logs"
}

for i in $(seq 1 "$CYCLES"); do
    echo ""
    echo "------------------------------------------"
    echo "Cycle ${i}/${CYCLES}: recreate app/nginx/worker"
    echo "------------------------------------------"

    docker-compose up -d --force-recreate app nginx worker
    sleep "$SLEEP_SECONDS"

    check_http
    check_db
    check_logs

    echo "[PASS] Cycle ${i}"
done

echo ""
echo "=========================================="
echo " All ${CYCLES} restart cycles passed"
echo "=========================================="

#!/bin/bash
set -e

echo "=== MagicQC Container Entrypoint ==="

# ---------------------------------------------------------------------------
# RACE CONDITION FIX:
# Both 'app' and 'worker' share the bind mount ./:/var/www.
# The lock file MUST be on the shared mount — /tmp is per-container and
# flock there does nothing. /var/www/.deploy.lock is visible to both.
# ---------------------------------------------------------------------------
LOCKFILE="/var/www/.deploy.lock"

# Only app container should sync shared bind-mounted artifacts.
# Worker starts with command: php artisan ... and must not mutate shared vendor/build.
if [ "$1" = "php-fpm" ]; then
    (
        flock -x -w 120 200

        MARKER="/var/www/.last_sync_hash"
        BUILD_HASH=$(md5sum /tmp/vendor-output/autoload.php 2>/dev/null | awk '{print $1}' || echo "none")
        CURRENT_HASH=$(cat "$MARKER" 2>/dev/null || echo "")

        if [ "$BUILD_HASH" != "$CURRENT_HASH" ]; then
            echo "Syncing Vite build assets..."
            if [ -d "/tmp/build-output" ]; then
                mkdir -p /var/www/public/build
                cp -a /tmp/build-output/. /var/www/public/build/
            fi

            echo "Syncing vendor dependencies..."
            if [ -d "/tmp/vendor-output" ]; then
                mkdir -p /var/www/vendor
                cp -a /tmp/vendor-output/. /var/www/vendor/
            fi

            echo "Clearing bootstrap cache..."
            rm -f /var/www/bootstrap/cache/packages.php \
                  /var/www/bootstrap/cache/services.php \
                  /var/www/bootstrap/cache/config.php

            echo "$BUILD_HASH" > "$MARKER"
            echo "Sync complete."
        else
            echo "Already synced, skipping."
        fi
    ) 200>"$LOCKFILE"
else
    echo "Non-app container detected; waiting for vendor sync..."
    for _ in $(seq 1 120); do
        [ -f /var/www/vendor/autoload.php ] && break
        sleep 1
    done
fi

echo "Entrypoint complete, starting: $@"
exec "$@"

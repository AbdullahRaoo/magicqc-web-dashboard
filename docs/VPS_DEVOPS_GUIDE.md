# MagicQC — VPS Server Information & DevOps Guide

This document contains all necessary infrastructure details, deployment procedures, and troubleshooting steps for the MagicQC production environment on the Ubuntu VPS. 

## 1. Server Details & Access

| Property | Value |
|----------|-------|
| **Host IP Address** | `121.52.149.158` |
| **SSH Port** | `222` |
| **OS** | Ubuntu 24.04 LTS |
| **Username** | `nutechadmin` |
| **Project Path** | `/var/www/magicqc` |

### SSH Connection Command
```bash
ssh -p 222 nutechadmin@121.52.149.158
```

---

## 2. Infrastructure Architecture

The application runs exclusively in Docker using `docker-compose`. There is **no host-level Nginx, Apache, or PHP installed**. Everything is containerized.

### Active Containers under `/var/www/magicqc`
| Service | Container Name | Image | Internal Port | Description |
|---------|----------------|-------|---------------|-------------|
| **Nginx** | `magicqc_nginx` | `nginx:alpine` | 80 -> 8081 | Edge router serving static files and proxying PHP |
| **App** | `magicqc_app` | Custom (`php:8.2-fpm`) | 9000 | Runs PHP-FPM for Laravel. Builds React/Vite assets. |
| **Worker** | `magicqc_worker` | Custom (`php:8.2-fpm`) | None | Runs `php artisan queue:work` |
| **DB** | `magicqc_db` | `mysql:5.7` | 3306 | MySQL database (v5.7 chosen for CPU compatibility) |

*Note: The Nginx container binds to external port `8081`, which is then likely reverse-proxied by a grand-master Nginx process at the host level (e.g., `robionix` Nginx).*

---

## 3. Deployment Procedure

All deployments are done by pulling from the `main` branch of the GitHub repository.

### Standard Update (No package changes)
```bash
cd /var/www/magicqc
git pull origin main

# Clear Laravel caches to ensure clean state
docker-compose exec app php artisan config:clear
docker-compose exec app php artisan cache:clear
docker-compose restart app worker
```

### Full Rebuild (When changing Composer or NPM packages)
If you altered `composer.json` or `package.json`, you must rebuild the `app` image completely:
```bash
cd /var/www/magicqc
git pull origin main

# Force Composer to use IPv4 to prevent 15-minute network timeout hangs
sed -i 's/RUN composer install/RUN COMPOSER_IPRESOLVE=4 composer install/g' Dockerfile

docker-compose build app
docker-compose up -d
```

---

## 4. Known Bugs & DevOps Quirks

### The `entrypoint.sh` Asset Copy Issue
The `app` Dockerfile builds Vite assets during the image build, then uses `entrypoint.sh` to copy them into the bind-mounted host volume (`/var/www/public/build`) every time the container starts.
**CRITICAL:** The command must be `cp -rfn` (no clobber). If it is changed back to `cp -rf` (force), Linux host-volume permissions will block the overwrite, the script will crash, PHP-FPM will fail to start, and Nginx will return a **502 Bad Gateway**.

### Composer / Docker IPv6 Timeout
When running `docker-compose build app`, if it hangs on `composer install` for 20+ minutes throwing `A connection timeout was encountered`, it is because the Docker daemon is attempting and failing to route IPv6 packets to packagist.org.
**Fix:** Ensure `COMPOSER_IPRESOLVE=4` is present in the `Dockerfile` command, or simply restart the host's docker service: `sudo systemctl restart docker`.

### Lethal "Class Not Found" / 502 Bad Gateway Errors after Upgrades
Laravel aggressively caches its config and discovered packages in `bootstrap/cache/`. If a package (like `nuwave/lighthouse`) is upgraded and a class is deleted, Laravel will crash on boot trying to find it. 
Because it crashes on boot, you **cannot** run `docker-compose exec app php artisan config:clear`.
**Fix:** You must manually delete the files as `sudo` on the host, since they were created by Docker:
```bash
sudo rm -f bootstrap/cache/packages.php bootstrap/cache/services.php bootstrap/cache/config.php
docker-compose restart app worker
```

---

## 5. Server Management & Commands

### Viewing Logs
To diagnose 500, 404, or 502 errors, read the live output of the containers:
```bash
# Watch the PHP app server logs
docker-compose logs --tail=100 -f app

# Watch the queue worker logs
docker-compose logs --tail=100 -f worker

# Watch Nginx reverse proxy logs
docker-compose logs --tail=100 -f nginx
```

### Running Artisan Commands
Always run artisan commands *inside* the app container:
```bash
docker-compose exec app php artisan migrate
docker-compose exec app php artisan tinker
```

### Checking System Resources
If the VPS crashes entirely, the 1GB/2GB RAM limit was likely exceeded by MySQL or Node.js.
```bash
free -m # Check RAM and Swap usage
df -h   # Check Disk space
top     # View live processes (press 'q' to exit)
```

### UFW Firewall Rules
The firewall restricts access to specific ports.
```bash
sudo ufw status
# Allowed: 222 (SSH), 80 (HTTP), 443 (HTTPS)
```

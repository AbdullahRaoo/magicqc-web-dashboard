FROM php:8.2-fpm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    zip \
    unzip \
    nodejs \
    npm \
    iputils-ping

# Clear cache
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

# Install PHP extensions
RUN docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd

# Get latest Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Set working directory
WORKDIR /var/www

# Copy existing application directory permissions
COPY --chown=www-data:www-data . /var/www

# Ensure the main directory is writable by www-data
RUN chown -R www-data:www-data /var/www

# Increase PHP upload limits
COPY docker/php/uploads.ini /usr/local/etc/php/conf.d/uploads.ini

# Copy entrypoint script and make executable
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Change current user to www
USER www-data

# Install PHP dependencies (force IPv4 to avoid Docker DNS/IPv6 timeout issues)
RUN COMPOSER_IPRESOLVE=4 composer install --no-interaction --optimize-autoloader --no-dev

# Install JS dependencies and build
RUN npm install && npm run build

# Save build output and vendor to backup locations
# These get copied back to the bind mount on container start
RUN cp -r /var/www/public/build /tmp/build-output
RUN cp -r /var/www/vendor /tmp/vendor-output

# Switch back to root for entrypoint (php-fpm handles user switching internally)
USER root

# Expose port 9000 and start php-fpm server
EXPOSE 9000
ENTRYPOINT ["entrypoint.sh"]
CMD ["php-fpm"]

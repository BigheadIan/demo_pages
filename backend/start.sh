#!/bin/sh

echo "Starting Golden Dragon Backend..."

# Construct DATABASE_URL if not set but components are available
if [ -z "$DATABASE_URL" ] && [ -n "$CLOUD_SQL_CONNECTION_NAME" ]; then
  export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${CLOUD_SQL_CONNECTION_NAME}"
  echo "Constructed DATABASE_URL for Cloud SQL"
fi

# Start the application immediately (db migrations run separately)
echo "Starting Node.js application..."
exec node src/index.js

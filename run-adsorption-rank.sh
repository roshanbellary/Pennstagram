#!/bin/bash

# Script to build and run the AdsorptionRankJob directly
# This is useful for testing and manual execution

# Set the working directory to the script's location
cd "$(dirname "$0")"
PROJECT_ROOT="$(pwd)"

# Build the Spark job
echo "Building the Spark job..."
cd "$PROJECT_ROOT/server/spark"
mvn clean package

if [ $? -ne 0 ]; then
  echo "Build failed. Exiting."
  exit 1
fi

echo "Build successful."

# Set database connection info directly
echo "Setting database connection info..."
DB_HOST="localhost"
DB_PORT="3306"
DB_NAME="imdb_basic"
DB_USER="admin"
DB_PASSWORD="TIF|UFlfCn7[XU67U~h?A]YGzVyK"

# Build JDBC URL
DB_URL="jdbc:mysql://${DB_HOST}:${DB_PORT}/${DB_NAME}?allowPublicKeyRetrieval=true&useSSL=false"

echo "Running AdsorptionRankJob..."
echo "Database URL: $DB_URL"

# Run the job
echo "Running from directory: $(pwd)"
echo "Checking JAR file..."
ls -la target/instalite-adsorption-1.0-SNAPSHOT-jar-with-dependencies.jar

java -cp "target/instalite-adsorption-1.0-SNAPSHOT-jar-with-dependencies.jar" \
  edu.upenn.cis.nets2120.adsorption.AdsorptionRankJob \
  "$DB_URL" "$DB_USER" "$DB_PASSWORD"

if [ $? -eq 0 ]; then
  echo "AdsorptionRankJob completed successfully."
else
  echo "AdsorptionRankJob failed."
  exit 1
fi

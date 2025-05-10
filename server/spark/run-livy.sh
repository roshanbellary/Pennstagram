#!/bin/bash

# This script submits the AdsorptionRankJob to an Apache Livy server

# Set default values
LIVY_SERVER=${LIVY_SERVER:-"http://localhost:8998"}
DB_HOST=${DB_HOST:-"instalite.cb8csnn97jyf.us-east-1.rds.amazonaws.com"}
DB_URL=${DB_URL:-"jdbc:mysql://$DB_HOST:3306/imdb_basic?allowPublicKeyRetrieval=true&useSSL=false"}
DB_USER=${DB_USER:-"admin"}
DB_PASSWORD=${DB_PASSWORD:-"TIF|UFlfCn7[XU67U~h?A]YGzVyK"}

# Path to the Spark job JAR
JAR_PATH="target/instalite-adsorption-1.0-SNAPSHOT-jar-with-dependencies.jar"

# Navigate to spark directory
cd "$(dirname "$0")"

# Build the project if needed
if [ ! -f "$JAR_PATH" ]; then
  echo "Building the Spark job..."
  mvn clean package
fi

# Submit the job to Livy
echo "Submitting job to Livy server at $LIVY_SERVER"
curl -X POST -H "Content-Type: application/json" -d '{
  "file": "'$(pwd)/$JAR_PATH'",
  "className": "edu.upenn.cis.nets2120.adsorption.AdsorptionRankJob",
  "args": ["'$DB_URL'", "'$DB_USER'", "'$DB_PASSWORD'"]
}' "$LIVY_SERVER/batches"

echo -e "\nJob submitted to Livy" 
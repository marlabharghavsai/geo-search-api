# Geo-Spatial Search API

This project provides a robust, highly performant geo-spatial search API. It utilizes Node.js, PostgreSQL with PostGIS for reliable persistence and spatial queries, OpenSearch for advanced, fast geo-queries with custom ranking, and NGINX for reverse proxying, caching, and rate limiting.

## Features
- Containerized microservice architecture.
- Automated data ingestion scripts populating 200,000 synthetic property records.
- Radius and Bounding Box geo-searches.
- Custom relevance ranking using `function_score`.
- NGINX caching layer and rate limiting.

## Setup

1. Copy `.env.example` to `.env`
2. Start the services:
   ```bash
   docker-compose up -d --build
   ```
   *Note: The first startup might take a few minutes as it waits for DB and OpenSearch to be healthy and runs the ingestion script for 200,000 records.*

3. Verify Health:
   ```bash
   curl http://localhost/api/properties/search/radius?lat=34.0&lon=-118.0&radius_km=10
   ```

## Running Load Tests

To run the k6 load test:
```bash
k6 run tests/load-test.js
```

const { Client } = require('pg');
const { Client: OSClient } = require('@opensearch-project/opensearch');
require('dotenv').config();

const PG_CONFIG = {
  user: process.env.POSTGRES_USER || 'myuser',
  host: process.env.POSTGRES_HOST || 'db',
  database: process.env.POSTGRES_DB || 'propertiesdb',
  password: process.env.POSTGRES_PASSWORD || 'mypassword',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
};

const OS_URL = process.env.OPENSEARCH_URL || 'http://opensearch:9200';
const NUM_RECORDS = 200000;
const BATCH_SIZE = 10000;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initPostgres() {
  let pgClient = new Client(PG_CONFIG);
  let connected = false;
  
  while (!connected) {
    try {
      await pgClient.connect();
      connected = true;
    } catch (e) {
      console.log('Waiting for Postgres to start...');
      await sleep(2000);
      pgClient = new Client(PG_CONFIG);
    }
  }

  console.log('Connected to Postgres');

  await pgClient.query(`
    CREATE EXTENSION IF NOT EXISTS postgis;
    
    CREATE TABLE IF NOT EXISTS properties (
      id SERIAL PRIMARY KEY,
      price INTEGER NOT NULL,
      date_of_transfer DATE NOT NULL,
      location GEOMETRY(Point, 4326) NOT NULL,
      engagement_score INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS properties_location_idx ON properties USING GIST (location);
  `);

  console.log('Postgres schema initialized');
  return pgClient;
}

async function initOpenSearch() {
  const osClient = new OSClient({ node: OS_URL });
  
  let connected = false;
  while (!connected) {
    try {
      await osClient.ping();
      connected = true;
    } catch (e) {
      console.log('Waiting for OpenSearch to start...');
      await sleep(2000);
    }
  }

  console.log('Connected to OpenSearch');

  const indexName = 'properties';

  const { body: exists } = await osClient.indices.exists({ index: indexName });
  
  if (!exists) {
    await osClient.indices.create({
      index: indexName,
      body: {
        mappings: {
          properties: {
            id: { type: 'integer' },
            price: { type: 'integer' },
            date_of_transfer: { type: 'date' },
            location: { type: 'geo_point' },
            engagement_score: { type: 'integer' }
          }
        }
      }
    });
    console.log('OpenSearch index created');
  } else {
    console.log('OpenSearch index already exists');
  }

  return osClient;
}

function generateBatch(startIndex, size) {
  const batch = [];
  for (let i = 0; i < size; i++) {
    const lat = 34.0 + (Math.random() - 0.5) * 2; // around LA
    const lon = -118.0 + (Math.random() - 0.5) * 2;
    const price = Math.floor(Math.random() * 900000) + 100000;
    const date_of_transfer = new Date(Date.now() - Math.floor(Math.random() * 10000000000)).toISOString().split('T')[0];
    const engagement_score = Math.floor(Math.random() * 1000);
    
    batch.push({
      id: startIndex + i,
      price,
      date_of_transfer,
      lat,
      lon,
      engagement_score
    });
  }
  return batch;
}

async function ingestData(pgClient, osClient) {
  const { rows } = await pgClient.query('SELECT COUNT(*) FROM properties');
  const count = parseInt(rows[0].count);
  
  if (count >= NUM_RECORDS) {
    console.log(`Database already has ${count} records. Skipping ingestion.`);
    return;
  }

  console.log('Starting data ingestion...');
  
  for (let i = count; i < NUM_RECORDS; i += BATCH_SIZE) {
    const currentBatchSize = Math.min(BATCH_SIZE, NUM_RECORDS - i);
    const batch = generateBatch(i + 1, currentBatchSize);
    
    // Insert into PG
    const values = [];
    const queryParts = [];
    let paramCounter = 1;
    
    batch.forEach(item => {
      queryParts.push(`($${paramCounter++}, $${paramCounter++}, $${paramCounter++}, ST_SetSRID(ST_MakePoint($${paramCounter++}, $${paramCounter++}), 4326), $${paramCounter++})`);
      values.push(item.id, item.price, item.date_of_transfer, item.lon, item.lat, item.engagement_score);
    });

    await pgClient.query(`
      INSERT INTO properties (id, price, date_of_transfer, location, engagement_score)
      VALUES ${queryParts.join(',')}
      ON CONFLICT (id) DO NOTHING
    `, values);

    // Insert into OpenSearch
    const osBody = batch.flatMap(doc => [
      { index: { _index: 'properties', _id: doc.id.toString() } },
      {
        id: doc.id,
        price: doc.price,
        date_of_transfer: doc.date_of_transfer,
        location: { lat: doc.lat, lon: doc.lon },
        engagement_score: doc.engagement_score
      }
    ]);

    await osClient.bulk({ refresh: false, body: osBody });
    
    console.log(`Ingested ${i + currentBatchSize} / ${NUM_RECORDS} records`);
  }
  
  // Refresh OpenSearch index
  await osClient.indices.refresh({ index: 'properties' });
  console.log('Data ingestion complete!');
}

async function main() {
  const pgClient = await initPostgres();
  const osClient = await initOpenSearch();
  
  try {
    await ingestData(pgClient, osClient);
  } catch (error) {
    console.error('Ingestion failed:', error);
  } finally {
    await pgClient.end();
  }
}

main();

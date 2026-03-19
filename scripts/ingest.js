const fs = require("fs");
const { Client } = require("pg");
const axios = require("axios");

const data = JSON.parse(fs.readFileSync("scripts/data.json"));

const pgClient = new Client({
  user: "postgres",
  host: "localhost",
  database: "properties_db",
  password: "postgres",
  port: 5432,
});

async function ingest() {
  await pgClient.connect();

  console.log("📥 Inserting into PostgreSQL (batch)...");

  const batchSize = 1000;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);

    const values = [];
    const params = [];

    batch.forEach((item, index) => {
      const base = index * 5;

      values.push(
        `($${base + 1}, $${base + 2}, ST_SetSRID(ST_MakePoint($${base + 3}, $${base + 4}),4326), $${base + 5})`
      );

      params.push(
        item.price,
        item.date_of_transfer,
        item.lon,
        item.lat,
        item.views
      );
    });

    await pgClient.query(
      `INSERT INTO properties (price, date_of_transfer, location, views)
       VALUES ${values.join(",")}`,
      params
    );

    console.log(`✅ Inserted ${i + batch.length}`);
  }

  console.log("📥 Indexing into OpenSearch (bulk)...");

  const osBatchSize = 2000;

  for (let i = 0; i < data.length; i += osBatchSize) {
    const batch = data.slice(i, i + osBatchSize);

    let bulkBody = "";

    batch.forEach((item, index) => {
      const id = i + index;

      bulkBody += JSON.stringify({
        index: { _index: "properties", _id: id }
      }) + "\n";

      bulkBody += JSON.stringify({
        price: item.price,
        location: { lat: item.lat, lon: item.lon },
        date_of_transfer: item.date_of_transfer,
        views: item.views
      }) + "\n";
    });

    await axios.post("http://localhost:9200/_bulk", bulkBody, {
      headers: {
        "Content-Type": "application/x-ndjson"
      }
    });

    console.log(`✅ Indexed ${i + batch.length}`);
  }

  console.log("🎉 Ingestion complete");

  await pgClient.end();
}

ingest();

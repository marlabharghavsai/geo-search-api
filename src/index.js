const express = require('express');
const { Client: OSClient } = require('@opensearch-project/opensearch');
const { Client: PGClient } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

const osClient = new OSClient({ node: process.env.OPENSEARCH_URL || 'http://opensearch:9200' });

const pgConfig = {
  user: process.env.POSTGRES_USER || 'myuser',
  host: process.env.POSTGRES_HOST || 'db',
  database: process.env.POSTGRES_DB || 'propertiesdb',
  password: process.env.POSTGRES_PASSWORD || 'mypassword',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
};

const pgClient = new PGClient(pgConfig);
pgClient.connect().catch(err => console.error('PG connect error', err));

function buildRankingScript(lat, lon) {
  return {
    source: `
      double price_score = 100000.0 / (doc['price'].value > 0 ? doc['price'].value : 100000.0);
      price_score = price_score > 1.0 ? 1.0 : price_score;
      
      double engagement_score = doc['engagement_score'].value / 1000.0;
      engagement_score = engagement_score > 1.0 ? 1.0 : engagement_score;
      
      long now = params.now;
      long docDate = doc['date_of_transfer'].value.toInstant().toEpochMilli();
      double recency_score = (double)docDate / (double)now;
      
      double geo_score = 1.0;
      if (params.lat != null && params.lon != null) {
        double dist = doc['location'].arcDistance(params.lat, params.lon);
        geo_score = 10000.0 / (dist + 10000.0);
      }
      
      return (0.2 * price_score) + (0.3 * recency_score) + (0.3 * geo_score) + (0.2 * engagement_score);
    `,
    params: {
      now: Date.now(),
      lat: lat !== null ? parseFloat(lat) : null,
      lon: lon !== null ? parseFloat(lon) : null
    }
  };
}

function calculateExplanation(hit, lat, lon) {
  const source = hit._source;
  const now = Date.now();
  const docDate = new Date(source.date_of_transfer).getTime();
  
  let price_score = 100000.0 / (source.price > 0 ? source.price : 100000.0);
  price_score = price_score > 1.0 ? 1.0 : price_score;
  
  let engagement_score = source.engagement_score / 1000.0;
  engagement_score = engagement_score > 1.0 ? 1.0 : engagement_score;
  
  const recency_score = docDate / now;
  
  let geo_score = 1.0;
  if (lat != null && lon != null) {
    // Haversine distance in meters
    const R = 6371e3; // metres
    const φ1 = lat * Math.PI/180;
    const φ2 = source.location.lat * Math.PI/180;
    const Δφ = (source.location.lat-lat) * Math.PI/180;
    const Δλ = (source.location.lon-lon) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const dist = R * c;
    
    geo_score = 10000.0 / (dist + 10000.0);
  }

  return {
    total_score: hit._score,
    price_score,
    recency_score,
    geo_distance_score: geo_score,
    engagement_score
  };
}

app.get('/health', (req, res) => {
  res.send('OK');
});

// GET /api/properties/search/radius
app.get('/api/properties/search/radius', async (req, res) => {
  try {
    const { lat, lon, radius_km } = req.query;
    
    if (!lat || !lon || !radius_km) {
      return res.status(400).json({ error: 'Missing lat, lon, or radius_km' });
    }

    const response = await osClient.search({
      index: 'properties',
      body: {
        query: {
          function_score: {
            query: {
              geo_distance: {
                distance: `${radius_km}km`,
                location: {
                  lat: parseFloat(lat),
                  lon: parseFloat(lon)
                }
              }
            },
            script_score: {
              script: buildRankingScript(lat, lon)
            },
            boost_mode: 'replace'
          }
        }
      }
    });

    const hits = response.body.hits.hits.map(hit => ({
      id: hit._source.id,
      price: hit._source.price,
      location: hit._source.location,
      _ranking_explanation: calculateExplanation(hit, parseFloat(lat), parseFloat(lon))
    }));

    res.json({ hits });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/properties/search/bbox
app.get('/api/properties/search/bbox', async (req, res) => {
  try {
    const { top_left_lat, top_left_lon, bottom_right_lat, bottom_right_lon } = req.query;
    
    if (!top_left_lat || !top_left_lon || !bottom_right_lat || !bottom_right_lon) {
      return res.status(400).json({ error: 'Missing bounding box coordinates' });
    }

    // Use center of bbox for distance scoring
    const centerLat = (parseFloat(top_left_lat) + parseFloat(bottom_right_lat)) / 2;
    const centerLon = (parseFloat(top_left_lon) + parseFloat(bottom_right_lon)) / 2;

    const response = await osClient.search({
      index: 'properties',
      body: {
        query: {
          function_score: {
            query: {
              geo_bounding_box: {
                location: {
                  top_left: {
                    lat: parseFloat(top_left_lat),
                    lon: parseFloat(top_left_lon)
                  },
                  bottom_right: {
                    lat: parseFloat(bottom_right_lat),
                    lon: parseFloat(bottom_right_lon)
                  }
                }
              }
            },
            script_score: {
              script: buildRankingScript(centerLat, centerLon)
            },
            boost_mode: 'replace'
          }
        }
      }
    });

    const hits = response.body.hits.hits.map(hit => ({
      id: hit._source.id,
      price: hit._source.price,
      location: hit._source.location,
      _ranking_explanation: calculateExplanation(hit, centerLat, centerLon)
    }));

    res.json({ hits });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/properties/:id/update
app.post('/api/properties/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const { price } = req.body;
    
    if (!price) {
      return res.status(400).json({ error: 'Missing price' });
    }

    // Update Postgres
    await pgClient.query('UPDATE properties SET price = $1 WHERE id = $2', [price, id]);

    // Update OpenSearch
    await osClient.update({
      index: 'properties',
      id: id,
      body: {
        doc: {
          price: price
        }
      },
      refresh: true
    });

    // We can signal NGINX to purge cache or delete files.
    // Since we mounted the cache volume to /var/cache/nginx, we can clear it.
    const fs = require('fs');
    const cachePath = '/var/cache/nginx';
    if (fs.existsSync(cachePath)) {
      const files = fs.readdirSync(cachePath);
      for (const file of files) {
        fs.rmSync(`${cachePath}/${file}`, { recursive: true, force: true });
      }
    }
    
    res.json({ success: true, message: 'Property updated and cache purged' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.APP_PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

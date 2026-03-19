const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.APP_PORT || 3000;

const OPENSEARCH_URL =
  process.env.OPENSEARCH_URL || "http://localhost:9200";

// -----------------------------
// Ranking Function
// -----------------------------
function calculateScore(doc, userLat, userLon) {
  const price = doc.price;
  const views = doc.views;
  const date = new Date(doc.date_of_transfer);

  const priceScore = 1 / price;

  const daysOld = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = 1 / (1 + daysOld);

  const docLon = doc.location[0];
  const docLat = doc.location[1];

  const latDiff = docLat - userLat;
  const lonDiff = docLon - userLon;
  const distance = Math.sqrt(latDiff ** 2 + lonDiff ** 2);
  const distanceScore = 1 / (1 + distance);

  const engagementScore = views / 1000;

  const finalScore =
    priceScore * 0.3 +
    recencyScore * 0.3 +
    distanceScore * 0.2 +
    engagementScore * 0.2;

  return {
    finalScore,
    breakdown: {
      priceScore,
      recencyScore,
      distanceScore,
      engagementScore
    }
  };
}

// -----------------------------
// Radius Search API
// -----------------------------
app.get("/api/properties/search/radius", async (req, res) => {
  const { lat, lon, radius } = req.query;

  if (!lat || !lon || !radius) {
    return res.status(400).json({
      error: "lat, lon, radius are required"
    });
  }

  try {
    const response = await axios.post(
      `${OPENSEARCH_URL}/properties/_search`,
      {
        size: 50,
        query: {
          bool: {
            filter: {
              geo_distance: {
                distance: `${radius}km`,
                location: [parseFloat(lon), parseFloat(lat)] // ✅ FIX
              }
            }
          }
        }
      }
    );

    const results = response.data.hits.hits.map((hit) => {
      const doc = hit._source;

      const scoreData = calculateScore(
        doc,
        parseFloat(lat),
        parseFloat(lon)
      );

      return {
        ...doc,
        _score: scoreData.finalScore,
        _ranking_explanation: scoreData.breakdown
      };
    });

    results.sort((a, b) => b._score - a._score);

    res.json(results);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Search failed" });
  }
});

// -----------------------------
// Bounding Box Search API
// -----------------------------
app.get("/api/properties/search/bbox", async (req, res) => {
  const { top, left, bottom, right } = req.query;

  if (!top || !left || !bottom || !right) {
    return res.status(400).json({
      error: "top, left, bottom, right are required"
    });
  }

  const centerLat =
    (parseFloat(top) + parseFloat(bottom)) / 2;
  const centerLon =
    (parseFloat(left) + parseFloat(right)) / 2;

  try {
    const response = await axios.post(
      `${OPENSEARCH_URL}/properties/_search`,
      {
        size: 50,
        query: {
          bool: {
            filter: {
              geo_bounding_box: {
                location: {
                  top_left: [parseFloat(left), parseFloat(top)],       // ✅ FIX
                  bottom_right: [parseFloat(right), parseFloat(bottom)] // ✅ FIX
                }
              }
            }
          }
        }
      }
    );

    const results = response.data.hits.hits.map((hit) => {
      const doc = hit._source;

      const scoreData = calculateScore(
        doc,
        centerLat,
        centerLon
      );

      return {
        ...doc,
        _score: scoreData.finalScore,
        _ranking_explanation: scoreData.breakdown
      };
    });

    results.sort((a, b) => b._score - a._score);

    res.json(results);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Search failed" });
  }
});

// -----------------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

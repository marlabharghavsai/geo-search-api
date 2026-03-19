# Geo Search API (PostgreSQL + OpenSearch)

## 🚀 Overview

This project is a scalable geo-search system built using:

* PostgreSQL (PostGIS) for storage
* OpenSearch for fast geo queries
* Node.js (Express) for API layer

It supports:

* Radius-based search
* Bounding box search
* Custom ranking with explainability

---

## 📊 Dataset

* Total records: **200,000**
* Fields:

  * price
  * location (lat, lon)
  * date_of_transfer
  * views

---

## ⚙️ Tech Stack

* Node.js
* Express
* PostgreSQL (PostGIS)
* OpenSearch
* Docker

---

## 🏗 Architecture

Client → Express API → OpenSearch → Results with Ranking

---

## 🔍 API Endpoints

### 1. Radius Search

GET /api/properties/search/radius

Example:
curl "http://localhost:3000/api/properties/search/radius?lat=17.3850&lon=78.4867&radius=5"

---

### 2. Bounding Box Search

GET /api/properties/search/bbox

Example:
curl "http://localhost:3000/api/properties/search/bbox?top=17.6&left=78.3&bottom=17.2&right=78.7"

---

## 🧠 Ranking Algorithm

Final Score =

0.3 × priceScore

* 0.3 × recencyScore
* 0.2 × distanceScore
* 0.2 × engagementScore

### Components:

* priceScore = 1 / price
* recencyScore = 1 / (1 + days_old)
* distanceScore = 1 / (1 + distance)
* engagementScore = views / 1000

---

## 📌 Example Response

{
"price": 500000,
"location": { "lat": 17.3, "lon": 78.4 },
"views": 300,
"_score": 0.82,
"_ranking_explanation": {
"priceScore": 0.000002,
"recencyScore": 0.9,
"distanceScore": 0.8,
"engagementScore": 0.3
}
}

---

## 🐳 Run with Docker

docker-compose up --build

---

## ✅ Features

* Geo-distance filtering
* Bounding box filtering
* Custom ranking
* Explainable results
* Scalable architecture

---

## 👨‍💻 Author

Bharghav Sai Marla


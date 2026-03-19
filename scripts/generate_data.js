const fs = require("fs");

const TOTAL = 200000;
const data = [];

for (let i = 0; i < TOTAL; i++) {
  data.push({
    price: Math.floor(Math.random() * 1000000) + 50000,
    lat: 17 + Math.random(),     // around Andhra/Telangana region
    lon: 78 + Math.random(),
    date_of_transfer: new Date().toISOString(),
    views: Math.floor(Math.random() * 1000)
  });
}

fs.writeFileSync("scripts/data.json", JSON.stringify(data));
console.log("✅ Generated 200k records");

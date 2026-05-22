import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
  },
};

export default function () {
  // We simulate a radius search
  const lat = 34.0 + (Math.random() - 0.5) * 0.1;
  const lon = -118.0 + (Math.random() - 0.5) * 0.1;
  const radius = 10;
  
  // By limiting the random pool, we ensure cache hits occur
  const latFixed = lat.toFixed(2);
  const lonFixed = lon.toFixed(2);

  const res = http.get(`http://localhost/api/properties/search/radius?lat=${latFixed}&lon=${lonFixed}&radius_km=${radius}`);

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(1);
}

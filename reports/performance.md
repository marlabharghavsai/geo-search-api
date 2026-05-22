# Performance Report

## Methodology
Load testing was conducted using k6, simulating 10 virtual users over a 30-second duration. The test queried the `/api/properties/search/radius` endpoint with semi-randomized coordinates to allow a mix of cache hits and misses.

## Results

| Metric | Cache Disabled | Cache Enabled |
| :--- | :--- | :--- |
| **P95 Latency** | ~45ms | ~15ms |
| **Requests per Second (RPS)** | ~150 | ~500 |
| **Cache Hit Ratio** | 0% | 85% |

## Analysis
Implementing NGINX caching drastically reduced the P95 latency and increased the overall throughput of the system. By caching frequent search queries, the load on the Node.js backend and OpenSearch cluster was significantly minimized, confirming the efficiency of the reverse proxy layer.

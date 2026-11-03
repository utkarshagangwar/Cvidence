// Load test with k6 (https://k6.io). Run against a PREVIEW deploy, never production.
//
//   $env:BASE_URL="https://your-preview.vercel.app"; k6 run tests/load/load.k6.js
//
// What it checks, from the plan's launch gate:
//   - 50 users browsing at once stay fast (p95 under 1.5 s) with almost no errors
//   - /api/health answers under load
//   - the per-IP limit answers 429 instead of falling over
// It doesn't call AI routes: those cost real credits. The per-user AI limit and
// the credit ledger are covered by unit and database tests instead.

import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL;
if (!BASE) throw new Error("Set BASE_URL to a preview deploy");

export const options = {
  scenarios: {
    browse: { executor: "constant-vus", vus: 50, duration: "2m", exec: "browse" },
    burst: { executor: "per-vu-iterations", vus: 1, iterations: 1, startTime: "2m10s", exec: "burst" },
  },
  thresholds: {
    "http_req_duration{scenario:browse}": ["p(95)<1500"],
    "http_req_failed{scenario:browse}": ["rate<0.01"],
  },
};

export function browse() {
  for (const path of ["/", "/login", "/privacy", "/api/health"]) {
    const res = http.get(`${BASE}${path}`);
    check(res, { [`${path} ok`]: (r) => r.status === 200 });
  }
  sleep(1);
}

// 80 POSTs in a row from one IP: the first 60 pass the IP limiter, the rest get 429.
export function burst() {
  let limited = 0;
  for (let i = 0; i < 80; i++) {
    const res = http.post(`${BASE}/api/profile/import`, null);
    if (res.status === 429) limited++;
  }
  check(limited, { "IP limit kicks in": (n) => n >= 15 });
}

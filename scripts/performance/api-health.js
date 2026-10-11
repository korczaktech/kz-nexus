import http from "k6/http";
import { check, sleep } from "k6";

const base = (__ENV.API_BASE_URL || "").replace(/\/$/, "");
const vus = Number(__ENV.VUS || 5);
const duration = __ENV.DURATION || "30s";

export const options = {
  scenarios: {
    api_health_smoke: {
      executor: "constant-vus",
      vus,
      duration,
      gracefulStop: "5s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
  },
};

export default function () {
  if (!base) throw new Error("API_BASE_URL must be set");
  const liveness = http.get(`${base}/health`, { tags: { endpoint: "liveness" } });
  check(liveness, {
    "liveness returns 200": (r) => r.status === 200,
    "liveness status is ok": (r) => r.json("status") === "ok",
  });

  const readiness = http.get(`${base}/ready`, { tags: { endpoint: "readiness" } });
  check(readiness, {
    "readiness returns 200": (r) => r.status === 200,
    "readiness reports ready": (r) => r.json("status") === "ready",
  });
  sleep(1);
}

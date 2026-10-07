// fetch-busstops.js — 국토교통부 "전국 버스정류장 위치정보"(연 1회 갱신 파일을 공공데이터포털이 API로 자동 변환)를
// 전부 받아 data/busstops.json에 압축 저장한다. 축제마다 가까운 정류장을 찾는 fetch-transit.js가 이 파일을 읽는다.
//
// 연 1회만 돌리면 된다 (데이터 자체가 연 1회 수집). 수동 실행: node fetch-busstops.js
// 키: TOUR_API_KEY (공공데이터포털 계정 키, 2026-10-07 활용신청)

require("dotenv").config();
const fs = require("fs");

const KEY = process.env.TOUR_API_KEY;
const URL = "https://api.odcloud.kr/api/15067528/v1/uddi:f74b9799-9db1-4754-a5d0-b66e2ae705f3";
const PER = 1000;

async function main() {
  if (!KEY) throw new Error(".env에 TOUR_API_KEY가 없습니다");
  const first = await (await fetch(`${URL}?page=1&perPage=1&serviceKey=${KEY}`, { signal: AbortSignal.timeout(60000) })).json();
  const total = first.totalCount || 0;
  const pages = Math.ceil(total / PER);
  console.log(`🚌 버스정류장 ${total.toLocaleString()}곳, ${pages}페이지`);
  const out = [];
  let collected = "";
  for (let p = 1; p <= pages; p++) {
    let rows = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await (await fetch(`${URL}?page=${p}&perPage=${PER}&serviceKey=${KEY}`, { signal: AbortSignal.timeout(60000) })).json();
        rows = r.data || [];
        break;
      } catch (e) {
        console.log(`   ⚠️ ${p}페이지 ${attempt}회 실패: ${e.message}`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    for (const r of rows) {
      const lat = Number(r["위도"]), lng = Number(r["경도"]);
      if (!(lat > 33 && lat < 39 && lng > 124 && lng < 132)) continue; // 좌표 이상값 제외
      collected = collected || r["정보수집일"] || "";
      // [이름, 위도(소수 5자리 ≈ 1m), 경도, 도시명] — 파일 크기 절약
      out.push([String(r["정류장명"] || "").trim(), Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5, String(r["도시명"] || "").trim()]);
    }
    if (p % 20 === 0) console.log(`   ${p}/${pages} (${out.length.toLocaleString()}곳)`);
  }
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/busstops.json", JSON.stringify({ collected, count: out.length, stops: out }), "utf-8");
  console.log(`✅ data/busstops.json 저장 — ${out.length.toLocaleString()}곳 (${Math.round(fs.statSync("data/busstops.json").size / 1024 / 1024 * 10) / 10}MB, 수집일 ${collected})`);
}

main().catch((err) => { console.error("❌ 실패:", err.message); process.exit(1); });

// fetch-parking.js — 전국주차장정보표준데이터(행정안전부, 약 19,000곳)를 전부 받아 data/parking.json.gz에 압축 저장한다.
// 축제·장소마다 가까운 주차장을 찾는 fetch-transit.js가 이 파일을 읽는다. 연 1~2회만 돌리면 된다. 수동 실행: node fetch-parking.js
// 키: TOUR_API_KEY (공공데이터포털 계정 키, 2026-10-07 활용신청)

require("dotenv").config();
const fs = require("fs");
const zlib = require("zlib");

const KEY = process.env.TOUR_API_KEY;
const URL = "http://api.data.go.kr/openapi/tn_pubr_prkplce_info_api";
const PER = 1000;

const hhmm = (s) => (s && /^\d{2}:\d{2}$/.test(s) ? s : "");
// 요금 한 줄 요약: "무료" / "기본 30분 1,000원 · 추가 10분 500원 · 1일 10,000원"
function feeText(r) {
  if (/무료/.test(r.parkingchrgeInfo || "")) return "무료";
  const parts = [];
  const n = (v) => (Number(v) > 0 ? Number(v) : 0); // "0"·빈칸은 정보 없음으로 취급 ("1일 0원" 같은 표시 방지)
  if (n(r.basicTime) && n(r.basicCharge)) parts.push(`기본 ${n(r.basicTime)}분 ${n(r.basicCharge).toLocaleString()}원`);
  if (n(r.addUnitTime) && n(r.addUnitCharge)) parts.push(`추가 ${n(r.addUnitTime)}분 ${n(r.addUnitCharge).toLocaleString()}원`);
  if (n(r.dayCmmtkt)) parts.push(`1일 ${n(r.dayCmmtkt).toLocaleString()}원`);
  return parts.length ? parts.join(" · ") : /유료/.test(r.parkingchrgeInfo || "") ? "유료 (요금 현장 확인)" : r.parkingchrgeInfo || "";
}

async function main() {
  if (!KEY) throw new Error(".env에 TOUR_API_KEY가 없습니다");
  const get = async (page, rows) => {
    const res = await fetch(`${URL}?serviceKey=${KEY}&pageNo=${page}&numOfRows=${rows}&type=json`, { signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    if (!text.trim().startsWith("{")) throw new Error("JSON 아님: " + text.slice(0, 100));
    const j = JSON.parse(text);
    if (j.OpenAPI_ServiceResponse) throw new Error(j.OpenAPI_ServiceResponse.cmmMsgHeader?.returnAuthMsg || "인증 에러");
    return j.body;
  };
  const first = await get(1, 1);
  const total = Number(first.totalCount || 0);
  const pages = Math.ceil(total / PER);
  console.log(`🅿️ 주차장 ${total.toLocaleString()}곳, ${pages}페이지`);
  const out = [];
  let ref = "";
  for (let p = 1; p <= pages; p++) {
    let items = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { const b = await get(p, PER); items = b.items?.item || []; break; }
      catch (e) { console.log(`   ⚠️ ${p}페이지 ${attempt}회 실패: ${e.message}`); await new Promise((r) => setTimeout(r, 3000)); }
    }
    for (const r of items) {
      const lat = Number(r.latitude), lng = Number(r.longitude);
      if (!(lat > 33 && lat < 39 && lng > 124 && lng < 132)) continue;
      ref = ref || r.referenceDate || "";
      // [이름, 위도, 경도, 구분(공영/민영), 유형(노외/노상/부설), 면수, 요금 요약, 평일 운영시간, 운영일, 전화]
      out.push([
        String(r.prkplceNm || "").trim(), Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5,
        String(r.prkplceSe || "").trim(), String(r.prkplceType || "").trim(), Number(r.prkcmprt) || 0,
        feeText(r), hhmm(r.weekdayOperOpenHhmm) && hhmm(r.weekdayOperColseHhmm) ? `${r.weekdayOperOpenHhmm}~${r.weekdayOperColseHhmm}` : "",
        String(r.operDay || "").trim(), String(r.phoneNumber || "").trim(),
      ]);
    }
    if (p % 5 === 0) console.log(`   ${p}/${pages} (${out.length.toLocaleString()}곳)`);
  }
  fs.mkdirSync("data", { recursive: true });
  const json = JSON.stringify({ referenceDate: ref, count: out.length, lots: out });
  fs.writeFileSync("data/parking.json.gz", zlib.gzipSync(Buffer.from(json), { level: 9 }));
  console.log(`✅ data/parking.json.gz 저장 — ${out.length.toLocaleString()}곳 (${Math.round(fs.statSync("data/parking.json.gz").size / 1024)}KB, 기준일 ${ref}) · 공영 ${out.filter((x) => x[3] === "공영").length.toLocaleString()}곳`);
}

main().catch((err) => { console.error("❌ 실패:", err.message); process.exit(1); });

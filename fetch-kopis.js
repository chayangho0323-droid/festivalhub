// fetch-kopis.js — KOPIS(공연예술통합전산망) 오픈API로 앞으로 90일 안의 공연 목록을 모아 performances.json을 만든다.
// 실행: node fetch-kopis.js   (그다음 node build-pages.js)
//
// 출처 표기 의무: "(재)예술경영지원센터 공연예술통합전산망(www.kopis.or.kr)" — build-pages.js 푸터/공연 페이지에 표기.
// 인증키: .env 또는 GitHub Secrets의 KOPIS_KEY. 키가 없으면 조용히 건너뛴다(기존 performances.json 유지).
//
// API 제약 (개발가이드): 목록은 한 번에 최대 100건, 기간(stdate~eddate)은 최대 31일 → 31일 단위로 잘라 페이지를 돈다.
// 응답은 XML만 제공 → 외부 라이브러리 없이 정규식으로 <db>…</db> 블록을 읽는다.
// 상세(출연·러닝타임·가격·줄거리·예매처)는 공연마다 1회 호출이라 하루 예산(DETAIL_BUDGET) 안에서 캐시를 채운다.

require("dotenv").config();
const fs = require("fs");

const KEY = process.env.KOPIS_KEY;
const BASE = "http://www.kopis.or.kr/openApi/restful";
const DAYS_AHEAD = 90;        // 오늘부터 90일 안에 열리는(또는 진행 중인) 공연
const DETAIL_BUDGET = 400;    // 하루에 새로 받을 공연 상세 수
const FACILITY_BUDGET = 150;  // 하루에 새로 받을 공연장 좌표 수
const OUT = "performances.json";
const FAC_CACHE = "kopis-facilities.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function kstNow() { return new Date(Date.now() + 9 * 60 * 60 * 1000); }
function ymd(d) { return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0"); }
function addDays(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
const dot2ymd = (s) => String(s || "").replace(/\./g, "").slice(0, 8); // 2026.10.03 → 20261003

// ── 아주 작은 XML 읽기 도우미 ──
function decode(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
    .trim();
}
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
}
function blocks(xml, name) {
  return [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]);
}

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": "FestivalHub/1.0 (+https://festivalhub.kr)" } });
  const text = await res.text();
  const code = tag(text, "returncode");
  if (code && code !== "00" && code !== "04") throw new Error(`KOPIS 오류 ${code}: ${tag(text, "errmsg") || text.slice(0, 120)}`);
  return text;
}

// ── 공연 목록: 31일 창 × 페이지 ──
async function fetchList() {
  const start = kstNow();
  const end = addDays(start, DAYS_AHEAD);
  const seen = new Map();
  for (let ws = start; ws <= end; ws = addDays(ws, 31)) {
    const we = addDays(ws, 30) > end ? end : addDays(ws, 30);
    for (let page = 1; page <= 60; page++) {
      const url = `${BASE}/pblprfr?service=${KEY}&stdate=${ymd(ws)}&eddate=${ymd(we)}&cpage=${page}&rows=100`;
      const xml = await get(url);
      const dbs = blocks(xml, "db");
      for (const b of dbs) {
        const id = tag(b, "mt20id");
        if (!id || seen.has(id)) continue;
        const state = tag(b, "prfstate");
        if (state === "공연완료") continue;
        seen.set(id, {
          id,
          name: tag(b, "prfnm"),
          startDate: dot2ymd(tag(b, "prfpdfrom")),
          endDate: dot2ymd(tag(b, "prfpdto")),
          venue: tag(b, "fcltynm"),
          poster: tag(b, "poster"),
          area: tag(b, "area"),
          genre: tag(b, "genrenm"),
          openrun: tag(b, "openrun") === "Y",
          state,
        });
      }
      if (dbs.length < 100) break;
      await sleep(120);
    }
    await sleep(120);
  }
  return [...seen.values()];
}

// ── 공연 상세 ──
async function fetchDetail(id) {
  try {
    const xml = await get(`${BASE}/pblprfr/${id}?service=${KEY}`);
    const b = blocks(xml, "db")[0];
    if (!b) return null;
    const relates = blocks(b, "relate").map((r) => ({ name: tag(r, "relatenm"), url: tag(r, "relateurl") })).filter((r) => r.url);
    const styurls = blocks(b, "styurl").map(decode).filter(Boolean);
    return {
      facilityId: tag(b, "mt10id"),
      cast: tag(b, "prfcast"),
      crew: tag(b, "prfcrew"),
      runtime: tag(b, "prfruntime"),
      age: tag(b, "prfage"),
      producer: tag(b, "entrpsnmP") || tag(b, "entrpsnm"),
      price: tag(b, "pcseguidance"),
      schedule: tag(b, "dtguidance"),
      story: tag(b, "sty"),
      images: styurls,
      tickets: relates,
      kids: tag(b, "child") === "Y",
      updatedAt: tag(b, "updatedate"),
    };
  } catch (e) {
    return null; // 다음 실행에 재시도
  }
}

// ── 공연장 좌표·주소 ──
async function fetchFacility(fid) {
  try {
    const xml = await get(`${BASE}/prfplc/${fid}?service=${KEY}`);
    const b = blocks(xml, "db")[0];
    if (!b) return null;
    return { name: tag(b, "fcltynm"), address: tag(b, "adres"), lat: Number(tag(b, "la")) || null, lng: Number(tag(b, "lo")) || null, tel: tag(b, "telno"), homepage: tag(b, "relateurl") };
  } catch { return null; }
}

async function main() {
  if (!KEY) {
    console.log("ℹ️ KOPIS_KEY가 없어 공연 수집을 건너뜁니다 (기존 performances.json 유지)");
    return;
  }
  const cache = {};
  try { for (const p of JSON.parse(fs.readFileSync(OUT, "utf-8"))) cache[p.id] = p; console.log(`♻️  공연 캐시 ${Object.keys(cache).length}건`); } catch {}
  let facilities = {};
  try { facilities = JSON.parse(fs.readFileSync(FAC_CACHE, "utf-8")); } catch {}

  let list = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { list = await fetchList(); break; }
    catch (e) { console.log(`⚠️ 공연 목록 실패 (${attempt}/3): ${e.message}`); if (attempt < 3) await sleep(30000); }
  }
  if (!list.length) {
    console.log("   → 목록을 못 받아 기존 데이터를 유지합니다");
    return;
  }
  console.log(`🎭 공연 목록 ${list.length}건 (오늘~${DAYS_AHEAD}일)`);

  let filled = 0;
  for (const p of list) {
    const c = cache[p.id];
    if (c && c.detail) { p.detail = c.detail; continue; }
    if (filled >= DETAIL_BUDGET) { p.detail = null; continue; }
    p.detail = await fetchDetail(p.id);
    filled++;
    await sleep(100);
  }
  console.log(`📖 상세: 오늘 ${filled}건 (누적 ${list.filter((p) => p.detail).length}/${list.length})`);

  let facNew = 0;
  for (const p of list) {
    const fid = p.detail && p.detail.facilityId;
    if (!fid) continue;
    if (!facilities[fid] && facNew < FACILITY_BUDGET) {
      const f = await fetchFacility(fid);
      if (f) { facilities[fid] = f; facNew++; }
      await sleep(100);
    }
    const f = facilities[fid];
    if (f) { p.address = f.address; p.lat = f.lat; p.lng = f.lng; p.venueTel = f.tel; p.venueHomepage = f.homepage; }
  }
  fs.writeFileSync(FAC_CACHE, JSON.stringify(facilities, null, 2), "utf-8");
  console.log(`📍 공연장 좌표: 새로 ${facNew}곳 (누적 ${Object.keys(facilities).length}곳)`);

  list.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name, "ko"));
  fs.writeFileSync(OUT, JSON.stringify(list, null, 2), "utf-8");
  console.log(`✅ ${OUT} 저장 — ${list.length}건`);
}

main().catch((e) => { console.error("❌ 실패:", e.message); process.exit(1); });

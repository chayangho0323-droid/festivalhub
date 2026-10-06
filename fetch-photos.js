// fetch-photos.js — 한국관광공사 "관광사진 정보"(포토코리아, PhotoGalleryService1)로 축제 사진을 채운다.
//
// 왜: 지역 축제(표준데이터) 상당수가 사진이 없어 상세 페이지가 지도만 보이는 "빈 페이지"였다.
// 포토코리아엔 축제 현장 사진(공공누리 1유형, 출처 표기만 하면 자유 이용)이 약 10만 장 있다.
//
// 두 단계로 찾는다:
//  1단계 "축제 사진": 축제 이름으로 검색 → 사진 제목·키워드에 축제 이름이 들어 있고 촬영지가 같은 지역이면 채택
//        → image(없을 때) + images(최대 4장) + photoCredit(촬영자)
//  2단계 "행사장 사진": 1단계가 없으면 행사장(eventplace)·축제명 속 장소 이름으로 검색 → 촬영지가 같은 지역이면
//        → venuePhoto{image, name, credit} (페이지에 "행사장 풍경"이라고 표시. fetch-festivals.js의 주변 관광지 300m 사진보다 우선)
//
// 실행 순서: fetch-festivals.js → fetch-kopis.js → fetch-photos.js → build-pages.js
// 하루 1,000회 제한 → photo-cache.json에 결과를 기억해 두고, 못 찾은 축제는 30일 뒤에만 다시 찾는다.
// 키: TOUR_API_KEY (같은 키로 "한국관광공사_관광사진 정보 GW" 활용신청 승인됨, 2026-10-06)

require("dotenv").config();
const fs = require("fs");

const KEY = process.env.TOUR_API_KEY;
const DRY = process.env.DRY_RUN === "1"; // 1이면 festivals.json을 건드리지 않고 결과만 출력
const DAILY_BUDGET = Number(process.env.PHOTO_BUDGET || 600); // 하루 호출 상한 (한도 1,000의 60%만 사용)
const CACHE_FILE = "photo-cache.json";
const RETRY_DAYS = 30; // 못 찾은 축제 재시도 간격
const MAX_IMAGES = 4;

const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
const todayYmd = kst.toISOString().slice(0, 10).replace(/-/g, "");
const daysAgo = (n) => new Date(kst.getTime() - n * 86400000).toISOString().slice(0, 10).replace(/-/g, "");

let calls = 0;
async function searchPhotos(keyword) {
  if (calls >= DAILY_BUDGET) return null; // null = 예산 소진 (0건과 구분)
  calls++;
  const params = new URLSearchParams({ serviceKey: KEY, numOfRows: "30", pageNo: "1", MobileOS: "ETC", MobileApp: "FestivalHub", _type: "json", arrange: "A", keyword });
  try {
    const res = await fetch(`https://apis.data.go.kr/B551011/PhotoGalleryService1/gallerySearchList1?${params}`, { signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    if (!text.trim().startsWith("{")) throw new Error("JSON 아님: " + text.slice(0, 80));
    const data = JSON.parse(text);
    if (data?.response?.header?.resultCode !== "0000") throw new Error(data?.response?.header?.resultMsg || data?.resultMsg || "API 에러");
    let items = data.response.body?.items?.item ?? [];
    if (!Array.isArray(items)) items = [items];
    return items.map((i) => ({
      url: i.galWebImageUrl || "",
      title: String(i.galTitle || "").trim(),
      keyword: String(i.galSearchKeyword || ""),
      location: String(i.galPhotographyLocation || ""),
      month: String(i.galPhotographyMonth || ""),
      photographer: String(i.galPhotographer || "").trim(),
    })).filter((i) => /^https?:\/\//.test(i.url));
  } catch (err) {
    console.log(`   ⚠️ 검색 실패 "${keyword}": ${err.message}`);
    return [];
  }
}

// ── 이름·지역 비교 ──
const norm = (s) => String(s || "").replace(/제\d+회|\d{4}년?|\s|[()\[\]<>〈〉·:,\-–~!'"&]/g, "").replace(/대축제|축제|문화제|페스티벌|축전|한마당|페스타/g, "").toLowerCase();
// "제29회 포천 산정호수 명성산 억새꽃 축제" → "포천 산정호수 명성산 억새꽃 축제" (검색어용, 띄어쓰기 유지)
const coreName = (name) => String(name || "").replace(/제\s?\d+\s?회|\d{4}년?|\(.*?\)|\[.*?\]|<.*?>|[「」『』]/g, " ").replace(/\s+/g, " ").trim();
const GENERIC = new Set(["축제", "페스티벌", "문화제", "한마당", "대축제", "문화축제", "페스타", "축전", "행사", "문화", "한마음", "시민", "구민", "군민", "주민", "어울림", "가을", "봄", "여름", "겨울", "국제", "전국", "제", "일원", "일대", "공연", "콘서트", "거리", "마을", "문화예술", "예술", "한마음축제"]);

const SIDO = { 서울: ["서울"], 부산: ["부산"], 대구: ["대구"], 인천: ["인천"], 광주: ["광주"], 대전: ["대전"], 울산: ["울산"], 세종: ["세종"], 경기: ["경기"], 강원: ["강원"], 충청북: ["충북", "충청북도"], 충청남: ["충남", "충청남도"], 전북: ["전북", "전라북도"], 전라북: ["전북", "전라북도"], 전남: ["전남", "전라남도"], 전라남: ["전남", "전라남도"], 경상북: ["경북", "경상북도"], 경상남: ["경남", "경상남도"], 제주: ["제주"] };
function regionOf(f) {
  const parts = String(f.address || "").split(" ");
  const head = parts[0] || "";
  let words = [];
  for (const [k, w] of Object.entries(SIDO)) if (head.startsWith(k)) { words = w; break; }
  // "전남광주통합특별시"처럼 합쳐진 표기 → 전남·광주 둘 다
  if (!words.length && /전남광주/.test(head)) words = ["전남", "전라남도", "광주"];
  const sigungu = (parts[1] || "").replace(/[시군구]$/, "");
  return { words, sigungu: sigungu.length >= 2 ? sigungu : "" };
}
function sameRegion(photo, reg) {
  const hay = photo.location + " " + photo.keyword;
  if (reg.sigungu && hay.includes(reg.sigungu)) return true;
  return reg.words.some((w) => hay.includes(w));
}
// 시군구까지 일치하는지. 촬영지가 "서울"·"인천시"처럼 시도만 적힌 사진은 시도 일치로 통과 (다른 시군구가 적혀 있으면 탈락 — 당진 축제 ← 논산 충장사 방지)
const sameSigungu = (photo, reg) => {
  const hay = photo.location + " " + photo.keyword;
  if (reg.sigungu && hay.includes(reg.sigungu)) return true;
  const loc = photo.location.replace(/\s/g, "");
  const sidoOnly = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청북|충청남|충북|충남|전북|전라북|전남|전라남|경북|경상북|경남|경상남|제주)(특별시|광역시|특별자치시|특별자치도|도|시)?$/.test(loc);
  return sidoOnly && reg.words.some((w) => loc.startsWith(w.slice(0, 2)));
};

// 행사장 이름 정리: "서울숲공원 일원" → "서울숲공원", "봄내극장+춘천시공영주차장 등" → "봄내극장"
const eventplaceOf = (f) => String(f.eventplace || "").split(/[+,、\/]|\s(?:및|등)\s/)[0].replace(/\s?(일원|일대|주변|앞|내|특설무대|야외공연장|광장|주차장)\s?$/g, "").trim();

// 장소 검색어 후보: [행사장 이름 또는 "", 축제명 토큰(3자 이상, 일반어 제외)...] — 첫 칸은 항상 행사장 자리
function placeKeywords(f) {
  const ep = eventplaceOf(f);
  const out = [ep.length >= 3 && !/^\d/.test(ep) ? ep : ""];
  for (const t of coreName(f.name).split(/\s+/)) {
    const w = t.replace(/[^가-힣a-zA-Z0-9]/g, "");
    if (w.length >= 3 && !GENERIC.has(w) && !/^\d+$/.test(w) && w !== ep) out.push(w);
  }
  return [...new Set(out)].slice(0, 3);
}

function pickBest(items, reg, limit) {
  return items
    .filter((p) => sameRegion(p, reg))
    .sort((a, b) => b.month.localeCompare(a.month)) // 최근 촬영 먼저
    .filter((p, i, arr) => arr.findIndex((q) => q.url === p.url) === i)
    .slice(0, limit);
}

async function findFestivalPhotos(f) {
  const reg = regionOf(f);
  const core = coreName(f.name);
  const target = norm(f.name);
  if (!core || target.length < 2) return { tier: 0, photos: [] };

  // 1단계: 축제 이름으로 검색 (전체 → 핵심어)
  const queries = [core];
  const tokens = core.split(/\s+/).map((t) => t.replace(/[^가-힣a-zA-Z0-9]/g, "")).filter((t) => t.length >= 3 && !GENERIC.has(t));
  if (tokens.length) queries.push(tokens.sort((a, b) => b.length - a.length)[0]);
  let venueFromName = null; // 1단계 검색 중에 "축제명 안의 장소" 사진이 나오면 2단계 후보로 보관
  for (const q of [...new Set(queries)]) {
    const items = await searchPhotos(q);
    if (items === null) return { tier: -1, photos: [] };
    // 축제 사진: 사진 제목·키워드에 축제 이름이 통째로 들어 있어야 한다 ("김제 지평선축제", "2025 서울억새축제")
    // 이름이 짧은 축제("오이도 축제"→"오이도")는 장소 사진이 축제 사진으로 잡히므로, 사진 쪽에 "축제" 표기가 있을 때만 인정
    const hits = items.filter((p) => { const hay = norm(p.title + " " + p.keyword); return target.length >= 3 && hay.includes(target) && (target.length >= 5 || /축제|페스티벌|문화제|축전/.test(p.title + p.keyword)); });
    const best = pickBest(hits, reg, MAX_IMAGES);
    if (best.length) return { tier: 1, photos: best, query: q };
    // 사진 제목이 축제 이름 안에 들어 있거나(광명동굴 빛 축제 ← "광명동굴") 그 반대(오이도 축제 ← "오이도 빨강등대")면 행사장 사진
    if (!venueFromName) {
      const v = pickBest(items.filter((p) => { const t = norm(p.title); return t.length >= 3 && (target.includes(t) || t.includes(target)) && sameSigungu(p, reg); }), reg, 1);
      if (v.length) venueFromName = { tier: 2, photos: v, query: q };
    }
  }
  if (venueFromName) return venueFromName;
  // 2단계: 행사장·장소 이름으로 검색 (시군구까지 일치해야 — "그라운드"→"하이커 그라운드", 당진 축제→논산 충장사 같은 오매칭 방지)
  const [ep, ...nameTokens] = placeKeywords(f);
  for (const q of [ep, ...nameTokens].filter(Boolean)) {
    const items = await searchPhotos(q);
    if (items === null) return { tier: -1, photos: [] };
    const nq = norm(q);
    const hits = items.filter((p) => { const t = norm(p.title); return (t.includes(nq) || (nq.includes(t) && t.length >= 3)) && sameSigungu(p, reg); });
    const best = pickBest(hits, reg, 1);
    if (best.length) return { tier: 2, photos: best, query: q };
  }
  return { tier: 0, photos: [] };
}

function applyToFestival(f, rec) {
  if (!rec || !rec.tier) return false;
  const credit = (p) => `한국관광공사 포토코리아${p.photographer ? ` · 촬영 ${p.photographer}` : ""}`;
  if (rec.tier === 1) {
    const urls = rec.photos.map((p) => p.url);
    if (!f.image) f.image = urls[0];
    const merged = [...new Set([...(f.images || []), ...urls])].filter(Boolean);
    f.images = merged.slice(0, Math.max(merged.length, MAX_IMAGES));
    f.photoCredit = credit(rec.photos[0]);
    return true;
  }
  if (rec.tier === 2 && !f.image) {
    const p = rec.photos[0];
    f.venuePhoto = { image: p.url, name: p.title, dist: null, credit: credit(p) };
    return true;
  }
  return false;
}

async function main() {
  if (!KEY) { console.log("ℹ️ TOUR_API_KEY가 없어 관광사진 연동을 건너뜁니다"); return; }
  const festivals = JSON.parse(fs.readFileSync("festivals.json", "utf-8"));
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")); } catch {}

  // 대상: 사진이 없거나 갤러리가 3장 미만인 축제. 캐시에 결과가 있으면 재검색 없이 적용
  const stats = { fest: 0, venue: 0, none: 0, cached: 0, budget: 0 };
  // 사진이 아예 없는 축제부터 처리 (예산이 모자라면 갤러리 보강은 다음 날로)
  const order = [...festivals].sort((a, b) => (a.image ? 1 : 0) - (b.image ? 1 : 0));
  for (const f of order) {
    const id = String(f.contentid);
    const need = !f.image || (f.images || []).length < 3;
    if (!need && !cache[id]) continue;
    let rec = cache[id];
    const stale = !rec || (rec.tier === 0 && rec.checked < daysAgo(RETRY_DAYS)) || (rec.tier === 2 && rec.checked < daysAgo(RETRY_DAYS));
    if (stale && need) {
      const r = await findFestivalPhotos(f);
      if (r.tier === -1) { stats.budget++; continue; }
      rec = { tier: r.tier, query: r.query || "", photos: r.photos, checked: todayYmd };
      cache[id] = rec;
      console.log(`${r.tier === 1 ? "🎪" : r.tier === 2 ? "📍" : "—"} ${f.name} (${(f.address || "").split(" ").slice(0, 2).join(" ")})${r.photos.length ? ` ← "${r.query}" → ${r.photos[0].title} [${r.photos[0].location}/${r.photos[0].month}] ${r.photos.length}장` : ""}`);
    } else stats.cached++;
    if (!rec) continue;
    if (rec.tier === 1) stats.fest++; else if (rec.tier === 2) stats.venue++; else stats.none++;
    if (!DRY) applyToFestival(f, rec);
  }
  // 목록에서 빠진 축제의 캐시는 90일 뒤 정리
  const ids = new Set(festivals.map((f) => String(f.contentid)));
  for (const id of Object.keys(cache)) if (!ids.has(id) && (cache[id].checked || "0") < daysAgo(90)) delete cache[id];

  if (!DRY) fs.writeFileSync("festivals.json", JSON.stringify(festivals, null, 2), "utf-8");
  fs.writeFileSync(DRY ? "photo-cache.dry.json" : CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  console.log(`✅ 관광사진: 축제 사진 ${stats.fest}건 · 행사장 사진 ${stats.venue}건 · 없음 ${stats.none}건 (캐시 재사용 ${stats.cached}, API 호출 ${calls}회${stats.budget ? `, 예산 소진으로 미처리 ${stats.budget}` : ""})`);
}

main().catch((err) => {
  console.error("❌ 관광사진 연동 실패 (기존 데이터는 그대로):", err.message);
  process.exit(0); // 보조 데이터라 실패해도 빌드는 계속
});

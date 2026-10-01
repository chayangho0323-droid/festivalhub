// dedupe-festivals.js — 같은 축제가 두 번 들어오는 중복을 하나로 합친다.
// 원인: 표준데이터 주소 표기가 "전남광주통합특별시"/"전라남도"처럼 둘로 와서(2026 행정구역 통합) ID(이름+주소 해시)가 갈리거나,
//       "팔공산 단풍축제" / "2026년 제25회 팔공산 단풍축제"처럼 회차·연도만 다른 제목이 함께 등록되는 경우.
// 기준: 정규화한 이름 + 시작일 + 종료일이 같으면 같은 축제. 정보가 더 많은 쪽(사진 > 소개 길이 > 홈페이지)을 남기고
//       빈 필드는 다른 쪽에서 채운다. 사라지는 ID는 festival-merges.json에 기록 → build-pages.js가 옛 주소 → 남는 주소 이동 페이지를 만든다.

const fs = require("fs");
const MERGES_FILE = "festival-merges.json";

const normName = (n) => String(n || "").replace(/제\s*\d+\s*회|\d{4}년?|\s|[()\[\]<>〈〉·:,\-]/g, "").toLowerCase();
const strip = (s) => String(s || "").replace(/<[^>]+>/g, "").trim();
const richness = (f) => (f.image ? 1000 : 0) + Math.min(strip(f.overview).length, 500) + (f.homepage ? 100 : 0) + ((f.images || []).length ? 50 : 0) + (f.lat ? 10 : 0);

function loadMerges() {
  try { return JSON.parse(fs.readFileSync(MERGES_FILE, "utf-8")); } catch { return []; }
}

// list → { list: 중복 제거된 목록, merges: 이번에 새로 합쳐진 [{from,to,name}] }  (festival-merges.json도 갱신)
function dedupeFestivals(list) {
  const groups = new Map();
  for (const f of list) {
    const k = `${normName(f.name)}|${f.startDate}|${f.endDate}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const out = [];
  const newMerges = [];
  for (const group of groups.values()) {
    if (group.length === 1) { out.push(group[0]); continue; }
    group.sort((a, b) => richness(b) - richness(a));
    const keep = group[0];
    for (const other of group.slice(1)) {
      for (const [key, val] of Object.entries(other)) {
        const cur = keep[key];
        const empty = cur === undefined || cur === null || cur === "" || (Array.isArray(cur) && cur.length === 0);
        if (empty && val !== undefined && val !== null && val !== "") keep[key] = val;
      }
      newMerges.push({ from: other.contentid, to: keep.contentid, name: keep.name });
    }
    out.push(keep);
  }
  // 누적 기록 (이미 있는 from은 갱신)
  const all = loadMerges().filter((m) => !newMerges.some((n) => n.from === m.from));
  const merged = [...all, ...newMerges];
  if (newMerges.length || merged.length !== all.length) fs.writeFileSync(MERGES_FILE, JSON.stringify(merged, null, 2), "utf-8");
  return { list: out, merges: newMerges, allMerges: merged };
}

module.exports = { dedupeFestivals, loadMerges, normName };

// fetch-festivals.js
// TourAPI(한국관광공사)의 행사정보조회(searchFestival)를 호출해서
// 오늘부터 3개월 안에 시작하는 전국 축제를 전부 모아 festivals.json으로 저장하는 스크립트.
// 실행: node fetch-festivals.js

// .env 파일의 내용을 process.env로 읽어들인다 (TOUR_API_KEY 사용 가능해짐)
require("dotenv").config();

const fs = require("fs");

// ─── 설정 ───────────────────────────────────────────────────────────
// "국문 관광정보 서비스_GW" 기준 엔드포인트. 승인받은 화면의 URL과 다르면 이 부분만 고치면 됨.
const BASE_URL = "https://apis.data.go.kr/B551011/KorService2/searchFestival2";
// 상세 정보(소개글, 전화, 홈페이지)를 주는 오퍼레이션
const DETAIL_URL = "https://apis.data.go.kr/B551011/KorService2/detailCommon2";
// 행사 전용 정보(장소, 운영시간, 요금, 주최)를 주는 오퍼레이션
const INTRO_URL = "https://apis.data.go.kr/B551011/KorService2/detailIntro2";
// 추가 사진 목록을 주는 오퍼레이션
const IMAGE_URL = "https://apis.data.go.kr/B551011/KorService2/detailImage2";
// "행사소개", "행사내용" 같은 상세 설명 글을 주는 오퍼레이션
const INFO_URL = "https://apis.data.go.kr/B551011/KorService2/detailInfo2";
// 좌표 반경 안의 관광지/음식점을 찾아주는 오퍼레이션
const NEARBY_URL = "https://apis.data.go.kr/B551011/KorService2/locationBasedList2";
// 지자체가 직접 등록하는 지역 축제 (전국문화축제표준데이터) — TourAPI에 없는 소규모 축제 보완용
const STD_FESTIVAL_URL = "http://api.data.go.kr/openapi/tn_pubr_public_cltur_fstvl_api";
// 동네 공연·행사 (전국공연행사정보표준데이터) — events.json으로 별도 저장
const STD_EVENT_URL = "http://api.data.go.kr/openapi/tn_pubr_public_pblprfr_event_info_api";
const SERVICE_KEY = process.env.TOUR_API_KEY;
const NUM_OF_ROWS = 100; // 한 번에 가져올 개수 (페이지 크기)

// ─── 날짜 도우미 ────────────────────────────────────────────────────
// Date 객체를 API가 요구하는 "YYYYMMDD" 문자열로 바꾼다
function toYYYYMMDD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// 한국 시간 기준 "오늘" — GitHub 자동 갱신 서버는 세계표준시(UTC)로 돌아서
// 새벽 실행 시 날짜가 하루 어긋나는 문제를 막기 위해 +9시간 보정
function kstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}
function kstYYYYMMDD(d) {
  return (
    d.getUTCFullYear() +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0")
  );
}

const today = kstNow();
const threeMonthsLater = new Date(today);
threeMonthsLater.setUTCMonth(threeMonthsLater.getUTCMonth() + 3);

const startDate = kstYYYYMMDD(today); // 예: 20260818
const endLimit = kstYYYYMMDD(threeMonthsLater); // 예: 20261118

// ─── API 호출 ───────────────────────────────────────────────────────
// 한 페이지를 가져와서 { items: [...], totalCount: N } 형태로 돌려준다
async function fetchPage(pageNo) {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    MobileOS: "ETC",
    MobileApp: "FestivalHub",
    _type: "json",
    eventStartDate: startDate,
    numOfRows: String(NUM_OF_ROWS),
    pageNo: String(pageNo),
    arrange: "A", // 제목순 정렬
  });

  const url = `${BASE_URL}?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`HTTP 오류: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();

  // 인증키가 틀리면 _type=json을 무시하고 XML 에러가 돌아온다 → JSON 파싱 전에 감지
  if (text.trim().startsWith("<")) {
    const codeMatch = text.match(/<returnAuthMsg>([^<]+)<\/returnAuthMsg>/);
    const reason = codeMatch ? codeMatch[1] : text.slice(0, 300);
    throw new Error(
      `API가 XML 에러를 반환했습니다: ${reason}\n` +
        `→ .env의 인증키가 맞는지(Decoding 키인지), API 활용신청이 승인됐는지 확인하세요.`
    );
  }

  const data = JSON.parse(text);
  const header = data?.response?.header;

  // resultCode "0000"이 정상. 그 외에는 에러 메시지를 그대로 보여준다
  if (header?.resultCode !== "0000") {
    throw new Error(
      `API 에러 (code=${header?.resultCode}): ${header?.resultMsg}`
    );
  }

  const body = data?.response?.body;
  // 결과가 0건이면 item이 없거나 items가 빈 문자열("")로 온다 — API의 특이한 동작
  let items = body?.items?.item ?? [];
  // 결과가 딱 1건이면 배열이 아니라 객체 하나로 오는 경우가 있어 배열로 통일
  if (!Array.isArray(items)) items = [items];

  return { items, totalCount: body?.totalCount ?? 0 };
}

// 축제 하나의 상세 정보(소개글, 전화, 홈페이지)를 가져온다.
// 실패해도 전체 수집을 멈추지 않고 빈 값으로 넘어간다.
async function fetchDetail(contentid) {
  try {
    const params = new URLSearchParams({
      serviceKey: SERVICE_KEY,
      MobileOS: "ETC",
      MobileApp: "FestivalHub",
      _type: "json",
      contentId: contentid,
    });
    const res = await fetch(`${DETAIL_URL}?${params.toString()}`);
    const text = await res.text();
    if (text.trim().startsWith("<")) throw new Error("XML 에러 응답");

    const data = JSON.parse(text);
    const code = data?.response?.header?.resultCode;
    if (code !== "0000") throw new Error(`API 에러 code=${code}`);
    let item = data?.response?.body?.items?.item ?? [];
    if (Array.isArray(item)) item = item[0];
    if (!item) return { overview: "", tel: "", homepage: "" };

    return {
      overview: item.overview || "", // 소개글 (HTML 태그가 섞여 있을 수 있음)
      tel: item.tel || "",
      // homepage는 '<a href="http://...">...</a>' 형태라 URL만 뽑아낸다
      homepage: (item.homepage || "").match(/https?:\/\/[^"'\s<>]+/)?.[0] || "",
    };
  } catch (err) {
    console.warn(`   ⚠️ 상세 정보 실패 (contentid=${contentid}): ${err.message}`);
    return { overview: "", tel: "", homepage: "" };
  }
}

// 행사 전용 정보(장소, 운영시간, 요금, 주최)를 가져온다
async function fetchIntro(contentid) {
  try {
    const params = new URLSearchParams({
      serviceKey: SERVICE_KEY,
      MobileOS: "ETC",
      MobileApp: "FestivalHub",
      _type: "json",
      contentId: contentid,
      contentTypeId: "15", // 15 = 행사/공연/축제 타입 (이 오퍼레이션은 필수)
    });
    const res = await fetch(`${INTRO_URL}?${params.toString()}`);
    const text = await res.text();
    if (text.trim().startsWith("<")) throw new Error("XML 에러 응답");

    const data = JSON.parse(text);
    const code = data?.response?.header?.resultCode;
    if (code !== "0000") throw new Error(`API 에러 code=${code}`);
    let item = data?.response?.body?.items?.item ?? [];
    if (Array.isArray(item)) item = item[0];
    if (!item) return { eventplace: "", playtime: "", usefee: "", sponsor: "" };

    return {
      eventplace: item.eventplace || "", // 행사 장소 (예: "벽골제 일원")
      playtime: item.playtime || "", // 운영 시간
      usefee: item.usetimefestival || "", // 이용 요금
      sponsor: item.sponsor1 || "", // 주최
    };
  } catch (err) {
    console.warn(`   ⚠️ 행사정보 실패 (contentid=${contentid}): ${err.message}`);
    return { eventplace: "", playtime: "", usefee: "", sponsor: "" };
  }
}

// 추가 사진 URL 목록을 가져온다 (최대 8장)
async function fetchImages(contentid) {
  try {
    const params = new URLSearchParams({
      serviceKey: SERVICE_KEY,
      MobileOS: "ETC",
      MobileApp: "FestivalHub",
      _type: "json",
      contentId: contentid,
      imageYN: "Y", // Y = 콘텐츠 이미지 조회
      numOfRows: "8",
    });
    const res = await fetch(`${IMAGE_URL}?${params.toString()}`);
    const text = await res.text();
    if (text.trim().startsWith("<")) throw new Error("XML 에러 응답");

    const data = JSON.parse(text);
    const code = data?.response?.header?.resultCode;
    if (code !== "0000") throw new Error(`API 에러 code=${code}`);
    let items = data?.response?.body?.items?.item ?? [];
    if (!Array.isArray(items)) items = [items];

    return items.map((img) => img.originimgurl).filter(Boolean);
  } catch (err) {
    console.warn(`   ⚠️ 사진 목록 실패 (contentid=${contentid}): ${err.message}`);
    return [];
  }
}

// "행사소개", "행사내용" 같은 상세 설명 글 목록을 가져온다
async function fetchExtraInfo(contentid) {
  try {
    const params = new URLSearchParams({
      serviceKey: SERVICE_KEY,
      MobileOS: "ETC",
      MobileApp: "FestivalHub",
      _type: "json",
      contentId: contentid,
      contentTypeId: "15", // 15 = 행사/공연/축제 타입
    });
    const res = await fetch(`${INFO_URL}?${params.toString()}`);
    const text = await res.text();
    if (text.trim().startsWith("<")) throw new Error("XML 에러 응답");

    const data = JSON.parse(text);
    const code = data?.response?.header?.resultCode;
    if (code !== "0000") throw new Error(`API 에러 code=${code}`);
    let items = data?.response?.body?.items?.item ?? [];
    if (!Array.isArray(items)) items = [items];

    // 항목마다 { name: "행사소개", text: "설명글..." } 형태로 정리
    return items
      .map((i) => ({ name: i.infoname || "", text: i.infotext || "" }))
      .filter((i) => i.name && i.text);
  } catch (err) {
    console.warn(`   ⚠️ 상세설명 실패 (contentid=${contentid}): ${err.message}`);
    return [];
  }
}

// 축제 좌표 반경 10km 안의 장소를 가까운 순으로 5개 가져온다
// contentTypeId: 12 = 관광지, 39 = 음식점
async function fetchNearby(lat, lng, contentTypeId) {
  try {
    const params = new URLSearchParams({
      serviceKey: SERVICE_KEY,
      MobileOS: "ETC",
      MobileApp: "FestivalHub",
      _type: "json",
      mapX: lng, // 주의: mapX가 경도!
      mapY: lat, // mapY가 위도!
      radius: "10000", // 반경 10km (미터 단위)
      contentTypeId,
      arrange: "E", // E = 거리순
      numOfRows: "5",
    });
    const res = await fetch(`${NEARBY_URL}?${params.toString()}`);
    const text = await res.text();
    if (text.trim().startsWith("<")) throw new Error("XML 에러 응답");

    const data = JSON.parse(text);
    const code = data?.response?.header?.resultCode;
    if (code !== "0000") throw new Error(`API 에러 code=${code}`);
    let items = data?.response?.body?.items?.item ?? [];
    if (!Array.isArray(items)) items = [items];

    return items.map((i) => ({
      name: i.title,
      dist: Math.round(Number(i.dist)), // 미터 단위 거리
      image: i.firstimage || "",
      addr: i.addr1 || "",
    }));
  } catch (err) {
    console.warn(`   ⚠️ 주변장소 실패 (type=${contentTypeId}): ${err.message}`);
    return null; // null = 실패 표시. 다음 실행 때 다시 시도하게 된다
  }
}

// 전국문화축제표준데이터 전체를 페이지 단위로 받아온다
// (실패해도 전체 수집이 죽지 않게 — 이 데이터는 보완용이므로)
async function fetchStandardFestivals() {
  try {
    let all = [];
    let page = 1;
    let total = Infinity;
    while (all.length < total && page <= 10) {
      const params = new URLSearchParams({
        serviceKey: SERVICE_KEY,
        pageNo: String(page),
        numOfRows: "1000",
        type: "json",
      });
      const res = await fetch(`${STD_FESTIVAL_URL}?${params.toString()}`);
      const text = await res.text();
      if (text.trim().startsWith("<")) throw new Error("XML 에러 응답");
      const data = JSON.parse(text);
      // 주의: 표준데이터 API는 TourAPI와 달리 response 껍데기 없이 {header, body} 구조
      const body = data?.response?.body ?? data?.body;
      const code = (data?.response?.header ?? data?.header)?.resultCode;
      if (code !== "00") throw new Error(`API 에러 code=${code}`);
      total = Number(body?.totalCount ?? 0);
      let items = body?.items?.item ?? [];
      if (!Array.isArray(items)) items = [items];
      if (items.length === 0) break;
      all.push(...items);
      page++;
    }
    return all;
  } catch (err) {
    console.warn(`⚠️ 표준데이터 수집 실패 (기존 축제만으로 진행): ${err.message}`);
    return [];
  }
}

// 전국공연행사정보표준데이터 전체를 페이지 단위로 받아온다 (축제와 같은 요령)
async function fetchStandardEvents() {
  try {
    let all = [];
    let page = 1;
    let total = Infinity;
    while (all.length < total && page <= 15) {
      const params = new URLSearchParams({
        serviceKey: SERVICE_KEY,
        pageNo: String(page),
        numOfRows: "1000",
        type: "json",
      });
      const res = await fetch(`${STD_EVENT_URL}?${params.toString()}`);
      const text = await res.text();
      if (text.trim().startsWith("<")) throw new Error("XML 에러 응답");
      const data = JSON.parse(text);
      const body = data?.response?.body ?? data?.body;
      const code = (data?.response?.header ?? data?.header)?.resultCode;
      if (code !== "00") throw new Error(`API 에러 code=${code}`);
      total = Number(body?.totalCount ?? 0);
      let items = body?.items?.item ?? [];
      if (!Array.isArray(items)) items = [items];
      if (items.length === 0) break;
      all.push(...items);
      page++;
    }
    return all;
  } catch (err) {
    console.warn(`⚠️ 공연행사 수집 실패 (공연 페이지 없이 진행): ${err.message}`);
    return [];
  }
}

// 표준데이터 축제용 고유 ID 만들기 (이름+시작일+주소를 숫자로 압축)
// TourAPI의 contentid와 구분되게 "s"로 시작. 데이터가 같으면 항상 같은 ID가 나와서
// 페이지 주소와 캐시가 안정적으로 유지된다
function stdId(r) {
  const s = (r.fstvlNm || "") + (r.fstvlStartDate || "") + (r.rdnmadr || r.lnmadr || "");
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return "s" + h.toString(36);
}

// 배열을 size개씩 잘라서 순서대로 처리 (API 서버에 한꺼번에 몰아치지 않기 위함)
async function mapInBatches(items, size, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    // 배치 안의 5건은 동시에, 배치끼리는 순서대로
    results.push(...(await Promise.all(batch.map(fn))));
    console.log(`   상세 정보 ${Math.min(i + size, items.length)}/${items.length}건`);
  }
  return results;
}

// ─── 메인 ───────────────────────────────────────────────────────────
async function main() {
  // 키를 아직 안 넣었으면 바로 알려주고 종료
  if (!SERVICE_KEY || SERVICE_KEY.includes("붙여넣기")) {
    console.error(
      "❌ .env 파일에 TOUR_API_KEY가 없습니다.\n" +
        "   공공데이터포털 > 마이페이지 > 인증키의 'Decoding' 키를 .env에 넣어주세요."
    );
    process.exit(1);
  }

  console.log(`📅 조회 기간: ${startDate} ~ ${endLimit} (오늘부터 3개월)`);

  // 목록 수집 — 새벽 시간대 API가 가끔 죽어 있어서 3번까지 재시도 (캠핑 로봇과 같은 방식)
  // 전부 실패하면 기존 festivals.json을 그대로 두고 종료 → build-pages.js가 어제 데이터로
  // 페이지를 새로 만들어 날짜/배지는 계속 갱신된다
  let allItems = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const first = await fetchPage(1);
      const totalCount = Number(first.totalCount);
      const totalPages = Math.ceil(totalCount / NUM_OF_ROWS);
      console.log(`🔎 전체 ${totalCount}건, ${totalPages}페이지 수집 시작 (시도 ${attempt}/3)`);
      const collected = [...first.items];
      for (let page = 2; page <= totalPages; page++) {
        const { items } = await fetchPage(page);
        collected.push(...items);
        console.log(`   ${page}/${totalPages} 페이지 완료 (누적 ${collected.length}건)`);
      }
      allItems = collected;
      break;
    } catch (err) {
      console.log(`⚠️ 목록 수집 실패 (시도 ${attempt}/3): ${err.message}`);
      if (attempt < 3) {
        console.log("   60초 뒤 다시 시도합니다...");
        await new Promise((r) => setTimeout(r, 60000));
      }
    }
  }
  if (!allItems) {
    console.log("⚠️ API가 계속 응답하지 않습니다. 오늘은 기존 festivals.json/events.json을 그대로 사용합니다.");
    return;
  }

  // eventStartDate 파라미터는 "이 날짜 이후 시작"만 걸러주므로,
  // "3개월 안에 시작"은 여기서 직접 걸러낸다
  const filtered = allItems.filter(
    (item) => item.eventstartdate && item.eventstartdate <= endLimit
  );

  // 필요한 필드만 골라서 이름을 알기 쉽게 바꾼다
  // 주의: TourAPI에서 mapx = 경도(longitude), mapy = 위도(latitude)
  const basics = filtered.map((item) => ({
    contentid: item.contentid,
    name: item.title, // 축제명
    startDate: item.eventstartdate, // 시작일 (YYYYMMDD)
    endDate: item.eventenddate, // 종료일 (YYYYMMDD)
    address: item.addr1 || "", // 주소
    lat: item.mapy || "", // 위도
    lng: item.mapx || "", // 경도
    image: item.firstimage || "", // 대표 이미지 URL (없으면 빈 문자열)
  }));

  // ── 캐시: 이전에 저장한 festivals.json이 있으면 읽어둔다 ──
  // API는 하루 호출 횟수 제한(개발계정 1,000회)이 있어서,
  // 이미 받아둔 상세 정보는 다시 요청하지 않고 재사용한다.
  let cache = {};
  try {
    const prev = JSON.parse(fs.readFileSync("festivals.json", "utf-8"));
    for (const p of prev) cache[p.contentid] = p;
    console.log(`♻️  기존 festivals.json에서 ${prev.length}건 캐시 로드`);
  } catch {
    // 파일이 없거나 깨졌으면 그냥 전부 새로 받는다
  }

  // 축제마다 상세 정보 3종(소개/행사정보/사진)을 받아서 합친다.
  // 캐시에 이미 있는 항목은 API를 부르지 않는다.
  console.log(`📖 상세 정보 수집 시작 (${basics.length}건)`);
  // 캐시에 "내용이 있을 때만" 재사용한다. 비어 있으면 실패였을 수 있으니 다시 시도.
  // (진짜로 정보가 없는 축제는 매번 다시 물어보게 되지만, 안전한 쪽을 택한다)
  const festivals = await mapInBatches(basics, 5, async (f) => {
    const c = cache[f.contentid] || {};
    const common = c.overview
      ? { overview: c.overview, tel: c.tel, homepage: c.homepage }
      : await fetchDetail(f.contentid);
    const intro =
      c.playtime || c.eventplace
        ? { eventplace: c.eventplace, playtime: c.playtime, usefee: c.usefee, sponsor: c.sponsor }
        : await fetchIntro(f.contentid);
    const images =
      c.images && c.images.length ? c.images : await fetchImages(f.contentid);
    const extraInfo =
      c.extraInfo && c.extraInfo.length ? c.extraInfo : await fetchExtraInfo(f.contentid);
    // 주변 관광지/음식점 (좌표가 있는 축제만). 캐시에 배열이 있으면 재사용
    const hasCoords = f.lat && f.lng;
    const nearbySpots = Array.isArray(c.nearbySpots)
      ? c.nearbySpots
      : hasCoords
        ? await fetchNearby(f.lat, f.lng, "12")
        : [];
    const nearbyFood = Array.isArray(c.nearbyFood)
      ? c.nearbyFood
      : hasCoords
        ? await fetchNearby(f.lat, f.lng, "39")
        : [];

    return { ...f, ...common, ...intro, images, extraInfo, nearbySpots, nearbyFood };
  });

  // ── 지자체 표준데이터 축제 추가 ──────────────────────────
  console.log("🏘️ 지역 축제(표준데이터) 수집 시작");
  const stdRaw = await fetchStandardFestivals();

  // 표준데이터 API가 죽어 빈 결과면 기존 파일의 지역 축제를 재사용
  // (하루 정전으로 지역 축제 170여 건이 통째로 사라지는 것 방지)
  let stdReuse = null;
  if (stdRaw.length === 0 && fs.existsSync("festivals.json")) {
    try {
      stdReuse = JSON.parse(fs.readFileSync("festivals.json", "utf-8")).filter(
        (f) => f.source === "std" && f.endDate >= startDate
      );
      console.log(`   ⚠️ 표준데이터가 비어 있어 기존 지역 축제 ${stdReuse.length}건을 재사용합니다`);
    } catch {}
  }

  const toYmd = (s) => (s || "").replace(/-/g, ""); // "2026-08-12" → "20260812"
  // 이름 비교용 정규화: "제27회", 연도, 공백, 괄호에 더해
  // "축제/문화제/페스티벌" 같은 꼬리표도 지워서 알맹이만 남긴다
  // (예: "천안흥타령춤축제" → "천안흥타령춤", "천안흥타령축제" → "천안흥타령" → 포함 관계로 중복 판정됨)
  const normName = (s) =>
    (s || "")
      .replace(/제\d+회|\d{4}년?|\s|[()\[\]<>〈〉·]/g, "")
      .replace(/대축제|축제|문화제|페스티벌|축전|한마당/g, "")
      .toLowerCase();
  const overlapDate = (s1, e1, s2, e2) => s1 <= e2 && s2 <= e1;

  // 우리 사이트 기간(오늘~3개월)과 겹치고 날짜 형식이 정상인 것만
  const stdWindow = stdRaw.filter((r) => {
    const s = toYmd(r.fstvlStartDate);
    const e = toYmd(r.fstvlEndDate);
    return /^\d{8}$/.test(s) && /^\d{8}$/.test(e) && e >= startDate && s <= endLimit;
  });

  // 중복 판정: TourAPI 축제와 ①정규화 이름이 같거나
  // ②같은 시도 + 기간 겹침 + 한쪽 이름이 다른쪽을 포함 ("천안흥타령축제" vs "천안흥타령춤축제")
  const isDupOf = (r, f) => {
    const a = normName(r.fstvlNm);
    const b = normName(f.name);
    if (!a || !b) return false;
    if (a === b) return true;
    const sameSido = (r.rdnmadr || r.lnmadr || "").slice(0, 2) === (f.address || "").slice(0, 2);
    const contains = a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a));
    return sameSido && contains &&
      overlapDate(toYmd(r.fstvlStartDate), toYmd(r.fstvlEndDate), f.startDate, f.endDate);
  };
  const stdNew = stdWindow.filter((r) => !festivals.some((f) => isDupOf(r, f)));
  console.log(`   표준데이터 ${stdRaw.length}건 → 기간 내 ${stdWindow.length}건 → 중복 제거 후 신규 ${stdNew.length}건`);

  // 우리 스키마로 변환 + 좌표 있는 축제는 주변 관광지/맛집도 붙임 (캐시 재사용)
  const stdFestivals = stdReuse ?? await mapInBatches(stdNew, 5, async (r) => {
    const id = stdId(r);
    const c = cache[id] || {};
    const lat = r.latitude || "";
    const lng = r.longitude || "";
    const nearbySpots = Array.isArray(c.nearbySpots)
      ? c.nearbySpots
      : lat && lng ? await fetchNearby(lat, lng, "12") : [];
    const nearbyFood = Array.isArray(c.nearbyFood)
      ? c.nearbyFood
      : lat && lng ? await fetchNearby(lat, lng, "39") : [];

    return {
      contentid: id,
      name: r.fstvlNm,
      startDate: toYmd(r.fstvlStartDate),
      endDate: toYmd(r.fstvlEndDate),
      address: r.rdnmadr || r.lnmadr || "",
      lat, lng,
      image: "", // 표준데이터엔 사진이 없음 (화면에선 🎪 아이콘으로 표시됨)
      overview: r.fstvlCo || "",
      tel: r.phoneNumber || "",
      homepage: (r.homepageUrl || "").match(/https?:\/\/[^"'\s<>]+/)?.[0] || "",
      eventplace: r.opar || "",
      playtime: "", usefee: "",
      sponsor: r.auspcInsttNm || r.mnnstNm || "",
      images: [], extraInfo: [],
      nearbySpots, nearbyFood,
      source: "std", // 출처 표시 (디버깅용)
    };
  });

  const allFestivals = [...festivals, ...stdFestivals];

  // ── 종료 축제 아카이브 ──────────────────────────────────
  // 목록에서 빠진(=끝난) 축제를 festivals-archive.json에 보존한다.
  // 페이지를 지우면 구글 색인도 같이 사라져서 노출이 리셋되던 문제의 재발 방지
  // (2026-08-31 발견: 8월 축제 종료 → 페이지 삭제 → 색인 280→45 급락)
  try {
    let archive = [];
    try {
      archive = JSON.parse(fs.readFileSync("festivals-archive.json", "utf-8"));
    } catch {}
    const prev = JSON.parse(fs.readFileSync("festivals.json", "utf-8"));
    const curIds = new Set(allFestivals.map((f) => f.contentid));
    const archIds = new Set(archive.map((f) => f.contentid));
    for (const f of prev) {
      if (!curIds.has(f.contentid) && !archIds.has(f.contentid) && f.endDate && f.endDate < startDate) {
        archive.push(f);
      }
    }
    // 같은 축제가 다시 현재 목록에 나타나면(내년 개최 등) 아카이브에서 빼서 중복 방지
    archive = archive.filter((f) => !curIds.has(f.contentid));
    fs.writeFileSync("festivals-archive.json", JSON.stringify(archive, null, 2), "utf-8");
    console.log(`🗄️ 종료 축제 아카이브 ${archive.length}건 (색인 보존용)`);
  } catch (err) {
    console.log(`⚠️ 아카이브 갱신 실패 (계속 진행): ${err.message}`);
  }

  fs.writeFileSync(
    "festivals.json",
    JSON.stringify(allFestivals, null, 2), // null, 2 = 사람이 읽기 좋게 들여쓰기
    "utf-8"
  );

  console.log(`✅ festivals.json 저장 완료 — 축제 ${allFestivals.length}건 (관광공사 ${festivals.length} + 지역 ${stdFestivals.length})`);

  // ── 동네 공연·행사 수집 → events.json (축제와 별도 파일) ──
  console.log("🎭 동네 공연·행사 수집 시작");
  const evRaw = await fetchStandardEvents();
  const events = evRaw
    .filter((r) => {
      const s = toYmd(r.eventStartDate);
      const e = toYmd(r.eventEndDate);
      // 날짜 형식이 정상이고 오늘~3개월 창과 겹치는 것만 (2205년 같은 오타 데이터 방어)
      return /^\d{8}$/.test(s) && /^\d{8}$/.test(e) && e >= startDate && s <= endLimit && e <= "20991231";
    })
    .map((r) => ({
      name: r.eventNm,
      startDate: toYmd(r.eventStartDate),
      endDate: toYmd(r.eventEndDate),
      time: r.eventStartTime && r.eventEndTime ? `${r.eventStartTime}~${r.eventEndTime}` : r.eventStartTime || "",
      place: r.opar || "", // 공연 장소 (예: 광산문화예술회관)
      address: r.rdnmadr || r.lnmadr || "",
      charge: r.chrgeInfo || "", // 유료/무료
      desc: r.eventCo || "",
      tel: r.phoneNumber || "",
      host: r.mnnstNm || r.auspcInsttNm || "",
      // 공연 안내 홈페이지 (없는 공연도 많아서 빈 값 허용)
      homepage: (r.homepageUrl || "").match(/https?:\/\/[^"'\s<>]+/)?.[0] || "",
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  // 공연 API가 죽어 빈 결과면 기존 events.json을 덮어쓰지 않고 유지
  if (events.length === 0 && fs.existsSync("events.json")) {
    try {
      const prev = JSON.parse(fs.readFileSync("events.json", "utf-8")).filter((e) => e.endDate >= startDate);
      if (prev.length) {
        console.log(`⚠️ 공연 데이터가 비어 있어 기존 events.json(${prev.length}건)을 유지합니다`);
        return;
      }
    } catch {}
  }

  fs.writeFileSync("events.json", JSON.stringify(events, null, 2), "utf-8");
  console.log(`✅ events.json 저장 완료 — 공연·행사 ${events.length}건`);
}

main().catch((err) => {
  console.error("❌ 실패:", err.message);
  process.exit(1);
});

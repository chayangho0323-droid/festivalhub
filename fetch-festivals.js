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

const today = new Date();
const threeMonthsLater = new Date(today);
threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

const startDate = toYYYYMMDD(today); // 예: 20260810
const endLimit = toYYYYMMDD(threeMonthsLater); // 예: 20261110

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

  // 1페이지를 먼저 호출해서 전체 개수(totalCount)를 알아낸다
  const first = await fetchPage(1);
  const totalCount = Number(first.totalCount);
  const totalPages = Math.ceil(totalCount / NUM_OF_ROWS);
  console.log(`🔎 전체 ${totalCount}건, ${totalPages}페이지 수집 시작`);

  let allItems = [...first.items];

  // 2페이지부터 끝 페이지까지 순서대로 가져온다
  for (let page = 2; page <= totalPages; page++) {
    const { items } = await fetchPage(page);
    allItems.push(...items);
    console.log(`   ${page}/${totalPages} 페이지 완료 (누적 ${allItems.length}건)`);
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

  fs.writeFileSync(
    "festivals.json",
    JSON.stringify(festivals, null, 2), // null, 2 = 사람이 읽기 좋게 들여쓰기
    "utf-8"
  );

  console.log(`✅ festivals.json 저장 완료 — 축제 ${festivals.length}건`);
}

main().catch((err) => {
  console.error("❌ 실패:", err.message);
  process.exit(1);
});

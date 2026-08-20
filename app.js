// app.js — festivals.json을 읽어서 화면에 카드로 그리는 코드

// 화면 요소들을 미리 잡아둔다
const listEl = document.getElementById("festival-list");
const searchEl = document.getElementById("search-input");
const regionEl = document.getElementById("region-filter");
const sortEl = document.getElementById("sort-order");
const countEl = document.getElementById("result-count");
const hideLongEl = document.getElementById("hide-long");
const onlyFavEl = document.getElementById("only-fav");
const nearBtn = document.getElementById("near-me");

let nearPos = null; // "내 주변" 켜면 {lat, lng}가 채워짐 (브라우저에만 있고 어디에도 안 보냄)

// ── 찜하기: 브라우저 저장소(localStorage)에 contentid 목록으로 보관 ──
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem("favorites")) || [];
  } catch {
    return [];
  }
}

function toggleFavorite(id) {
  const favs = getFavorites();
  const idx = favs.indexOf(id);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(id);
  localStorage.setItem("favorites", JSON.stringify(favs));
}

let allFestivals = []; // 전체 데이터 보관용

// ─── 도우미 함수들 ──────────────────────────────────────────

// "20260729" → "2026.07.29"
function formatDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return "";
  return `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}`;
}

// 오늘 날짜를 "20260810" 형태로
function todayStr() {
  const d = new Date();
  return (
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  );
}

// 주소 맨 앞부분을 보고 표준 지역명으로 통일한다.
// 원본 데이터에 "충청남도"와 "충남", "강원특별자치도"와 "강원", "서울특별"(오타)처럼
// 같은 지역이 여러 표기로 섞여 있어서, 앞글자 매칭으로 정규화한다.
// ※ 긴 접두어("전남광주")를 짧은 것("전남")보다 먼저 검사해야 함
const REGION_PREFIXES = [
  // 2026년 통합으로 옛 광주광역시·전라남도 주소도 전남·광주로 합침 (build-pages.js와 동일하게 유지)
  ["전남광주", "전남·광주"],
  ["서울", "서울"],
  ["부산", "부산"],
  ["대구", "대구"],
  ["인천", "인천"],
  ["광주", "전남·광주"],
  ["대전", "대전"],
  ["울산", "울산"],
  ["세종", "세종"],
  ["경기", "경기"],
  ["강원", "강원"],
  ["충청북", "충북"],
  ["충북", "충북"],
  ["충청남", "충남"],
  ["충남", "충남"],
  ["전라북", "전북"],
  ["전북", "전북"],
  ["전라남", "전남·광주"],
  ["전남", "전남·광주"],
  ["경상북", "경북"],
  ["경북", "경북"],
  ["경상남", "경남"],
  ["경남", "경남"],
  ["제주", "제주"],
];

function getRegion(address) {
  if (!address) return "기타";
  for (const [prefix, name] of REGION_PREFIXES) {
    if (address.startsWith(prefix)) return name;
  }
  return "기타";
}

// 축제 기간이 90일 이상이면 "상설·장기"로 분류
// (수문장 교대의식, 상설 드론쇼처럼 연중 내내 하는 행사를 구분하기 위함)
function isLongRunning(f) {
  const toDate = (s) =>
    new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
  const days = (toDate(f.endDate) - toDate(f.startDate)) / (1000 * 60 * 60 * 24);
  return days >= 90;
}

// 시작일까지 며칠 남았는지 계산 (진행중이면 null 반환 안 하고 배지에서 처리)
function daysUntil(yyyymmdd) {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6)) - 1;
  const d = Number(yyyymmdd.slice(6, 8));
  const target = new Date(y, m, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

// ─── 카드 그리기 ────────────────────────────────────────────

function render() {
  const keyword = searchEl.value.trim().toLowerCase();
  const region = regionEl.value;
  const today = todayStr();

  // 1) 검색어와 지역으로 거르기
  const favorites = getFavorites();

  let shown = allFestivals.filter((f) => {
    const notEnded = f.endDate >= today; // 끝난 축제는 다음 데이터 갱신 전이라도 화면에서 바로 제외
    const matchKeyword = !keyword || f.name.toLowerCase().includes(keyword);
    const matchRegion = !region || getRegion(f.address) === region;
    const matchLong = !hideLongEl.checked || !isLongRunning(f);
    const matchFav = !onlyFavEl.checked || favorites.includes(f.contentid);
    return notEnded && matchKeyword && matchRegion && matchLong && matchFav;
  });

  // 2) 정렬
  if (nearPos) {
    // "내 주변" 켜짐: 현재 위치에서 가까운 순 (하버사인 공식으로 km 거리 계산)
    const rad = (deg) => (deg * Math.PI) / 180;
    shown.forEach((f) => {
      if (!f.lat || !f.lng) {
        f._dist = Infinity; // 좌표 없는 축제(지역 표준데이터 일부)는 맨 뒤로
        return;
      }
      const dLat = rad(f.lat - nearPos.lat);
      const dLng = rad(f.lng - nearPos.lng);
      const h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(rad(nearPos.lat)) * Math.cos(rad(f.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      f._dist = 6371 * 2 * Math.asin(Math.sqrt(h)); // 지구 반지름 6371km
    });
    shown.sort((a, b) => a._dist - b._dist);
  } else if (sortEl.value === "date") {
    // 날짜순 = ① 진행중인 축제 먼저 (곧 끝나는 순 — "지금 가야 하는 것"부터)
    //          ② 그다음 예정 축제 (시작일 빠른 순 = D-day 순)
    shown.sort((a, b) => {
      const aOn = a.startDate <= today && today <= a.endDate;
      const bOn = b.startDate <= today && today <= b.endDate;
      if (aOn !== bOn) return aOn ? -1 : 1; // 진행중이 앞으로
      if (aOn && bOn) return a.endDate.localeCompare(b.endDate); // 진행중끼리는 마감 임박순
      return a.startDate.localeCompare(b.startDate); // 예정끼리는 시작 빠른 순
    });
  } else {
    shown.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  countEl.textContent = `${shown.length}개의 축제`;

  // 3) 카드 HTML 만들기
  listEl.innerHTML = shown
    .map((f) => {
      const ongoing = f.startDate <= today && today <= f.endDate;
      const dday = daysUntil(f.startDate);
      // 상설·장기 행사는 회색 배지, 나머지는 진행중/디데이 배지
      const badge = isLongRunning(f)
        ? `<span class="badge long">상설·장기</span>`
        : ongoing
          ? `<span class="badge ongoing">진행중</span>`
          : `<span class="badge upcoming">D-${dday}</span>`;

      const img = f.image
        ? `<img src="${f.image}" alt="${f.name}" loading="lazy" />`
        : `<div class="no-image">🎪</div>`;

      const faved = favorites.includes(f.contentid);

      // 카드 전체를 <a>로 감싸서 클릭하면 상세 페이지로 이동.
      // 하트 버튼은 카드 위에 겹쳐 놓고, 클릭 시 페이지 이동을 막는다 (아래 이벤트 처리 참고)
      return `
        <a class="card-link" href="festival/${f.contentid}.html">
          <article class="card">
            <button class="fav-heart${faved ? " faved" : ""}" data-id="${f.contentid}" aria-label="찜하기">${faved ? "❤️" : "🤍"}</button>
            ${img}
            <div class="card-body">
              ${badge}
              <h2>${f.name}</h2>
              <p class="period">📅 ${formatDate(f.startDate)} ~ ${formatDate(f.endDate)}</p>
              <p class="address">📍 ${f.address || "주소 정보 없음"}${
                nearPos && isFinite(f._dist)
                  ? ` · 🚗 ${f._dist < 10 ? f._dist.toFixed(1) : Math.round(f._dist)}km`
                  : ""
              }</p>
              <button class="review-link" data-query="${`${(f.address || "").split(" ")[1] || ""} ${f.name}`.trim()}"
                onclick="event.preventDefault();window.open('https://map.naver.com/p/search/'+encodeURIComponent(this.dataset.query)+'?placePath=%2Freview','_blank','noopener');">📝 네이버 후기 보기</button>
            </div>
          </article>
        </a>`;
    })
    .join("");
}

// 지역명 → 지역 페이지 파일명용 슬러그 (build-pages.js와 같은 표. 수정 시 양쪽 다!)
const REGION_SLUGS = {
  서울: "seoul", 부산: "busan", 대구: "daegu", 인천: "incheon",
  광주: "gwangju", 대전: "daejeon", 울산: "ulsan", 세종: "sejong",
  경기: "gyeonggi", 강원: "gangwon", 충북: "chungbuk", 충남: "chungnam",
  전북: "jeonbuk", 전남: "jeonnam", "전남·광주": "jeonnam-gwangju",
  경북: "gyeongbuk", 경남: "gyeongnam", 제주: "jeju",
};

// 홈 상단의 바로가기 칩 채우기 (월별/테마별/지역별 정적 페이지로 연결)
function fillQuickLinks() {
  const nav = document.getElementById("quick-links");
  // tip을 넘기면 마우스 올렸을 때 말풍선 설명이 뜬다 (style.css의 [data-tip] 참고)
  const addChip = (href, label, cls = "chip", tip = "") => {
    const a = document.createElement("a");
    a.className = cls;
    a.href = href;
    a.textContent = label;
    if (tip) a.dataset.tip = tip;
    nav.appendChild(a);
  };

  // 공연·행사는 축제와 다른 성격의 페이지라 전용 스타일(보라색)로 맨 앞에 배치
  addChip("events.html", "🎭 공연·행사", "chip chip-events",
    "축제가 아닌 공연·연주회·전시 등 동네 문예회관 행사를 지역별로 모은 페이지입니다.");

  // 월별 칩: 이번 달부터 4개월 (build-pages.js가 만드는 파일명과 같은 규칙)
  const now = new Date();
  for (let i = 0; i < 4; i++) {
    const md = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const m = md.getMonth() + 1;
    const mm = String(m).padStart(2, "0");
    addChip(`month-${md.getFullYear()}-${mm}.html`, `${m}월`, "chip",
      `${m}월에 열리는 전국 축제를 날짜순으로 정리한 페이지입니다.`);
  }

  // 테마별 칩 (build-pages.js의 THEMES와 같은 목록)
  addChip("theme-flower.html", "🌸 꽃", "chip",
    "연꽃·상사화·구절초 등 전국 꽃 축제만 모아봅니다.");
  addChip("theme-light.html", "🎆 불꽃·빛", "chip",
    "불꽃놀이·드론쇼·미디어아트 등 밤이 아름다운 축제 모음입니다.");
  addChip("theme-food.html", "🍜 먹거리", "chip",
    "맥주·전어·한우·인삼 등 맛있는 먹거리 축제 모음입니다.");
  addChip("theme-heritage.html", "🏯 문화유산 야행", "chip",
    "고궁·읍성 같은 문화유산에서 열리는 야간 행사 모음입니다.");
  addChip("theme-kids.html", "👨‍👩‍👧 아이랑", "chip",
    "인형극·공룡·반딧불 등 아이와 함께 가기 좋은 축제만 골랐습니다.");

  // 지역별 칩
  const regions = [...new Set(allFestivals.map((f) => getRegion(f.address)))]
    .filter((r) => REGION_SLUGS[r])
    .sort((a, b) => a.localeCompare(b, "ko"));
  for (const r of regions) {
    addChip(`region-${REGION_SLUGS[r]}.html`, r);
  }
}

// ─── 지역 드롭다운 채우기 ───────────────────────────────────

function fillRegionOptions() {
  // Set을 쓰면 중복이 자동 제거됨
  const regions = [...new Set(allFestivals.map((f) => getRegion(f.address)))];
  regions.sort((a, b) => a.localeCompare(b, "ko"));
  for (const r of regions) {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    regionEl.appendChild(opt);
  }
}

// ─── 시작: 데이터 불러오기 ──────────────────────────────────

async function init() {
  try {
    const res = await fetch("festivals.json");
    if (!res.ok) throw new Error(`festivals.json 로드 실패 (${res.status})`);
    allFestivals = await res.json();

    fillRegionOptions();
    fillQuickLinks();
    render();
  } catch (err) {
    listEl.innerHTML = `<p style="text-align:center; grid-column: 1 / -1;">
      ⚠️ 데이터를 불러오지 못했습니다: ${err.message}<br>
      node fetch-festivals.js 를 먼저 실행했는지, serve.js로 접속했는지 확인하세요.
    </p>`;
  }
}

// 검색/필터/정렬이 바뀔 때마다 다시 그린다
searchEl.addEventListener("input", render);
regionEl.addEventListener("change", render);
sortEl.addEventListener("change", render);
hideLongEl.addEventListener("change", render);
onlyFavEl.addEventListener("change", render);

// 하트 클릭 처리: 카드가 새로 그려져도 동작하도록 목록 전체에 이벤트를 하나만 건다
// (하트는 <a> 안에 있어서 preventDefault로 페이지 이동을 막아야 함)
listEl.addEventListener("click", (e) => {
  const heart = e.target.closest(".fav-heart");
  if (!heart) return;
  e.preventDefault();
  toggleFavorite(heart.dataset.id);
  render();
});

// ─── 내 주변 가까운 순 (CampingHub와 같은 방식 — 수정 시 양쪽 다!) ───
// 브라우저 위치 기능(허용 팝업)을 써서 현재 위치를 받아온다.
// 위치는 이 페이지 안에서 거리 계산에만 쓰고 서버로 보내지 않음.
nearBtn.addEventListener("click", () => {
  // 이미 켜져 있으면 → 끄고 원래 정렬로
  if (nearPos) {
    nearPos = null;
    nearBtn.classList.remove("on");
    nearBtn.textContent = "📍 내 주변 가까운 순";
    render();
    return;
  }
  if (!navigator.geolocation) {
    alert("이 브라우저는 위치 기능을 지원하지 않아요.");
    return;
  }
  nearBtn.textContent = "📍 위치 확인 중...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      nearPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      nearBtn.classList.add("on");
      nearBtn.textContent = "📍 내 주변 순 (누르면 끔)";
      render();
      window.scrollTo({ top: 0 }); // 정렬이 바뀌었으니 목록 맨 위로
    },
    () => {
      nearBtn.textContent = "📍 내 주변 가까운 순";
      alert("위치 정보를 가져오지 못했어요.\n주소창 근처의 위치 권한을 허용으로 바꾸고 다시 눌러주세요.");
    },
    { maximumAge: 600000, timeout: 8000 } // 10분 내 위치는 재사용, 8초 안에 응답 없으면 포기
  );
});

init();

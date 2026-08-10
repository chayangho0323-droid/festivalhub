// detail.js — 주소창의 ?id=contentid 를 읽어 해당 축제의 상세 정보를 보여준다

const detailEl = document.getElementById("detail");

// "20260729" → "2026.07.29" (app.js와 같은 함수. 파일이 분리돼 있어 다시 정의)
function formatDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return "";
  return `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}`;
}

function todayStr() {
  const d = new Date();
  return (
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  );
}

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
  if (idx >= 0) favs.splice(idx, 1); // 이미 있으면 빼기
  else favs.push(id); // 없으면 넣기
  localStorage.setItem("favorites", JSON.stringify(favs));
  return idx < 0; // true = 방금 찜함
}

// "20260819" → 하루 뒤인 "20260820" (구글 캘린더는 종료일을 하루 뒤로 줘야 함)
function addOneDay(yyyymmdd) {
  const d = new Date(
    Number(yyyymmdd.slice(0, 4)),
    Number(yyyymmdd.slice(4, 6)) - 1,
    Number(yyyymmdd.slice(6, 8)) + 1
  );
  return (
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  );
}

// 정보가 있을 때만 한 줄(라벨 + 내용)을 만들어주는 도우미
// (내용에 <br> 태그가 섞여 올 수 있어 그대로 HTML로 넣는다)
function infoRow(icon, label, value) {
  if (!value) return "";
  return `<div class="info-item"><span class="info-label">${icon} ${label}</span><div class="info-value">${value}</div></div>`;
}

async function init() {
  // 주소창 예: detail.html?id=1307813 → "1307813"을 꺼낸다
  const id = new URLSearchParams(location.search).get("id");

  try {
    const res = await fetch("festivals.json");
    if (!res.ok) throw new Error(`festivals.json 로드 실패 (${res.status})`);
    const festivals = await res.json();

    const f = festivals.find((item) => item.contentid === id);
    if (!f) {
      detailEl.innerHTML = `
        <a class="back-link" href="index.html">← 목록으로</a>
        <p>해당 축제를 찾을 수 없습니다.</p>`;
      return;
    }

    document.title = `${f.name} — FestivalHub`;

    const today = todayStr();
    const ongoing = f.startDate <= today && today <= f.endDate;
    const badge = ongoing
      ? `<span class="badge ongoing">진행중</span>`
      : `<span class="badge upcoming">예정</span>`;

    // ── 사진 갤러리: 대표 이미지 + 추가 사진 (중복 제거) ──
    const photos = [...new Set([f.image, ...(f.images || [])])].filter(Boolean);
    const gallery = photos.length
      ? `
        <img class="hero" id="hero-img" src="${photos[0]}" alt="${f.name}" />
        ${
          photos.length > 1
            ? `<div class="thumbs">${photos
                .map(
                  (url, i) =>
                    `<img src="${url}" alt="사진 ${i + 1}" class="thumb${i === 0 ? " active" : ""}" data-url="${url}" />`
                )
                .join("")}</div>`
            : ""
        }`
      : "";

    // ── 길찾기 버튼: 지도 앱 링크는 키 없이 URL만으로 동작 ──
    const hasCoords = f.lat && f.lng;
    const directions = hasCoords
      ? `
        <div class="dir-buttons">
          <a class="dir-btn kakao" target="_blank" rel="noopener"
             href="https://map.kakao.com/link/to/${encodeURIComponent(f.name)},${f.lat},${f.lng}">🚗 카카오맵 길찾기</a>
          <a class="dir-btn naver" target="_blank" rel="noopener"
             href="https://map.naver.com/p/search/${encodeURIComponent(f.address || f.name)}">🧭 네이버지도에서 보기</a>
        </div>`
      : "";

    // ── 액션 버튼: 찜하기 / 캘린더 추가 / 링크 복사 ──
    const isFav = getFavorites().includes(f.contentid);
    // 구글 캘린더는 URL 파라미터만으로 일정 추가 화면이 열린다 (키 불필요)
    const calendarUrl =
      `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(f.name)}` +
      `&dates=${f.startDate}/${addOneDay(f.endDate)}` +
      `&location=${encodeURIComponent(f.address || "")}` +
      `&details=${encodeURIComponent((f.homepage || "") + "\n(FestivalHub)")}`;

    const actions = `
      <div class="actions">
        <button id="fav-btn" class="action-btn${isFav ? " faved" : ""}">${isFav ? "❤️ 찜 해제" : "🤍 찜하기"}</button>
        <a class="action-btn" href="${calendarUrl}" target="_blank" rel="noopener">📆 캘린더에 추가</a>
        <button id="share-btn" class="action-btn">🔗 링크 복사</button>
      </div>`;

    const overview = f.overview
      ? `<section class="overview"><h2>소개</h2><p>${f.overview}</p></section>`
      : "";

    // "행사소개", "행사내용" 같은 추가 설명 글들 — 항목마다 섹션 하나씩.
    // 위의 "소개"와 내용이 똑같은 항목은 중복이라 건너뛴다
    // (비교 전에 HTML 태그와 공백을 지워서 사실상 같은 글인지 판단)
    const normalize = (s) => (s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, "");
    const extraSections = (f.extraInfo || [])
      .filter((info) => normalize(info.text) !== normalize(f.overview))
      .map(
        (info) =>
          `<section class="overview"><h2>${info.name}</h2><p>${info.text}</p></section>`
      )
      .join("");

    const homepage = f.homepage
      ? `<a href="${f.homepage}" target="_blank" rel="noopener">${f.homepage}</a>`
      : "";

    // ── 주변 관광지/맛집 카드 목록 만들기 ──
    // (수집 실패 시 null일 수 있어서 || [] 로 안전하게 처리)
    const nearbyCards = (list) =>
      (list || [])
        .map(
          (p) => `
          <div class="nearby-card">
            ${p.image ? `<img src="${p.image}" alt="${p.name}" loading="lazy" />` : `<div class="nearby-noimg">📷</div>`}
            <div class="nearby-name">${p.name}</div>
            <div class="nearby-dist">${p.dist >= 1000 ? (p.dist / 1000).toFixed(1) + "km" : p.dist + "m"}</div>
          </div>`
        )
        .join("");

    const nearbySection = (title, icon, list) =>
      list && list.length
        ? `<section class="nearby-section"><h2>${icon} ${title}</h2><div class="nearby-row">${nearbyCards(list)}</div></section>`
        : "";

    detailEl.innerHTML = `
      <a class="back-link" href="index.html">← 목록으로</a>
      ${gallery}
      <div class="detail-body">
        ${badge}
        <h1>${f.name}</h1>
        ${actions}
        <div class="info-grid">
          ${infoRow("📅", "기간", `${formatDate(f.startDate)} ~ ${formatDate(f.endDate)}`)}
          ${infoRow("📍", "주소", f.address)}
          ${infoRow("🎪", "행사 장소", f.eventplace)}
          ${infoRow("⏰", "운영 시간", f.playtime)}
          ${infoRow("💰", "이용 요금", f.usefee)}
          ${infoRow("🏛️", "주최", f.sponsor)}
          ${infoRow("📞", "문의", f.tel)}
          ${infoRow("🔗", "홈페이지", homepage)}
        </div>
        ${overview}
        ${extraSections}
        ${hasCoords ? `<section class="map-section"><h2>오시는 길</h2><div id="map"></div>${directions}</section>` : ""}
        ${nearbySection("주변 관광지", "🏞️", f.nearbySpots)}
        ${nearbySection("주변 맛집", "🍜", f.nearbyFood)}
      </div>`;

    // ── 찜하기 버튼 동작 ──
    const favBtn = document.getElementById("fav-btn");
    favBtn.addEventListener("click", () => {
      const nowFaved = toggleFavorite(f.contentid);
      favBtn.textContent = nowFaved ? "❤️ 찜 해제" : "🤍 찜하기";
      favBtn.classList.toggle("faved", nowFaved);
    });

    // ── 링크 복사 버튼 동작 ──
    const shareBtn = document.getElementById("share-btn");
    shareBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        shareBtn.textContent = "✅ 복사됨!";
      } catch {
        shareBtn.textContent = "⚠️ 복사 실패";
      }
      setTimeout(() => (shareBtn.textContent = "🔗 링크 복사"), 2000);
    });

    // ── 썸네일 클릭 → 큰 사진 교체 ──
    const heroImg = document.getElementById("hero-img");
    document.querySelectorAll(".thumb").forEach((t) => {
      t.addEventListener("click", () => {
        heroImg.src = t.dataset.url;
        document.querySelectorAll(".thumb").forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
      });
    });

    // ── 지도 그리기 (Leaflet + OpenStreetMap) ──
    if (hasCoords) {
      const lat = Number(f.lat);
      const lng = Number(f.lng);
      const map = L.map("map").setView([lat, lng], 15); // 15 = 확대 정도
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      L.marker([lat, lng]).addTo(map).bindPopup(f.name).openPopup();
    }
  } catch (err) {
    detailEl.innerHTML = `<p>⚠️ 데이터를 불러오지 못했습니다: ${err.message}</p>`;
  }
}

init();

# 제보 사진·영상 폴더

방문자가 이메일로 보낸 사진·영상을 여기에 넣는다.

1. 파일 이름은 축제 ID로: `photos/574285-1.jpg` (ID는 축제 페이지 주소 `festival/<ID>.html`). 여러 장이면 `-1`, `-2`…
2. 사진은 가로 1200px 이하(용량 300KB 안팎). 영상은 720p·H.264·10MB 이하 (ffmpeg 예:
   `ffmpeg -i 원본.mp4 -vf scale=-2:720 -c:v libx264 -crf 29 -movflags +faststart -c:a aac -b:a 96k photos/<ID>-x.mp4`
   포스터: `ffmpeg -ss 3 -i photos/<ID>-x.mp4 -frames:v 1 photos/<ID>-x.jpg`)
3. `photos.json`에 추가 (date = 올린 날, 이 날부터 7일간 랜딩 맨 위에 "📸 방문자 사진" 고정 — 끝난 축제도 보임):
   ```json
   {
     "574285": [
       { "image": "photos/574285-1.jpg", "credit": "닉네임", "caption": "한 줄 설명", "date": "20261006" },
       { "video": "photos/574285-fireworks.mp4", "poster": "photos/574285-fireworks.jpg", "credit": "닉네임", "caption": "불꽃놀이", "date": "20261006" }
     ]
   }
   ```
4. `node build-pages.js` → 커밋 → 푸시하면 상세 갤러리·랜딩 고정(pinned.json)에 반영됨

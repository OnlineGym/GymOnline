# 🏋️ Gym Online – Game gym 3D multiplayer

Game web 3D nhiều người chơi: dạo quanh phòng gym, tập máy để tăng chỉ số và lên level, nhảy aerobic, xông hơi, đổi đồ ở tủ locker, chat và dùng biểu cảm với bạn bè theo thời gian thực.

Nhân vật kiểu **chibi tròn tròn, lùn lùn** (đầu to, thân tròn, tay chân ngắn có khớp). Mọi model (nhân vật, máy tập, phòng ốc) đều dựng bằng khối hình học của Three.js, không dùng asset ngoài.

| Thành phần | Công nghệ |
|---|---|
| Frontend (`client/`) | Vite, Three.js, nipplejs (joystick ảo), Socket.IO client |
| Backend (`server/`) | Node.js, Express, Socket.IO, Mongoose, JWT, bcryptjs, helmet, express-rate-limit |
| Database | MongoDB (cài trên máy hoặc Atlas) |

---

## 1. Yêu cầu

- **Node.js ≥ 18.11** (khuyến nghị 20 trở lên)
- **MongoDB** đang chạy ở máy (`mongodb://127.0.0.1:27017`) **hoặc** một cluster MongoDB Atlas

## 2. Cài đặt & chạy

### Backend

```bash
cd server
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm run dev                 # http://localhost:4000 (tự khởi động lại khi sửa code)
```

Thấy dòng `[db] Đã kết nối MongoDB` và `[server] ... đang chạy` là backend đã sẵn sàng.

### Frontend (mở một terminal khác)

```bash
cd client
npm install
npm run dev                 # http://localhost:5173
```

Mở **http://localhost:5173**, đăng ký tài khoản, tạo nhân vật rồi vào phòng gym.
Muốn thử multiplayer thì mở thêm một cửa sổ ẩn danh (hoặc trình duyệt khác) và đăng ký tài khoản thứ hai.

> Vite đã proxy `/api` và `/socket.io` sang `http://localhost:4000`, nên frontend và backend chạy chung origin khi dev. Điện thoại cùng mạng Wi-Fi mở được bằng địa chỉ `Network` mà Vite in ra (ví dụ `http://192.168.1.10:5173`).

### Kết nối MongoDB

Sửa `MONGODB_URI` trong `server/.env`:

```env
# MongoDB cài trên máy
MONGODB_URI=mongodb://127.0.0.1:27017/gym_online
# MongoDB Atlas
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/gym_online
```

Với Atlas, cần thêm IP của máy chạy backend vào mục *Network Access*.

### Biến môi trường backend (`server/.env`)

| Biến | Ý nghĩa |
|---|---|
| `PORT` | Cổng backend (mặc định 4000) |
| `MONGODB_URI` | Chuỗi kết nối MongoDB |
| `JWT_SECRET` | Khóa ký JWT. **Bắt buộc đổi** khi deploy (`NODE_ENV=production` sẽ không chạy nếu còn giá trị mặc định) |
| `JWT_EXPIRES_IN` | Thời hạn token (mặc định `7d`) |
| `CLIENT_ORIGIN` | Các origin được phép gọi API/socket, phân tách bằng dấu phẩy (CORS) |

### Build production

```bash
cd client && npm run build      # kết quả nằm ở client/dist
```

Nếu frontend và backend ở hai domain khác nhau, đặt `VITE_API_URL=https://api.ten-mien.com` trong `client/.env` trước khi build, và thêm domain frontend vào `CLIENT_ORIGIN` của backend.

---

## 3. Cách chơi

| Thao tác | PC | Mobile |
|---|---|---|
| Di chuyển | `W A S D` / phím mũi tên | Joystick bên trái |
| Chạy | Giữ `Shift` | Nút 🏃 (bật/tắt) |
| Xoay camera | Kéo chuột | Vuốt màn hình |
| Zoom | Lăn chuột | Chụm 2 ngón |
| Tập / tương tác / dừng | `E` hoặc bấm vào nút gợi ý | Nút lớn bên phải |
| Biểu cảm | `Q` (vòng chọn), `1`–`8` dùng nhanh | Nút 😊 |
| Chat | `Enter` | Nút 💬 |
| Ẩn/hiện bản đồ | `M` | – |

- Lại gần máy tập sẽ hiện nút **"Tập"**. Bấm vào, nhân vật tự đi tới máy, vào tư thế và tập. Trong lúc tập có bảng đếm rep, thời gian và calo. Bấm **Dừng** để kết thúc, nhận EXP, chỉ số cơ, xu và lên level.
- Mỗi máy chỉ một người dùng cùng lúc (server giữ khóa).
- **Phòng thay đồ**: mở tủ màu cam để đổi trang phục. **Toilet**: bồn cầu, bồn rửa tay. **Xông hơi**: ngồi ghế gỗ, có hơi nước và nhiệt kế.
- Trong game có 3 NPC: lễ tân, huấn luyện viên aerobic và "Sư phụ Gym" ngồi thiền.

### Các khu trong gym

Sảnh lễ tân (điểm xuất hiện) · Khu máy tập (máy kéo xô, kéo cáp ngồi, đẩy ngực, ép ngực, đạp đùi, đá đùi, tay trước, tay sau, 5 máy chạy bộ, khu tạ đơn) · Khu tập tự do (xà đơn, dây kéo, thảm, bóng tạ) · Phòng Aerobic (sàn gỗ, gương lớn, loa, đèn disco, nhạc 124 BPM) · Phòng thay đồ · Toilet nam/nữ · Phòng xông hơi.

---

## 4. Cấu trúc thư mục

```
GymOnline/
├── client/                      # FRONTEND
│   ├── index.html
│   ├── vite.config.js           # proxy /api, /socket.io -> backend
│   └── src/
│       ├── main.js              # luồng: đăng nhập -> tạo nhân vật -> vào game
│       ├── core/                # renderer, camera, game loop, input, audio, settings, Game.js
│       ├── world/               # layout, buildGym, rooms, lighting, collision, doors, effects
│       ├── equipment/           # config, builders (dựng từng máy), EquipmentManager
│       ├── character/           # Character (chibi), animations + emote, RemotePlayer, NPC
│       ├── ui/                  # auth, tạo nhân vật, HUD, chat, emote wheel, joystick, minimap, panels
│       ├── network/             # api.js (REST), socket.js (realtime)
│       └── styles/main.css
├── server/                      # BACKEND
│   ├── .env.example
│   └── src/
│       ├── server.js, app.js
│       ├── config/              # env, db, cors, equipment (bảng thưởng)
│       ├── models/              # User, Character, WorkoutLog, ChatMessage
│       ├── routes/ + controllers/
│       ├── middleware/          # auth JWT, validate, errorHandler
│       ├── services/            # workoutSessions (đối chiếu thời gian tập)
│       ├── sockets/             # vị trí, chat, emote, khóa máy
│       └── utils/               # lọc từ thô tục, tính EXP/level
└── README.md
```

## 5. REST API

Mọi route (trừ đăng ký/đăng nhập) cần header `Authorization: Bearer <token>`. Khi lỗi, API trả về `{ "error": { "message", "details?" } }`.

| Method | Route | Mô tả |
|---|---|---|
| POST | `/api/auth/register` | `{ username, email, password }` → `{ token, user }` |
| POST | `/api/auth/login` | `{ login (username hoặc email), password }` |
| GET | `/api/auth/me` | Thông tin tài khoản + nhân vật |
| GET | `/api/character` | Lấy nhân vật (404 nếu chưa tạo) |
| PUT | `/api/character` | Tạo/sửa ngoại hình `{ displayName, gender, skinColor, hair{style,color}, outfit{style,top,bottom,shoes} }` |
| POST | `/api/workouts` | Ghi buổi tập `{ equipmentType, durationSec, reps }`. Server tự tính lại EXP/calo |
| GET | `/api/workouts/history?limit=` | Lịch sử tập + tổng hợp + calo hôm nay |
| GET | `/api/leaderboard` | `{ topLevel, topCalories }` |
| GET | `/api/chat/history?channel=global\|nearby\|dm&with=<userId>` | Lịch sử chat |

### Sự kiện Socket.IO

- Client gửi: `state` (vị trí ~12 lần/giây), `emote`, `chat` (có ack), `equipment:request` (có ack), `equipment:release`
- Server gửi: `init`, `snapshot` (15 lần/giây), `player:join`, `player:leave`, `player:emote`, `player:appearance`, `player:levelup`, `chat`, `equipment:lock`, `session:kicked`

## 6. Bảo mật & chống gian lận

- Mật khẩu hash bằng **bcrypt** (thư viện `bcryptjs`, thuần JS nên không cần build native trên Windows). Đăng nhập bằng **JWT**.
- Kiểm tra dữ liệu đầu vào cho mọi route; giới hạn body JSON 20kb; dùng `helmet` và CORS theo danh sách origin.
- Rate limit cho toàn bộ API, chặt hơn ở đăng nhập/đăng ký. Chat chống spam: tối đa 5 tin trong 8 giây, mỗi tin cách nhau ít nhất 0,7 giây, lặp lại cùng câu sẽ bị chặn, vượt giới hạn bị khóa chat 15 giây.
- Lọc từ thô tục (tiếng Việt và tiếng Anh) trong chat và tên hiển thị.
- **Thưởng do server tính**: buổi tập chỉ được ghi khi người chơi thực sự giữ khóa máy qua socket. Thời lượng bị giới hạn theo thời gian server đo được, số rep bị giới hạn theo tốc độ tối đa của từng máy, và mỗi phiên tập chỉ ghi được một lần.
- Mỗi tài khoản chỉ online ở một nơi; đăng nhập chỗ mới sẽ ngắt phiên cũ.

## 7. Hiệu năng

- Geometry tĩnh được gộp theo material (`bakeStatic`), số draw call giảm từ hàng nghìn xuống vài chục.
- 4 mức đồ họa trong ⚙️ Cài đặt, kèm tự giảm độ phân giải 3D khi FPS thấp:
  - **Thấp** (mặc định trên mobile): tắt bóng đổ và đèn màu, giảm độ phân giải.
  - **Trung bình**: bóng đổ 1024.
  - **Cao**: bóng đổ 1536, AO, gương phòng aerobic phản chiếu thật khi ở gần.
  - **Cực cao**: bóng đổ 2048, độ phân giải tới 1.5x.
- Minimap vẽ nền một lần, sau đó chỉ cập nhật chấm người chơi khoảng 10 lần/giây. Vị trí người chơi khác được nội suy, hiển thị trễ khoảng 120ms để chuyển động mượt.

## 8. Tài khoản, quản trị và email

### Email

Quên mật khẩu, xác minh email và đổi email cần gửi mail. Cấu hình trong `server/.env`:

```
CLIENT_URL=http://localhost:5173
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail của bạn>
SMTP_PASS=<App Password của Gmail>
MAIL_FROM=Gym Online <gmail của bạn>
```

Để trống `SMTP_HOST`: không gửi mail thật, link được in ra log server để thử khi phát triển.

### Trang quản trị

Cấp quyền cho một tài khoản đã đăng ký rồi mở `/admin.html` (hoặc nút 🛠️ trong game):

```bash
cd server
npm run admin -- <tên đăng nhập>            # cấp quyền
npm run admin -- <tên đăng nhập> --remove   # gỡ quyền
```

Trang này có: tổng quan, hàng chờ báo cáo vi phạm, tìm người chơi, khóa tài khoản, cấm chat, thông báo toàn server, nhật ký thao tác.

### API bổ sung

| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/auth/forgot`, `/api/auth/reset` | Quên / đặt lại mật khẩu |
| POST | `/api/auth/verify`, `/api/auth/resend-verify` | Xác minh email |
| POST | `/api/auth/change-password`, `/api/auth/change-email` | Đổi mật khẩu, đổi email |
| POST | `/api/auth/logout-all`, `/api/auth/refresh` | Đăng xuất mọi thiết bị, gia hạn phiên |
| DELETE | `/api/auth/account` | Xóa tài khoản |
| GET/POST | `/api/daily`, `/api/daily/checkin`, `/api/daily/quests/:key/claim` | Nhiệm vụ, điểm danh |
| POST | `/api/character/tutorial` | Hoàn thành hướng dẫn tân thủ |
| PATCH/DELETE | `/api/guilds/mine` | Sửa, giải tán CLB |
| POST | `/api/guilds/transfer` | Chuyển quyền chủ CLB |
| GET/POST | `/api/admin/*` | Quản trị (chỉ role admin) |

`POST /api/gifts` nhận thêm `wantCoins`, `wantItem`, `wantQty` để trao đổi 2 chiều.

## 9. Kiểm thử

```bash
cd server
npm test                                     # API, dùng database riêng gym_online_test (MongoDB phải đang chạy)
npm run loadtest -- --bots 1000 --ramp 40 --report   # kết quả ghi vào tools/loadtest-report.md
```

Test tải cần `LOADTEST_SECRET` và `ADMIN_SECRET` trong `server/.env`. Một tiến trình Node chạy ổn tới khoảng 500 người; 1000 người đã dùng hết 1 nhân CPU (tick vượt ngân sách 66ms), nên khi đông hãy chạy nhiều tiến trình bằng `npm run start:cluster` kèm Redis.

## 10. Trước khi mở công khai

- Điền email liên hệ và nhờ người có chuyên môn pháp lý rà soát `client/public/terms.html`, `client/public/privacy.html` (đang là bản nháp).
- Đặt `JWT_SECRET` ngẫu nhiên, cấu hình SMTP thật, `CLIENT_URL` và `CLIENT_ORIGIN` đúng tên miền.

## 11. Minigame từng máy

Mỗi nhóm máy có trò riêng, cấu hình ở bảng `MACHINE_GAME` trong `client/src/core/minigames.js`. Thêm trò mới: viết class có `key`, `pointer`, `update`, `draw`, đăng ký vào `GAMES`, thêm bot chơi đúng luật trong `server/test/minigames.test.js`.

| Trò | Thao tác | Máy |
|---|---|---|
| Vũ điệu | Nhập chuỗi mũi tên, SPACE đúng nhịp | Lớp Aerobic |
| Mũi tên theo nhạc | Mũi tên chạy tới vạch | Lớp Spin |
| Tư thế | Giữ đúng 2 phím tới hết hơi thở | Lớp Yoga |
| Nhảy rào | SPACE nhảy, giữ S cúi | Máy chạy bộ |
| Kéo cáp | Kéo chuột vào vùng đích | Kéo xô, chèo cáp, xà đơn, face pull... |
| Click vòng tròn | Click khi vòng co khít | Máy tay, tạ đơn, đấm đích |
| Kim quét | Bấm đúng vùng xanh 3 lần | Bench, Smith, power rack, hack squat |
| Cân 2 bên | Giữ A + D cho 2 thanh trong vùng | Ép ngực, cáp chéo, hip abduction... |
| Bơm áp lực | Nhấp SPACE giữ kim trong vùng | Đạp chân, đá đùi, cuốn đùi |
| Bật nảy | SPACE lúc chạm sàn | Bắp chân, plyo box |
| Tích lực | Giữ rồi thả trong vùng | Deadlift, kettlebell, lật lốp, slam ball... |
| Bám đường | Rê chuột hoặc W/S theo sóng | Lateral raise, dip, TRX, roll-up... |
| Vòng quay | Bấm khi kim qua cung sáng | Xoay người, ghế gập bụng |
| Xếp tháp | Thả khối cho khớp | Gập bụng, Reformer |
| 4 làn | A S J K khi khối chạm vạch | Leo thang, elliptical |
| Sang số | W/S khớp độ dốc | Xe đạp |
| Mái chèo | Giữ, thả ở đỉnh lực | Chèo thuyền, ski erg |
| Dồn sức | Bấm nhanh, tránh quá nhiệt | Assault bike, xe trượt |
| Nhảy dây | SPACE đúng nhịp dây | Dây nhảy |
| Bóng tốc độ | J/K 2 bên theo nhịp | Speed bag |
| Lăn cơ | Rê tới điểm căng rồi giữ yên | Foam roller, bàn massage |

Các trò gốc vẫn dùng cho: đẩy ngực và tricep (giữ/thả), thảm plank (giữ thăng bằng), bao cát (chuỗi đòn), dây thừng (xen kẽ A/D), sauna (hít thở).


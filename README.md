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
- 3 mức đồ họa trong ⚙️ Cài đặt:
  - **Thấp** (mặc định trên mobile): tắt bóng đổ và đèn màu, giảm độ phân giải.
  - **Trung bình**: bóng đổ 1024.
  - **Cao**: bóng đổ 2048, gương phòng aerobic phản chiếu thật (Reflector), nhiều hạt hơi nước.
- Minimap vẽ nền một lần, sau đó chỉ cập nhật chấm người chơi khoảng 10 lần/giây. Vị trí người chơi khác được nội suy, hiển thị trễ khoảng 120ms để chuyển động mượt.

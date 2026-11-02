/**
 * LOAD TEST: giả lập N bot kết nối Socket.IO, di chuyển ngẫu nhiên, chat/emote, đổi tầng.
 * Đo: số kết nối thành công, băng thông vào/ra mỗi bot, RTT (ping qua ack), CPU/RAM/tick server.
 *
 * Cách chạy (server cần LOADTEST_SECRET + ADMIN_SECRET trong .env):
 *   npm run loadtest -- --bots 500 --duration 60
 * Tham số: --bots N  --duration giây  --url http://localhost:4000  --ramp bot/giây
 *          --secret <LOADTEST_SECRET>  --admin <ADMIN_SECRET>  --report (ghi kết quả vào tools/loadtest-report.md)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { io } from 'socket.io-client';
import msgpackParser from 'socket.io-msgpack-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split('--')
    .filter(Boolean)
    .map((s) => {
      const [k, ...v] = s.trim().split(/\s+/);
      return [k, v.length ? v.join(' ') : true];
    })
);
const BOTS = Number(args.bots) || 200;
const DURATION = Number(args.duration) || 60;
const URL = args.url || `http://localhost:${process.env.PORT || 4000}`;
const RAMP = Number(args.ramp) || 25; // bot kết nối / giây
const SECRET = args.secret || process.env.LOADTEST_SECRET;
const ADMIN = args.admin || process.env.ADMIN_SECRET;
const WRITE_REPORT = !!args.report;

if (!SECRET) {
  console.error('Thiếu LOADTEST_SECRET (đặt trong server/.env hoặc --secret)');
  process.exit(1);
}

const stats = {
  connected: 0,
  failed: 0,
  disconnected: 0,
  bytesIn: 0,
  bytesOut: 0,
  msgsIn: 0,
  snapshots: 0,
  aoiEnter: 0,
  rtts: [],
  floorChanges: 0,
  corrections: 0,
  errors: {},
};
const bots = [];
const sizeOf = (d) => (typeof d === 'string' ? Buffer.byteLength(d) : d?.byteLength ?? d?.length ?? 0);
const rand = (a, b) => a + Math.random() * (b - a);
const CHAT = ['Chào mọi người!', 'Tập chung không?', 'Hôm nay leg day 🦵', 'Máy này còn trống nè', 'Gym vui quá'];
const EMOTES = ['wave', 'laugh', 'flex', 'cheer', 'dance'];

function startBot(i) {
  const s = io(URL, {
    auth: { bot: SECRET, name: `Bot ${i}` },
    transports: ['websocket'],
    parser: msgpackParser,
    reconnection: false,
    forceNew: true,
    timeout: 20000,
  });
  const bot = { s, i, x: 0, z: 0, f: 1, tx: 0, tz: 0, ry: 0, timers: [] };
  bots.push(bot);
  s.io.on('open', () => {
    const eng = s.io.engine;
    eng.on('packet', (p) => {
      stats.bytesIn += sizeOf(p.data);
      stats.msgsIn++;
    });
    eng.on('packetCreate', (p) => (stats.bytesOut += sizeOf(p.data)));
  });
  s.on('init', (d) => {
    stats.connected++;
    bot.x = d.x;
    bot.z = d.z;
    bot.f = d.f;
    bot.pick = () => {
      bot.tx = rand(-36, 36);
      bot.tz = rand(-26, 26);
    };
    bot.pick();
    // Di chuyển 12 lần/giây với tốc độ đi bộ/chạy hợp lệ
    let last = Date.now();
    bot.timers.push(
      setInterval(() => {
        const now = Date.now();
        const dt = (now - last) / 1000;
        last = now;
        const dx = bot.tx - bot.x;
        const dz = bot.tz - bot.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.5) bot.pick();
        else {
          const step = Math.min(d, 2.6 * dt);
          bot.x += (dx / d) * step;
          bot.z += (dz / d) * step;
          bot.ry = Math.atan2(dx, dz);
        }
        s.volatile.emit('state', { x: +bot.x.toFixed(2), y: 0, z: +bot.z.toFixed(2), ry: +bot.ry.toFixed(3), a: 1 });
      }, 1000 / 12)
    );
    // Emote / chat / đo RTT
    bot.timers.push(setInterval(() => s.emit('emote', EMOTES[Math.floor(Math.random() * EMOTES.length)]), rand(15000, 30000)));
    bot.timers.push(setInterval(() => s.emit('chat', { channel: 'nearby', content: CHAT[Math.floor(Math.random() * CHAT.length)] }, () => {}), rand(40000, 80000)));
    bot.timers.push(
      setInterval(() => {
        const t0 = Date.now();
        s.timeout(5000).emit('nearby:list', {}, (err) => {
          if (!err) stats.rtts.push(Date.now() - t0);
        });
      }, 5000 + Math.random() * 2000)
    );
  });
  s.on('s', () => stats.snapshots++);
  s.on('aoi', (d) => (stats.aoiEnter += d.e.length));
  s.on('correct', (c) => {
    stats.corrections++;
    bot.x = c.x;
    bot.z = c.z;
  });
  s.on('fatal', (e) => (stats.errors[e.code || e.message] = (stats.errors[e.code || e.message] || 0) + 1));
  s.on('connect_error', (e) => {
    stats.failed++;
    stats.errors[e.message] = (stats.errors[e.message] || 0) + 1;
  });
  s.on('disconnect', () => {
    stats.disconnected++;
    bot.timers.forEach(clearInterval);
  });
}

async function metrics() {
  if (!ADMIN) return null;
  try {
    const r = await fetch(`${URL}/api/admin/metrics`, { headers: { 'x-admin-secret': ADMIN } });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function main() {
  console.log(`\n🏋️  LOAD TEST Gym Online: ${BOTS} bot → ${URL} trong ${DURATION}s (ramp ${RAMP} bot/s)\n`);
  const m0 = await metrics();
  const t0 = Date.now();
  // Kết nối dần (ramp-up)
  for (let i = 0; i < BOTS; i++) {
    startBot(i + 1);
    if ((i + 1) % RAMP === 0) await new Promise((r) => setTimeout(r, 1000));
  }
  const rampEnd = Date.now();
  let prevCpu = m0?.cpu;
  let prevT = Date.now();
  let prevIn = 0;
  let prevOut = 0;
  const samples = [];
  const end = rampEnd + DURATION * 1000;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 5000));
    const m = await metrics();
    const now = Date.now();
    const sec = (now - prevT) / 1000;
    const inKBs = (stats.bytesIn - prevIn) / 1024 / sec;
    const outKBs = (stats.bytesOut - prevOut) / 1024 / sec;
    prevIn = stats.bytesIn;
    prevOut = stats.bytesOut;
    let cpu = null;
    if (m && prevCpu) cpu = ((m.cpu.user - prevCpu.user + (m.cpu.system - prevCpu.system)) / 1000 / (sec * 1000)) * 100;
    prevCpu = m?.cpu;
    prevT = now;
    const live = stats.connected - stats.disconnected;
    const sample = {
      t: Math.round((now - t0) / 1000),
      live,
      channels: m?.channels.length,
      cpu,
      tickAvg: m?.tick.avgMs,
      tickMax: m?.tick.maxMs,
      lag: m?.tick.lagMs,
      rss: m?.memoryMB.rss,
      inKBsPerBot: live ? inKBs / live : 0,
      outKBsPerBot: live ? outKBs / live : 0,
      rttP50: pct(stats.rtts.slice(-500), 50),
      rttP95: pct(stats.rtts.slice(-500), 95),
    };
    samples.push(sample);
    console.log(
      `[${String(sample.t).padStart(3)}s] online ${live}/${BOTS} | channel ${sample.channels ?? '?'} | CPU ${cpu?.toFixed(0) ?? '?'}% | tick ${sample.tickAvg ?? '?'}ms (max ${sample.tickMax ?? '?'}) | lag ${sample.lag ?? '?'}ms | RAM ${sample.rss ?? '?'}MB | ↓${sample.inKBsPerBot.toFixed(2)} ↑${sample.outKBsPerBot.toFixed(2)} KB/s/bot | RTT p50 ${sample.rttP50}ms p95 ${sample.rttP95}ms`
    );
  }
  const steady = samples.slice(1); // bỏ mẫu đầu (đang ramp)
  const avg = (k) => steady.reduce((a, s) => a + (s[k] || 0), 0) / Math.max(1, steady.length);
  const mFinal = await metrics();
  const summary = {
    date: new Date().toISOString(),
    bots: BOTS,
    connected: stats.connected,
    failed: stats.failed,
    channels: mFinal?.channels.map((c) => `${c.name}:${c.count}`).join(' '),
    cpuAvg: avg('cpu'),
    tickAvg: avg('tickAvg'),
    tickMax: Math.max(...steady.map((s) => s.tickMax || 0)),
    lagMax: Math.max(...steady.map((s) => s.lag || 0)),
    rssMax: Math.max(...steady.map((s) => s.rss || 0)),
    inKBsPerBot: avg('inKBsPerBot'),
    outKBsPerBot: avg('outKBsPerBot'),
    totalMbps: ((avg('inKBsPerBot') * BOTS * 8) / 1024),
    rttP50: pct(stats.rtts, 50),
    rttP95: pct(stats.rtts, 95),
    corrections: stats.corrections,
    errors: stats.errors,
  };
  console.log('\n================ KẾT QUẢ ================');
  console.table({
    'Bot kết nối thành công': `${summary.connected}/${BOTS}`,
    'Số channel': mFinal?.channels.length,
    'Phân bổ': summary.channels,
    'CPU server TB (% 1 nhân)': summary.cpuAvg.toFixed(1),
    'Tick AOI TB / max (ms)': `${summary.tickAvg.toFixed(2)} / ${summary.tickMax.toFixed(1)}`,
    'Event loop lag max (ms)': summary.lagMax,
    'RAM server max (MB)': summary.rssMax,
    'Băng thông xuống / bot (KB/s)': summary.inKBsPerBot.toFixed(2),
    'Băng thông lên / bot (KB/s)': summary.outKBsPerBot.toFixed(2),
    'Tổng băng thông server gửi (Mbps)': summary.totalMbps.toFixed(2),
    'RTT p50 / p95 (ms)': `${summary.rttP50} / ${summary.rttP95}`,
    'Bị kéo về (chống hack)': summary.corrections,
  });
  if (Object.keys(stats.errors).length) console.log('Lỗi:', stats.errors);
  if (WRITE_REPORT) {
    const file = path.join(__dirname, 'loadtest-report.md');
    const row = `| ${summary.date.slice(0, 16).replace('T', ' ')} | ${BOTS} | ${summary.connected} | ${mFinal?.channels.length} | ${summary.cpuAvg.toFixed(0)}% | ${summary.tickAvg.toFixed(2)} / ${summary.tickMax.toFixed(1)} | ${summary.lagMax} | ${summary.rssMax} | ${summary.inKBsPerBot.toFixed(2)} | ${summary.outKBsPerBot.toFixed(2)} | ${summary.totalMbps.toFixed(1)} | ${summary.rttP50} / ${summary.rttP95} |\n`;
    if (!fs.existsSync(file)) {
      fs.writeFileSync(
        file,
        '# Kết quả load test Gym Online\n\n| Thời điểm | Bot | Kết nối | Channel | CPU TB | Tick TB/max (ms) | Lag max (ms) | RAM (MB) | ↓ KB/s/bot | ↑ KB/s/bot | Tổng ↓ (Mbps) | RTT p50/p95 (ms) |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n'
      );
    }
    fs.appendFileSync(file, row);
    console.log(`Đã ghi báo cáo: ${file}`);
  }
  for (const b of bots) {
    b.timers.forEach(clearInterval);
    b.s.disconnect();
  }
  setTimeout(() => process.exit(0), 500);
}

main();

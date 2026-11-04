// Test tích hợp REST API trên database riêng (gym_online_test): tự tạo rồi tự xóa
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/gym_online_test';
process.env.JWT_SECRET = 'test-secret';

const mongoose = (await import('mongoose')).default;
const { createApp } = await import('../src/app.js');
const { outbox } = await import('../src/services/mailer.js');
const { invalidateAuth } = await import('../src/middleware/auth.js');
const { bump, state, dayKey } = await import('../src/services/quests.js');
const User = (await import('../src/models/User.js')).default;
const Character = (await import('../src/models/Character.js')).default;
const DailyProgress = (await import('../src/models/DailyProgress.js')).default;
const { Report, Guild, Transaction } = await import('../src/models/social.js');

let server;
let base;
let n = 0;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const APPEARANCE = {
  displayName: 'Tester',
  gender: 'male',
  skinColor: '#f5c9a0',
  hair: { style: 'short', color: '#3b2a20' },
  outfit: { style: 'tshirt', top: '#22d3ee', bottom: '#334155', shoes: '#f8fafc' },
};

async function makeUser({ character = true, coins } = {}) {
  n++;
  const username = `tester_${n}_${Date.now() % 100000}`;
  const email = `${username}@test.vn`;
  const password = 'matkhau123';
  const r = await call('POST', '/auth/register', { body: { username, email, password } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const u = { username, email, password, token: r.data.token, id: r.data.user.id };
  if (character) {
    const c = await call('PUT', '/character', { token: u.token, body: APPEARANCE });
    assert.ok(c.status < 300, JSON.stringify(c.data));
    if (coins !== undefined) await Character.updateOne({ userId: u.id }, { coins });
  }
  return u;
}

const lastToken = (email, kind) => {
  const mail = [...outbox].reverse().find((m) => m.to === email && m.text.includes(`?${kind}=`));
  assert.ok(mail, `không có email ${kind} tới ${email}`);
  return mail.text.match(new RegExp(`\\?${kind}=([0-9a-f]+)`))[1];
};

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch(() => {})));
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('Tài khoản', () => {
  test('đăng ký gửi email xác minh, bấm link thì xác minh xong', async () => {
    const u = await makeUser({ character: false });
    await new Promise((r) => setTimeout(r, 300)); // email gửi ở nền
    assert.equal((await call('GET', '/auth/me', { token: u.token })).data.user.emailVerified, false);
    const v = await call('POST', '/auth/verify', { body: { token: lastToken(u.email, 'verify') } });
    assert.equal(v.status, 200);
    assert.equal((await call('GET', '/auth/me', { token: u.token })).data.user.emailVerified, true);
  });

  test('link xác minh sai bị từ chối', async () => {
    const r = await call('POST', '/auth/verify', { body: { token: 'a'.repeat(64) } });
    assert.equal(r.status, 400);
  });

  test('quên mật khẩu: không lộ email có tồn tại, đặt lại xong token cũ hết hiệu lực, link chỉ dùng 1 lần', async () => {
    const u = await makeUser({ character: false });
    const none = await call('POST', '/auth/forgot', { body: { email: 'khongtontai@test.vn' } });
    const yes = await call('POST', '/auth/forgot', { body: { email: u.email } });
    assert.equal(none.status, 200);
    assert.deepEqual(none.data, yes.data);
    const token = lastToken(u.email, 'reset');
    assert.equal((await call('POST', '/auth/reset', { body: { token, password: 'matkhaumoi1' } })).status, 200);
    invalidateAuth(u.id);
    assert.equal((await call('GET', '/auth/me', { token: u.token })).status, 401);
    assert.equal((await call('POST', '/auth/reset', { body: { token, password: 'matkhaukhac2' } })).status, 400);
    assert.equal((await call('POST', '/auth/login', { body: { login: u.username, password: u.password } })).status, 401);
    assert.equal((await call('POST', '/auth/login', { body: { login: u.username, password: 'matkhaumoi1' } })).status, 200);
  });

  test('link đặt lại mật khẩu hết hạn bị từ chối', async () => {
    const u = await makeUser({ character: false });
    await call('POST', '/auth/forgot', { body: { email: u.email } });
    const token = lastToken(u.email, 'reset');
    await User.updateOne({ _id: u.id }, { resetTokenExp: new Date(Date.now() - 1000) });
    assert.equal((await call('POST', '/auth/reset', { body: { token, password: 'matkhaumoi1' } })).status, 400);
  });

  test('đổi mật khẩu cần đúng mật khẩu cũ, thiết bị hiện tại nhận token mới', async () => {
    const u = await makeUser({ character: false });
    assert.equal((await call('POST', '/auth/change-password', { token: u.token, body: { current: 'saimatkhau', password: 'matkhaumoi1' } })).status, 400);
    const ok = await call('POST', '/auth/change-password', { token: u.token, body: { current: u.password, password: 'matkhaumoi1' } });
    assert.equal(ok.status, 200);
    invalidateAuth(u.id);
    assert.equal((await call('GET', '/auth/me', { token: u.token })).status, 401);
    assert.equal((await call('GET', '/auth/me', { token: ok.data.token })).status, 200);
  });

  test('đổi email chỉ có hiệu lực sau khi bấm link gửi tới email mới', async () => {
    const u = await makeUser({ character: false });
    const newMail = `${u.username}.moi@test.vn`;
    assert.equal((await call('POST', '/auth/change-email', { token: u.token, body: { password: u.password, email: newMail } })).status, 200);
    assert.equal((await call('GET', '/auth/me', { token: u.token })).data.user.email, u.email);
    await call('POST', '/auth/verify', { body: { token: lastToken(newMail, 'verify') } });
    const me = (await call('GET', '/auth/me', { token: u.token })).data.user;
    assert.equal(me.email, newMail);
    assert.equal(me.pendingEmail, null);
  });

  test('đăng xuất mọi thiết bị làm token cũ hết hiệu lực', async () => {
    const u = await makeUser({ character: false });
    assert.equal((await call('POST', '/auth/logout-all', { token: u.token })).status, 200);
    assert.equal((await call('GET', '/auth/me', { token: u.token })).status, 401);
  });

  test('xóa tài khoản: cần mật khẩu + tên đăng nhập, dọn dữ liệu, hoàn quà đang chờ cho người gửi', async () => {
    const sender = await makeUser({ coins: 500 });
    const u = await makeUser({ coins: 500 });
    const g = await call('POST', '/gifts', { token: sender.token, body: { to: u.id, coins: 100 } });
    assert.equal(g.status, 201);
    assert.equal((await Character.findOne({ userId: sender.id })).coins, 400);
    assert.equal((await call('DELETE', '/auth/account', { token: u.token, body: { password: 'sai', confirm: u.username } })).status, 400);
    assert.equal((await call('DELETE', '/auth/account', { token: u.token, body: { password: u.password, confirm: 'sai' } })).status, 400);
    assert.equal((await call('DELETE', '/auth/account', { token: u.token, body: { password: u.password, confirm: u.username } })).status, 200);
    assert.equal(await User.countDocuments({ _id: u.id }), 0);
    assert.equal(await Character.countDocuments({ userId: u.id }), 0);
    assert.equal((await Character.findOne({ userId: sender.id })).coins, 500);
    invalidateAuth(u.id);
    assert.equal((await call('GET', '/auth/me', { token: u.token })).status, 401);
  });
});

describe('Quản trị', () => {
  test('người thường không vào được API quản trị', async () => {
    const u = await makeUser({ character: false });
    assert.equal((await call('GET', '/admin/overview', { token: u.token })).status, 403);
    assert.equal((await call('GET', '/admin/overview')).status, 401);
  });

  test('báo cáo tới được admin, xử lý xong rời hàng chờ; khóa tài khoản chặn đăng nhập, mở khóa thì vào lại', async () => {
    const admin = await makeUser({ character: false });
    await User.updateOne({ _id: admin.id }, { role: 'admin' });
    invalidateAuth(admin.id);
    const bad = await makeUser();
    const reporter = await makeUser();
    assert.equal((await call('POST', '/reports', { token: reporter.token, body: { userId: bad.id, reason: 'abuse', details: 'chửi bậy' } })).status, 201);

    const list = await call('GET', '/admin/reports', { token: admin.token });
    assert.equal(list.status, 200);
    const report = list.data.reports.find((r) => r.target.id === bad.id);
    assert.ok(report);
    assert.equal(report.details, 'chửi bậy');

    assert.equal((await call('POST', `/admin/users/${bad.id}/ban`, { token: admin.token, body: { hours: 24, reason: 'Chửi bậy' } })).status, 200);
    invalidateAuth(bad.id);
    const denied = await call('GET', '/auth/me', { token: bad.token });
    assert.equal(denied.status, 403);
    assert.match(denied.data.error.message, /Chửi bậy/);
    assert.equal((await call('POST', '/auth/login', { body: { login: bad.username, password: bad.password } })).status, 403);

    assert.equal((await call('POST', `/admin/reports/${report.id}/resolve`, { token: admin.token, body: { status: 'reviewed', note: 'đã khóa 24h' } })).status, 200);
    const after2 = await call('GET', '/admin/reports', { token: admin.token });
    assert.ok(!after2.data.reports.some((r) => r.id === report.id));

    assert.equal((await call('POST', `/admin/users/${bad.id}/unban`, { token: admin.token })).status, 200);
    invalidateAuth(bad.id);
    assert.equal((await call('GET', '/auth/me', { token: bad.token })).status, 200);

    const log = await call('GET', '/admin/actions', { token: admin.token });
    assert.ok(log.data.actions.some((a) => a.action === 'ban'));
  });

  test('admin không tự khóa mình và không khóa admin khác', async () => {
    const a = await makeUser({ character: false });
    const b = await makeUser({ character: false });
    await User.updateMany({ _id: { $in: [a.id, b.id] } }, { role: 'admin' });
    invalidateAuth(a.id);
    assert.equal((await call('POST', `/admin/users/${a.id}/ban`, { token: a.token, body: {} })).status, 400);
    assert.equal((await call('POST', `/admin/users/${b.id}/ban`, { token: a.token, body: {} })).status, 403);
  });
});

describe('Nhiệm vụ & điểm danh', () => {
  test('điểm danh mỗi ngày 1 lần, chuỗi tăng nếu hôm qua có điểm danh, đứt thì về 1', async () => {
    const u = await makeUser({ coins: 0 });
    const first = await call('POST', '/daily/checkin', { token: u.token });
    assert.equal(first.status, 200);
    assert.equal(first.data.streak, 1);
    assert.equal(first.data.coins, 20);
    assert.equal((await call('POST', '/daily/checkin', { token: u.token })).status, 409);
    assert.equal((await Character.findOne({ userId: u.id })).coins, 20);

    const yesterday = dayKey(Date.now() - 86400000);
    await DailyProgress.updateOne({ userId: u.id }, { checkinDay: yesterday, streak: 6 });
    const seventh = await call('POST', '/daily/checkin', { token: u.token });
    assert.equal(seventh.data.streak, 7);
    assert.equal(seventh.data.coins, 150);

    await DailyProgress.updateOne({ userId: u.id }, { checkinDay: '2000-01-01', streak: 9 });
    assert.equal((await call('POST', '/daily/checkin', { token: u.token })).data.streak, 1);
  });

  test('nhiệm vụ: chưa xong không nhận được, xong nhận 1 lần, bấm đồng thời cũng chỉ 1 lần', async () => {
    const u = await makeUser({ coins: 0 });
    const s = await state(u.id);
    assert.equal(s.daily.length, 3);
    assert.equal(s.weekly.length, 2);
    const q = (await DailyProgress.findOne({ userId: u.id })).daily[0];
    assert.equal((await call('POST', `/daily/quests/${q.key}/claim`, { token: u.token })).status, 400);
    await bump(u.id, q.kind, q.goal);
    const results = await Promise.all([1, 2, 3].map(() => call('POST', `/daily/quests/${q.key}/claim`, { token: u.token })));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    const reward = results.find((r) => r.status === 200).data;
    assert.equal((await Character.findOne({ userId: u.id })).coins, reward.coins);
  });

  test('sang ngày mới thì nhiệm vụ ngày làm lại, cùng ngày thì giữ nguyên', async () => {
    const u = await makeUser();
    const a = (await state(u.id)).daily.map((q) => q.key);
    assert.deepEqual((await state(u.id)).daily.map((q) => q.key), a);
    await DailyProgress.updateOne({ userId: u.id }, { day: '2000-01-01', 'daily.0.progress': 99 });
    assert.ok((await state(u.id)).daily.every((q) => q.progress === 0));
  });

  test('thưởng hướng dẫn tân thủ chỉ nhận 1 lần, bỏ qua thì không có thưởng', async () => {
    const u = await makeUser({ coins: 0 });
    assert.equal((await call('POST', '/character/tutorial', { token: u.token, body: { finished: true } })).data.coins, 100);
    assert.equal((await call('POST', '/character/tutorial', { token: u.token, body: { finished: true } })).data.coins, 0);
    assert.equal((await Character.findOne({ userId: u.id })).coins, 100);
    const v = await makeUser({ coins: 0 });
    assert.equal((await call('POST', '/character/tutorial', { token: v.token, body: { finished: false } })).data.coins, 0);
  });
});

describe('Trao đổi vật phẩm', () => {
  test('đổi xu lấy vật phẩm: 2 bên nhận đúng phần của mình', async () => {
    const a = await makeUser({ coins: 1000 });
    const b = await makeUser({ coins: 0 });
    await Character.updateOne({ userId: b.id }, { $push: { inventory: { item: 'whey', qty: 2 } } });
    assert.equal((await call('POST', '/gifts', { token: a.token, body: { to: b.id, coins: 300, wantItem: 'whey', wantQty: 2 } })).status, 201);
    assert.equal((await Character.findOne({ userId: a.id })).coins, 700); // giữ tạm
    const { gifts } = (await call('GET', '/gifts/pending', { token: b.token })).data;
    assert.equal(gifts[0].wantItem, 'whey');
    assert.equal((await call('POST', `/gifts/${gifts[0].id}/accept`, { token: b.token })).status, 200);
    const [ca, cb] = await Promise.all([Character.findOne({ userId: a.id }), Character.findOne({ userId: b.id })]);
    assert.equal(ca.coins, 700);
    assert.equal(ca.inventory.find((i) => i.item === 'whey').qty, 2);
    assert.equal(cb.coins, 300);
    assert.equal(cb.inventory.find((i) => i.item === 'whey').qty, 0);
  });

  test('người nhận không đủ đồ để đổi: báo lỗi, không ai mất gì, trao đổi vẫn còn chờ', async () => {
    const a = await makeUser({ coins: 1000 });
    const b = await makeUser({ coins: 50 });
    await call('POST', '/gifts', { token: a.token, body: { to: b.id, coins: 100, wantCoins: 500 } });
    const { gifts } = (await call('GET', '/gifts/pending', { token: b.token })).data;
    assert.equal((await call('POST', `/gifts/${gifts[0].id}/accept`, { token: b.token })).status, 400);
    assert.equal((await Character.findOne({ userId: b.id })).coins, 50);
    assert.equal((await Transaction.findById(gifts[0].id)).status, 'pending');
  });

  test('từ chối trao đổi: người gửi được hoàn lại', async () => {
    const a = await makeUser({ coins: 1000 });
    const b = await makeUser({ coins: 50 });
    await call('POST', '/gifts', { token: a.token, body: { to: b.id, coins: 100, wantCoins: 10 } });
    const { gifts } = (await call('GET', '/gifts/pending', { token: b.token })).data;
    assert.equal((await call('POST', `/gifts/${gifts[0].id}/decline`, { token: b.token })).status, 200);
    assert.equal((await Character.findOne({ userId: a.id })).coins, 1000);
    assert.equal((await Character.findOne({ userId: b.id })).coins, 50);
  });

  test('đưa phụ kiện đang đeo cho người khác thì tự tháo ra', async () => {
    const a = await makeUser({ coins: 1000 });
    const b = await makeUser();
    await call('POST', '/shop/buy', { token: a.token, body: { item: 'cap' } });
    await call('POST', '/inventory/equip', { token: a.token, body: { item: 'cap' } });
    assert.equal((await call('POST', '/gifts', { token: a.token, body: { to: b.id, item: 'cap', qty: 1 } })).status, 201);
    assert.equal((await Character.findOne({ userId: a.id })).accessory, null);
  });
});

describe('Câu lạc bộ', () => {
  const makeGuild = async (leader, tag) => {
    const r = await call('POST', '/guilds', { token: leader.token, body: { name: `CLB ${tag}`, tag, description: 'x', color: '#22d3ee', open: true } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data.guild;
  };

  test('chủ CLB sửa thông tin được, thành viên thường thì không', async () => {
    const a = await makeUser({ coins: 1000 });
    const b = await makeUser();
    const g = await makeGuild(a, 'AAA');
    await call('POST', `/guilds/${g.id}/join`, { token: b.token });
    assert.equal((await call('PATCH', '/guilds/mine', { token: b.token, body: { description: 'hack' } })).status, 403);
    const r = await call('PATCH', '/guilds/mine', { token: a.token, body: { description: 'mô tả mới', open: false } });
    assert.equal(r.status, 200);
    assert.equal(r.data.guild.description, 'mô tả mới');
  });

  test('chuyển quyền chủ CLB chỉ cho thành viên trong CLB', async () => {
    const a = await makeUser({ coins: 1000 });
    const b = await makeUser();
    const outsider = await makeUser();
    const g = await makeGuild(a, 'BBB');
    await call('POST', `/guilds/${g.id}/join`, { token: b.token });
    assert.equal((await call('POST', '/guilds/transfer', { token: a.token, body: { userId: outsider.id } })).status, 400);
    assert.equal((await call('POST', '/guilds/transfer', { token: a.token, body: { userId: b.id } })).status, 200);
    assert.equal(String((await Guild.findById(g.id)).leader), b.id);
    assert.equal((await call('PATCH', '/guilds/mine', { token: a.token, body: { description: 'x' } })).status, 403);
  });

  test('giải tán CLB: mọi thành viên được gỡ khỏi CLB', async () => {
    const a = await makeUser({ coins: 1000 });
    const b = await makeUser();
    const g = await makeGuild(a, 'CCC');
    await call('POST', `/guilds/${g.id}/join`, { token: b.token });
    assert.equal((await call('DELETE', '/guilds/mine', { token: b.token })).status, 403);
    assert.equal((await call('DELETE', '/guilds/mine', { token: a.token })).status, 200);
    assert.equal(await Guild.countDocuments({ _id: g.id }), 0);
    assert.equal((await Character.findOne({ userId: b.id })).guildId, null);
  });
});

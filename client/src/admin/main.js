import './admin.css';
import { h, fmtDate } from '../ui/dom.js';
import { api, auth } from '../network/api.js';

/**
 * Trang quản trị (chỉ tài khoản role = admin, server kiểm tra ở từng API):
 * tổng quan, xử lý báo cáo, tìm người chơi, khóa/cấm chat, thông báo toàn server, nhật ký thao tác.
 */
const app = document.getElementById('app');
const REASON = { spam: 'Spam / quấy rối', abuse: 'Xúc phạm', cheat: 'Gian lận', name: 'Tên không phù hợp', other: 'Khác' };
const ACTION = { ban: 'Khóa', unban: 'Mở khóa', mute: 'Cấm chat', unmute: 'Bỏ cấm chat', announce: 'Thông báo', 'report:reviewed': 'Xử lý báo cáo', 'report:dismissed': 'Bỏ qua báo cáo' };

let msgTimer;
const msgEl = h('div', { class: 'msg hidden' });
function say(text, bad = false) {
  msgEl.textContent = text;
  msgEl.className = `msg ${bad ? 'bad' : 'good'}`;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => msgEl.classList.add('hidden'), 4000);
}
const guard = (fn) => async (...a) => {
  try {
    return await fn(...a);
  } catch (e) {
    say(e.message, true);
    return undefined;
  }
};
const isActive = (d) => d && new Date(d) > new Date();
const until = (d) => (new Date(d).getFullYear() > 2900 ? 'vĩnh viễn' : `tới ${fmtDate(d)}`);

// ---------- Khóa / cấm chat ----------
function moderation(u, refresh) {
  const box = h('div', { class: 'actions' });
  if (u.role === 'admin') return h('span', { class: 'tag' }, 'Quản trị viên');
  const banned = isActive(u.bannedUntil);
  const muted = isActive(u.chatMutedUntil);
  if (banned) box.append(h('button', { class: 'ghost', onclick: guard(async () => (await api.adminUnban(u.id), say(`Đã mở khóa ${u.username || u.name}`), refresh())) }, 'Mở khóa'));
  else
    box.append(
      h(
        'button',
        {
          class: 'danger',
          onclick: guard(async () => {
            const reason = prompt(`Lý do khóa ${u.username || u.name}:`, 'Vi phạm quy định');
            if (reason === null) return;
            const hours = prompt('Khóa bao nhiêu giờ? (để trống = vĩnh viễn)', '24');
            if (hours === null) return;
            await api.adminBan(u.id, Number(hours) || 0, reason);
            say(`Đã khóa ${u.username || u.name}`);
            refresh();
          }),
        },
        'Khóa'
      )
    );
  if (muted) box.append(h('button', { class: 'ghost', onclick: guard(async () => (await api.adminUnmute(u.id), say('Đã bỏ cấm chat'), refresh())) }, 'Bỏ cấm chat'));
  else
    box.append(
      h(
        'button',
        {
          class: 'warn',
          onclick: guard(async () => {
            const minutes = prompt('Cấm chat bao nhiêu phút?', '60');
            if (!minutes) return;
            const reason = prompt('Lý do (người chơi sẽ thấy):', 'Ngôn từ không phù hợp') ?? '';
            await api.adminMute(u.id, Number(minutes) || 60, reason);
            say('Đã cấm chat');
            refresh();
          }),
        },
        'Cấm chat'
      )
    );
  return box;
}

const statusTags = (u) => [isActive(u.bannedUntil) ? h('span', { class: 'tag bad' }, `Bị khóa ${until(u.bannedUntil)}`) : null, isActive(u.chatMutedUntil) ? h('span', { class: 'tag warn' }, `Cấm chat ${until(u.chatMutedUntil)}`) : null];

// ---------- Các tab ----------
async function overview(el) {
  const d = await api.adminOverview();
  const card = (label, value, hot) => h('div', { class: `card${hot ? ' hot' : ''}` }, h('b', {}, value), h('span', {}, label));
  el.append(
    h(
      'div',
      { class: 'cards' },
      card('Báo cáo đang chờ', d.openReports, d.openReports > 0),
      card('Đang online', d.online),
      card('Tài khoản', d.users),
      card('Mới trong 7 ngày', d.newUsers),
      card('Đang bị khóa', d.banned),
      card('Đang cấm chat', d.muted),
      card('Câu lạc bộ', d.guilds)
    ),
    h('h3', {}, 'Channel'),
    d.channels.length ? h('table', {}, h('tr', {}, h('th', {}, 'Tên'), h('th', {}, 'Đang online'), h('th', {}, 'Cao nhất')), d.channels.map((c) => h('tr', {}, h('td', {}, c.name), h('td', {}, c.count), h('td', {}, c.peak)))) : h('p', { class: 'muted' }, 'Không có channel nào đang chạy.')
  );
  const text = h('input', { maxlength: 200, placeholder: 'Nội dung gửi tới mọi người đang online' });
  el.append(
    h('h3', {}, 'Thông báo toàn server'),
    h(
      'form',
      {
        class: 'row',
        onsubmit: guard(async (e) => {
          e.preventDefault();
          if (!text.value.trim() || !confirm(`Gửi tới mọi người: "${text.value}"?`)) return;
          await api.adminAnnounce(text.value.trim());
          text.value = '';
          say('Đã gửi thông báo');
        }),
      },
      text,
      h('button', { type: 'submit' }, 'Gửi')
    )
  );
}

async function reports(el) {
  let status = 'open';
  const list = h('div');
  const filter = h('div', { class: 'row' });
  const load = guard(async () => {
    filter.innerHTML = '';
    for (const [k, label] of [['open', 'Đang chờ'], ['reviewed', 'Đã xử lý'], ['dismissed', 'Đã bỏ qua']]) filter.append(h('button', { class: k === status ? '' : 'ghost', onclick: () => ((status = k), load()) }, label));
    const { reports: rows } = await api.adminReports(status);
    list.innerHTML = '';
    if (!rows.length) list.append(h('p', { class: 'muted' }, status === 'open' ? 'Không còn báo cáo nào đang chờ 🎉' : 'Chưa có báo cáo nào.'));
    for (const r of rows) {
      const resolve = (st) =>
        guard(async () => {
          const note = prompt(st === 'reviewed' ? 'Ghi chú cách xử lý:' : 'Lý do bỏ qua:', '');
          if (note === null) return;
          await api.adminResolve(r.id, st, note);
          say('Đã cập nhật báo cáo');
          load();
        });
      list.append(
        h(
          'div',
          { class: 'report' },
          h(
            'div',
            { class: 'report-head' },
            h('b', {}, r.target.name || r.target.username),
            h('span', { class: 'muted' }, ` @${r.target.username}`),
            r.target.openReports > 1 ? h('span', { class: 'tag bad' }, `${r.target.openReports} báo cáo đang mở`) : null,
            h('span', { class: 'tag' }, REASON[r.reason] || r.reason),
            statusTags(r.target),
            h('span', { class: 'muted right' }, fmtDate(r.createdAt))
          ),
          h('p', {}, h('span', { class: 'muted' }, `Người báo cáo: ${r.reporter.name || r.reporter.username}. `), r.details || h('i', { class: 'muted' }, 'Không có mô tả')),
          r.note ? h('p', { class: 'muted' }, `Ghi chú: ${r.note}`) : null,
          r.recentChat?.length ? h('details', {}, h('summary', {}, `Tin nhắn gần nhất (${r.recentChat.length})`), h('ul', {}, r.recentChat.map((c) => h('li', {}, c)))) : h('p', { class: 'muted' }, 'Không có tin nhắn đính kèm.'),
          h('div', { class: 'row' }, moderation({ ...r.target, username: r.target.username, role: 'user' }, load), status === 'open' ? h('button', { onclick: resolve('reviewed') }, '✓ Đã xử lý') : null, status === 'open' ? h('button', { class: 'ghost', onclick: resolve('dismissed') }, 'Bỏ qua') : null, h('button', { class: 'ghost', onclick: () => showUser(r.target.id) }, 'Chi tiết'))
        )
      );
    }
  });
  el.append(filter, list);
  await load();
}

function showUser(id) {
  const box = h('div', { class: 'dialog' });
  const close = () => back.remove();
  const back = h('div', { class: 'backdrop', onclick: (e) => e.target === back && close() }, box);
  document.body.append(back);
  const load = guard(async () => {
    const d = await api.adminUser(id);
    const u = d.user;
    box.innerHTML = '';
    box.append(
      h('div', {},
      h('button', { class: 'ghost close', onclick: close }, '✕'),
      h('h3', {}, `${u.displayName || '(chưa tạo nhân vật)'} `, h('span', { class: 'muted' }, `@${u.username}`)),
      h('p', {}, u.email, ' ', u.emailVerified ? h('span', { class: 'tag' }, 'Đã xác minh') : h('span', { class: 'tag warn' }, 'Chưa xác minh'), ' ', h('span', { class: 'muted' }, `Tham gia ${fmtDate(u.createdAt)}`)),
      u.level ? h('p', {}, `Level ${u.level} • ${u.coins} xu`) : null,
      h('div', {}, statusTags(u)),
      u.banReason ? h('p', { class: 'muted' }, `Lý do khóa: ${u.banReason}`) : null,
      moderation(u, load),
      h('h4', {}, `Báo cáo về người này (${d.reports.length})`),
      d.reports.length ? h('ul', {}, d.reports.map((r) => h('li', {}, `${fmtDate(r.createdAt)} • ${REASON[r.reason]} • ${r.status}${r.details ? ` • ${r.details}` : ''}`))) : h('p', { class: 'muted' }, 'Chưa có.'),
      h('h4', {}, 'Lịch sử xử lý'),
      d.actions.length ? h('ul', {}, d.actions.map((a) => h('li', {}, `${fmtDate(a.createdAt)} • ${ACTION[a.action] || a.action}${a.detail ? ` • ${a.detail}` : ''}`))) : h('p', { class: 'muted' }, 'Chưa có.'),
      h('h4', {}, 'Tin nhắn gần đây'),
      d.chat.length ? h('ul', {}, d.chat.map((c) => h('li', {}, `${fmtDate(c.createdAt)} [${c.channel.split(':')[0]}] ${c.content}`))) : h('p', { class: 'muted' }, 'Chưa có.'))
    );
  });
  load();
}

async function users(el) {
  const q = h('input', { placeholder: 'Tìm tên đăng nhập, email hoặc tên nhân vật' });
  const list = h('div');
  const load = guard(async () => {
    const { users: rows } = await api.adminUsers(q.value.trim());
    list.innerHTML = '';
    if (!rows.length) return list.append(h('p', { class: 'muted' }, 'Không tìm thấy.'));
    list.append(
      h(
        'table',
        {},
        h('tr', {}, h('th', {}, 'Người chơi'), h('th', {}, 'Email'), h('th', {}, 'Level'), h('th', {}, 'Trạng thái'), h('th', {}, '')),
        rows.map((u) =>
          h(
            'tr',
            {},
            h('td', {}, h('a', { href: '#', onclick: (e) => (e.preventDefault(), showUser(u.id)) }, u.displayName || u.username), h('div', { class: 'muted' }, `@${u.username}`)),
            h('td', {}, u.email),
            h('td', {}, u.level ?? '-'),
            h('td', {}, statusTags(u)),
            h('td', {}, moderation(u, load))
          )
        )
      )
    );
    return undefined;
  });
  q.oninput = () => {
    clearTimeout(q._t);
    q._t = setTimeout(load, 300);
  };
  el.append(h('div', { class: 'row' }, q), list);
  await load();
}

async function actions(el) {
  const { actions: rows } = await api.adminActions();
  if (!rows.length) return el.append(h('p', { class: 'muted' }, 'Chưa có thao tác nào.'));
  el.append(h('table', {}, h('tr', {}, h('th', {}, 'Lúc'), h('th', {}, 'Quản trị viên'), h('th', {}, 'Thao tác'), h('th', {}, 'Người chơi'), h('th', {}, 'Chi tiết')), rows.map((a) => h('tr', {}, h('td', {}, fmtDate(a.at)), h('td', {}, a.admin), h('td', {}, ACTION[a.action] || a.action), h('td', {}, a.target), h('td', {}, a.detail)))));
  return undefined;
}

// ---------- Khung trang ----------
async function main() {
  if (!auth.token) return denied('Bạn chưa đăng nhập. Hãy đăng nhập trong game rồi mở lại trang này.');
  let me;
  try {
    me = await api.me();
  } catch (e) {
    return denied(e.message);
  }
  if (me.user.role !== 'admin') return denied('Tài khoản này không có quyền quản trị.');
  const content = h('main');
  const nav = h('nav');
  const tabs = { 'Tổng quan': overview, 'Báo cáo': reports, 'Người chơi': users, 'Nhật ký': actions };
  const show = guard(async (name) => {
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('ghost', b.textContent !== name));
    content.innerHTML = '';
    await tabs[name](content);
  });
  for (const name of Object.keys(tabs)) nav.append(h('button', { class: 'ghost', onclick: () => show(name) }, name));
  app.append(h('header', {}, h('h1', {}, '🛠️ Quản trị Gym Online'), h('span', { class: 'muted' }, `@${me.user.username}`), h('a', { href: '/', class: 'right' }, '← Về game')), nav, msgEl, content);
  await show('Tổng quan');
  return undefined;
}

function denied(text) {
  app.append(h('div', { class: 'denied' }, h('h2', {}, '🛠️ Quản trị Gym Online'), h('p', {}, text), h('a', { href: '/' }, '← Về game')));
}

main();

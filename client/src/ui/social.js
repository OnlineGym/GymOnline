import { h, openModal, toast, fmtDate } from './dom.js';
import { api } from '../network/api.js';
import { STAT_LABELS, STAT_ICONS, STAT_COLORS } from '../equipment/config.js';
import { ITEMS, FLOORS, GUILD_COST, ACHIEVEMENTS, PARTY_MAX } from '@shared/constants.js';

const loading = () => h('div', { class: 'muted', style: { padding: '14px', textAlign: 'center' } }, 'Đang tải...');
const err = (e) => h('div', { class: 'error-text' }, e.message);
const small = (text) => h('span', { class: 'muted', style: { fontSize: '12px' } }, text);
const mini = (label, onclick, cls = 'ghost') => h('button', { class: `btn ${cls}`, type: 'button', style: { padding: '5px 10px', fontSize: '12px' }, onclick }, label);

function presenceText(p) {
  if (!p) return 'Offline';
  const fl = FLOORS[p.floor]?.key ?? '?';
  return `${p.channelName || p.channel} • Tầng ${fl}${p.zone ? ` • ${p.zone}` : ''}${p.activity ? ` • 🏋️ ${p.activity}` : ''}`;
}

// ============== BẠN BÈ / PARTY / CLB ==============
export function openSocial(game, tab = 'friends') {
  const tabs = h('div', { class: 'tabs' });
  const content = h('div');
  const body = h('div', {}, tabs, content);
  const m = openModal('👥 Cộng đồng', body, { width: 620 });
  const show = (t) => {
    tab = t;
    tabs.innerHTML = '';
    for (const [k, label] of [
      ['friends', '🤝 Bạn bè'],
      ['party', '👥 Party'],
      ['guild', '🛡️ CLB'],
    ])
      tabs.append(h('button', { type: 'button', class: k === tab ? 'active' : '', onclick: () => show(k) }, label));
    content.innerHTML = '';
    content.append(loading());
    ({ friends: renderFriends, party: renderParty, guild: renderGuild })[tab](game, content, () => show(tab), m);
  };
  show(tab);
}

async function renderFriends(game, el, refresh, modal) {
  try {
    const [{ friends, incoming, outgoing }, { blocked }] = await Promise.all([api.friends(), api.blocked()]);
    game.setFriends(friends);
    el.innerHTML = '';
    const input = h('input', { class: 'input', placeholder: 'Tên hiển thị hoặc tên đăng nhập', maxlength: 20 });
    el.append(
      h(
        'form',
        {
          class: 'row-form',
          onsubmit: async (e) => {
            e.preventDefault();
            if (!input.value.trim()) return;
            try {
              const r = await api.friendRequestByName(input.value.trim());
              toast(r.status === 'accepted' ? '🤝 Đã trở thành bạn bè!' : '📨 Đã gửi lời mời kết bạn', 'success');
              refresh();
            } catch (ex) {
              toast(ex.message, 'error');
            }
          },
        },
        input,
        h('button', { class: 'btn', type: 'submit' }, '➕ Kết bạn')
      )
    );
    if (incoming.length) {
      el.append(h('h4', {}, `📩 Lời mời (${incoming.length})`));
      for (const f of incoming)
        el.append(
          h(
            'div',
            { class: 'list-row' },
            h('div', {}, h('b', {}, f.name), ' ', small(`Lv.${f.level}`)),
            h(
              'div',
              { class: 'row-actions' },
              mini('Đồng ý', async () => {
                await api.friendAccept(f.userId).catch((e) => toast(e.message, 'error'));
                refresh();
              }, ''),
              mini('Từ chối', async () => {
                await api.friendRemove(f.userId).catch(() => {});
                refresh();
              })
            )
          )
        );
    }
    el.append(h('h4', {}, `Bạn bè (${friends.filter((f) => f.online).length}/${friends.length} online)`));
    if (!friends.length) el.append(h('p', { class: 'muted' }, 'Chưa có bạn bè. Bấm vào một người chơi trong game để kết bạn!'));
    for (const f of friends) {
      el.append(
        h(
          'div',
          { class: 'list-row' },
          h('div', {}, h('span', { class: `dot ${f.online ? '' : 'off'}` }), ' ', h('b', {}, f.name), ' ', small(`Lv.${f.level}`), h('div', {}, small(presenceText(f.presence)))),
          h(
            'div',
            { class: 'row-actions' },
            mini('💬', () => {
              modal.close();
              game.chat.openDm(f.userId, f.name);
            }),
            f.online
              ? mini('📍 Đến chỗ', () => {
                  modal.close();
                  game.gotoFriend(f);
                }, '')
              : null,
            mini('👥', () => game.inviteParty(f.userId, f.name)),
            mini('👤', () => openProfile(game, f.userId)),
            mini('✕', async () => {
              if (!confirm(`Xóa ${f.name} khỏi danh sách bạn?`)) return;
              await api.friendRemove(f.userId);
              refresh();
            })
          )
        )
      );
    }
    if (outgoing.length) el.append(h('p', { class: 'muted' }, `Đang chờ: ${outgoing.map((o) => o.name).join(', ')}`));
    if (blocked.length) {
      el.append(h('h4', {}, '🚫 Đã chặn'));
      for (const b of blocked)
        el.append(
          h('div', { class: 'list-row' }, h('b', {}, b.name), mini('Bỏ chặn', async () => {
            await api.unblock(b.userId);
            game.blocked.delete(b.userId);
            refresh();
          }))
        );
    }
  } catch (e) {
    el.innerHTML = '';
    el.append(err(e));
  }
}

async function renderParty(game, el, refresh) {
  try {
    const [{ party }, { friends }] = await Promise.all([api.party(), api.friends()]);
    game.onPartyUpdate(party);
    el.innerHTML = '';
    if (!party) {
      el.append(
        h('p', {}, `Lập nhóm tối đa ${PARTY_MAX} người để có mục tiêu calo chung mỗi ngày, chat nhóm và +10% EXP khi tập.`),
        mini('➕ Tạo party', async () => {
          await api.partyCreate().catch((e) => toast(e.message, 'error'));
          refresh();
        }, '')
      );
      return;
    }
    const isLeader = party.leader === game.user.id;
    const pct = Math.min(100, (party.progress.calories / party.progress.goal) * 100);
    el.append(
      h('div', { class: 'kpi', style: { marginBottom: '12px' } }, h('b', {}, `${party.progress.calories}/${party.progress.goal} kcal`), h('span', {}, `Mục tiêu nhóm hôm nay • ${party.progress.sessions} buổi tập`), h('div', { class: 'bar' }, h('div', { style: { width: `${pct}%` } })))
    );
    for (const mb of party.members) {
      el.append(
        h(
          'div',
          { class: 'list-row' },
          h('div', {}, h('span', { class: `dot ${mb.online ? '' : 'off'}` }), ' ', h('b', {}, `${mb.userId === party.leader ? '👑 ' : ''}${mb.name}`), ' ', small(`Lv.${mb.level}`), h('div', {}, small(presenceText(mb.presence)))),
          isLeader && mb.userId !== game.user.id
            ? mini('Mời ra', async () => {
                await api.partyKick(mb.userId);
                refresh();
              })
            : null
        )
      );
    }
    const candidates = friends.filter((f) => f.online && !party.members.some((m) => m.userId === f.userId));
    if (candidates.length && party.members.length < PARTY_MAX) {
      el.append(h('h4', {}, 'Mời bạn bè đang online'));
      for (const f of candidates) el.append(h('div', { class: 'list-row' }, h('b', {}, f.name), mini('Mời', () => game.inviteParty(f.userId, f.name), '')));
    }
    el.append(
      h('div', { style: { marginTop: '12px' } }, mini('🚪 Rời party', async () => {
        await api.partyLeave();
        game.onPartyUpdate(null);
        refresh();
      }, 'danger'))
    );
  } catch (e) {
    el.innerHTML = '';
    el.append(err(e));
  }
}

async function renderGuild(game, el, refresh) {
  try {
    const { guild } = await api.myGuild();
    el.innerHTML = '';
    if (guild) {
      const isLeader = guild.leader === game.user.id;
      el.append(
        h('div', { class: 'guild-head', style: { borderColor: guild.color } }, h('b', { style: { color: guild.color } }, `[${guild.tag}] ${guild.name}`), h('div', { class: 'muted' }, guild.description || 'Chưa có mô tả')),
        h(
          'div',
          { class: 'kpis' },
          h('div', { class: 'kpi' }, h('b', {}, `${guild.memberCount}/${guild.max}`), h('span', {}, 'Thành viên')),
          h('div', { class: 'kpi' }, h('b', {}, guild.weekly.exp), h('span', {}, 'EXP tuần này')),
          h('div', { class: 'kpi' }, h('b', {}, guild.weekly.calories), h('span', {}, 'kcal tuần này'))
        ),
        h('p', { class: 'muted', style: { fontSize: '12px' } }, 'Chat CLB: chọn tab "CLB" trong khung chat.')
      );
      for (const mb of guild.members) {
        el.append(
          h(
            'div',
            { class: 'list-row' },
            h('div', {}, h('span', { class: `dot ${mb.online ? '' : 'off'}` }), ' ', h('b', {}, `${mb.userId === guild.leader ? '👑 ' : ''}${mb.name}`), ' ', small(`Lv.${mb.level}`)),
            isLeader && mb.userId !== game.user.id
              ? mini('Mời ra', async () => {
                  await api.guildKick(mb.userId).catch((e) => toast(e.message, 'error'));
                  refresh();
                })
              : null
          )
        );
      }
      el.append(
        h('div', { style: { marginTop: '12px' } }, mini('🚪 Rời CLB', async () => {
          if (!confirm('Rời câu lạc bộ?')) return;
          await api.guildLeave();
          game.onGuildChange(null);
          refresh();
        }, 'danger'))
      );
      return;
    }
    // Chưa có CLB: tạo mới hoặc tìm để tham gia
    const name = h('input', { class: 'input', placeholder: 'Tên CLB (3-24 ký tự)', maxlength: 24 });
    const tag = h('input', { class: 'input', placeholder: 'TAG (2-5)', maxlength: 5, style: { textTransform: 'uppercase' } });
    const desc = h('input', { class: 'input', placeholder: 'Mô tả ngắn', maxlength: 200 });
    const color = h('input', { type: 'color', value: '#22d3ee', class: 'swatch-custom' });
    el.append(
      h('h4', {}, `Lập CLB mới (${GUILD_COST} xu)`),
      h(
        'form',
        {
          class: 'guild-form',
          onsubmit: async (e) => {
            e.preventDefault();
            try {
              const r = await api.guildCreate({ name: name.value.trim(), tag: tag.value.trim(), description: desc.value.trim(), color: color.value });
              game.onCharacter(r.character);
              game.onGuildChange(r.guild);
              toast(`🛡️ Đã lập CLB [${r.guild.tag}] ${r.guild.name}`, 'success');
              refresh();
            } catch (ex) {
              toast(ex.message, 'error');
            }
          },
        },
        name,
        tag,
        desc,
        h('label', { class: 'muted' }, 'Màu ', color),
        h('button', { class: 'btn', type: 'submit' }, '🛡️ Lập CLB')
      )
    );
    const search = h('input', { class: 'input', placeholder: 'Tìm CLB...' });
    const results = h('div');
    const doSearch = async () => {
      const { guilds } = await api.guilds(search.value.trim());
      results.innerHTML = '';
      if (!guilds.length) results.append(h('p', { class: 'muted' }, 'Không tìm thấy CLB'));
      for (const g of guilds)
        results.append(
          h(
            'div',
            { class: 'list-row' },
            h('div', {}, h('b', { style: { color: g.color } }, `[${g.tag}] ${g.name}`), ' ', small(`${g.memberCount} thành viên ${g.open ? '' : '• 🔒 chỉ nhận lời mời'}`)),
            mini('Tham gia', async () => {
              try {
                const r = await api.guildJoin(g.id);
                game.onGuildChange(r.guild);
                toast(`Đã vào CLB ${g.name}`, 'success');
                refresh();
              } catch (ex) {
                toast(ex.message, 'error');
              }
            }, '')
          )
        );
    };
    search.oninput = () => {
      clearTimeout(search._t);
      search._t = setTimeout(doSearch, 300);
    };
    el.append(h('h4', {}, 'Tham gia CLB'), search, results);
    doSearch();
  } catch (e) {
    el.innerHTML = '';
    el.append(err(e));
  }
}

// ============== HỒ SƠ CÔNG KHAI ==============
export async function openProfile(game, userId) {
  const body = h('div', {}, loading());
  const m = openModal('👤 Hồ sơ', body, { width: 560 });
  try {
    const { player: p } = await api.player(userId);
    const self = userId === game.user.id;
    const max = Math.max(20, ...Object.values(p.stats));
    body.innerHTML = '';
    const a = p.appearance;
    body.append(
      h(
        'div',
        { class: 'profile-head' },
        h('div', { class: 'avatar big', style: { background: `linear-gradient(135deg, ${a.outfit.top}, ${a.skinColor})` } }, a.displayName.slice(0, 1).toUpperCase()),
        h(
          'div',
          {},
          h('h3', { style: { margin: 0 } }, a.displayName, ' ', h('span', { class: 'level-badge' }, `Lv.${p.level}`)),
          p.guild ? h('div', { style: { color: p.guild.color, fontWeight: 700 } }, `🛡️ [${p.guild.tag}] ${p.guild.name}`) : null,
          h('div', { class: 'muted', style: { fontSize: '12px' } }, `${p.online ? '🟢 Đang online' : '⚫ Offline'} • Tham gia ${fmtDate(p.joinedAt)}`),
          p.presence ? small(presenceText(p.presence)) : null
        )
      ),
      h(
        'div',
        { class: 'kpis' },
        h('div', { class: 'kpi' }, h('b', {}, p.totalWorkouts), h('span', {}, 'Buổi tập')),
        h('div', { class: 'kpi' }, h('b', {}, p.totalCalories), h('span', {}, 'Tổng kcal')),
        h('div', { class: 'kpi' }, h('b', {}, `${p.wins}/${p.matches}`), h('span', {}, 'Thắng/Trận')),
        h('div', { class: 'kpi' }, h('b', {}, p.trackLaps), h('span', {}, 'Vòng chạy'))
      ),
      h('h4', {}, 'Chỉ số cơ bắp'),
      Object.keys(STAT_LABELS).map((k) =>
        h(
          'div',
          { class: 'stat-row' },
          h('span', {}, `${STAT_ICONS[k]} ${STAT_LABELS[k]}`),
          h('div', { class: 'bar' }, h('div', { style: { width: `${(p.stats[k] / max) * 100}%`, background: STAT_COLORS[k] } })),
          h('b', { style: { textAlign: 'right' } }, Math.floor(p.stats[k]))
        )
      ),
      h('h4', {}, `Huy hiệu (${p.badges.length})`),
      h('div', { class: 'badges' }, p.badges.length ? p.badges.map((b) => h('span', { class: 'badge', title: b.desc }, `${b.icon} ${b.label}`)) : small('Chưa có huy hiệu'))
    );
    const actions = h('div', { class: 'creator-actions' });
    if (self) {
      actions.append(h('button', { class: 'btn ghost', onclick: () => (m.close(), game.openWardrobe(false)) }, '🧥 Đổi ngoại hình'), h('button', { class: 'btn ghost', onclick: () => (m.close(), game.openMenu('inventory')) }, '🎒 Túi đồ'));
    } else {
      const fs = { none: '➕ Kết bạn', incoming: '✅ Chấp nhận kết bạn', outgoing: '⏳ Đã gửi lời mời', friends: '🤝 Bạn bè', blocked: '🚫 Đã chặn' }[p.friendStatus];
      actions.append(
        h(
          'button',
          {
            class: 'btn',
            disabled: p.friendStatus === 'outgoing' || p.friendStatus === 'friends' || p.friendStatus === 'blocked',
            onclick: async () => {
              try {
                if (p.friendStatus === 'incoming') await api.friendAccept(userId);
                else await api.friendRequest(userId);
                toast('Đã gửi!', 'success');
                m.close();
              } catch (e) {
                toast(e.message, 'error');
              }
            },
          },
          fs
        ),
        h('button', { class: 'btn ghost', onclick: () => (m.close(), game.chat.openDm(userId, a.displayName)) }, '💬 Nhắn'),
        h('button', { class: 'btn ghost', onclick: () => (m.close(), openGiftDialog(game, { userId, name: a.displayName })) }, '🎁 Tặng quà')
      );
    }
    body.append(actions);
  } catch (e) {
    body.innerHTML = '';
    body.append(err(e));
  }
}

// ============== TẶNG QUÀ ==============
export function openGiftDialog(game, target) {
  const inv = (game.character.inventory || []).filter((i) => i.qty > 0);
  const coins = h('input', { class: 'input', type: 'number', min: 0, max: 10000, value: 10 });
  const item = h('select', { class: 'input' }, h('option', { value: '' }, '— Không tặng vật phẩm —'), inv.map((i) => h('option', { value: i.item }, `${ITEMS[i.item]?.icon} ${ITEMS[i.item]?.label} (có ${i.qty})`)));
  const qty = h('input', { class: 'input', type: 'number', min: 1, max: 10, value: 1 });
  const msg = h('input', { class: 'input', maxlength: 100, placeholder: 'Lời nhắn (không bắt buộc)' });
  const body = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const r = await api.sendGift({ to: target.userId, coins: Number(coins.value) || 0, item: item.value || undefined, qty: item.value ? Number(qty.value) || 1 : undefined, message: msg.value });
          game.onCharacter(r.character);
          toast(`🎁 Đã gửi quà cho ${target.name}. Chờ họ xác nhận!`, 'success');
          m.close();
        } catch (ex) {
          toast(ex.message, 'error');
        }
      },
    },
    h('p', { class: 'muted' }, `Quà sẽ được giữ tạm cho tới khi ${target.name} đồng ý nhận (từ chối hoặc quá 24h sẽ hoàn lại).`),
    h('div', { class: 'field' }, h('label', {}, `Xu (bạn có ${game.character.coins})`), coins),
    h('div', { class: 'field' }, h('label', {}, 'Vật phẩm'), item),
    h('div', { class: 'field' }, h('label', {}, 'Số lượng'), qty),
    h('div', { class: 'field' }, h('label', {}, 'Lời nhắn'), msg),
    h('button', { class: 'btn', type: 'submit', style: { width: '100%' } }, '🎁 Gửi quà')
  );
  const m = openModal(`🎁 Tặng quà cho ${target.name}`, body, { width: 420 });
}

// ============== BÁO CÁO ==============
export function openReportDialog(target) {
  const reason = h(
    'select',
    { class: 'input' },
    [
      ['spam', 'Spam / quấy rối chat'],
      ['abuse', 'Ngôn từ xúc phạm'],
      ['cheat', 'Gian lận / hack'],
      ['name', 'Tên không phù hợp'],
      ['other', 'Khác'],
    ].map(([v, l]) => h('option', { value: v }, l))
  );
  const details = h('textarea', { class: 'input', rows: 3, maxlength: 300, placeholder: 'Mô tả thêm (không bắt buộc)' });
  const body = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const r = await api.report(target.userId, reason.value, details.value);
          toast(r.message || 'Đã gửi báo cáo', 'success');
          m.close();
        } catch (ex) {
          toast(ex.message, 'error');
        }
      },
    },
    h('div', { class: 'field' }, h('label', {}, 'Lý do'), reason),
    h('div', { class: 'field' }, h('label', {}, 'Chi tiết'), details),
    h('p', { class: 'muted', style: { fontSize: '12px' } }, '10 tin nhắn gần nhất của người này sẽ được đính kèm để kiểm duyệt.'),
    h('button', { class: 'btn danger', type: 'submit', style: { width: '100%' } }, '⚠️ Gửi báo cáo')
  );
  const m = openModal(`⚠️ Báo cáo ${target.name}`, body, { width: 420 });
}

// ============== THÀNH TÍCH ==============
export async function openAchievements() {
  const body = h('div', {}, loading());
  openModal('🏅 Thành tích', body, { width: 560 });
  try {
    const { unlocked } = await api.achievements();
    const got = new Map(unlocked.map((a) => [a.key, a]));
    body.innerHTML = '';
    body.append(h('p', { class: 'muted' }, `Đã mở khóa ${got.size}/${Object.keys(ACHIEVEMENTS).length}`));
    body.append(
      h(
        'div',
        { class: 'ach-grid' },
        Object.entries(ACHIEVEMENTS).map(([k, a]) =>
          h('div', { class: `ach ${got.has(k) ? 'on' : ''}` }, h('div', { class: 'ach-icon' }, got.has(k) ? a.icon : '🔒'), h('b', {}, a.label), small(a.desc), got.has(k) ? small(fmtDate(got.get(k).at)) : null)
        )
      )
    );
  } catch (e) {
    body.innerHTML = '';
    body.append(err(e));
  }
}

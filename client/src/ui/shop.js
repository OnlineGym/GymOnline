import { h, openModal, toast } from './dom.js';
import { api } from '../network/api.js';
import { ITEMS } from '@shared/constants.js';
import { audio } from '../core/audio.js';

/**
 * Cửa hàng (dùng coins) + túi đồ: uống đồ uống để nhận buff, đeo phụ kiện.
 * kind: 'whey' (đủ mặt hàng) | 'juice' (chỉ đồ uống) | 'inventory' (mở thẳng túi đồ)
 */
export function openShop(game, kind = 'whey') {
  let tab = kind === 'inventory' ? 'inv' : 'shop';
  const tabs = h('div', { class: 'tabs' });
  const content = h('div');
  const coinsEl = h('b', {});
  const title = kind === 'juice' ? '🧃 Juice Bar' : kind === 'inventory' ? '🎒 Túi đồ' : '🛒 Cửa hàng Whey';
  openModal(title, h('div', {}, h('div', { class: 'shop-coins' }, '🪙 Xu của bạn: ', coinsEl), tabs, content), { width: 600 });

  const render = () => {
    const c = game.character;
    coinsEl.textContent = c.coins;
    tabs.innerHTML = '';
    tabs.append(
      h('button', { type: 'button', class: tab === 'shop' ? 'active' : '', onclick: () => ((tab = 'shop'), render()) }, '🛒 Mua'),
      h('button', { type: 'button', class: tab === 'inv' ? 'active' : '', onclick: () => ((tab = 'inv'), render()) }, `🎒 Túi đồ (${(c.inventory || []).reduce((s, i) => s + i.qty, 0)})`)
    );
    content.innerHTML = '';
    if (tab === 'shop') {
      const entries = Object.entries(ITEMS).filter(([, it]) => kind !== 'juice' || it.type === 'drink');
      content.append(
        h(
          'div',
          { class: 'shop-grid' },
          entries.map(([key, it]) => {
            const owned = it.type === 'accessory' && (c.inventory || []).some((i) => i.item === key && i.qty > 0);
            return h(
              'div',
              { class: 'shop-item' },
              h('div', { class: 'si-icon' }, it.icon),
              h('b', {}, it.label),
              h('span', { class: 'muted' }, it.desc),
              h(
                'button',
                {
                  class: 'btn',
                  type: 'button',
                  disabled: owned || c.coins < it.price,
                  onclick: async () => {
                    try {
                      const r = await api.buy(key, 1);
                      game.onCharacter(r.character);
                      audio.sfx('coin');
                      toast(`Đã mua ${it.icon} ${it.label}`, 'success');
                      render();
                    } catch (e) {
                      toast(e.message, 'error');
                    }
                  },
                },
                owned ? 'Đã có' : `🪙 ${it.price}`
              )
            );
          })
        )
      );
    } else {
      const inv = (c.inventory || []).filter((i) => i.qty > 0);
      if (!inv.length) content.append(h('p', { class: 'muted' }, 'Túi đồ trống. Ghé Cửa hàng Whey (tầng 1) hoặc Juice Bar để mua!'));
      for (const i of inv) {
        const it = ITEMS[i.item];
        if (!it) continue;
        const equipped = c.accessory === i.item;
        content.append(
          h(
            'div',
            { class: 'list-row' },
            h('div', {}, h('b', {}, `${it.icon} ${it.label}`), ' ', h('span', { class: 'muted' }, `x${i.qty} • ${it.desc}`)),
            it.type === 'drink'
              ? h(
                  'button',
                  {
                    class: 'btn',
                    type: 'button',
                    style: { padding: '6px 12px' },
                    onclick: async () => {
                      try {
                        const r = await api.useItem(i.item);
                        game.onCharacter(r.character);
                        audio.sfx('levelup');
                        toast(`${it.icon} Đã dùng ${it.label}: ${it.desc}`, 'success');
                        render();
                      } catch (e) {
                        toast(e.message, 'error');
                      }
                    },
                  },
                  'Uống'
                )
              : h(
                  'button',
                  {
                    class: `btn ${equipped ? 'ghost' : ''}`,
                    type: 'button',
                    style: { padding: '6px 12px' },
                    onclick: async () => {
                      try {
                        const r = await api.equip(equipped ? null : i.item);
                        game.onCharacter(r.character);
                        game.me.setAppearance({ ...game.me.appearance, accessory: r.character.accessory });
                        render();
                      } catch (e) {
                        toast(e.message, 'error');
                      }
                    },
                  },
                  equipped ? 'Tháo ra' : 'Đeo'
                )
          )
        );
      }
    }
  };
  render();
}

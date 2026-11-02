import { h, openModal } from './dom.js';
import { EQUIPMENT_INFO, EQUIPMENT_GROUP_LABEL, STAT_ICONS } from '../equipment/config.js';
import { FLOORS } from '@shared/constants.js';

/**
 * "Tìm máy trống": chọn nhóm cơ -> xem từng loại máy ở các tầng còn bao nhiêu máy trống,
 * bấm "Chỉ đường" để đặt waypoint tới máy trống gần nhất.
 * getLocks(floor) -> Promise<{ [equipmentId]: nid }>
 */
export async function openFinder({ equipment, currentFloor, self, level, getLocks, onWaypoint }) {
  let group = 'chest';
  const tabs = h('div', { class: 'tabs wrap' });
  const listEl = h('div', {}, h('div', { class: 'muted' }, 'Đang kiểm tra máy trống...'));
  const m = openModal('🔍 Tìm máy trống', h('div', {}, tabs, listEl), { width: 640 });

  // Lấy trạng thái khóa của tất cả các tầng
  const locks = {};
  await Promise.all(FLOORS.map(async (f) => (locks[f.id] = await getLocks(f.id))));

  const render = () => {
    tabs.innerHTML = '';
    for (const [k, label] of Object.entries(EQUIPMENT_GROUP_LABEL)) {
      tabs.append(h('button', { type: 'button', class: k === group ? 'active' : '', onclick: () => ((group = k), render()) }, `${STAT_ICONS[k]} ${label}`));
    }
    listEl.innerHTML = '';
    const types = Object.entries(EQUIPMENT_INFO).filter(([, v]) => v.group === group && !v.utility);
    for (const [type, info] of types) {
      const perFloor = [];
      for (const f of FLOORS) {
        const items = (equipment.byFloor.get(f.id) || []).filter((e) => e.type === type && !e.base);
        if (!items.length) continue;
        const free = items.filter((e) => !locks[f.id]?.[e.id]);
        perFloor.push({ f, items, free });
      }
      if (!perFloor.length) continue;
      const locked = level < (info.unlock || 1);
      const best = () => {
        // Ưu tiên tầng hiện tại, sau đó gần nhất theo khoảng cách
        const cands = perFloor.flatMap((pf) => pf.free.map((e) => ({ e, d: (pf.f.id === currentFloor ? 0 : 1000) + Math.hypot(e.seat.x - self.x, e.seat.z - self.z) })));
        cands.sort((a, b) => a.d - b.d);
        return cands[0]?.e;
      };
      listEl.append(
        h(
          'div',
          { class: 'finder-row' },
          h('div', {}, h('b', {}, info.label), h('div', { class: 'muted', style: { fontSize: '12px' } }, `${info.en}${locked ? ` • 🔒 Cần level ${info.unlock}` : ''}`)),
          h('div', { class: 'finder-floors' }, perFloor.map((pf) => h('span', { class: `ff ${pf.free.length ? 'ok' : 'busy'}` }, `${pf.f.key}: ${pf.free.length}/${pf.items.length}`))),
          h(
            'button',
            {
              class: 'btn ghost',
              type: 'button',
              style: { padding: '6px 12px', fontSize: '13px' },
              onclick: () => {
                const e = best();
                if (!e) return;
                onWaypoint({ f: e.floor, x: e.seat.x, z: e.seat.z, label: info.label, equipmentId: e.id });
                m.close();
              },
            },
            '📍 Chỉ đường'
          )
        )
      );
    }
  };
  render();
}

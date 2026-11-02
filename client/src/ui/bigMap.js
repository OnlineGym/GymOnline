import { h, openModal } from './dom.js';
import { renderFloorPlan } from './minimap.js';
import { FLOORS } from '@shared/constants.js';
import { isMobile } from '../core/device.js';

/**
 * Bản đồ toàn tòa nhà: tab theo tầng, bấm vào khu/phòng để đặt chỉ đường (waypoint).
 * Có danh sách phòng của tầng để chọn nhanh trên mobile.
 */
export function openBigMap({ building, equipment, currentFloor, self, friends, onWaypoint }) {
  let floor = currentFloor;
  const scale = isMobile() ? 4 : 8;
  const tabs = h('div', { class: 'tabs' });
  const canvasWrap = h('div', { class: 'bigmap-wrap' });
  const roomList = h('div', { class: 'room-list' });
  const body = h('div', {}, tabs, canvasWrap, h('div', { class: 'muted', style: { fontSize: '12px', margin: '6px 0' } }, 'Bấm vào bản đồ hoặc tên khu để chỉ đường • Vàng: máy tập • Xanh: thang máy/cầu thang'), roomList);
  const m = openModal('🗺️ Bản đồ tòa nhà', body, { width: 760 });

  const render = () => {
    tabs.innerHTML = '';
    for (const f of FLOORS) {
      const b = h('button', { type: 'button', class: f.id === floor ? 'active' : '', onclick: () => ((floor = f.id), render()) }, `${f.key} ${f.id === currentFloor ? '📍' : ''}`);
      b.title = f.name;
      tabs.append(b);
    }
    const def = building.floor(floor).def;
    const plan = renderFloorPlan(def, equipment, scale, { labels: true });
    const c = plan.canvas;
    c.className = 'bigmap-canvas';
    const g = c.getContext('2d');
    if (floor === currentFloor) {
      g.fillStyle = '#facc15';
      g.beginPath();
      g.arc(plan.tx(self.x), plan.tz(self.z), 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0b0f1a';
      g.font = '700 11px sans-serif';
      g.fillText('BẠN', plan.tx(self.x), plan.tz(self.z) - 13);
    }
    // Bạn bè đang ở tầng này (chỉ biết tầng + khu, không lộ toạ độ)
    const here = (friends || []).filter((fr) => fr.online && fr.presence?.floor === floor);
    if (here.length) {
      g.fillStyle = 'rgba(2,6,23,0.75)';
      g.fillRect(6, 6, 260, 20 + here.length * 16);
      g.fillStyle = '#a3e635';
      g.font = '700 12px sans-serif';
      g.textAlign = 'left';
      g.fillText('Bạn bè ở tầng này:', 14, 18);
      here.forEach((fr, i) => g.fillText(`• ${fr.name} – ${fr.presence.zone || ''}`, 14, 34 + i * 16));
    }
    c.onclick = (e) => {
      const rect = c.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * plan.w;
      const z = ((e.clientY - rect.top) / rect.height) * plan.h;
      const wx = x / scale + plan.B.minX;
      const wz = z / scale + plan.B.minZ;
      const room = building.floor(floor).roomAt(wx, wz);
      onWaypoint({ f: floor, x: wx, z: wz, label: room.name || `Tầng ${FLOORS[floor].key}` });
      m.close();
    };
    canvasWrap.innerHTML = '';
    canvasWrap.append(c);
    roomList.innerHTML = '';
    roomList.append(h('b', {}, FLOORS[floor].name));
    for (const r of def.rooms) {
      roomList.append(
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            onclick: () => {
              onWaypoint({ f: floor, x: (r.x1 + r.x2) / 2, z: (r.z1 + r.z2) / 2, label: r.name });
              m.close();
            },
          },
          `${r.icon} ${r.name}`
        )
      );
    }
  };
  render();
}

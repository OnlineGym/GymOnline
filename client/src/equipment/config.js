// Client dùng chung cấu hình thiết bị với server (shared/equipment.js) – thêm máy mới chỉ cần thêm config ở đó
import { EQUIPMENT, slotInfo, EQUIPMENT_GROUP_LABEL } from '@shared/equipment.js';
import { STAT_LABELS, STAT_ICONS, STAT_COLORS } from '@shared/constants.js';

export const EQUIPMENT_INFO = EQUIPMENT;
export { slotInfo, STAT_LABELS, STAT_ICONS, STAT_COLORS, EQUIPMENT_GROUP_LABEL };

// Hàm chuyển phase (0..1) thành độ "gắng sức" p: 0 -> 1 -> 0 mượt (dùng chung cho máy + nhân vật)
export const effort = (phase) => 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);

import { BEAT_SECONDS } from '../core/audio.js';

/**
 * Cấu hình tương tác từng loại thiết bị (phía client, dùng để hiển thị + chạy animation).
 * Thưởng EXP/calo thật được SERVER tính lại (server/src/config/equipment.js).
 *  - anim: tên animation nhân vật
 *  - rep: số giây cho 1 rep (1 chu kỳ animation)
 *  - cal: calo/phút (ước tính hiển thị)
 *  - utility: thiết bị tiện ích (không tính buổi tập)
 */
export const EQUIPMENT_INFO = {
  chest_press: { label: 'Máy đẩy ngực', en: 'Chest Press', stat: 'chest', anim: 'chestPress', rep: 2.2, cal: 7 },
  pec_deck: { label: 'Máy ép ngực', en: 'Pec Deck', stat: 'chest', anim: 'pecDeck', rep: 2.4, cal: 6 },
  lat_pulldown: { label: 'Máy kéo xô', en: 'Lat Pulldown', stat: 'back', anim: 'latPulldown', rep: 2.4, cal: 7 },
  seated_row: { label: 'Máy kéo cáp ngồi', en: 'Seated Row', stat: 'back', anim: 'seatedRow', rep: 2.4, cal: 7 },
  leg_press: { label: 'Máy đạp đùi', en: 'Leg Press', stat: 'legs', anim: 'legPress', rep: 2.4, cal: 8 },
  leg_extension: { label: 'Máy đá đùi', en: 'Leg Extension', stat: 'legs', anim: 'legExtension', rep: 2.2, cal: 6 },
  bicep_machine: { label: 'Máy cuốn tay trước', en: 'Bicep Curl', stat: 'arms', anim: 'bicepCurl', rep: 2.0, cal: 5 },
  tricep_machine: { label: 'Máy tay sau', en: 'Tricep Press', stat: 'arms', anim: 'tricepPress', rep: 2.0, cal: 5 },
  treadmill: { label: 'Máy chạy bộ', en: 'Treadmill', stat: 'stamina', anim: 'treadmill', rep: 0.7, cal: 11 },
  dumbbell_bench: { label: 'Ghế tập tạ đơn', en: 'Dumbbell Curl', stat: 'arms', anim: 'dumbbellCurl', rep: 2.0, cal: 6 },
  pullup_bar: { label: 'Xà đơn', en: 'Pull-up', stat: 'back', anim: 'pullup', rep: 2.4, cal: 9 },
  battle_rope: { label: 'Dây kéo', en: 'Battle Rope', stat: 'stamina', anim: 'battleRope', rep: 0.6, cal: 12 },
  yoga_mat: { label: 'Thảm giãn cơ', en: 'Stretching', stat: 'stamina', anim: 'stretch', rep: 4, cal: 4 },
  medicine_ball: { label: 'Bóng tạ', en: 'Medicine Ball', stat: 'chest', anim: 'ballThrow', rep: 2.0, cal: 8 },
  aerobic_spot: { label: 'Nhảy Aerobic', en: 'Aerobic Dance', stat: 'stamina', anim: 'aerobic', rep: BEAT_SECONDS * 2, cal: 9 },
  sauna_seat: { label: 'Ghế xông hơi', en: 'Sauna', stat: 'stamina', anim: 'sauna', rep: 5, cal: 2 },
  locker: { label: 'Tủ đồ – Thay trang phục', en: 'Locker', utility: 'wardrobe', anim: 'locker' },
  toilet: { label: 'Đi vệ sinh', en: 'Toilet', utility: 'timed', anim: 'toilet', duration: 5 },
  sink: { label: 'Rửa tay', en: 'Sink', utility: 'timed', anim: 'washHands', duration: 3.5 },
};

export const STAT_LABELS = {
  chest: 'Ngực',
  back: 'Lưng',
  legs: 'Chân',
  arms: 'Tay',
  stamina: 'Thể lực',
};

export const STAT_ICONS = { chest: '🫁', back: '🦾', legs: '🦵', arms: '💪', stamina: '❤️' };

// Hàm chuyển phase (0..1) thành độ "gắng sức" p: 0 -> 1 -> 0 mượt (dùng chung cho máy + nhân vật)
export const effort = (phase) => 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);

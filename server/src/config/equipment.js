// Bảng cấu hình thiết bị phía server – dùng để TÍNH thưởng (không tin dữ liệu client gửi lên)
// stat: chỉ số được cộng | calPerMin: calo/phút | expPerRep: exp mỗi rep | minRepSec: thời gian tối thiểu 1 rep
export const EQUIPMENT_TYPES = {
  lat_pulldown: { stat: 'back', calPerMin: 7, expPerRep: 3, minRepSec: 1.6 },
  seated_row: { stat: 'back', calPerMin: 7, expPerRep: 3, minRepSec: 1.6 },
  chest_press: { stat: 'chest', calPerMin: 7, expPerRep: 3, minRepSec: 1.6 },
  pec_deck: { stat: 'chest', calPerMin: 6, expPerRep: 3, minRepSec: 1.6 },
  leg_press: { stat: 'legs', calPerMin: 8, expPerRep: 3, minRepSec: 1.8 },
  leg_extension: { stat: 'legs', calPerMin: 6, expPerRep: 3, minRepSec: 1.6 },
  bicep_machine: { stat: 'arms', calPerMin: 5, expPerRep: 3, minRepSec: 1.4 },
  tricep_machine: { stat: 'arms', calPerMin: 5, expPerRep: 3, minRepSec: 1.4 },
  treadmill: { stat: 'stamina', calPerMin: 11, expPerRep: 1, minRepSec: 0.5 },
  dumbbell_bench: { stat: 'arms', calPerMin: 6, expPerRep: 3, minRepSec: 1.4 },
  pullup_bar: { stat: 'back', calPerMin: 9, expPerRep: 4, minRepSec: 1.8 },
  battle_rope: { stat: 'stamina', calPerMin: 12, expPerRep: 1, minRepSec: 0.5 },
  yoga_mat: { stat: 'stamina', calPerMin: 4, expPerRep: 2, minRepSec: 2.5 },
  medicine_ball: { stat: 'chest', calPerMin: 8, expPerRep: 3, minRepSec: 1.6 },
  aerobic_spot: { stat: 'stamina', calPerMin: 9, expPerRep: 1, minRepSec: 0.8 },
  sauna_seat: { stat: 'stamina', calPerMin: 2, expPerRep: 1, minRepSec: 4 },
};

export const STAT_KEYS = ['chest', 'back', 'legs', 'arms', 'stamina'];

// EXP cần để lên level kế tiếp
export const expToNext = (level) => 100 + (level - 1) * 60;

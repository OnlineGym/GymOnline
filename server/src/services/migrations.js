import Character from '../models/Character.js';
import { STATS } from '../../../shared/constants.js';

/**
 * Migration chạy khi khởi động: bổ sung giá trị mặc định cho người chơi cũ
 * (chỉ số Vai/Bụng mới, túi đồ, buff...). Idempotent – chạy nhiều lần không sao.
 */
export async function runMigrations() {
  let changed = 0;
  for (const s of STATS) {
    const r = await Character.updateMany({ [`stats.${s}`]: { $exists: false } }, { $set: { [`stats.${s}`]: 0 } });
    changed += r.modifiedCount;
  }
  const defaults = { inventory: [], buffs: [], accessory: null, guildId: null, groupsTrained: [], wins: 0, trackLaps: 0 };
  for (const [k, v] of Object.entries(defaults)) {
    const r = await Character.updateMany({ [k]: { $exists: false } }, { $set: { [k]: v } });
    changed += r.modifiedCount;
  }
  // Đồng bộ index mới (leaderboard theo nhóm cơ, tuần, guild...)
  await Character.syncIndexes();
  if (changed) console.log(`[migrate] Đã cập nhật ${changed} trường cho dữ liệu cũ`);
}

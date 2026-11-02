import ChatMessage from '../models/ChatMessage.js';
import WorkoutLog from '../models/WorkoutLog.js';

/**
 * Ghi DB theo lô: gom ChatMessage/WorkoutLog vào bộ đệm rồi insertMany mỗi 3 giây
 * (hoặc khi đủ 200 bản ghi) thay vì ghi từng bản – giảm tải MongoDB khi đông người.
 * Document được tạo sẵn _id ở RAM nên có thể trả về client ngay.
 */
const FLUSH_MS = 3000;
const MAX_BATCH = 200;

const buffers = new Map([
  [ChatMessage, []],
  [WorkoutLog, []],
]);
let timer = null;
export const stats = { flushed: 0, batches: 0, lastFlushMs: 0 };

export function queue(Model, data) {
  const doc = new Model(data);
  const err = doc.validateSync();
  if (err) throw err;
  const buf = buffers.get(Model);
  buf.push(doc);
  if (buf.length >= MAX_BATCH) flushModel(Model);
  return doc;
}

async function flushModel(Model) {
  const buf = buffers.get(Model);
  if (!buf.length) return;
  const batch = buf.splice(0, buf.length);
  const t = Date.now();
  try {
    await Model.insertMany(batch, { ordered: false });
    stats.flushed += batch.length;
    stats.batches++;
    stats.lastFlushMs = Date.now() - t;
  } catch (e) {
    console.error(`[writeBuffer] Lỗi ghi ${Model.modelName}:`, e.message);
  }
}

export async function flushAll() {
  await Promise.all([...buffers.keys()].map(flushModel));
}

// Các bản ghi chưa xuống DB (để API lịch sử vẫn thấy tin nhắn vừa gửi)
export function pending(Model, filter) {
  return buffers.get(Model).filter(filter);
}

export function startWriteBuffer() {
  if (timer) return;
  timer = setInterval(flushAll, FLUSH_MS);
}

export async function stopWriteBuffer() {
  clearInterval(timer);
  timer = null;
  await flushAll();
}

import mongoose from 'mongoose';
import Character from '../models/Character.js';
import { Transaction, Friendship } from '../models/social.js';
import { HttpError, asyncHandler } from '../middleware/errorHandler.js';
import { notifyUser, broadcastAppearance } from '../realtime/notify.js';
import { award } from '../services/achievements.js';
import { ITEMS } from '../../../shared/constants.js';

const me = (req) => new mongoose.Types.ObjectId(String(req.userId));

// Thêm vật phẩm vào túi đồ bằng thao tác nguyên tử (không ghi đè dữ liệu song song)
async function addItemAtomic(userId, item, qty) {
  const r = await Character.updateOne({ userId, 'inventory.item': item }, { $inc: { 'inventory.$.qty': qty } });
  if (!r.matchedCount) await Character.updateOne({ userId }, { $push: { inventory: { item, qty } } });
}

async function takeItemAtomic(userId, item, qty) {
  const r = await Character.updateOne(
    { userId, inventory: { $elemMatch: { item, qty: { $gte: qty } } } },
    { $inc: { 'inventory.$.qty': -qty } }
  );
  return r.modifiedCount === 1;
}

async function takeCoinsAtomic(userId, coins) {
  const r = await Character.updateOne({ userId, coins: { $gte: coins } }, { $inc: { coins: -coins } });
  return r.modifiedCount === 1;
}

// Đưa hết phụ kiện đang đeo cho người khác thì phải tháo ra
async function unequipIfGone(userId, item) {
  if (!item || ITEMS[item]?.type !== 'accessory') return;
  const c = await Character.findOne({ userId });
  if (c?.accessory === item && !c.hasItem(item)) {
    c.accessory = null;
    await c.save();
    broadcastAppearance(userId, c.appearance());
  }
}

const charOf = async (userId) => (await Character.findOne({ userId })).toPublic();

// ===== Cửa hàng =====
export const getShop = asyncHandler(async (_req, res) => {
  res.json({ items: Object.entries(ITEMS).map(([key, v]) => ({ key, ...v })) });
});

export const buyItem = asyncHandler(async (req, res) => {
  const { item } = req.body;
  const qty = Math.max(1, Math.min(10, Math.floor(Number(req.body.qty) || 1)));
  const def = ITEMS[item];
  if (!def) throw new HttpError(400, 'Vật phẩm không tồn tại');
  const uid = me(req);
  if (def.type === 'accessory') {
    const c = await Character.findOne({ userId: uid }).select('inventory').lean();
    if (c.inventory.some((i) => i.item === item && i.qty > 0)) throw new HttpError(409, 'Bạn đã sở hữu phụ kiện này');
  }
  const cost = def.price * (def.type === 'accessory' ? 1 : qty);
  if (!(await takeCoinsAtomic(uid, cost))) throw new HttpError(400, 'Không đủ xu');
  await addItemAtomic(uid, item, def.type === 'accessory' ? 1 : qty);
  res.json({ ok: true, character: await charOf(uid) });
});

// Uống đồ uống -> nhận buff (cùng loại thì làm mới thời gian)
export const useItem = asyncHandler(async (req, res) => {
  const def = ITEMS[req.body.item];
  if (!def || def.type !== 'drink') throw new HttpError(400, 'Vật phẩm không dùng được');
  const uid = me(req);
  if (!(await takeItemAtomic(uid, req.body.item, 1))) throw new HttpError(400, 'Bạn không có vật phẩm này');
  const until = new Date(Date.now() + def.buff.sec * 1000);
  await Character.updateOne({ userId: uid }, { $pull: { buffs: { kind: def.buff.kind } } });
  await Character.updateOne({ userId: uid }, { $push: { buffs: { kind: def.buff.kind, mult: def.buff.mult, until } } });
  res.json({ ok: true, buff: { ...def.buff, until }, character: await charOf(uid) });
});

export const equipAccessory = asyncHandler(async (req, res) => {
  const item = req.body.item || null;
  const c = await Character.findOne({ userId: me(req) });
  if (item && (ITEMS[item]?.type !== 'accessory' || !c.hasItem(item))) throw new HttpError(400, 'Bạn chưa sở hữu phụ kiện này');
  c.accessory = item;
  await c.save();
  broadcastAppearance(req.userId, c.appearance());
  res.json({ ok: true, character: c.toPublic() });
});

// ===== Quà tặng (2 bên xác nhận) =====
// Người gửi bị trừ ngay (giữ tạm). Người nhận đồng ý -> nhận; từ chối/hết hạn -> hoàn lại.
export const sendGift = asyncHandler(async (req, res) => {
  const uid = me(req);
  const to = String(req.body.to || '');
  if (!mongoose.isValidObjectId(to) || to === String(uid)) throw new HttpError(400, 'Người nhận không hợp lệ');
  const coins = Math.max(0, Math.floor(Number(req.body.coins) || 0));
  const item = req.body.item || null;
  const qty = item ? Math.max(1, Math.min(10, Math.floor(Number(req.body.qty) || 1))) : 0;
  if (!coins && !item) throw new HttpError(400, 'Chọn xu hoặc vật phẩm để tặng');
  if (coins > 10000) throw new HttpError(400, 'Tối đa 10.000 xu / lần');
  if (item && !ITEMS[item]) throw new HttpError(400, 'Vật phẩm không tồn tại');
  const wantCoins = Math.max(0, Math.min(10000, Math.floor(Number(req.body.wantCoins) || 0)));
  const wantItem = req.body.wantItem || null;
  const wantQty = wantItem ? Math.max(1, Math.min(10, Math.floor(Number(req.body.wantQty) || 1))) : 0;
  if (wantItem && !ITEMS[wantItem]) throw new HttpError(400, 'Vật phẩm yêu cầu không tồn tại');
  const blocked = await Friendship.exists({ status: 'blocked', $or: [{ requester: uid, recipient: to }, { requester: to, recipient: uid }] });
  if (blocked) throw new HttpError(403, 'Không thể tặng quà cho người này');
  if (!(await Character.exists({ userId: to }))) throw new HttpError(404, 'Không tìm thấy người nhận');
  const pendingCount = await Transaction.countDocuments({ from: uid, status: 'pending' });
  if (pendingCount >= 10) throw new HttpError(429, 'Bạn có quá nhiều món quà đang chờ xác nhận');

  if (coins && !(await takeCoinsAtomic(uid, coins))) throw new HttpError(400, 'Không đủ xu');
  if (item && !(await takeItemAtomic(uid, item, qty))) {
    if (coins) await Character.updateOne({ userId: uid }, { $inc: { coins } }); // hoàn xu
    throw new HttpError(400, 'Không đủ vật phẩm');
  }
  const sender = await Character.findOne({ userId: uid }).select('displayName').lean();
  const tx = await Transaction.create({
    from: uid,
    to,
    fromName: sender.displayName,
    coins,
    item,
    qty,
    message: String(req.body.message || '').slice(0, 100),
    wantCoins,
    wantItem,
    wantQty,
  });
  await unequipIfGone(uid, item);
  notifyUser(to, 'notify', { kind: 'gift', id: String(tx._id), from: { userId: String(uid), name: sender.displayName }, coins, item, qty, message: tx.message, wantCoins, wantItem, wantQty });
  if (!wantCoins && !wantItem) await award(uid, 'generous');
  res.status(201).json({ ok: true, character: await charOf(uid) });
});

export const pendingGifts = asyncHandler(async (req, res) => {
  const docs = await Transaction.find({ to: me(req), status: 'pending' }).sort({ createdAt: -1 }).lean();
  res.json({ gifts: docs.map((d) => ({ id: String(d._id), from: d.fromName, coins: d.coins, item: d.item, qty: d.qty, message: d.message, wantCoins: d.wantCoins || 0, wantItem: d.wantItem || null, wantQty: d.wantQty || 0, at: d.createdAt })) });
});

export const respondGift = (accept) =>
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'ID không hợp lệ');
    // Đổi trạng thái nguyên tử: chỉ 1 request thắng (chống nhận 2 lần)
    const tx = await Transaction.findOneAndUpdate(
      { _id: req.params.id, to: me(req), status: 'pending' },
      { status: accept ? 'accepted' : 'declined' },
      { new: true }
    );
    if (!tx) throw new HttpError(404, 'Quà không còn hiệu lực');
    // Trao đổi: trừ phần người nhận phải đưa trước; thiếu thì trả trạng thái về chờ, không ai mất gì
    if (accept && (tx.wantCoins || tx.wantItem)) {
      const uid = me(req);
      if (tx.wantCoins && !(await takeCoinsAtomic(uid, tx.wantCoins))) {
        await Transaction.updateOne({ _id: tx._id }, { status: 'pending' });
        throw new HttpError(400, 'Bạn không đủ xu để đổi');
      }
      if (tx.wantItem && !(await takeItemAtomic(uid, tx.wantItem, tx.wantQty))) {
        if (tx.wantCoins) await Character.updateOne({ userId: uid }, { $inc: { coins: tx.wantCoins } });
        await Transaction.updateOne({ _id: tx._id }, { status: 'pending' });
        throw new HttpError(400, 'Bạn không đủ vật phẩm để đổi');
      }
      await unequipIfGone(uid, tx.wantItem);
      if (tx.wantCoins) await Character.updateOne({ userId: tx.from }, { $inc: { coins: tx.wantCoins } });
      if (tx.wantItem) await addItemAtomic(tx.from, tx.wantItem, tx.wantQty);
    }
    const receiver = accept ? tx.to : tx.from;
    if (tx.coins) await Character.updateOne({ userId: receiver }, { $inc: { coins: tx.coins } });
    if (tx.item) await addItemAtomic(receiver, tx.item, tx.qty);
    const c = await Character.findOne({ userId: me(req) }).select('displayName').lean();
    notifyUser(tx.from, 'notify', { kind: accept ? 'gift_accepted' : 'gift_declined', from: { name: c.displayName } });
    res.json({ ok: true, character: await charOf(me(req)) });
  });

// Hoàn quà quá hạn 24 giờ
export function startGiftExpiry() {
  setInterval(async () => {
    const old = await Transaction.find({ status: 'pending', createdAt: { $lt: new Date(Date.now() - 86400000) } }).limit(100);
    for (const tx of old) {
      const r = await Transaction.updateOne({ _id: tx._id, status: 'pending' }, { status: 'expired' });
      if (!r.modifiedCount) continue;
      if (tx.coins) await Character.updateOne({ userId: tx.from }, { $inc: { coins: tx.coins } });
      if (tx.item) await addItemAtomic(tx.from, tx.item, tx.qty);
    }
  }, 10 * 60000).unref();
}

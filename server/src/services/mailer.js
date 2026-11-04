import nodemailer from 'nodemailer';
import env from '../config/env.js';

/**
 * Gửi email qua SMTP (cấu hình SMTP_URL hoặc SMTP_HOST/PORT/USER/PASS trong .env).
 * Chưa cấu hình: không gửi thật, in link ra log server để vẫn dùng được khi phát triển.
 */
let transport = null;
function getTransport() {
  if (transport) return transport;
  if (env.smtp.url) transport = nodemailer.createTransport(env.smtp.url);
  else if (env.smtp.host) {
    transport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transport;
}

export const mailConfigured = () => !!(env.smtp.url || env.smtp.host);

// Hộp thư giả cho test tự động và môi trường chưa có SMTP
export const outbox = [];

function layout(title, intro, url, label, note) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#111">
  <h2 style="color:#0891b2">🏋️ Gym Online</h2><h3>${title}</h3><p>${intro}</p>
  <p><a href="${url}" style="display:inline-block;background:#0891b2;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${label}</a></p>
  <p style="font-size:13px;color:#555">Hoặc mở link: ${url}</p><p style="font-size:13px;color:#555">${note}</p></div>`;
}

async function send(to, subject, text, html) {
  outbox.push({ to, subject, text });
  if (outbox.length > 50) outbox.shift();
  const t = getTransport();
  if (!t) {
    if (process.env.NODE_ENV !== 'test') console.log(`[mail] (chưa cấu hình SMTP) Tới ${to} – ${subject}\n${text}`);
    return;
  }
  try {
    await t.sendMail({ from: env.smtp.from, to, subject, text, html });
  } catch (e) {
    // Lỗi gửi mail không được làm hỏng luồng chính; người dùng có thể bấm gửi lại
    console.error('[mail] Không gửi được:', e.message);
  }
}

export function sendVerifyEmail(to, token) {
  const url = `${env.clientUrl}/?verify=${token}`;
  return send(
    to,
    'Xác minh email Gym Online',
    `Mở link sau để xác minh email (hạn 24 giờ): ${url}`,
    layout('Xác minh email', 'Bấm nút bên dưới để xác minh email của bạn.', url, 'Xác minh email', 'Link có hạn 24 giờ. Nếu không phải bạn đăng ký, hãy bỏ qua email này.')
  );
}

export function sendResetEmail(to, token) {
  const url = `${env.clientUrl}/?reset=${token}`;
  return send(
    to,
    'Đặt lại mật khẩu Gym Online',
    `Mở link sau để đặt lại mật khẩu (hạn 1 giờ): ${url}`,
    layout('Đặt lại mật khẩu', 'Có người yêu cầu đặt lại mật khẩu cho tài khoản của bạn.', url, 'Đặt lại mật khẩu', 'Link có hạn 1 giờ. Nếu không phải bạn, hãy bỏ qua email này, mật khẩu vẫn giữ nguyên.')
  );
}

export function sendPasswordChangedEmail(to) {
  return send(
    to,
    'Mật khẩu Gym Online vừa được đổi',
    'Mật khẩu tài khoản của bạn vừa được đổi. Nếu không phải bạn, hãy dùng chức năng Quên mật khẩu ngay.',
    `<p>Mật khẩu tài khoản Gym Online của bạn vừa được đổi. Nếu không phải bạn, hãy dùng chức năng <b>Quên mật khẩu</b> ngay.</p>`
  );
}

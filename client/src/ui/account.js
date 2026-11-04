import { h, openModal, toast, fmtDate } from './dom.js';
import { api, auth } from '../network/api.js';

/**
 * Tài khoản: xác minh email, đổi email, đổi mật khẩu, đăng xuất mọi thiết bị, xóa tài khoản.
 */
const field = (label, input) => h('div', { class: 'field' }, h('label', {}, label), input);
const passInput = (ph, ac = 'current-password') => h('input', { class: 'input', type: 'password', maxlength: 72, placeholder: ph, autocomplete: ac });

export function openAccount(game) {
  const body = h('div', { class: 'account' });
  const m = openModal('👤 Tài khoản', body, { width: 480 });

  const run = async (btn, fn) => {
    btn.disabled = true;
    try {
      await fn();
    } catch (e) {
      toast(e.message, 'error', 4000);
    } finally {
      btn.disabled = false;
    }
  };

  const render = () => {
    const u = game.user;
    body.innerHTML = '';

    // ----- Email -----
    const verify = h('button', { class: 'btn ghost', type: 'button' }, '📨 Gửi lại link xác minh');
    verify.onclick = () =>
      run(verify, async () => {
        const r = await api.resendVerify();
        toast(r.mail === false ? `${r.message} (máy chủ chưa cấu hình gửi mail: link nằm trong log server)` : r.message, 'success', 5000);
      });
    const emailNew = h('input', { class: 'input', type: 'email', maxlength: 100, placeholder: 'Email mới', autocomplete: 'email' });
    const emailPass = passInput('Mật khẩu hiện tại');
    const emailBtn = h('button', { class: 'btn', type: 'submit' }, 'Đổi email');
    const emailForm = h(
      'form',
      {
        onsubmit: (e) => {
          e.preventDefault();
          run(emailBtn, async () => {
            const r = await api.changeEmail(emailPass.value, emailNew.value.trim());
            game.user = r.user;
            toast(r.message, 'success', 5000);
            render();
          });
        },
      },
      field('Đổi email', emailNew),
      emailPass,
      h('div', { style: { marginTop: '8px' } }, emailBtn)
    );
    body.append(
      h(
        'div',
        {},
      h('h4', {}, '📧 Email'),
      h('p', {}, u.email, ' ', h('span', { class: `level-badge ${u.emailVerified ? '' : 'warn'}` }, u.emailVerified ? '✓ Đã xác minh' : 'Chưa xác minh')),
      u.pendingEmail ? h('p', { class: 'muted' }, `Đang chờ xác nhận email mới: ${u.pendingEmail}`) : null,
      !u.emailVerified || u.pendingEmail ? verify : null,
      emailForm
      )
    );

    // ----- Mật khẩu -----
    const cur = passInput('Mật khẩu hiện tại');
    const nw = passInput('Mật khẩu mới (tối thiểu 6 ký tự)', 'new-password');
    const nw2 = passInput('Nhập lại mật khẩu mới', 'new-password');
    const passBtn = h('button', { class: 'btn', type: 'submit' }, 'Đổi mật khẩu');
    body.append(
      h('h4', {}, '🔑 Mật khẩu'),
      h(
        'form',
        {
          onsubmit: (e) => {
            e.preventDefault();
            if (nw.value.length < 6) return toast('Mật khẩu mới tối thiểu 6 ký tự', 'error');
            if (nw.value !== nw2.value) return toast('Mật khẩu xác nhận không khớp', 'error');
            run(passBtn, async () => {
              const r = await api.changePassword(cur.value, nw.value);
              auth.token = r.token;
              // Kết nối realtime đang chạy vẫn hợp lệ; lần kết nối sau dùng token mới
              if (game.net) game.net.token = r.token;
              toast(r.message, 'success', 4000);
              render();
            });
          },
        },
        cur,
        nw,
        nw2,
        h('div', { style: { marginTop: '8px' } }, passBtn)
      )
    );

    // ----- Phiên đăng nhập -----
    const allBtn = h('button', { class: 'btn ghost', type: 'button' }, '🚪 Đăng xuất mọi thiết bị');
    allBtn.onclick = () =>
      confirm('Đăng xuất khỏi mọi thiết bị, kể cả thiết bị này?') &&
      run(allBtn, async () => {
        await api.logoutAll();
        auth.token = null;
        location.reload();
      });
    body.append(h('h4', {}, '🖥️ Phiên đăng nhập'), h('p', { class: 'muted' }, `Tham gia từ ${fmtDate(u.createdAt)}`), allBtn);

    // ----- Xóa tài khoản -----
    const delPass = passInput('Mật khẩu');
    const delName = h('input', { class: 'input', maxlength: 20, placeholder: `Gõ "${u.username}" để xác nhận`, autocomplete: 'off' });
    const delBtn = h('button', { class: 'btn danger', type: 'submit' }, '🗑️ Xóa vĩnh viễn tài khoản');
    body.append(
      h('h4', { style: { color: '#f87171' } }, '⚠️ Xóa tài khoản'),
      h('p', { class: 'muted' }, 'Xóa vĩnh viễn nhân vật, xu, vật phẩm, lịch sử tập, bạn bè và tin nhắn của bạn. Không thể khôi phục.'),
      h(
        'form',
        {
          onsubmit: (e) => {
            e.preventDefault();
            if (delName.value !== u.username) return toast('Tên đăng nhập xác nhận không đúng', 'error');
            if (!confirm('Lần xác nhận cuối: xóa vĩnh viễn tài khoản này?')) return undefined;
            run(delBtn, async () => {
              await api.deleteAccount(delPass.value, delName.value);
              auth.token = null;
              m.close();
              location.reload();
            });
          },
        },
        delPass,
        delName,
        h('div', { style: { marginTop: '8px' } }, delBtn)
      )
    );
  };
  render();
}

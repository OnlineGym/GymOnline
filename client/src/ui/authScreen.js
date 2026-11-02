import { h, uiRoot } from './dom.js';
import { api, auth } from '../network/api.js';
import { audio } from '../core/audio.js';

/**
 * Màn hình đăng nhập / đăng ký. Trả về Promise resolve { user, hasCharacter } khi thành công.
 */
export function showAuthScreen() {
  return new Promise((resolve) => {
    let mode = 'login';
    const err = h('div', { class: 'error-text' });
    const submit = h('button', { class: 'btn', type: 'submit', style: { width: '100%' } }, 'Đăng nhập');

    const fUser = h('input', { class: 'input', name: 'username', autocomplete: 'username', maxlength: 20, placeholder: 'vd: nhathao_99' });
    const fLogin = h('input', { class: 'input', name: 'login', autocomplete: 'username', maxlength: 100, placeholder: 'Tên đăng nhập hoặc email' });
    const fEmail = h('input', { class: 'input', name: 'email', type: 'email', autocomplete: 'email', maxlength: 100, placeholder: 'ban@email.com' });
    const fPass = h('input', { class: 'input', name: 'password', type: 'password', autocomplete: 'current-password', maxlength: 72, placeholder: '••••••' });
    const fPass2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', maxlength: 72, placeholder: 'Nhập lại mật khẩu' });

    const rowLogin = h('div', { class: 'field' }, h('label', {}, 'Tên đăng nhập / Email'), fLogin);
    const rowUser = h('div', { class: 'field' }, h('label', {}, 'Tên đăng nhập (3-20 ký tự, không dấu, không dấu cách)'), fUser);
    const rowEmail = h('div', { class: 'field' }, h('label', {}, 'Email'), fEmail);
    const rowPass = h('div', { class: 'field' }, h('label', {}, 'Mật khẩu (tối thiểu 6 ký tự)'), fPass);
    const rowPass2 = h('div', { class: 'field' }, h('label', {}, 'Xác nhận mật khẩu'), fPass2);

    const tabLogin = h('button', { type: 'button', class: 'active' }, 'Đăng nhập');
    const tabReg = h('button', { type: 'button' }, 'Đăng ký');

    const setMode = (m) => {
      mode = m;
      tabLogin.classList.toggle('active', m === 'login');
      tabReg.classList.toggle('active', m === 'register');
      rowLogin.classList.toggle('hidden', m !== 'login');
      rowUser.classList.toggle('hidden', m !== 'register');
      rowEmail.classList.toggle('hidden', m !== 'register');
      rowPass2.classList.toggle('hidden', m !== 'register');
      fPass.autocomplete = m === 'login' ? 'current-password' : 'new-password';
      submit.textContent = m === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
      err.textContent = '';
    };
    tabLogin.onclick = () => setMode('login');
    tabReg.onclick = () => setMode('register');

    const form = h(
      'form',
      { class: 'auth-card panel', novalidate: true },
      h('div', { class: 'logo' }, 'GYM', h('span', {}, 'ONLINE')),
      h('div', { class: 'tagline' }, 'Phòng gym 3D – tập luyện cùng bạn bè 💪'),
      h('div', { class: 'tabs' }, tabLogin, tabReg),
      rowLogin,
      rowUser,
      rowEmail,
      rowPass,
      rowPass2,
      err,
      submit
    );

    form.onsubmit = async (e) => {
      e.preventDefault();
      audio.unlock();
      err.textContent = '';
      // Validate phía client trước khi gửi
      if (mode === 'register') {
        const uname = fUser.value.trim();
        if (/\s/.test(uname)) return (err.textContent = 'Tên đăng nhập không được có dấu cách');
        if (/[^\x00-\x7F]/.test(uname)) return (err.textContent = 'Tên đăng nhập không được có dấu (vd: nhathao thay vì nhật hào)');
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(uname)) return (err.textContent = 'Tên đăng nhập 3-20 ký tự, chỉ gồm chữ không dấu, số, dấu _');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fEmail.value.trim())) return (err.textContent = 'Email không hợp lệ');
        if (fPass.value.length < 6) return (err.textContent = 'Mật khẩu tối thiểu 6 ký tự');
        if (fPass.value !== fPass2.value) return (err.textContent = 'Mật khẩu xác nhận không khớp');
      } else if (!fLogin.value.trim() || !fPass.value) {
        return (err.textContent = 'Vui lòng nhập đầy đủ thông tin');
      }
      submit.disabled = true;
      submit.textContent = 'Đang xử lý...';
      try {
        const res =
          mode === 'login'
            ? await api.login(fLogin.value.trim(), fPass.value)
            : await api.register(fUser.value.trim(), fEmail.value.trim(), fPass.value);
        auth.token = res.token;
        screen.remove();
        resolve({ user: res.user, hasCharacter: res.hasCharacter });
      } catch (ex) {
        err.textContent = ex.message;
        audio.sfx('error');
      } finally {
        submit.disabled = false;
        submit.textContent = mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
      }
    };

    const screen = h('div', { class: 'screen' }, form);
    setMode('login');
    uiRoot().append(screen);
    setTimeout(() => fLogin.focus(), 100);
  });
}

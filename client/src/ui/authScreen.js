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

    const fTerms = h('input', { type: 'checkbox' });
    const rowTerms = h(
      'label',
      { class: 'terms-row' },
      fTerms,
      h('span', {}, 'Tôi đồng ý với ', h('a', { href: '/terms.html', target: '_blank', rel: 'noopener' }, 'Điều khoản'), ' và ', h('a', { href: '/privacy.html', target: '_blank', rel: 'noopener' }, 'Chính sách riêng tư'))
    );
    const forgotLink = h('button', { type: 'button', class: 'link-btn', onclick: () => showForgot(fLogin.value.trim()) }, 'Quên mật khẩu?');

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
      rowTerms.classList.toggle('hidden', m !== 'register');
      forgotLink.classList.toggle('hidden', m !== 'login');
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
      rowTerms,
      err,
      submit,
      forgotLink,
      h('div', { class: 'auth-foot' }, h('a', { href: '/home.html' }, 'Giới thiệu'), ' • ', h('a', { href: '/terms.html', target: '_blank', rel: 'noopener' }, 'Điều khoản'), ' • ', h('a', { href: '/privacy.html', target: '_blank', rel: 'noopener' }, 'Riêng tư'))
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
        if (!fTerms.checked) return (err.textContent = 'Bạn cần đồng ý với Điều khoản và Chính sách riêng tư');
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

// Quên mật khẩu: nhập email để nhận link
function showForgot(prefill = '') {
  const email = h('input', { class: 'input', type: 'email', maxlength: 100, placeholder: 'ban@email.com', autocomplete: 'email', value: prefill.includes('@') ? prefill : '' });
  const info = h('div', { class: 'tagline' }, 'Nhập email đã đăng ký, chúng tôi sẽ gửi link đặt lại mật khẩu.');
  const err = h('div', { class: 'error-text' });
  const submit = h('button', { class: 'btn', type: 'submit', style: { width: '100%' } }, 'Gửi link');
  const close = () => screen.remove();
  const form = h(
    'form',
    {
      class: 'auth-card panel',
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) return (err.textContent = 'Email không hợp lệ');
        submit.disabled = true;
        try {
          const r = await api.forgot(email.value.trim());
          info.textContent = r.message;
          form.classList.add('sent');
        } catch (ex) {
          err.textContent = ex.message;
        } finally {
          submit.disabled = false;
        }
        return undefined;
      },
    },
    h('div', { class: 'logo' }, 'QUÊN', h('span', {}, 'MẬT KHẨU')),
    info,
    h('div', { class: 'field' }, h('label', {}, 'Email'), email),
    err,
    submit,
    h('button', { type: 'button', class: 'link-btn', onclick: close }, '← Quay lại đăng nhập')
  );
  const screen = h('div', { class: 'screen', style: { zIndex: 60 } }, form);
  uiRoot().append(screen);
  setTimeout(() => email.focus(), 100);
}

// Đặt lại mật khẩu từ link trong email. Resolve khi xong hoặc khi người dùng bỏ qua
export function showResetScreen(token) {
  return new Promise((resolve) => {
    const p1 = h('input', { class: 'input', type: 'password', maxlength: 72, placeholder: 'Mật khẩu mới (tối thiểu 6 ký tự)', autocomplete: 'new-password' });
    const p2 = h('input', { class: 'input', type: 'password', maxlength: 72, placeholder: 'Nhập lại mật khẩu mới', autocomplete: 'new-password' });
    const err = h('div', { class: 'error-text' });
    const submit = h('button', { class: 'btn', type: 'submit', style: { width: '100%' } }, 'Đặt lại mật khẩu');
    const done = (msg) => {
      screen.remove();
      resolve(msg);
    };
    const form = h(
      'form',
      {
        class: 'auth-card panel',
        novalidate: true,
        onsubmit: async (e) => {
          e.preventDefault();
          err.textContent = '';
          if (p1.value.length < 6) return (err.textContent = 'Mật khẩu tối thiểu 6 ký tự');
          if (p1.value !== p2.value) return (err.textContent = 'Mật khẩu xác nhận không khớp');
          submit.disabled = true;
          try {
            const r = await api.resetPassword(token, p1.value);
            auth.token = null;
            done(r.message);
          } catch (ex) {
            err.textContent = ex.message;
            submit.disabled = false;
          }
          return undefined;
        },
      },
      h('div', { class: 'logo' }, 'ĐẶT LẠI', h('span', {}, 'MẬT KHẨU')),
      h('div', { class: 'field' }, h('label', {}, 'Mật khẩu mới'), p1),
      h('div', { class: 'field' }, h('label', {}, 'Xác nhận mật khẩu'), p2),
      err,
      submit,
      h('button', { type: 'button', class: 'link-btn', onclick: () => done(null) }, '← Về đăng nhập')
    );
    const screen = h('div', { class: 'screen', style: { zIndex: 60 } }, form);
    uiRoot().append(screen);
    setTimeout(() => p1.focus(), 100);
  });
}

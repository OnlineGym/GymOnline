// Tạo phần tử DOM gọn: h('div', { class: 'x', onclick: fn }, 'text', child)
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

// Escape chuỗi khi cần chèn HTML
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const uiRoot = () => document.getElementById('ui');

export function fmtTime(sec) {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtDate(d) {
  const date = new Date(d);
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

// Toast thông báo
let toastBox = null;
export function toast(text, type = 'info', ms = 2600) {
  if (!toastBox) {
    toastBox = h('div', { class: 'toasts' });
    uiRoot().append(toastBox);
  }
  const t = h('div', { class: `toast panel ${type}` }, text);
  toastBox.append(t);
  setTimeout(() => {
    t.style.transition = 'opacity .4s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 400);
  }, ms);
}

// Modal chung
export function openModal(title, body, { onClose, width } = {}) {
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  const modal = h(
    'div',
    { class: 'modal panel', style: width ? { width: `min(${width}px, 100%)` } : undefined },
    h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'close-x', onclick: close, 'aria-label': 'Đóng' }, '✕')),
    h('div', { class: 'modal-body' }, body)
  );
  const backdrop = h('div', { class: 'modal-backdrop', onclick: (e) => e.target === backdrop && close() }, modal);
  uiRoot().append(backdrop);
  document.addEventListener('keydown', onKey);
  return { close, body: modal.querySelector('.modal-body') };
}

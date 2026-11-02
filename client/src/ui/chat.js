import { h, uiRoot } from './dom.js';
import { isMobile } from '../core/device.js';

const CHANNEL_LABEL = { global: 'Channel', nearby: 'Gần', party: 'Party', guild: 'CLB', dm: 'Riêng' };
const MAX_MSGS = 120;

/**
 * Khung chat: tab Thế giới / Gần đây / Riêng (1-1).
 * Bấm vào tên người gửi để chat riêng với họ.
 */
export class ChatUI {
  constructor({ selfUserId, onSend, onOpenDm }) {
    this.selfUserId = selfUserId;
    this.onSend = onSend;
    this.onOpenDm = onOpenDm;
    this.channel = 'global';
    this.messages = { global: [], nearby: [], party: [], guild: [], dm: [] };
    this.dmTarget = null; // { userId, name }
    this.unread = 0;

    this.tabBtns = {};
    const tabs = h(
      'div',
      { class: 'tabs' },
      Object.entries(CHANNEL_LABEL).map(([ch, label]) => {
        const b = h('button', { type: 'button', onclick: () => this.setChannel(ch) }, label);
        this.tabBtns[ch] = b;
        return b;
      })
    );
    this.log = h('div', { class: 'chat-log' });
    this.dmBar = h('div', { class: 'dm-target hidden' });
    this.input = h('input', { class: 'input', maxlength: 200, placeholder: 'Nhấn Enter để chat...', enterkeyhint: 'send' });
    const sendBtn = h('button', { class: 'btn', type: 'submit' }, 'Gửi');
    const form = h('form', { class: 'chat-input' }, this.input, sendBtn);
    form.onsubmit = (e) => {
      e.preventDefault();
      this.submit();
    };
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.input.blur();
    });
    this.el = h('div', { class: 'chat panel interactive' + (isMobile() ? ' collapsed' : '') }, tabs, this.dmBar, this.log, form);
    uiRoot().append(this.el);
    this.setChannel('global');
  }

  get isOpen() {
    return !this.el.classList.contains('collapsed');
  }

  toggle(force) {
    const open = force ?? !this.isOpen;
    this.el.classList.toggle('collapsed', !open);
    if (open) {
      this.unread = 0;
      this.onUnread?.(0);
      this.scrollBottom();
    }
  }

  focus() {
    if (isMobile()) this.toggle(true);
    this.input.focus();
  }

  submit() {
    const text = this.input.value.trim();
    if (!text) {
      this.input.blur();
      return;
    }
    if (this.channel === 'dm' && !this.dmTarget) {
      this.system('Chọn một người trong danh sách online (👥) hoặc bấm vào tên trong chat để nhắn riêng.');
      return;
    }
    this.onSend(this.channel, text, this.dmTarget?.userId);
    this.input.value = '';
  }

  setChannel(ch) {
    this.channel = ch;
    for (const [k, b] of Object.entries(this.tabBtns)) b.classList.toggle('active', k === ch);
    this.dmBar.classList.toggle('hidden', ch !== 'dm');
    this.input.placeholder = ch === 'dm' ? (this.dmTarget ? `Nhắn riêng ${this.dmTarget.name}...` : 'Chọn người để nhắn riêng') : ch === 'nearby' ? 'Chat với người xung quanh (14m)...' : ch === 'party' ? 'Chat với party...' : ch === 'guild' ? 'Chat với câu lạc bộ...' : 'Chat với cả channel...';
    this.render();
  }

  openDm(userId, name) {
    if (userId === this.selfUserId) return;
    this.dmTarget = { userId, name };
    this.dmBar.innerHTML = '';
    this.dmBar.append(
      h('span', {}, `💌 Đang nhắn riêng với ${name}`),
      h('button', { type: 'button', onclick: () => ((this.dmTarget = null), this.dmBar.classList.add('hidden'), this.setChannel('global')) }, '✕')
    );
    this.messages.dm = [];
    this.setChannel('dm');
    this.toggle(true);
    this.onOpenDm?.(userId);
  }

  setHistory(channel, msgs) {
    this.messages[channel] = msgs.slice(-MAX_MSGS);
    if (this.channel === channel) this.render();
  }

  add(msg) {
    if (this.isBlocked?.(msg.userId)) return;
    const ch = msg.channel;
    if (ch === 'dm') {
      const other = msg.from === this.selfUserId ? msg.to : msg.from;
      if (!this.dmTarget || this.dmTarget.userId !== other) {
        // Tin nhắn riêng từ người khác -> tự mở cuộc trò chuyện nếu chưa chat riêng với ai
        if (!this.dmTarget && msg.from !== this.selfUserId) {
          this.dmTarget = { userId: msg.from, name: msg.displayName };
          this.dmBar.innerHTML = '';
          this.dmBar.append(h('span', {}, `💌 Đang nhắn riêng với ${msg.displayName}`));
        } else if (msg.from !== this.selfUserId) {
          this.system(`💌 ${msg.displayName} nhắn riêng: ${msg.content}`);
          return;
        }
      }
    }
    const list = this.messages[ch];
    if (!list) return;
    list.push(msg);
    if (list.length > MAX_MSGS) list.shift();
    if (this.channel === ch) this._append(msg);
    if (!this.isOpen) {
      this.unread++;
      this.onUnread?.(this.unread);
    }
  }

  system(text) {
    this.log.append(h('div', { class: 'msg system' }, text));
    this.scrollBottom();
  }

  render() {
    this.log.innerHTML = '';
    const list = this.messages[this.channel] || [];
    if (!list.length) this.log.append(h('div', { class: 'msg system' }, this.channel === 'dm' ? 'Chưa có tin nhắn riêng.' : 'Chưa có tin nhắn nào. Hãy chào mọi người! 👋'));
    list.forEach((m) => this._append(m, false));
    this.scrollBottom();
  }

  _append(m, scroll = true) {
    const self = m.userId === this.selfUserId;
    const who = h('span', { class: 'who' }, m.displayName);
    if (!self) who.onclick = () => this.openDm(m.userId, m.displayName);
    const time = new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    this.log.append(
      h('div', { class: `msg${self ? ' self' : ''}${m.channel === 'dm' ? ' dm' : ''}`, title: time }, m.channel !== 'global' && m.channel !== 'dm' ? h('span', { class: 'ch' }, CHANNEL_LABEL[m.channel]) : null, who, ': ', m.content)
    );
    if (scroll) this.scrollBottom();
  }

  scrollBottom() {
    this.log.scrollTop = this.log.scrollHeight;
  }
}

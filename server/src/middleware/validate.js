import { HttpError } from './errorHandler.js';

// Bộ validate nhỏ gọn: schema = { field: (value, body) => thôngBáoLỗi | undefined }
export function validateBody(schema) {
  return (req, _res, next) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const errors = [];
    for (const [field, check] of Object.entries(schema)) {
      const msg = check(body[field], body);
      if (msg) errors.push(`${field}: ${msg}`);
    }
    if (errors.length) return next(new HttpError(400, 'Dữ liệu không hợp lệ', errors));
    next();
  };
}

export const rules = {
  string:
    ({ min = 0, max = 1000, pattern, optional = false, label = 'Giá trị' } = {}) =>
    (v) => {
      if (v === undefined || v === null || v === '') return optional ? undefined : `${label} là bắt buộc`;
      if (typeof v !== 'string') return `${label} phải là chuỗi`;
      const s = v.trim();
      if (s.length < min) return `${label} tối thiểu ${min} ký tự`;
      if (s.length > max) return `${label} tối đa ${max} ký tự`;
      if (pattern && !pattern.test(s)) return `${label} không đúng định dạng`;
      return undefined;
    },
  number:
    ({ min = -Infinity, max = Infinity, optional = false, label = 'Giá trị' } = {}) =>
    (v) => {
      if (v === undefined || v === null) return optional ? undefined : `${label} là bắt buộc`;
      if (typeof v !== 'number' || !Number.isFinite(v)) return `${label} phải là số`;
      if (v < min || v > max) return `${label} phải trong khoảng ${min} - ${max}`;
      return undefined;
    },
  oneOf:
    (list, { optional = false, label = 'Giá trị' } = {}) =>
    (v) => {
      if (v === undefined || v === null) return optional ? undefined : `${label} là bắt buộc`;
      if (!list.includes(v)) return `${label} không hợp lệ`;
      return undefined;
    },
};

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

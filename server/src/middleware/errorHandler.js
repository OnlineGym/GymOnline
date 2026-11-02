// Lỗi HTTP có mã trạng thái, ném ra từ controller để errorHandler xử lý
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Bọc controller async để lỗi tự chuyển tới errorHandler
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(req, _res, next) {
  next(new HttpError(404, `Không tìm thấy: ${req.method} ${req.originalUrl}`));
}

// Định dạng lỗi chuẩn: { error: { message, details? } }
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = err.status || 500;
  let message = err.message || 'Lỗi máy chủ';
  let details = err.details;

  if (err.name === 'ValidationError') {
    status = 400;
    message = 'Dữ liệu không hợp lệ';
    details = Object.values(err.errors).map((e) => e.message);
  } else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = field === 'email' ? 'Email đã được sử dụng' : field === 'username' ? 'Tên đăng nhập đã tồn tại' : 'Dữ liệu bị trùng';
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'ID không hợp lệ';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'JSON không hợp lệ';
  }

  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: { message: status >= 500 ? 'Lỗi máy chủ, vui lòng thử lại' : message, details } });
}

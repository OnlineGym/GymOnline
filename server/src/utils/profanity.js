// Bộ lọc từ thô tục cơ bản (tiếng Việt + tiếng Anh). Thay ký tự bằng dấu *
const BAD_WORDS = [
  'đụ', 'địt', 'đéo', 'đ m', 'dm', 'đm', 'dcm', 'đcm', 'vcl', 'vl', 'clm', 'cmm', 'cc', 'lồn', 'buồi', 'cặc',
  'đĩ', 'óc chó', 'ngu như chó', 'mẹ mày', 'con chó', 'súc vật', 'fuck', 'fucking', 'shit', 'bitch', 'dick',
  'pussy', 'asshole', 'cunt', 'bastard', 'motherfucker',
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Dùng ranh giới "không phải chữ cái" thay cho \b để hỗ trợ ký tự có dấu
const patterns = BAD_WORDS.map(
  (w) => new RegExp(`(^|[^\\p{L}\\p{N}])(${escape(w).replace(/ /g, '\\s+')})(?=$|[^\\p{L}\\p{N}])`, 'giu')
);

export function filterProfanity(text) {
  let out = text;
  for (const re of patterns) {
    out = out.replace(re, (_m, pre, word) => pre + '*'.repeat([...word].length));
  }
  return out;
}

// Làm sạch nội dung chat: bỏ ký tự điều khiển, gộp khoảng trắng, giới hạn độ dài
export function sanitizeMessage(text, max = 200) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

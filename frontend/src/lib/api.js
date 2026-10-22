import axios from 'axios';

export const api = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api`, withCredentials: true });
const BACKEND = process.env.REACT_APP_BACKEND_URL;
export const mediaUrl = v => !v ? '' : (String(v).startsWith('http') ? v : `${BACKEND}/api/public/media/${v}`);
let csrf = '';
export const setCsrf = value => { csrf = value || ''; };
api.interceptors.request.use(config => {
  if (csrf && !['get', 'head', 'options'].includes(config.method)) config.headers['X-CSRF-Token'] = csrf;
  return config;
});
export const errorText = error => {
  const detail = error.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map(item => item.msg.replace('Value error, ', '')).join(' ');
  return typeof detail === 'string' ? detail : 'We couldn’t connect. Please try again.';
};
export const dateLabel = value => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', weekday: 'short' }).format(new Date(value));
export const timeLabel = value => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
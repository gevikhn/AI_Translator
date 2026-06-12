import { t } from './i18n.js';

const meta = document.querySelector('meta[name="theme-color"]');
const media = window.matchMedia('(prefers-color-scheme: dark)');
const THEME_KEY = 'AI_TR_THEME_MODE'; // 'light' | 'dark' | 'system'

function getStoredTheme(){
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

function setStoredTheme(mode){
  if (!['light','dark','system'].includes(mode)) mode = 'system';
  localStorage.setItem(THEME_KEY, mode);
}

function applyTheme(theme){
  let mode = theme;
  if (mode === 'system' || !mode){
    mode = media.matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = mode;
  if (meta){ meta.setAttribute('content', mode === 'dark' ? '#0d0f11' : '#f6f8fa'); }
}

function updateToggleUI(active){
  const btn = document.getElementById('btnThemeToggle');
  if (!btn) return;
  const iconSun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>';
  const iconMoon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"></path></svg>';
  const iconSystem = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2" ry="2"></rect><path d="M8 21h8"></path></svg>';
  let label = t('theme.system');
  let icon = iconSystem;
  if (active === 'light'){ label = t('theme.light'); icon = iconSun; }
  else if (active === 'dark'){ label = t('theme.dark'); icon = iconMoon; }
  else { label = t('theme.system'); icon = iconSystem; }
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.innerHTML = icon;
  btn.setAttribute('aria-pressed', 'true');
}

function bindToggleUI(){
  const btn = document.getElementById('btnThemeToggle');
  if (!btn) return;
  const modes = ['light','dark','system'];
  const setMode = (m)=>{ setStoredTheme(m); applyTheme(m); updateToggleUI(m); };
  btn.addEventListener('click', ()=>{
    const cur = getStoredTheme();
    const idx = modes.indexOf(cur);
    const next = modes[(idx + 1) % modes.length] || 'system';
    setMode(next);
  });
  updateToggleUI(getStoredTheme());
}

export function initTheme(){
  applyTheme(getStoredTheme());
  const handler = ()=>{ if (getStoredTheme()==='system') applyTheme('system'); };
  if (media.addEventListener){ media.addEventListener('change', handler); }
  else if (media.addListener){ media.addListener(handler); }
  bindToggleUI();
}

initTheme();

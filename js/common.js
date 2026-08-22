/* ============================================================
 * 喃言 · 通用基础库 common.js
 * 包含：存储 / 鉴权 / Toast / 确认弹窗 / 6个原创SVG表情 / 像素小人头像 / 图标 / 日期工具
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 常量 ---------- */
  var K_USERS = 'nanyan_users';
  var K_SESSION = 'nanyan_session';
  var K_SPACES = 'nanyan_spaces';

  // 用户可选预设头像：avatar2 ~ avatar7（共 6 个）；avatar1.png 保留给喃呱
  var AVATAR_PRESETS = ['avatar2.png','avatar3.png','avatar4.png','avatar5.png','avatar6.png','avatar7.png'];
  var NANGUA_AVATAR_FILE = 'avatar1.png';

  /* ---------- 喃呱（默认搭档 / 教学 bot） ---------- */
  var NANGUA_USERNAME = '__nangua__';
  var NANGUA_NICKNAME = '喃呱';
  var NANGUA_JOIN_MSG = '你好呀，我是喃呱，能加入你的空间吗？';
  // 确保 nanyan_users 中存在喃呱这条"伪用户"记录，让 avatarHTML / displayName 能正常渲染
  // 喃呱固定使用 avatar1.png（不再用 SVG 青蛙）；每次加载都强制刷新，保证旧数据升级
  function seedNangua() {
    var users = Store.getUsers();
    var ng = users[NANGUA_USERNAME];
    if (!ng) {
      ng = {
        password: hash('__nangua_no_login__' + Math.random().toString(36).slice(2)),
        nickname: NANGUA_NICKNAME,
        createdAt: 0,
        lastSpaceId: null,
        isNangua: true
      };
    }
    ng.avatar = { image: NANGUA_AVATAR_FILE };
    users[NANGUA_USERNAME] = ng;
    Store.setUsers(users);
  }
  var EMOTIONS = [
    { id: 'uncomfy', name: '难受', color: '#D9E6F2', dark: '#86B0D6' },
    { id: 'unhappy', name: '不开心', color: '#E4DFE8', dark: '#8A7D9A' },
    { id: 'meh', name: '没表情', color: '#EAE2F0', dark: '#A89BC4' },
    { id: 'blessed', name: '幸福', color: '#F5E3EC', dark: '#E6A4C2' },
    { id: 'happy', name: '开心', color: '#F7ECD7', dark: '#D9B86D' },
    { id: 'excited', name: '激动', color: '#F3DADA', dark: '#E28E8E' },
  ];
  // 情绪默认色（无情绪时用的中性泡泡背景）
  var DEFAULT_BUBBLE_COLOR = '#F0E9F4';

  /* ---------- 存储 ---------- */
  function lsGet(k, def) {
    try { var v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); }
    catch (e) { return def; }
  }
  function lsSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  var Store = {
    getUsers: function () { return lsGet(K_USERS, {}); },
    setUsers: function (u) { lsSet(K_USERS, u); },
    getSpaces: function () { return lsGet(K_SPACES, {}); },
    setSpaces: function (s) { lsSet(K_SPACES, s); },
    getSession: function () { return lsGet(K_SESSION, null); },
    setSession: function (u) { lsSet(K_SESSION, u); },
  };
  seedNangua();

  /* ---------- 工具 ---------- */
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function hash(str) {
    // 简易 djb2 哈希（仅用于本地 demo，非安全方案）
    var h = 5381;
    for (var i = 0; i < str.length; i++) { h = ((h << 5) + h) + str.charCodeAt(i); h |= 0; }
    return (h >>> 0).toString(16);
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function fmtTime(ts) {
    var d = new Date(ts);
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    var hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (sameDay) return hm;
    var yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return '昨天 ' + hm;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
  }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function startOfWeek(date) {
    // 周一为一周起点
    var d = new Date(date); d.setHours(0, 0, 0, 0);
    var day = d.getDay(); day = day === 0 ? 6 : day - 1; // 周日=0 -> 6
    d.setDate(d.getDate() - day);
    return d;
  }
  function weekRange(date) {
    var s = startOfWeek(date);
    var e = new Date(s); e.setDate(s.getDate() + 6);
    return { start: s, end: e };
  }
  function addDays(date, n) { var d = new Date(date); d.setDate(d.getDate() + n); return d; }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

  /* ============================================================
   * 原创表情 SVG（圆形脸蛋统一风格，无任何系统emoji）
   * ============================================================ */
  function emoSvg(id) {
    var F = '<circle cx="50" cy="50" r="38" fill="#F7F0F4" stroke="#C9BFDF" stroke-width="2.5"/>';
    var S = 'stroke="#6B5B8A" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"';
    switch (id) {
      case 'uncomfy': // 难受：螺旋眼 + 波浪嘴 + 汗珠
        return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' + F +
          '<path d="M37,41 C42,41 42,50 37,50 C33,50 33,44 37,44 C40,44 40,47 37,47" ' + S + '/>' +
          '<path d="M63,41 C58,41 58,50 63,50 C67,50 67,44 63,44 C60,44 60,47 63,47" ' + S + '/>' +
          '<path d="M37,61 q2.6,-3.6 5.2,0 t5.2,0 t5.2,0" ' + S + '/>' +
          '<path d="M73,30 C76.5,35 76.5,41 73,41 C69.5,41 69.5,35 73,30 Z" fill="#A8C8E0" stroke="#86B0D6" stroke-width="1.2"/>' +
          '</svg>';
      case 'unhappy': // 不开心：垂眼 + 皱眉 + 下弯嘴
        return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' + F +
          '<ellipse cx="38" cy="44" rx="5" ry="2.6" fill="#6B5B8A" transform="rotate(-16 38 44)"/>' +
          '<ellipse cx="62" cy="44" rx="5" ry="2.6" fill="#6B5B8A" transform="rotate(16 62 44)"/>' +
          '<path d="M33,37 L43,39.5" ' + S + '/>' +
          '<path d="M67,37 L57,39.5" ' + S + '/>' +
          '<path d="M40,63 Q50,56 60,63" ' + S + '/>' +
          '</svg>';
      case 'meh': // 没表情：圆点眼 + 平嘴
        return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' + F +
          '<circle cx="38" cy="44" r="3.2" fill="#6B5B8A"/>' +
          '<circle cx="62" cy="44" r="3.2" fill="#6B5B8A"/>' +
          '<path d="M40,61 L60,61" ' + S + '/>' +
          '</svg>';
      case 'blessed': // 幸福：弯月笑眼 + 腮红 + 微笑
        return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' + F +
          '<path d="M32,45 Q38,39 44,45" ' + S + '/>' +
          '<path d="M56,45 Q62,39 68,45" ' + S + '/>' +
          '<ellipse cx="34" cy="55" rx="4" ry="2.6" fill="#E6B8C4" opacity="0.75"/>' +
          '<ellipse cx="66" cy="55" rx="4" ry="2.6" fill="#E6B8C4" opacity="0.75"/>' +
          '<path d="M42,60 Q50,64 58,60" ' + S + '/>' +
          '</svg>';
      case 'happy': // 开心：圆点眼 + 大笑嘴
        return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' + F +
          '<circle cx="38" cy="43" r="3.4" fill="#6B5B8A"/>' +
          '<circle cx="62" cy="43" r="3.4" fill="#6B5B8A"/>' +
          '<path d="M39,57 Q50,70 61,57 Q50,63 39,57 Z" fill="#6B5B8A" stroke="#6B5B8A" stroke-width="1.5" stroke-linejoin="round"/>' +
          '</svg>';
      case 'excited': // 激动：星星眼 + 张嘴 + 激动线
        return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' + F +
          '<path d="M38,38.5 L39.29,42.22 L43.23,42.3 L40.09,44.68 L41.23,48.45 L38,46.2 L34.77,48.45 L35.91,44.68 L32.77,42.3 L36.71,42.22 Z" fill="#E8B850" stroke="#C9952A" stroke-width="1"/>' +
          '<path d="M62,38.5 L63.29,42.22 L67.23,42.3 L64.09,44.68 L65.23,48.45 L62,46.2 L58.77,48.45 L59.91,44.68 L56.77,42.3 L60.71,42.22 Z" fill="#E8B850" stroke="#C9952A" stroke-width="1"/>' +
          '<path d="M43,58 Q50,67 57,58 Q50,62 43,58 Z" fill="#6B5B8A" stroke="#6B5B8A" stroke-width="1.5" stroke-linejoin="round"/>' +
          '<path d="M20,38 l4,-4 M80,38 l-4,-4 M20,62 l4,4 M80,62 l-4,4" ' + S + '/>' +
          '</svg>';
    }
    return '';
  }
  function emoName(id) {
    for (var i = 0; i < EMOTIONS.length; i++) if (EMOTIONS[i].id === id) return EMOTIONS[i].name;
    return '';
  }

  /* ============================================================
   * 7 预设图片头像系统
   * 存储格式：{ image: "avatar3.png" }
   * ============================================================ */
  function avatarSvg(avatarData) {
    // avatarData 支持 { custom: "data:image/png;base64,..." }（优先）/ { image: "avatar3.png" } / 旧 {skin,hair,clothes}
    var customSrc = '';
    var fileName = '';
    if (avatarData && avatarData.custom && typeof avatarData.custom === 'string' && avatarData.custom.indexOf('data:image') === 0) {
      customSrc = avatarData.custom;
    }
    if (!customSrc) {
      if (avatarData && avatarData.image && typeof avatarData.image === 'string') {
        fileName = avatarData.image;
      } else if (avatarData && (avatarData.skin || avatarData.hair || avatarData.clothes)) {
        // 旧像素头像数据：按 skin/hair/clothes hash 固定映射到某个预设，避免丢失
        var seed = (avatarData.skin || '') + (avatarData.hair || '') + (avatarData.clothes || '');
        var idx = 0;
        for (var i = 0; i < seed.length; i++) { idx = (idx * 31 + seed.charCodeAt(i)) % AVATAR_PRESETS.length; }
        fileName = AVATAR_PRESETS[idx];
      }
    }
    var src;
    if (customSrc) src = customSrc;
    else {
      if (!fileName) fileName = AVATAR_PRESETS[0];
      src = 'images/avatars/' + fileName;
    }
    // 返回一张 img，onerror 时降级为灰色首字母占位
    return '<img src="' + src + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit;" onerror="this.style.display=\'none\';var fb=this.parentNode&&this.parentNode.querySelector(\'.avatar-fallback\');if(fb){fb.style.display=\'flex\';}" />' +
           '<div class="avatar-fallback" style="display:none;width:100%;height:100%;border-radius:50%;background:#CFC7DD;color:#6B5B8A;align-items:center;justify-content:center;font-weight:700;font-size:12px;position:absolute;top:0;left:0;">·</div>';
  }
  function randomAvatar() {
    return { image: AVATAR_PRESETS[Math.floor(Math.random() * AVATAR_PRESETS.length)] };
  }
  function defaultAvatar() { return randomAvatar(); }
  function emotionColor(emoId) {
    for (var i = 0; i < EMOTIONS.length; i++) if (EMOTIONS[i].id === emoId) return EMOTIONS[i].color;
    return DEFAULT_BUBBLE_COLOR;
  }
  function AVATAR_LIST() { return AVATAR_PRESETS.slice(); }

  /* ============================================================
   * 通用图标（线性 SVG，currentColor）
   * ============================================================ */
  var ICONS = {
    back: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 5 8 12 15 19"/></svg>',
    chevronLeft: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 5 8 12 15 19"/></svg>',
    chevronRight: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 5 16 12 9 19"/></svg>',
    chevronLeftSm: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 5 8 12 15 19"/></svg>',
    chevronRightSm: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 5 16 12 9 19"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12 20 4l-6 16-3-7z"/><path d="M11 13l9-9"/></svg>',
    paperPlane: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12 20 4l-6 16-3-7z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v3M16 3v3"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12.5 10 17.5 19 7"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#D4888E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><line x1="12" y1="10" x2="12" y2="14"/><circle cx="12" cy="17" r="0.6" fill="#D4888E" stroke="none"/></svg>',
    image: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M3.5 16l4.5-4 4 3 3-2 5.5 4"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 5l5 5L9 20l-5 1 1-5L14 5z"/></svg>',
    key: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3.5"/><path d="M10.5 10.5 20 20M17 17l2-2M14 14l2-2"/></svg>',
    logout: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 17l-5-5 5-5M5 12h11"/></svg>',
    users: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M17 9.5a3 3 0 0 0-2-5.6M16 19a5.5 5.5 0 0 0-3-5"/></svg>',
    bell: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17h12l-1.5-2V11a4.5 4.5 0 0 0-9 0v4L6 17z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
    chat: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z"/></svg>',
    camera: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/></svg>',
    bubble: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="5"/><circle cx="16" cy="15" r="4"/></svg>',
    doc: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13a0 0 0 0 1 0 0H7a0 0 0 0 1 0 0V3z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
    download: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10M8 10l4 4 4-4M5 19h14"/></svg>',
    heart: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20S4 14.5 4 9.2A4 4 0 0 1 12 7a4 4 0 0 1 8 2.2C20 14.5 12 20 12 20z"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/></svg>',
    globe: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    robot: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M8 11h.01M16 11h.01M9 16h6"/></svg>',
    flower_i: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="2.5"/><path d="M12 11.5C11 8 14 6.5 15.5 8C17 9.5 15.5 12.5 12 11.5z"/><path d="M12 11.5C13 8 10 6.5 8.5 8C7 9.5 8.5 12.5 12 11.5z"/><path d="M14.5 14C18 13 19 16 16.5 17.5C14 19 12 17.5 14.5 14z"/><path d="M9.5 14C6 13 5 16 7.5 17.5C10 19 12 17.5 9.5 14z"/><path d="M12 16.5V21"/></svg>',
    chat_i: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H10l-5 4V7a1 1 0 0 1 1-1z"/></svg>',
    card_i: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="12" rx="2"/><path d="M7 9h10M7 12h5"/></svg>',
  };
  function icon(name) { return ICONS[name] || ''; }

  /* ============================================================
   * Toast
   * ============================================================ */
  function toast(msg, type) {
    var wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    var t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .3s, transform .3s';
      t.style.opacity = '0'; t.style.transform = 'translateY(-6px)';
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, 1800);
  }
  function toastOk(m) { toast(m, 'ok'); }
  function toastErr(m) { toast(m, 'err'); }

  /* ============================================================
   * 确认弹窗
   * ============================================================ */
  function confirm(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var mask = document.createElement('div');
      mask.className = 'mask';
      mask.style.alignItems = 'center';
      mask.innerHTML =
        '<div class="confirm-card">' +
        '<div class="ci-icon">' + (opts.danger ? icon('alert') : icon('sparkle')) + '</div>' +
        '<h3>' + escapeHtml(opts.title || '确认操作') + '</h3>' +
        '<p>' + (opts.html ? opts.html : escapeHtml(opts.message || '')) + '</p>' +
        (opts.input ? '<input id="cfInput" class="input" placeholder="' + escapeHtml(opts.inputPlaceholder || '') + '" autocomplete="off" style="margin-bottom:16px"/>' : '') +
        '<div class="row">' +
        '<button class="btn btn-ghost" id="cfCancel">' + escapeHtml(opts.cancelText || '取消') + '</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : '') + '" id="cfOk">' + escapeHtml(opts.okText || '确定') + '</button>' +
        '</div></div>';
      document.body.appendChild(mask);
      var inp = mask.querySelector('#cfInput');
      if (inp) setTimeout(function () { inp.focus(); }, 60);
      function close(val) { mask.style.opacity = '0'; setTimeout(function () { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 200); resolve(val); }
      mask.querySelector('#cfCancel').onclick = function () { close(null); };
      mask.querySelector('#cfOk').onclick = function () {
        if (opts.input) {
          var v = inp.value;
          if (opts.validate && opts.validate(v) !== true) { toastErr(opts.validate(v)); return; }
          close(v);
        } else close(true);
      };
      if (opts.input) {
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') mask.querySelector('#cfOk').click(); });
      }
    });
  }
  function alertBox(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var mask = document.createElement('div'); mask.className = 'mask'; mask.style.alignItems = 'center';
      mask.innerHTML = '<div class="confirm-card"><div class="ci-icon">' + icon('sparkle') + '</div><h3>' + escapeHtml(opts.title || '提示') + '</h3><p>' + escapeHtml(opts.message || '') + '</p><div class="row"><button class="btn" id="afOk">' + escapeHtml(opts.okText || '知道了') + '</button></div></div>';
      document.body.appendChild(mask);
      mask.querySelector('#afOk').onclick = function () { mask.style.opacity = '0'; setTimeout(function () { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 200); resolve(true); };
    });
  }

  /* ============================================================
   * 底部弹层 sheet
   * ============================================================ */
  function openSheet(opts) {
    opts = opts || {};
    var mask = document.createElement('div'); mask.className = 'mask';
    var sheet = document.createElement('div'); sheet.className = 'sheet';
    sheet.innerHTML =
      '<div class="sheet-head"><h3>' + escapeHtml(opts.title || '') + '</h3><div class="sheet-close" data-close>' + icon('close') + '</div></div>' +
      '<div class="sheet-body">' + (opts.html || '') + '</div>';
    mask.appendChild(sheet);
    document.body.appendChild(mask);
    mask.addEventListener('click', function (e) {
      // 点击遮罩或关闭按钮（含其内部 SVG 子元素）才关闭，避免误触表单内容
      if (e.target === mask || (e.target.closest && e.target.closest('[data-close]'))) close();
    });
    function close() { mask.style.opacity = '0'; sheet.style.transform = 'translateY(40px)'; setTimeout(function () { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 250); }
    return { mask: mask, sheet: sheet, close: close };
  }

  /* ============================================================
   * 鉴权 API
   * ============================================================ */
  var Auth = {
    currentUser: function () {
      var u = Store.getSession();
      if (!u) return null;
      var users = Store.getUsers();
      return users[u] ? { username: u, nickname: users[u].nickname || u, avatar: users[u].avatar, createdAt: users[u].createdAt, lastSpaceId: users[u].lastSpaceId || null } : null;
    },
    getUser: function (username) {
      var users = Store.getUsers();
      return users[username] ? users[username] : null;
    },
    register: function (username, password) {
      username = (username || '').trim();
      if (!username || !password) return { ok: false, err: '用户名和密码不能为空' };
      if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{2,16}$/.test(username)) return { ok: false, err: '用户名需2-16位中英文/数字/下划线' };
      if (password.length < 4) return { ok: false, err: '密码至少4位' };
      var users = Store.getUsers();
      if (users[username]) return { ok: false, err: '用户名已存在' };
      users[username] = { password: hash(password), avatar: randomAvatar(), createdAt: Date.now(), lastSpaceId: null };
      Store.setUsers(users);
      Store.setSession(username);
      return { ok: true };
    },
    login: function (username, password) {
      username = (username || '').trim();
      var users = Store.getUsers();
      var u = users[username];
      if (!u) return { ok: false, err: '用户不存在' };
      if (u.password !== hash(password)) return { ok: false, err: '密码错误' };
      Store.setSession(username);
      return { ok: true };
    },
    logout: function () { Store.setSession(null); },
    setLastSpace: function (spaceId) {
      var u = Store.getSession(); if (!u) return false;
      var users = Store.getUsers();
      if (!users[u]) return false;
      users[u].lastSpaceId = spaceId;
      Store.setUsers(users);
      return true;
    },
    updateProfile: function (patch) {
      var u = Store.getSession(); if (!u) return false;
      var users = Store.getUsers();
      if (!users[u]) return false;
      for (var k in patch) if (patch.hasOwnProperty(k)) users[u][k] = patch[k];
      Store.setUsers(users);
      return true;
    },
    changePassword: function (oldP, newP) {
      var u = Store.getSession(); if (!u) return { ok: false, err: '未登录' };
      var users = Store.getUsers();
      if (!users[u]) return { ok: false, err: '用户不存在' };
      if (users[u].password !== hash(oldP)) return { ok: false, err: '原密码错误' };
      if (newP.length < 4) return { ok: false, err: '新密码至少4位' };
      users[u].password = hash(newP);
      Store.setUsers(users);
      return { ok: true };
    }
  };

  /* ============================================================
   * 空间 / 数据 API
   * ============================================================ */
  function genInviteCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var c = ''; for (var i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
  }
  function uniqueInviteCode() {
    var spaces = Store.getSpaces();
    for (var i = 0; i < 20; i++) { var c = genInviteCode(); if (!spaces['code_' + c]) return c; }
    return genInviteCode();
  }
  function getSpace(id) { return Store.getSpaces()[id] || null; }
  function saveSpace(space) { var s = Store.getSpaces(); s[space.id] = space; Store.setSpaces(s); }
  function spaceByCode(code) {
    var spaces = Store.getSpaces();
    for (var k in spaces) if (spaces.hasOwnProperty(k) && spaces[k].inviteCode === code) return spaces[k];
    return null;
  }

  var Space = {
    list: function () { return Store.getSpaces(); },
    save: function (sp) { saveSpace(sp); },

    create: function (name, intro) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      name = (name || '').trim(); intro = (intro || '').trim();
      if (name.length < 1 || name.length > 16) return { ok: false, err: '空间名需1-16字' };
      if (intro.length > 60) return { ok: false, err: '简介最多60字' };
      var code = uniqueInviteCode();
      var id = uid('sp');
      var space = {
        id: id, name: name, intro: intro, inviteCode: code,
        creator: user.username, members: [user.username], memberCount: 1,
        bubbles: [], messages: [], invitations: [], calendar: {}, reports: [],
        applications: [], read: {}, createdAt: Date.now(),
        lastEffect: { type: null, time: 0 }
      };
      space.read[user.username] = Date.now();
      saveSpace(space);
      return { ok: true, space: space };
    },

    applyJoin: function (code, message) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      code = (code || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) return { ok: false, err: '邀请码为6位' };
      var space = spaceByCode(code);
      if (!space) return { ok: false, err: '邀请码无效或空间不存在' };
      if (space.creator === user.username) return { ok: false, err: '这是你自己创建的空间' };
      if (space.members.indexOf(user.username) >= 0) return { ok: false, err: '你已在该空间中' };
      if (space.members.length >= 2) {
        if (space.members.indexOf(NANGUA_USERNAME) >= 0) return { ok: false, err: '空间已满员（喃呱已在场，可请创建者在设置中移除喃呱后再邀请你）' };
        return { ok: false, err: '空间已满员（最多2人）' };
      }
      // 已有申请
      for (var i = 0; i < space.applications.length; i++) {
        if (space.applications[i].username === user.username && space.applications[i].status === 'pending')
          return { ok: false, err: '已提交过申请，请等待对方处理' };
      }
      message = (message || '').trim().slice(0, 60);
      space.applications.push({ id: uid('ap'), username: user.username, message: message, status: 'pending', createdAt: Date.now() });
      saveSpace(space);
      return { ok: true };
    },

    listPendingForCreator: function () {
      var user = Auth.currentUser(); if (!user) return [];
      var spaces = Store.getSpaces(); var list = [];
      for (var k in spaces) if (spaces.hasOwnProperty(k)) {
        var sp = spaces[k];
        if (sp.creator !== user.username) continue;
        for (var i = 0; i < sp.applications.length; i++) {
          if (sp.applications[i].status === 'pending') list.push({ space: sp, app: sp.applications[i] });
        }
      }
      list.sort(function (a, b) { return b.app.createdAt - a.app.createdAt; });
      return list;
    },

    approveApplication: function (spaceId, appId, approve) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      if (sp.creator !== user.username) return { ok: false, err: '无权限' };
      var app = null;
      for (var i = 0; i < sp.applications.length; i++) if (sp.applications[i].id === appId) { app = sp.applications[i]; break; }
      if (!app || app.status !== 'pending') return { ok: false, err: '申请已处理' };
      // 喃呱的申请：纯教学用，无论同意/拒绝都不影响其成员身份（喃呱始终在场）
      if (app.username === NANGUA_USERNAME) {
        app.status = approve ? 'approved' : 'rejected';
        if (approve) {
          // 喃呱已是成员，这里只推进新手教学进度到第1步（进入空间）
          if (sp.members.indexOf(NANGUA_USERNAME) < 0) { sp.members.push(NANGUA_USERNAME); sp.memberCount = sp.members.length; }
          sp.onboardStep = 1;
        }
        saveSpace(sp);
        return { ok: true, nangua: true, approved: !!approve };
      }
      if (approve) {
        if (sp.members.length >= 2) return { ok: false, err: '空间已满员' };
        app.status = 'approved';
        if (sp.members.indexOf(app.username) < 0) sp.members.push(app.username);
        sp.memberCount = sp.members.length;
        sp.read[app.username] = Date.now();
      } else {
        app.status = 'rejected';
      }
      saveSpace(sp);
      return { ok: true };
    },

    // 喃呱在被拒绝 2s 后自动重新发起一条 pending 申请（直到用户点同意）
    nanguaResubmit: function (spaceId) {
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      sp.applications = sp.applications || [];
      for (var i = 0; i < sp.applications.length; i++) {
        if (sp.applications[i].username === NANGUA_USERNAME && sp.applications[i].status === 'pending') {
          return { ok: true, exists: true };
        }
      }
      sp.applications.push({
        id: uid('ap'), username: NANGUA_USERNAME, message: NANGUA_JOIN_MSG,
        status: 'pending', createdAt: Date.now() + 1
      });
      saveSpace(sp);
      return { ok: true };
    },

    // 创建者移除喃呱：退出喃呱成员身份 + 清理其互动数据，腾出位置给真人
    removeNangua: function (spaceId) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      if (sp.creator !== user.username) return { ok: false, err: '无权限' };
      if (sp.members.indexOf(NANGUA_USERNAME) < 0) return { ok: false, err: '喃呱不在空间中' };
      sp.members = sp.members.filter(function (m) { return m !== NANGUA_USERNAME; });
      sp.memberCount = sp.members.length;
      sp.applications = (sp.applications || []).filter(function (a) { return a.username !== NANGUA_USERNAME; });
      sp.bubbles = sp.bubbles.filter(function (b) { return b.author !== NANGUA_USERNAME; });
      sp.messages = sp.messages.filter(function (m) { return m.author !== NANGUA_USERNAME && !m.system; });
      sp.invitations = (sp.invitations || []).filter(function (iv) { return iv.fromUsername !== NANGUA_USERNAME; });
      sp.onboardStep = null;
      saveSpace(sp);
      return { ok: true };
    },

    // 我创建的 + 我加入的
    mySpaces: function () {
      var user = Auth.currentUser(); if (!user) return [];
      var spaces = Store.getSpaces(); var list = [];
      for (var k in spaces) if (spaces.hasOwnProperty(k)) {
        var sp = spaces[k];
        if (sp.members.indexOf(user.username) >= 0) list.push(sp);
      }
      list.sort(function (a, b) { return b.createdAt - a.createdAt; });
      return list;
    },

    // 最近访问的空间：优先 lastSpaceId（仍有效），否则按创建时间最新的
    latestSpace: function () {
      var user = Auth.currentUser(); if (!user) return null;
      var list = Space.mySpaces();
      if (!list.length) return null;
      if (user.lastSpaceId) {
        for (var i = 0; i < list.length; i++) if (list[i].id === user.lastSpaceId) return list[i];
      }
      return list[0];
    },

    // 若当前用户没有任何空间，则自动创建一个默认空间（昵称 + "的小窝"）
    ensureDefaultSpace: function () {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      var existing = Space.mySpaces();
      if (existing.length) {
        var target = user.lastSpaceId ? (function () {
          for (var i = 0; i < existing.length; i++) if (existing[i].id === user.lastSpaceId) return existing[i];
          return null;
        })() : null;
        target = target || existing[0];
        return { ok: true, space: target, created: false };
      }
      var name = (user.nickname || user.username) + '的小窝';
      var r = Space.create(name, '欢迎来到喃言');
      if (!r.ok) return r;
      var sp = r.space;
      // 喃呱作为默认搭档直接加入空间（从这一刻起就是正式成员，互动功能可用）
      // 同时生成一条 pending 申请记录（仅用于新手教学展示：教用户"处理加入申请"）
      if (sp.members.indexOf(NANGUA_USERNAME) < 0) sp.members.push(NANGUA_USERNAME);
      sp.memberCount = sp.members.length;
      sp.applications = sp.applications || [];
      sp.applications.push({
        id: uid('ap'), username: NANGUA_USERNAME, message: NANGUA_JOIN_MSG,
        status: 'pending', createdAt: Date.now() + 100
      });
      // 让"待处理申请"红点可见（app.createdAt 略大于 read 时间）
      sp.read = sp.read || {};
      sp.read[user.username] = Date.now();
      // 新手教学进度：0 = 待处理申请（个人主页起点）；用户"同意"喃呱后推进到 1
      sp.onboardStep = 0;
      saveSpace(sp);
      Auth.setLastSpace(sp.id);
      return { ok: true, space: sp, created: true };
    },

    isCreator: function (sp) { var u = Auth.currentUser(); return u && sp && sp.creator === u.username; },

    // 未读数：创建者计入待审申请；普通成员计入泡泡/密语/待处理邀约
    unreadCount: function (sp) {
      var user = Auth.currentUser(); if (!user || !sp) return 0;
      var last = (sp.read && sp.read[user.username]) || 0;
      var n = 0;
      for (var i = 0; i < sp.bubbles.length; i++) if (sp.bubbles[i].author !== user.username && !sp.bubbles[i].isPrivate && sp.bubbles[i].createdAt > last) n++;
      for (var j = 0; j < sp.messages.length; j++) if (sp.messages[j].author !== user.username && !sp.messages[j].system && sp.messages[j].createdAt > last) n++;
      var invs = sp.invitations || [];
      for (var r = 0; r < invs.length; r++) {
        if (invs[r].toUsername === user.username && invs[r].status === 'pending') n++;
      }
      if (sp.creator === user.username) {
        for (var a = 0; a < sp.applications.length; a++) if (sp.applications[a].status === 'pending' && sp.applications[a].createdAt > last) n++;
      }
      return n;
    },

    markRead: function (spaceId) {
      var user = Auth.currentUser(); if (!user) return;
      var sp = getSpace(spaceId); if (!sp) return;
      sp.read = sp.read || {}; sp.read[user.username] = Date.now(); saveSpace(sp);
    },

    /* --- 泡泡 --- */
    addBubble: function (spaceId, data, forceAuthor) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      if (sp.members.indexOf(user.username) < 0) return { ok: false, err: '不在空间中' };
      var text = (data.text || '').trim();
      if (!text && !data.image) return { ok: false, err: '写点什么吧' };
      if (text.length > 200) return { ok: false, err: '泡泡内容最多200字' };
      // forceAuthor：仅限喃呱 bot 等可信调用方使用，必须是空间成员
      var authorName = user.username;
      if (typeof forceAuthor === 'string' && forceAuthor && sp.members.indexOf(forceAuthor) >= 0) {
        authorName = forceAuthor;
      }
      var b = { id: uid('b'), author: authorName, text: text, emotion: data.emotion || null, isPrivate: !!data.isPrivate, image: data.image || null, comments: [], createdAt: Date.now(), updatedAt: Date.now() };
      sp.bubbles.unshift(b); saveSpace(sp);
      return { ok: true, bubble: b };
    },
    addBubbleComment: function (spaceId, bubbleId, text, forceAuthor) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      if (sp.members.indexOf(user.username) < 0) return { ok: false, err: '不在空间中' };
      text = (text || '').trim();
      if (!text) return { ok: false, err: '写点什么吧' };
      if (text.length > 200) return { ok: false, err: '留言最多200字' };
      // forceAuthor：仅限喃呱 bot 等可信调用方使用，必须是空间成员
      var authorName = user.username;
      if (typeof forceAuthor === 'string' && forceAuthor && sp.members.indexOf(forceAuthor) >= 0) {
        authorName = forceAuthor;
      }
      for (var i = 0; i < sp.bubbles.length; i++) {
        if (sp.bubbles[i].id === bubbleId) {
          sp.bubbles[i].comments = sp.bubbles[i].comments || [];
          var c = { id: uid('bc'), author: authorName, text: text, createdAt: Date.now() };
          sp.bubbles[i].comments.push(c);
          sp.bubbles[i].updatedAt = Date.now();
          saveSpace(sp);
          return { ok: true, comment: c };
        }
      }
      return { ok: false, err: '泡泡不存在' };
    },
    updateBubble: function (spaceId, bubbleId, patch) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      for (var i = 0; i < sp.bubbles.length; i++) {
        if (sp.bubbles[i].id === bubbleId) {
          if (sp.bubbles[i].author !== user.username) return { ok: false, err: '只能编辑自己的' };
          if (patch.text !== undefined) { patch.text = patch.text.trim(); if (patch.text.length > 200) return { ok: false, err: '最多200字' }; }
          for (var k in patch) if (patch.hasOwnProperty(k)) sp.bubbles[i][k] = patch[k];
          sp.bubbles[i].updatedAt = Date.now();
          saveSpace(sp); return { ok: true };
        }
      }
      return { ok: false, err: '泡泡不存在' };
    },
    deleteBubble: function (spaceId, bubbleId) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      for (var i = 0; i < sp.bubbles.length; i++) {
        if (sp.bubbles[i].id === bubbleId) {
          if (sp.bubbles[i].author !== user.username) return { ok: false, err: '只能删除自己的' };
          sp.bubbles.splice(i, 1); saveSpace(sp); return { ok: true };
        }
      }
      return { ok: false, err: '泡泡不存在' };
    },

    /* --- 留言 --- */
    addMessage: function (spaceId, text, opts, forceAuthor) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      if (sp.members.indexOf(user.username) < 0) return { ok: false, err: '不在空间中' };
      text = (text || '').trim();
      if (!text) return { ok: false, err: '写点什么吧' };
      if (text.length > 500) return { ok: false, err: '留言最多500字' };
      opts = opts || {};
      // forceAuthor：仅限喃呱 bot 等可信调用方使用，必须是空间成员
      var authorName = user.username;
      if (typeof forceAuthor === 'string' && forceAuthor && sp.members.indexOf(forceAuthor) >= 0) {
        authorName = forceAuthor;
      }
      var m = { id: uid('m'), author: authorName, text: text, createdAt: Date.now() };
      if (opts.burnAfterRead) { m.burnAfterRead = true; m.burnStatus = 'unread'; }
      if (opts.image) { m.image = opts.image; }
      sp.messages.push(m); saveSpace(sp);
      return { ok: true, message: m };
    },

    /* --- 邀约（送花 / 兑现卡 / 聊一聊邀请）--- */
    createInvitation: function (spaceId, type, message) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      if (sp.members.indexOf(user.username) < 0) return { ok: false, err: '不在空间中' };
      if (sp.members.length < 2) return { ok: false, err: '空间尚未满员' };
      if (['flower', 'card', 'chat'].indexOf(type) < 0) return { ok: false, err: '邀约类型无效' };
      sp.invitations = sp.invitations || [];
      // 限制：同类型 pending 未处理时不可重复发送
      for (var i = 0; i < sp.invitations.length; i++) {
        var iv = sp.invitations[i];
        if (iv.type === type && iv.fromUsername === user.username && iv.status === 'pending') {
          return { ok: false, err: '对方还有未处理的邀约' };
        }
      }
      var other = null;
      for (var k = 0; k < sp.members.length; k++) if (sp.members[k] !== user.username) { other = sp.members[k]; break; }
      message = (message || '').trim().slice(0, 60);
      var inv = {
        id: uid('inv'),
        type: type,
        fromUsername: user.username,
        toUsername: other,
        message: message,
        status: 'pending',
        createdAt: Date.now(),
        respondedAt: null
      };
      sp.invitations.unshift(inv);
      // 写 lastEffect 触发发送方特效（发送方自行立即播放；接收方跨标签页通过 storage 比较时间戳触发）
      sp.lastEffect = { type: type, time: Date.now() };
      saveSpace(sp);
      return { ok: true, invitation: inv };
    },
    actInvitation: function (spaceId, invId, action) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      sp.invitations = sp.invitations || [];
      for (var i = 0; i < sp.invitations.length; i++) {
        if (sp.invitations[i].id === invId) {
          var inv = sp.invitations[i];
          if (inv.toUsername !== user.username) return { ok: false, err: '只能处理发给自己的邀约' };
          if (inv.status !== 'pending') return { ok: false, err: '邀约已处理过' };
          if (action !== 'accepted' && action !== 'rejected') return { ok: false, err: '操作无效' };
          inv.status = action;
          inv.respondedAt = Date.now();
          // 聊一聊邀请被接受 → 在密语列表里追加一条系统提示
          if (inv.type === 'chat' && action === 'accepted') {
            sp.messages.push({
              id: uid('ms'),
              author: '__system__',
              system: true,
              text: '已开启深度对话',
              linkInvitationId: inv.id,
              createdAt: Date.now()
            });
          }
          // 接受/拒绝后更新 lastEffect：只有 accepted 需要触发特效（拒绝无特效）
          if (action === 'accepted') {
            sp.lastEffect = { type: inv.type, time: Date.now() };
          }
          saveSpace(sp);
          return { ok: true, invitation: inv };
        }
      }
      return { ok: false, err: '邀约不存在' };
    },
    // 24小时限时：清理非当天的泡泡
    expireBubbles: function (spaceId) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      var todayStr = ymd(new Date());
      var before = sp.bubbles.length;
      var kept = [];
      for (var i = 0; i < sp.bubbles.length; i++) {
        if (ymd(new Date(sp.bubbles[i].createdAt)) === todayStr) kept.push(sp.bubbles[i]);
      }
      sp.bubbles = kept;
      if (sp.bubbles.length !== before) saveSpace(sp);
      return { ok: true, removed: before - sp.bubbles.length };
    },

    /* --- 日历 --- */
    setCalendar: function (spaceId, date, emotion) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      if (sp.members.indexOf(user.username) < 0) return { ok: false, err: '不在空间中' };
      sp.calendar = sp.calendar || {};
      var day = sp.calendar[date] = sp.calendar[date] || {};
      if (day[user.username] === emotion) { delete day[user.username]; if (Object.keys(day).length === 0) delete sp.calendar[date]; }
      else day[user.username] = emotion;
      saveSpace(sp);
      return { ok: true };
    },

    /* --- 心情日记 --- */
    saveDiary: function (spaceId, dateStr, text, isPrivate) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      if (sp.members.indexOf(user.username) < 0) return { ok: false, err: '不在空间中' };
      text = (text || '').trim();
      if (!text) return { ok: false, err: '日记内容不能为空' };
      if (text.length > 100) return { ok: false, err: '日记最多100字' };
      sp.diaries = sp.diaries || {};
      sp.diaries[dateStr] = sp.diaries[dateStr] || [];
      var d = { id: uid('d'), author: user.username, text: text, isPrivate: !!isPrivate, createdAt: Date.now() };
      sp.diaries[dateStr].push(d);
      sp.diaries[dateStr].sort(function (a, b) { return b.createdAt - a.createdAt; });
      saveSpace(sp);
      return { ok: true, diary: d };
    },

    /* --- 周报 --- */
    saveReport: function (spaceId, report) {
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      report.id = report.id || uid('rp');
      report.createdAt = Date.now();
      var idx = -1; for (var i = 0; i < sp.reports.length; i++) if (sp.reports[i].weekStart === report.weekStart) { idx = i; break; }
      if (idx >= 0) sp.reports[idx] = report; else sp.reports.push(report);
      sp.reports.sort(function (a, b) { return b.weekStart - a.weekStart; });
      saveSpace(sp);
      return { ok: true, report: report };
    },
    listReports: function (spaceId) {
      var sp = getSpace(spaceId); return sp ? sp.reports : [];
    },
    getReport: function (spaceId, weekStart) {
      var sp = getSpace(spaceId); if (!sp) return null;
      for (var i = 0; i < sp.reports.length; i++) if (sp.reports[i].weekStart === weekStart) return sp.reports[i];
      return null;
    },
    // 统计某周数据
    statsForWeek: function (spaceId, weekStart) {
      var sp = getSpace(spaceId); if (!sp) return null;
      var ws = startOfWeek(new Date(weekStart));
      var we = addDays(ws, 7); // 不含
      var bubbles = 0, messages = 0, invitations = 0, emoCount = {};
      var bubbleList = sp.bubbles || [];
      var msgList = sp.messages || [];
      for (var i = 0; i < bubbleList.length; i++) {
        var b = bubbleList[i]; if (b.createdAt >= ws.getTime() && b.createdAt < we.getTime()) { bubbles++; if (b.emotion) emoCount[b.emotion] = (emoCount[b.emotion] || 0) + 1; }
      }
      for (var j = 0; j < msgList.length; j++) { var m = msgList[j]; if (m.createdAt >= ws.getTime() && m.createdAt < we.getTime() && !m.system && !m.burnAfterRead) messages++; }
      var invs = sp.invitations || [];
      for (var r = 0; r < invs.length; r++) { if (invs[r].createdAt >= ws.getTime() && invs[r].createdAt < we.getTime()) invitations++; }
      var topEmos = Object.keys(emoCount).map(function (k) { return { id: k, count: emoCount[k] }; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 3);
      return { weekStart: ws.getTime(), weekEnd: we.getTime() - 1, bubbles: bubbles, messages: messages, invitations: invitations, topEmos: topEmos };
    },

    /* --- 退场 --- */
    clearSpace: function (spaceId) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      if (sp.creator !== user.username) return { ok: false, err: '仅创建者可清空' };
      sp.bubbles = []; sp.messages = []; sp.invitations = []; sp.calendar = {}; sp.reports = []; sp.applications = [];
      sp.lastEffect = { type: null, time: 0 }; sp.onboardStep = null;
      sp.read = {}; sp.read[user.username] = Date.now();
      saveSpace(sp);
      return { ok: true };
    },
    leaveSpace: function (spaceId) {
      var user = Auth.currentUser(); if (!user) return { ok: false, err: '未登录' };
      var sp = getSpace(spaceId); if (!sp) return { ok: false, err: '空间不存在' };
      if (sp.creator === user.username) return { ok: false, err: '创建者不能退出，请使用清空空间' };
      if (sp.members.indexOf(user.username) < 0) return { ok: false, err: '不在空间中' };
      // 只清除自己的数据
      sp.bubbles = sp.bubbles.filter(function (b) { return b.author !== user.username; });
      sp.messages = sp.messages.filter(function (m) { return m.author !== user.username && !m.system; });
      sp.invitations = (sp.invitations || []).filter(function (iv) { return iv.fromUsername !== user.username; });
      if (sp.calendar) { Object.keys(sp.calendar).forEach(function (d) { if (sp.calendar[d] && sp.calendar[d][user.username]) delete sp.calendar[d][user.username]; if (sp.calendar[d] && Object.keys(sp.calendar[d]).length === 0) delete sp.calendar[d]; }); }
      sp.members = sp.members.filter(function (u) { return u !== user.username; });
      sp.memberCount = sp.members.length;
      sp.applications = sp.applications.filter(function (a) { return a.username !== user.username; });
      if (sp.read) delete sp.read[user.username];
      saveSpace(sp);
      return { ok: true };
    }
  };

  /* ---------- 鉴权守卫 ---------- */
  function requireAuth() {
    if (!Auth.currentUser()) { location.href = 'index.html'; return false; }
    return true;
  }
  // 已登录用户访问 index.html 时：进入最近空间；若无空间则自动创建默认空间后进入
  function redirectIfAuthed() {
    if (!Auth.currentUser()) return false;
    var r = Space.ensureDefaultSpace();
    if (r.ok && r.space) {
      location.href = 'space.html?id=' + r.space.id;
    } else {
      // 极端兜底：默认空间创建失败时回退到个人主页
      location.href = 'profile.html';
    }
    return true;
  }

  /* ---------- 渲染辅助 ---------- */
  function avatarHTML(user, size) {
    if (!user) return '';
    var u = typeof user === 'string' ? Auth.getUser(user) : user;
    var av = (u && u.avatar) || defaultAvatar();
    var style = size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '';
    return '<span class="avatar"' + style + '>' + avatarSvg(av) + '</span>';
  }
  function emoHTML(id, cls) {
    if (!id) return '';
    return '<span class="emo ' + (cls || '') + '">' + emoSvg(id) + '</span>';
  }
  function displayName(username) {
    var u = Auth.getUser(username);
    if (!u) return username;
    return u.nickname || username;
  }

  /* ============================================================
   * 全屏特效：playEffect(type) — 发送类 flower/card/chat ｜ 统一接受 accept ｜ 统一拒绝 reject
   * 入场 0.4s → 停留 2.0s → 出场 0.4s（总时长 ≈ 2.8s）；图片缺失自动渐变文字降级
   * 遮罩层挂在 .app 容器内（position:absolute），只覆盖手机容器范围
   * ============================================================ */
  var _effectPlaying = false;
  function playEffect(type) {
    if (!type) return Promise.resolve(false);
    if (['flower', 'card', 'chat', 'accept', 'reject'].indexOf(type) < 0) return Promise.resolve(false);
    if (_effectPlaying) return Promise.resolve(false);
    _effectPlaying = true;
    var fallbackMap = {
      flower: { cls: 'fb-flower', text: '鲜花送出' },
      card:   { cls: 'fb-card',   text: '心愿已发送' },
      chat:   { cls: 'fb-chat',   text: '对话邀约已发送' },
      accept: { cls: 'fb-accept', text: '邀约已接受' },
      reject: { cls: 'fb-reject', text: '邀约被婉拒' }
    };
    var fb = fallbackMap[type] || fallbackMap.flower;
    var layer = document.createElement('div');
    layer.className = 'effect-layer';
    var box = document.createElement('div');
    box.className = 'effect-box';
    var imgPath = 'images/effects/' + type + '.png';
    var img = document.createElement('img');
    img.alt = fb.text;
    img.className = 'effect-img effect-type-' + type;
    var loaded = false, failed = false;
    var doneResolve = null;
    var donePromise = new Promise(function (res) { doneResolve = res; });
    function finishRemove() {
      layer.classList.add('leaving');
      setTimeout(function () {
        if (layer.parentNode) layer.parentNode.removeChild(layer);
        _effectPlaying = false;
        if (doneResolve) doneResolve(true);
      }, 400);
    }
    function renderFallback() {
      if (loaded) return;
      loaded = true;
      var fbEl = document.createElement('div');
      fbEl.className = 'effect-fallback ' + fb.cls;
      fbEl.textContent = fb.text;
      box.innerHTML = '';
      box.appendChild(fbEl);
    }
    img.onload = function () {
      if (failed || loaded) return;
      loaded = true;
      box.innerHTML = '';
      box.appendChild(img);
    };
    img.onerror = function () {
      failed = true;
      renderFallback();
    };
    img.src = imgPath;
    // 兜底：300ms 若 img 未加载完仍显示降级
    setTimeout(function () { if (!loaded) renderFallback(); }, 320);
    layer.appendChild(box);
    (document.querySelector('.app') || document.body).appendChild(layer);
    // 总时长：0.4 入场 + 2.7 停留 = 3.1s 后开始出场（再加 0.4s 出场 ≈ 3.5s）
    setTimeout(finishRemove, 3100);
    return donePromise;
  }

  /* ============================================================
   * 新手教学：N.Onboard — 弹窗分步引导（跨 profile / space 两页）
   * 进度存于空间数据 onboardStep 字段（0~9 进行中，10 已完成，null 未开始/已移除）
   * ============================================================ */
  var Onboard = {
    DONE: 10,
    getStep: function (spaceId) {
      var sp = getSpace(spaceId); if (!sp) return -1;
      var s = sp.onboardStep;
      return (typeof s === 'number') ? s : -1;
    },
    setStep: function (spaceId, step) {
      var sp = getSpace(spaceId); if (!sp) return;
      sp.onboardStep = step; saveSpace(sp);
    },
    isActive: function (spaceId) {
      var s = Onboard.getStep(spaceId);
      return s >= 0 && s < 9;
    },
    isDone: function (spaceId) {
      return Onboard.getStep(spaceId) >= 10;
    },
    complete: function (spaceId) { Onboard.setStep(spaceId, 10); },
    // 找到当前用户正在进行新手教学的空间（如有）
    activeSpace: function () {
      var user = Auth.currentUser(); if (!user) return null;
      var list = Space.mySpaces();
      for (var i = 0; i < list.length; i++) {
        var s = list[i].onboardStep;
        if (typeof s === 'number' && s >= 0 && s <= 8) return list[i];
      }
      return null;
    },
    // 弹窗 + 半透明遮罩；opts: { text, buttonText, onNext, onSkip }
    // onNext：点"下一步"后调用（弹窗已关，由调用方决定是否高亮目标）
    // onSkip：点"跳过引导"后调用（默认仅关弹窗）
    showPopup: function (opts) {
      Onboard.clearHl();
      Onboard.hidePopup();
      opts = opts || {};
      var mask = document.createElement('div');
      mask.className = 'onboard-mask';
      mask.innerHTML =
        '<div class="onboard-popup">' +
          '<button class="onboard-skip" type="button">跳过引导</button>' +
          '<div class="onboard-avatar">' + avatarHTML(NANGUA_USERNAME, 64) + '</div>' +
          '<div class="onboard-text">' + escapeHtml(opts.text || '') + '</div>' +
          '<button class="btn onboard-next" type="button">' + escapeHtml(opts.buttonText || '下一步') + '</button>' +
        '</div>';
      (document.querySelector('.app') || document.body).appendChild(mask);
      Onboard._mask = mask;
      mask.querySelector('.onboard-skip').onclick = function () {
        if (typeof opts.onSkip === 'function') opts.onSkip();
        else Onboard.hidePopup();
      };
      mask.querySelector('.onboard-next').onclick = function () {
        Onboard.hidePopup();
        if (typeof opts.onNext === 'function') opts.onNext();
      };
    },
    hidePopup: function () {
      if (Onboard._mask && Onboard._mask.parentNode) Onboard._mask.parentNode.removeChild(Onboard._mask);
      Onboard._mask = null;
    },
    // 给目标元素加呼吸高亮（2px 主色描边 + 呼吸动画）；并滚动到视区
    highlight: function (el) {
      Onboard.clearHl();
      if (!el) return;
      el.classList.add('onboard-hl');
      Onboard._hl = el;
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    },
    clearHl: function () {
      if (Onboard._hl) { Onboard._hl.classList.remove('onboard-hl'); Onboard._hl = null; }
      var all = document.querySelectorAll('.onboard-hl');
      for (var i = 0; i < all.length; i++) all[i].classList.remove('onboard-hl');
    },
    skip: function (spaceId) {
      Onboard.setStep(spaceId, 8);
      Onboard.hidePopup();
      Onboard.clearHl();
      Onboard.hideNotice();
    },
    // ===== 顶部通知条（喃呱发布泡泡 / 邀约接受 / 邀约婉拒 等） =====
    // opts: { avatarUser, message, onClick, onClose, autoMs }
    showNotice: function (opts) {
      Onboard.hideNotice();
      opts = opts || {};
      var app = document.querySelector('.app') || document.body;
      var bar = document.createElement('div');
      bar.className = 'notice-bar';
      bar.innerHTML =
        '<div class="avatar">' + avatarHTML(opts.avatarUser || NANGUA_USERNAME, 32) + '</div>' +
        '<div class="nb-text">' + (opts.message || '') + '</div>' +
        '<button class="nb-close" type="button" aria-label="关闭">×</button>';
      app.appendChild(bar);
      Onboard._notice = bar;
      bar.querySelector('.nb-close').onclick = function (e) {
        e.stopPropagation();
        Onboard.hideNotice();
        if (typeof opts.onClose === 'function') opts.onClose();
      };
      bar.onclick = function () {
        if (typeof opts.onClick === 'function') opts.onClick();
        Onboard.hideNotice();
      };
      if (opts.autoMs && opts.autoMs > 0) {
        Onboard._noticeTimer = setTimeout(function () { Onboard.hideNotice(); }, opts.autoMs);
      }
    },
    hideNotice: function () {
      if (Onboard._noticeTimer) { clearTimeout(Onboard._noticeTimer); Onboard._noticeTimer = null; }
      if (Onboard._notice && Onboard._notice.parentNode) {
        Onboard._notice.parentNode.removeChild(Onboard._notice);
      }
      Onboard._notice = null;
    },
    // ===== 中央通知弹窗（用于邀约接受/婉拒等场景，带【好的】按钮，点完后再播特效）=====
    // opts: { title, message, html, okText, onOk }
    showCenterNotice: function (opts) {
      Onboard.hideCenterNotice();
      opts = opts || {};
      var mask = document.createElement('div');
      mask.className = 'onboard-mask';
      mask.innerHTML =
        '<div class="onboard-popup" style="max-width:320px">' +
          (opts.title ? '<div class="onboard-title">' + escapeHtml(opts.title) + '</div>' : '') +
          '<div class="onboard-text">' + (opts.html || escapeHtml(opts.message || '')) + '</div>' +
          '<button class="btn onboard-next" type="button">' + escapeHtml(opts.okText || '好的') + '</button>' +
        '</div>';
      (document.querySelector('.app') || document.body).appendChild(mask);
      Onboard._centerMask = mask;
      mask.querySelector('.onboard-next').onclick = function () {
        Onboard.hideCenterNotice();
        if (typeof opts.onOk === 'function') opts.onOk();
      };
    },
    hideCenterNotice: function () {
      if (Onboard._centerMask && Onboard._centerMask.parentNode) {
        Onboard._centerMask.parentNode.removeChild(Onboard._centerMask);
      }
      Onboard._centerMask = null;
    }
  };

  /* ---------- 导出 ---------- */
  var N = {
    EMOTIONS: EMOTIONS,
    NANGUA: NANGUA_USERNAME, NANGUA_NICKNAME: NANGUA_NICKNAME,
    emoSvg: emoSvg, emoName: emoName, emoHTML: emoHTML,
    avatarSvg: avatarSvg, defaultAvatar: defaultAvatar, randomAvatar: randomAvatar, avatarPresets: AVATAR_LIST, avatarHTML: avatarHTML,
    emotionColor: emotionColor, defaultBubbleColor: DEFAULT_BUBBLE_COLOR,
    icon: icon,
    toast: toast, toastOk: toastOk, toastErr: toastErr,
    confirm: confirm, alertBox: alertBox, openSheet: openSheet,
    Auth: Auth, Space: Space, Onboard: Onboard,
    requireAuth: requireAuth, redirectIfAuthed: redirectIfAuthed,
    playEffect: playEffect,
    utils: {
      uid: uid, escapeHtml: escapeHtml, hash: hash,
      fmtDate: fmtDate, fmtTime: fmtTime, ymd: ymd,
      startOfWeek: startOfWeek, weekRange: weekRange, addDays: addDays, daysBetween: daysBetween, pad2: pad2
    },
    displayName: displayName
  };
  global.N = N;
})(window);

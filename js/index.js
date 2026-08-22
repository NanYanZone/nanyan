/* 喃言 · 落地页（登录/注册） */
(function () {
  'use strict';
  if (N.redirectIfAuthed()) return;

  /* ---------- Logo：加载失败显示圆形占位 ---------- */
  var logoImg = document.getElementById('logoImg');
  var logoFallback = document.getElementById('logoFallback');
  function showFallback() {
    if (logoImg) logoImg.classList.add('broken');
    if (logoFallback) logoFallback.style.display = 'block';
  }
  if (logoImg) {
    logoImg.onerror = showFallback;
    if (logoImg.complete && logoImg.naturalWidth === 0) showFallback();
  } else if (logoFallback) {
    logoFallback.style.display = 'block';
  }

  var mode = 'login';
  var seg = document.getElementById('seg');
  var segItems = seg.querySelectorAll('.seg-item');
  var submitBtn = document.getElementById('submitBtn');

  function setMode(m) {
    mode = m;
    segItems.forEach(function (it) { it.classList.toggle('active', it.dataset.mode === m); });
    var isReg = m === 'register';
    document.getElementById('pwd2Field').style.display = isReg ? '' : 'none';
    submitBtn.textContent = isReg ? '注 册' : '登 录';
    clearErr();
  }
  segItems.forEach(function (it) { it.addEventListener('click', function () { setMode(it.dataset.mode); }); });

  function setErr(id, msg) {
    var el = document.getElementById(id + 'Hint');
    if (el) { el.textContent = msg; el.className = msg ? 'field-err' : 'muted'; }
  }
  function clearErr() {
    setErr('username', '用于登录的唯一账号');
  }

  // 用户名实时校验
  var username = document.getElementById('username');
  username.addEventListener('input', function () {
    var v = username.value.trim();
    if (!v) { setErr('username', '用于登录的唯一账号'); return; }
    if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{2,16}$/.test(v)) { setErr('username', '2-16位中英文/数字/下划线'); return; }
    setErr('username', '用于登录的唯一账号');
  });

  // 老用户登录后：跳转到最近空间（无空间则自动创建默认空间后进入）
  // 新用户注册后：先跳个人主页（由个人主页弹出喃呱申请处理弹窗，处理完再进空间）
  function enterDefaultSpace(forLogin) {
    var r = N.Space.ensureDefaultSpace();
    if (forLogin) {
      // 老用户登录：直接进空间
      if (r.ok && r.space) {
        location.href = 'space.html?id=' + r.space.id;
      } else {
        location.href = 'profile.html';
      }
    } else {
      // 新用户注册：先到个人主页处理申请
      location.href = 'profile.html';
    }
  }

  document.getElementById('authForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var u = username.value.trim();
    var p = document.getElementById('password').value;
    if (!u || !p) { N.toastErr('请填写用户名和密码'); return; }

    if (mode === 'register') {
      var p2 = document.getElementById('password2').value;
      if (p !== p2) { N.toastErr('两次密码不一致'); return; }
      var res = N.Auth.register(u, p);
      if (!res.ok) { N.toastErr(res.err); return; }
      N.toastOk('注册成功，欢迎来到喃言');
      setTimeout(function () { enterDefaultSpace(false); }, 400);
    } else {
      var r = N.Auth.login(u, p);
      if (!r.ok) { N.toastErr(r.err); return; }
      N.toastOk('欢迎回来');
      setTimeout(function () { enterDefaultSpace(true); }, 400);
    }
  });

  setMode('login');
})();

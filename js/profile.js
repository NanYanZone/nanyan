/* 喃言 · 个人主页 */
(function () {
  'use strict';
  if (!N.requireAuth()) return;

  var u = N.Auth.currentUser();
  var uid = 'input';
  // 渲染图标
  document.getElementById('icoCreate').innerHTML = N.icon('plus');
  document.getElementById('icoJoin').innerHTML = N.icon('key');
  document.getElementById('icoApps').innerHTML = N.icon('bell');
  document.getElementById('icoEdit').innerHTML = N.icon('edit');
  document.getElementById('icoPwd').innerHTML = N.icon('lock');
  document.getElementById('icoLogout').innerHTML = N.icon('logout');

  renderProfile();
  renderSpaceList();
  renderAppsPill();
  // 进入页面即检测是否有进行中的新手教学空间，弹对应步骤的引导弹窗
  setTimeout(startProfileOnboard, 300);

  document.getElementById('btnEditAvatar').innerHTML = N.icon('edit');

  function renderProfile() {
    var user = N.Auth.currentUser();
    document.getElementById('myAvatar').innerHTML = N.avatarSvg(user.avatar);
    document.getElementById('myNick').textContent = user.nickname;
    document.getElementById('myUname').textContent = '@' + user.username;
  }

  function renderSpaceList() {
    var spaces = N.Space.mySpaces();
    var box = document.getElementById('spaceList');
    if (!spaces.length) {
      box.innerHTML = '<div class="empty">' + N.emoHTML('meh', 'emo') +
        '<div class="t">还没有空间</div><div class="sub">新建一个，或用邀请码加入挚友的空间</div></div>';
      return;
    }
    var html = '';
    spaces.forEach(function (sp) {
      var unread = N.Space.unreadCount(sp);
      var avatars = sp.members.map(function (m) { return N.avatarHTML(m, 44); }).join('');
      var creatorTag = sp.creator === u.username ? '<span class="tag">创建者</span>' : '<span class="tag">成员</span>';
      var memberTag = sp.members.length < 2 ? '<span class="tag tag-warn">等待加入</span>' : '';
      html +=
        '<div class="space-card" data-id="' + sp.id + '">' +
        '<div class="avatars">' + avatars + '</div>' +
        '<div class="info">' +
        '<div class="row" style="gap:6px"><span class="name">' + N.utils.escapeHtml(sp.name) + '</span>' + creatorTag + memberTag + '</div>' +
        '<div class="intro">' + N.utils.escapeHtml(sp.intro || '还没有简介') + '</div>' +
        '</div>' +
        (unread ? '<div class="badge-dot">' + (unread > 99 ? '99+' : unread) + '</div>' : '') +
        '</div>';
    });
    box.innerHTML = html;
    box.querySelectorAll('.space-card').forEach(function (card) {
      card.addEventListener('click', function () { location.href = 'space.html?id=' + card.dataset.id; });
    });
  }

  function renderAppsPill() {
    var apps = N.Space.listPendingForCreator();
    var pill = document.getElementById('appsPill');
    if (apps.length) { pill.textContent = apps.length; pill.classList.remove('hidden'); }
    else pill.classList.add('hidden');
  }

  /* ---------- 功能宫格点击 ---------- */
  document.getElementById('fnGrid').addEventListener('click', function (e) {
    var item = e.target.closest('.fn-item'); if (!item) return;
    var act = item.dataset.act;
    if (act === 'create') openCreate();
    else if (act === 'join') openJoin();
    else if (act === 'apps') openApps();
    else if (act === 'edit') openEditAvatar();
    else if (act === 'pwd') openChangePwd();
    else if (act === 'logout') doLogout();
  });
  document.getElementById('btnEditAvatar').addEventListener('click', openEditAvatar);

  /* ---------- 新建空间 ---------- */
  function openCreate() {
    var s = N.openSheet({
      title: '新建空间',
      html:
        '<div class="field"><label>空间名称</label>' +
        '<input class="input" id="spName" placeholder="1-16字" maxlength="16" />' +
        '<div class="field-hint"><span class="muted">给你的双人空间起个名字</span><span class="input-count" id="spNameCnt">0/16</span></div></div>' +
        '<div class="field"><label>简介</label>' +
        '<textarea class="textarea" id="spIntro" placeholder="一句简介（选填）" maxlength="60"></textarea>' +
        '<div class="field-hint"><span class="muted">最多60字</span><span class="input-count" id="spIntroCnt">0/60</span></div></div>' +
        '<button class="btn" id="spCreateBtn">创建并生成邀请码</button>'
    });
    var nameI = s.sheet.querySelector('#spName'), introI = s.sheet.querySelector('#spIntro');
    bindCount(nameI, 'spNameCnt', 16);
    bindCount(introI, 'spIntroCnt', 60);
    s.sheet.querySelector('#spCreateBtn').onclick = function () {
      var res = N.Space.create(nameI.value, introI.value);
      if (!res.ok) { N.toastErr(res.err); return; }
      s.close();
      N.toastOk('空间已创建');
      setTimeout(function () { showInviteCode(res.space); renderSpaceList(); }, 250);
    };
  }

  function showInviteCode(space) {
    var s = N.openSheet({
      title: '邀请码',
      html:
        '<div class="center" style="margin:8px 0 6px">' + N.emoHTML('blessed', 'emo') + '</div>' +
        '<p class="center muted small" style="margin-bottom:14px">把邀请码发给挚友，TA可申请加入</p>' +
        '<div class="card" style="text-align:center;border:2px dashed var(--fog-light)">' +
        '<div style="font-size:30px;letter-spacing:6px;font-weight:700;color:var(--fog-dark)" id="codeTxt">' + space.inviteCode + '</div>' +
        '</div>' +
        '<div class="row" style="margin-top:16px;gap:10px"><button class="btn btn-ghost" id="copyCode">复制邀请码</button>' +
        '<button class="btn" id="goSpace">进入空间</button></div>'
    });
    s.sheet.querySelector('#copyCode').onclick = function () {
      copyText(space.inviteCode, function () { N.toastOk('邀请码已复制'); });
    };
    s.sheet.querySelector('#goSpace').onclick = function () { s.close(); setTimeout(function () { location.href = 'space.html?id=' + space.id; }, 250); };
  }

  /* ---------- 加入空间 ---------- */
  function openJoin() {
    var s = N.openSheet({
      title: '加入空间',
      html:
        '<div class="field"><label>邀请码</label>' +
        '<input class="input" id="joinCode" placeholder="6位邀请码" maxlength="6" style="text-transform:uppercase;letter-spacing:2px;text-align:center" />' +
        '<div class="field-hint"><span class="muted">向空间创建者索取</span></div></div>' +
        '<div class="field"><label>附言</label>' +
        '<textarea class="textarea" id="joinMsg" placeholder="一句话告诉对方是你（选填）" maxlength="60"></textarea>' +
        '<div class="field-hint"><span class="muted">最多60字</span></div></div>' +
        '<button class="btn" id="joinBtn">提交申请</button>'
    });
    s.sheet.querySelector('#joinCode').addEventListener('input', function (e) { e.target.value = e.target.value.toUpperCase(); });
    s.sheet.querySelector('#joinBtn').onclick = function () {
      var res = N.Space.applyJoin(s.sheet.querySelector('#joinCode').value, s.sheet.querySelector('#joinMsg').value);
      if (!res.ok) { N.toastErr(res.err); return; }
      s.close(); N.toastOk('申请已提交，请等待对方处理');
    };
  }

  /* ---------- 待处理申请 ---------- */
  function openApps() {
    var list = N.Space.listPendingForCreator();
    var body;
    if (!list.length) {
      body = '<div class="empty">' + N.emoHTML('meh', 'emo') + '<div class="t">没有待处理的申请</div></div>';
    } else {
      body = list.map(function (it) {
        return '<div class="recon-card" data-sid="' + it.space.id + '" data-aid="' + it.app.id + '">' +
          '<div class="rc-head">' + N.avatarHTML(it.app.username, 32) +
          '<div class="rc-from"><b>' + N.utils.escapeHtml(N.displayName(it.app.username)) + '</b> 想加入「' + N.utils.escapeHtml(it.space.name) + '」</div></div>' +
          (it.app.message ? '<div class="rc-msg">' + N.utils.escapeHtml(it.app.message) + '</div>' : '') +
          '<div class="rc-time">' + N.utils.fmtTime(it.app.createdAt) + '</div>' +
          '<div class="rc-actions"><button class="btn btn-ghost btn-sm" data-reject>婉拒</button>' +
          '<button class="btn btn-sm" data-approve>同意</button></div></div>';
      }).join('');
    }
    var s = N.openSheet({ title: '待处理申请', html: body });
    s.sheet.querySelectorAll('.recon-card').forEach(function (card) {
      var sid = card.dataset.sid, aid = card.dataset.aid;
      card.querySelector('[data-approve]').onclick = function () {
        var r = N.Space.approveApplication(sid, aid, true);
        if (!r.ok) { N.toastErr(r.err); return; }
        N.toastOk('已同意加入');
        N.Onboard.clearHl();
        _obSubStep = null;
        card.parentNode.removeChild(card);
        renderAppsPill(); renderSpaceList();
        if (!s.sheet.querySelector('.recon-card')) s.sheet.querySelector('.sheet-body').innerHTML = '<div class="empty">' + N.emoHTML('blessed', 'emo') + '<div class="t">已全部处理</div></div>';
        // 喃呱：同意后 → 进入新手教学第1步（引导点击空间卡片）
        if (r.nangua) {
          s.close();
          N.Onboard.hidePopup();
          setTimeout(function () {
            renderSpaceList();
            showProfileOnboard(sid, 1);
          }, 250);
        }
      };
      card.querySelector('[data-reject]').onclick = function () {
        var r = N.Space.approveApplication(sid, aid, false);
        if (!r.ok) { N.toastErr(r.err); return; }
        N.toastOk('已婉拒');
        N.Onboard.clearHl();
        _obSubStep = null;
        card.parentNode.removeChild(card);
        renderAppsPill();
        if (!s.sheet.querySelector('.recon-card')) s.sheet.querySelector('.sheet-body').innerHTML = '<div class="empty">' + N.emoHTML('meh', 'emo') + '<div class="t">已全部处理</div></div>';
        // 喃呱：拒绝后仍在空间里，2秒后自动重新发起申请（直到用户同意）
        if (r.nangua) {
          setTimeout(function () {
            N.Space.nanguaResubmit(sid);
            renderAppsPill();
            N.toast('喃呱又发来一条加入申请');
          }, 2000);
        }
      };
    });
    // 新手教学：若处于 step0 且等待用户打开申请，则继续引导"点同意"
    maybeGuideApproveInSheet(s.sheet);
  }

  /* ============================================================
   * 新手教学（个人主页侧：第0步 处理申请 / 第1步 进入空间）
   * Step 0-a: 弹窗"点击待处理申请看看吧" → 下一步 → 高亮待处理申请
   * Step 0-b: 用户点待处理申请展开sheet → 弹窗"点击同意让喃呱加入" → 下一步 → 高亮同意按钮
   * Step 0-c: 用户点同意 → onboardStep 变 1 → 弹"点击空间卡进入"→ 下一步 → 高亮空间卡
   * ============================================================ */
  var _obSubStep = null; // 记录 profile 内部的子步骤（'apps_opened' 等）

  function startProfileOnboard() {
    var sp = N.Onboard.activeSpace();
    if (!sp) return;
    if (sp.onboardStep === 0) {
      // 首次进入：只弹教学引导，不直接弹出申请处理弹窗
      showProfileOnboard(sp.id, 0);
    } else if (sp.onboardStep === 1) {
      // 从别处回来或刚同意完申请：弹引导进入空间
      setTimeout(function () { showProfileOnboard(sp.id, 1); }, 300);
    }
  }

  // 显示个人主页侧某一步引导弹窗
  function showProfileOnboard(spaceId, step) {
    var opts;
    if (step === 0) {
      opts = {
        text: '你有一条新的好友申请哦～\n点击「待处理申请」看看吧',
        buttonText: '下一步',
        onSkip: function () { N.Onboard.skip(spaceId); },
        onNext: function () {
          var appsBtn = document.querySelector('.fn-item[data-act="apps"]');
          N.Onboard.highlight(appsBtn);
          _obSubStep = 'wait_apps_click';
        }
      };
    } else if (step === 1) {
      opts = {
        text: '太好了！现在点击空间卡片，进入你和喃呱的小天地吧',
        buttonText: '下一步',
        onSkip: function () { N.Onboard.skip(spaceId); },
        onNext: function () {
          var card = document.querySelector('#spaceList .space-card');
          N.Onboard.highlight(card);
        }
      };
    } else return;
    N.Onboard.showPopup(opts);
  }

  // 在待处理申请 sheet 打开后，检查是否处于教学中，若是则弹"点击同意"引导
  function maybeGuideApproveInSheet(sheet) {
    var sp = N.Onboard.activeSpace();
    if (!sp || sp.onboardStep !== 0) return;
    if (_obSubStep !== 'wait_apps_click') return;
    N.Onboard.clearHl();
    _obSubStep = 'wait_approve_click';
    // 延迟一点让 sheet 先渲染完
    setTimeout(function () {
      N.Onboard.showPopup({
        text: '点击「同意」，让喃呱加入你的空间吧',
        buttonText: '下一步',
        onSkip: function () { N.Onboard.skip(sp.id); },
        onNext: function () {
          var appBtn = sheet.querySelector('[data-approve]');
          N.Onboard.highlight(appBtn);
        }
      });
    }, 350);
  }

  /* ---------- 编辑形象：7 预设头像 + 自定义上传 ---------- */
  function openEditAvatar() {
    var user = N.Auth.currentUser();
    var av = user.avatar || {};
    var curCustom = (av && av.custom && typeof av.custom === 'string' && av.custom.indexOf('data:image') === 0) ? av.custom : '';
    var curFile = (av && av.image) ? av.image : N.avatarPresets()[0];
    var presets = N.avatarPresets();
    var avsHtml = presets.map(function (f) {
      var sel = (!curCustom && f === curFile) ? 'sel' : '';
      return '<div class="av-opt ' + sel + '" data-file="' + f + '">' +
             '<img src="images/avatars/' + f + '" alt="" />' +
             '</div>';
    }).join('');
    var s = N.openSheet({
      title: '编辑形象',
      html:
        '<div class="center" style="margin:10px 0 18px"><div class="avatar" id="avPrev" style="width:92px;height:92px;margin:0 auto"></div></div>' +
        '<div class="muted small center" style="margin-bottom:8px">选择预设头像或上传自定义图片（1 / ' + presets.length + '）</div>' +
        '<div class="avatar-pick" id="avPick">' + avsHtml + '</div>' +
        // 自定义上传：放在预设下方、随机按钮上方
        '<div class="divider" style="margin:16px 0"></div>' +
        '<div class="row" style="gap:10px">' +
        '<label class="btn btn-outline" style="flex:1;justify-content:center;cursor:pointer">' + N.icon('camera') + ' 上传自定义头像' +
        '<input type="file" id="avUpload" accept="image/*" style="display:none" /></label>' +
        '</div>' +
        '<div class="muted small center" style="margin-top:6px;margin-bottom:16px" id="avUploadHint">' + (curCustom ? '已使用自定义头像 · 选预设会清除自定义' : '单张图片不超过 500KB') + '</div>' +
        '<div class="row" style="gap:10px"><button class="btn btn-ghost" id="avRand">🎲 随机换一个</button><button class="btn" id="avSave">保存形象</button></div>'
    });
    var prev = s.sheet.querySelector('#avPrev');
    var hintEl = s.sheet.querySelector('#avUploadHint');
    function curAvatarData() {
      if (curCustom) return { custom: curCustom };
      return { image: curFile };
    }
    function clearSel() {
      s.sheet.querySelectorAll('.av-opt').forEach(function (x) { x.classList.remove('sel'); });
    }
    function setSelPreset(file) {
      s.sheet.querySelectorAll('.av-opt').forEach(function (x) { x.classList.toggle('sel', x.dataset.file === file); });
    }
    function refresh() { prev.innerHTML = N.avatarSvg(curAvatarData()); }
    refresh();
    // 点击预设：清除 custom，切到预设
    s.sheet.querySelectorAll('.av-opt').forEach(function (o) {
      o.onclick = function () {
        curFile = o.dataset.file;
        curCustom = '';
        setSelPreset(curFile);
        if (hintEl) hintEl.textContent = '单张图片不超过 500KB';
        refresh();
      };
    });
    // 随机换一个：从预设中随机（也会清除 custom）
    s.sheet.querySelector('#avRand').onclick = function () {
      var others = presets.filter(function (f) { return f !== curFile; });
      curFile = others[Math.floor(Math.random() * others.length)];
      curCustom = '';
      setSelPreset(curFile);
      if (hintEl) hintEl.textContent = '单张图片不超过 500KB';
      refresh();
    };
    // 上传自定义头像
    s.sheet.querySelector('#avUpload').onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      // 500KB 限制
      if (f.size > 500 * 1024) {
        N.toastErr('图片过大，请选择500KB以内的图片');
        e.target.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image') !== 0) {
          N.toastErr('图片读取失败'); return;
        }
        curCustom = dataUrl;
        clearSel();
        if (hintEl) hintEl.textContent = '已使用自定义头像 · 选预设会清除自定义';
        refresh();
        N.toast('自定义头像已载入');
      };
      reader.onerror = function () { N.toastErr('图片读取失败'); };
      reader.readAsDataURL(f);
      e.target.value = '';
    };
    // 保存：优先 custom，其次 image
    s.sheet.querySelector('#avSave').onclick = function () {
      N.Auth.updateProfile({ avatar: curAvatarData() });
      renderProfile();
      renderSpaceList();
      s.close(); N.toastOk('形象已更新');
    };
  }

  /* ---------- 修改密码 ---------- */
  function openChangePwd() {
    var s = N.openSheet({
      title: '修改密码',
      html:
        '<div class="field"><label>原密码</label><input class="input" id="oldP" type="password" placeholder="输入当前密码" /></div>' +
        '<div class="field"><label>新密码</label><input class="input" id="newP" type="password" placeholder="至少4位" /></div>' +
        '<div class="field"><label>确认新密码</label><input class="input" id="newP2" type="password" placeholder="再输入一次" /></div>' +
        '<button class="btn" id="pwdSave">保存</button>'
    });
    s.sheet.querySelector('#pwdSave').onclick = function () {
      var oldP = s.sheet.querySelector('#oldP').value, newP = s.sheet.querySelector('#newP').value, newP2 = s.sheet.querySelector('#newP2').value;
      if (newP !== newP2) { N.toastErr('两次新密码不一致'); return; }
      var r = N.Auth.changePassword(oldP, newP);
      if (!r.ok) { N.toastErr(r.err); return; }
      s.close(); N.toastOk('密码已修改，下次登录生效');
    };
  }

  /* ---------- 退出登录 ---------- */
  function doLogout() {
    N.confirm({
      title: '退出登录？', message: '退出后需重新登录才能查看空间',
      okText: '退出', cancelText: '取消'
    }).then(function (ok) {
      if (!ok) return;
      N.Auth.logout();
      location.href = 'index.html';
    });
  }

  /* ---------- 工具 ---------- */
  function bindCount(input, cntId, max) {
    var cnt = function () { document.getElementById(cntId).textContent = input.value.length + '/' + max; };
    input.addEventListener('input', cnt); cnt();
  }
  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} document.body.removeChild(ta);
    }
  }

  /* ============================================================
   * 跨标签页同步：其他标签页修改了 nanyan_ 开头的 localStorage 时，自动重新渲染
   * ============================================================ */
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key.indexOf('nanyan_') !== 0) return;
    // 会话被注销（其他标签页退出登录）：跳回登录页
    if (e.key === 'nanyan_session' && !e.newValue) {
      location.href = 'index.html';
      return;
    }
    // 用户数据变更（如形象更新）：刷新个人头部
    if (e.key === 'nanyan_users') {
      renderProfile();
      renderSpaceList();
      renderAppsPill();
    }
    // 空间数据变更（新建/加入/申请/泡泡等）：刷新空间列表与申请红点
    if (e.key === 'nanyan_spaces') {
      renderSpaceList();
      renderAppsPill();
    }
  });
})();

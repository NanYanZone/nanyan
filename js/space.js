/* ============================================================
 * 喃言 · 双人空间（泡泡 / 密语 / 邀约 / 日历 / 周报）
 * ============================================================ */
(function () {
  'use strict';
  if (!N.requireAuth()) return;

  var me = N.Auth.currentUser();
  var spaceId = new URLSearchParams(location.search).get('id');
  var space = N.Space.list()[spaceId];
  if (!space || space.members.indexOf(me.username) < 0) {
    N.toastErr('空间不存在或你已不在其中');
    setTimeout(function () { location.href = 'profile.html'; }, 600);
    return;
  }
  // 记录为最近访问的空间（不自动标记已读，保留红点提示）
  N.Auth.setLastSpace(spaceId);

  // 进入即清理 24 小时已过期的泡泡
  N.Space.expireBubbles(spaceId);
  space = N.Space.list()[spaceId];

  // 跨标签页特效同步：记录本页最近一次播放的 lastEffect.time，避免重复
  var lastPlayedEffectTime = (space.lastEffect && space.lastEffect.time) || 0;
  // 新手教学：标记最近一颗喃呱的泡泡 ID（给 onboard step2 联动）
  var _lastNanguaBubbleId = null;
  // onboard step2: 用户留言后，喃呱自动在该泡泡留言一条；记录需要喃呱留言的泡泡 ID
  var _obPendingCmtBubble = null;
  // onboard step3: 标记喃呱是否已回复过（确保教学期间只回复一条，不因多条消息重复回复）
  var _step3Replied = false;

  var tabContent = document.getElementById('tabContent');
  var bottomBar = document.getElementById('bottomBar');
  var activeTab = 'bubbles';

  /* ---------- 顶部 / 头部 ---------- */
  document.getElementById('backBtn').innerHTML = N.icon('back');
  document.getElementById('backBtn').onclick = function () { location.href = 'profile.html'; };
  document.getElementById('setBtn').innerHTML = N.icon('settings');
  document.getElementById('setBtn').onclick = openSettings;
  document.getElementById('codeBtn').innerHTML = N.icon('key');

  /* ============================================================
   * 喃呱（默认搭档 bot）：菜单触发 + 自动回应 + 新手教学
   * 喃呱始终是空间成员（注册即加入）；所有互动写入共用数据结构
   * ============================================================ */
  var NANGUA = N.NANGUA;
  var NG_BUBBLE_TEXTS = [
    '今天好累啊','突然想到你','晚饭吃了吗','今天天气真好','想和你说说话','有点emo了','看了个电影超感动','突然好想你',
    '加班到现在…','今天的云好好看','喝了好喝的奶茶','想和你一起吃火锅','刚睡醒 你呢','今天想你了三次','周末一起去散步吧'
  ];
  var NG_SECRET_TEXTS = [
    '在干嘛','晚安','今天想你了','吃饭了吗','想和你聊聊天','刚到家～','今天过的怎么样','做什么呢宝贝',
    '睡不着…','今天的你超可爱','抱抱～','早点休息','你睡了吗','在想我吗','今天我超乖的'
  ];
  /* ===== 喃呱定时主动行为：文案/食物库 ===== */
  // 喃呱每日定时泡泡文案（20+条，含用户需求的全部内容）
  var NG_DAILY_BUBBLES = [
    '今天天气真好，适合发呆～',
    '刚刚看到一只好可爱的猫！',
    '突然想吃甜食了...',
    '今天工作/学习好累呀',
    '发现一首超好听的歌，单曲循环中',
    '午饭吃太饱了，困困的',
    '今天心情不错，你呢？',
    '突然想起一件好笑的事哈哈哈',
    '外面下雨了，记得带伞哦',
    '今天喝了三杯奶茶，罪恶感满满',
    '刚做完运动，神清气爽！',
    '今天的云好好看，像棉花糖',
    '又到周五啦，开心！',
    '周末打算宅家追剧，有推荐吗？',
    '今天早起了，表扬自己一下',
    '吃到了超好吃的蛋糕，幸福！',
    '今天有点emo，需要抱抱',
    '发现一家新店，下次一起去呀',
    '今天的月亮好圆好亮',
    '突然很想念你～',
    '夕阳好漂亮，你看到了吗？',
    '今天路上遇到了有趣的事情',
    '新买的书到了，准备开始读！',
    '今天收拾了房间，心情都变好了'
  ];
  // 喃呱午饭随机食物（30+种）
  var NG_LUNCH_FOODS = [
    '红烧肉','番茄炒蛋','宫保鸡丁','麻婆豆腐','鱼香肉丝','回锅肉','糖醋排骨','酸菜鱼','水煮鱼','辣子鸡',
    '黄焖鸡','煲仔饭','拉面','炒饭','炒面','汉堡','披萨','寿司','咖喱饭','烤肉拌饭',
    '螺蛳粉','过桥米线','沙县小吃','煎饼果子','肉夹馍','凉皮','热干面','担担面','钟水饺','小笼包',
    '红烧牛肉面','日式便当','海鲜粥','麻辣烫','章鱼小丸子'
  ];
  // UTC+8 时间/日期工具（以中国时间为基准，强制24小时制）
  function cnDateKey(d) {
    d = d || new Date();
    var s = d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    // zh-CN 格式示例：2026/8/20 15:30:45
    var m = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!m) {
      var tmp = new Date(d.getTime() + 8 * 3600 * 1000);
      return tmp.getUTCFullYear() + '-' + String(tmp.getUTCMonth() + 1).padStart(2, '0') + '-' + String(tmp.getUTCDate()).padStart(2, '0');
    }
    return m[1] + '-' + String(Number(m[2])).padStart(2, '0') + '-' + String(Number(m[3])).padStart(2, '0');
  }
  function cnHour(d) {
    d = d || new Date();
    var s = d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    var m = s.match(/(\d{1,2}):(\d{1,2})/);
    if (m) return { h: Number(m[1]), m: Number(m[2]) };
    var tmp = new Date(d.getTime() + 8 * 3600 * 1000);
    return { h: tmp.getUTCHours(), m: tmp.getUTCMinutes() };
  }
  function todayKey() { return cnDateKey(); }
  // 基于UTC+8的当天某时:分的时间戳（避免本地时区干扰）
  function cnTodayAt(hour, minute) {
    var d = new Date();
    var s = d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    var m = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (m) {
      var y = Number(m[1]);
      var mo = Number(m[2]) - 1;
      var da = Number(m[3]);
      // UTC+8 时刻 = UTC(y,mo,da, hour-8, minute)
      return Date.UTC(y, mo, da, hour - 8, minute || 0, 0);
    }
    // 兜底：用本地时间
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute || 0).getTime();
  }
  // 密语时间格式化（基于UTC+8）：当天显示HH:MM，昨天显示"昨天 HH:MM"，更早显示M/D HH:MM
  function fmtMsgTime(ts) {
    var today = todayKey();
    var yesterday = cnDateKey(new Date(Date.now() - 86400000));
    var msgDate = cnDateKey(new Date(ts));
    // 提取 UTC+8 时区的 HH:MM 和 月/日
    var d = new Date(ts);
    var s = d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    var hm = s.match(/(\d{1,2}):(\d{1,2})/);
    var hhmm = hm ? (String(hm[1]).padStart(2, '0') + ':' + String(hm[2]).padStart(2, '0')) : N.utils.fmtTime(ts);
    if (msgDate === today) return hhmm;
    if (msgDate === yesterday) return '昨天 ' + hhmm;
    var m2 = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (m2) return Number(m2[2]) + '/' + Number(m2[3]) + ' ' + hhmm;
    return hhmm;
  }
  // 生成当日3个分散的随机泡泡发送时间点（小时[9-22]），返回升序小时数数组，例如 [11,15,19]
  function generateBubbleHours() {
    var slots = [];
    // 9-22 共 14 个小时，分成 3 段，每段抽一个，确保分散
    var segments = [
      { from: 9, to: 13 }, // 上午
      { from: 14, to: 18 }, // 下午
      { from: 19, to: 22 }  // 晚上
    ];
    for (var i = 0; i < segments.length; i++) {
      var sg = segments[i];
      var h = sg.from + Math.floor(Math.random() * (sg.to - sg.from + 1));
      slots.push(h);
    }
    slots.sort(function (a, b) { return a - b; });
    return slots;
  }
  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function ngEmotion() {
    // 仅使用 N.EMOTIONS 中的合法 id，避免渲染降级
    var ids = N.EMOTIONS.map(function (e) { return e.id; });
    return ids[Math.floor(Math.random() * ids.length)];
  }
  function isNanguaPartner() {
    var sp = N.Space.list()[spaceId];
    return !!(sp && sp.members && sp.members.indexOf(NANGUA) >= 0);
  }
  // 以喃呱身份直接写入一颗共享泡泡（绕过权限校验，因为喃呱是 bot）
  // 参数 returnId=true 时返回新泡泡 id（默认 false 只做副作用，返回 undefined）
  function nanguaAddBubble(text, returnId) {
    var sp = N.Space.list()[spaceId];
    var b = {
      id: 'b_ng' + Date.now(),
      author: NANGUA,
      text: text || rand(NG_BUBBLE_TEXTS),
      emotion: ngEmotion(),
      isPrivate: false, image: null, comments: [],
      createdAt: Date.now(), updatedAt: Date.now()
    };
    sp.bubbles.unshift(b);
    _lastNanguaBubbleId = b.id;
    N.Space.save(sp);
    reload();
    // 非新手教学期间，显示喃呱新泡泡通知
    if (!N.Onboard.isActive(spaceId)) {
      showNanguaNotice('bubble', '<b>喃呱</b>有新的泡泡，快去看看吧');
    }
    if (returnId) return b.id;
  }
  // 以喃呱身份直接写入一条密语
  function nanguaAddMessage(text, opts) {
    var sp = N.Space.list()[spaceId];
    var m = { id: 'm_ng' + Date.now(), author: NANGUA, text: text || rand(NG_SECRET_TEXTS), createdAt: Date.now() };
    opts = opts || {};
    if (opts.burnAfterRead) { m.burnAfterRead = true; m.burnStatus = 'unread'; }
    if (opts.image) { m.image = opts.image; }
    sp.messages.push(m);
    N.Space.save(sp);
    reload();
    if (activeTab === 'secret') tabContent.scrollTop = tabContent.scrollHeight;
    // 非新手教学期间，显示喃呱新密语通知
    if (!N.Onboard.isActive(spaceId)) {
      showNanguaNotice('secret', '<b>喃呱</b>在密语和你说了悄悄话');
    }
    return m;
  }
  // 以喃呱身份发起一条邀约
  function nanguaCreateInvitation(type) {
    var sp = N.Space.list()[spaceId];
    if (sp.members.length < 2) { N.toastErr('空间尚未满员'); return; }
    if (['flower', 'card', 'chat'].indexOf(type) < 0) { N.toastErr('邀约类型无效'); return; }
    sp.invitations = sp.invitations || [];
    for (var i = 0; i < sp.invitations.length; i++) {
      var iv = sp.invitations[i];
      if (iv.type === type && iv.fromUsername === NANGUA && iv.status === 'pending') {
        N.toastErr('喃呱还有未处理的同类型邀约'); return;
      }
    }
    var messages = {
      flower: ['我想送你一束花', '给你满满的爱', '鲜花陪好心情~', '谢谢你陪着我'],
      card:   ['帮我实现一个心愿', '陪我散步、一次拥抱', '一起去看电影好吗', '周末去吃火锅？'],
      chat:   ['想和你聊聊最近的心情', '我们好好聊聊吧', '有些话想和你说', '来一次深度对话吧']
    };
    var inv = {
      id: 'inv_ng' + Date.now(),
      type: type, fromUsername: NANGUA, toUsername: me.username,
      message: rand(messages[type]), status: 'pending',
      createdAt: Date.now(), respondedAt: null
    };
    sp.invitations.unshift(inv);
    sp.lastEffect = { type: type, time: Date.now() };
    N.Space.save(sp);
    reload();
    N.toastOk('喃呱发起了' + { flower: '送花', card: '兑现卡', chat: '聊一聊' }[type] + '邀约');
  }
  // 喃呱处理"我发出的"最新一条 pending 邀约（接受/拒绝）
  function nanguaActMyPending(action) {
    var sp = N.Space.list()[spaceId];
    sp.invitations = sp.invitations || [];
    var inv = null;
    for (var j = 0; j < sp.invitations.length; j++) {
      if (sp.invitations[j].fromUsername === me.username && sp.invitations[j].status === 'pending') { inv = sp.invitations[j]; break; }
    }
    if (!inv) { N.toastErr('你还没有待处理的 pending 邀约哦'); return; }
    inv.status = action;
    inv.respondedAt = Date.now();
    if (inv.type === 'chat' && action === 'accepted') {
      sp.messages.push({
        id: 'ms_ng' + Date.now(), author: '__system__', system: true,
        text: '已开启深度对话', linkInvitationId: inv.id, createdAt: Date.now()
      });
    }
    if (action === 'accepted') {
      sp.lastEffect = { type: inv.type, time: Date.now() };
      lastPlayedEffectTime = sp.lastEffect.time;
      N.Space.save(sp);
      N.playEffect(inv.type).then(function () {
        N.toastOk('喃呱接受了你的' + { flower: '送花', card: '兑现卡', chat: '聊一聊' }[inv.type] + '邀请');
      });
    } else {
      N.Space.save(sp);
      N.toastOk('喃呱拒绝了你的' + { flower: '送花', card: '兑现卡', chat: '聊一聊' }[inv.type] + '邀请');
    }
    reload();
  }

  /* ---------- 喃呱自动回应（邀约三段式：处理中→3s→中央通知→点好的→播放特效；教学时强制结果） ---------- */
  // 喃呱回应某条我刚刚发出的邀约
  function nanguaRespondInvitation(invId, forceStatus, forceMsg) {
    if (!isNanguaPartner()) return;
    var sp = N.Space.list()[spaceId];
    sp.invitations = sp.invitations || [];
    var idx = -1, inv = null;
    for (var i = 0; i < sp.invitations.length; i++) {
      if (sp.invitations[i].id === invId) { idx = i; inv = sp.invitations[i]; break; }
    }
    if (!inv || inv.fromUsername !== me.username || inv.status !== 'pending') return;
    var status = forceStatus;
    if (!status) {
      if (inv.type === 'chat') status = Math.random() < 0.5 ? 'accepted' : 'rejected';
      else status = 'accepted';
    }
    var rejectPool = ['今天有点累，下次再聊吧', '在忙哦，明天再说', '有点社恐，想一个人待会', '等我先把手上的事情做完'];
    var message = forceMsg || (status === 'rejected' && inv.type === 'chat' ? rejectPool[Math.floor(Math.random() * rejectPool.length)] : '');
    inv.status = status;
    inv.respondedAt = Date.now();
    inv.responseMessage = message;
    if (status === 'accepted') {
      if (inv.type === 'chat') {
        sp.messages = sp.messages || [];
        sp.messages.push({
          id: 'ms_ng' + Date.now(), author: '__system__', system: true,
          text: '已开启深度对话', linkInvitationId: inv.id, createdAt: Date.now()
        });
      }
    }
    sp.lastEffect = { type: status, time: Date.now() };
    lastPlayedEffectTime = sp.lastEffect.time;
    N.Space.save(sp);
    reload(); // 立即刷新邀约卡片状态（显示"已接受"/"已拒绝"）

    var typeName = { flower: '鲜花', card: '兑现卡', chat: '聊一聊' }[inv.type] || '邀约';
    var curStep = (typeof sp.onboardStep === 'number') ? sp.onboardStep : -1;
    var isTeaching = (status === 'accepted' && curStep === 5) || (status === 'rejected' && curStep === 6);
    var advanceAfter = null;
    if (status === 'accepted' && curStep === 5) advanceAfter = 5;
    if (status === 'rejected' && curStep === 6) advanceAfter = 6;

    if (status === 'accepted') {
      var accHtml = '<b>喃呱</b>接受了你的' + typeName + '邀约！';
      // 需求五：中央通知弹窗（页面中间），点【好的】后才播放accept特效
      N.Onboard.showCenterNotice({
        html: accHtml,
        okText: '好的',
        onOk: function () {
          N.playEffect('accept').then(function () {
            // 教学第5步：特效结束后推进下一步
            if (advanceAfter === 5) {
              setTimeout(function () { advanceOnboarding(5); }, 300);
            }
          });
        }
      });
    } else {
      var rejHtml = '<b>喃呱</b>婉拒了你的' + typeName + '邀请' + (message ? '<br/><span class="muted small">附言：' + N.utils.escapeHtml(message) + '</span>' : '');
      // 需求六：婉拒中央通知 → 点好的后才播放 reject 特效
      N.Onboard.showCenterNotice({
        html: rejHtml,
        okText: '好的',
        onOk: function () {
          N.playEffect('reject').then(function () {
            if (advanceAfter === 6) {
              setTimeout(function () { advanceOnboarding(6); }, 300);
            }
          });
        }
      });
    }
  }
  function nanguaAutoRespondLatestInvitation(type, forceStatus, forceMsg) {
    if (!isNanguaPartner()) return;
    var sp = N.Space.list()[spaceId];
    sp.invitations = sp.invitations || [];
    // 找最新一条我发出、type=xxx 且 pending 的邀约
    var latest = null;
    for (var i = sp.invitations.length - 1; i >= 0; i--) {
      var iv = sp.invitations[i];
      if (iv.fromUsername === me.username && iv.type === type && iv.status === 'pending') {
        latest = iv; break;
      }
    }
    if (!latest) return;
    nanguaRespondInvitation(latest.id, forceStatus, forceMsg);
  }

  /* ---------- 喃呱互动菜单（点击空间头部喃呱头像触发） ---------- */
  function openNanguaMenu() {
    if (!isNanguaPartner()) { N.toastErr('喃呱不在空间中，可邀请真人搭档互动'); return; }
    var items = [
      { key: 'bubble', icon: 'bubble',   label: '让喃呱发颗泡泡',     act: function () { nanguaAddBubble(); N.toastOk('喃呱飘起了一颗泡泡'); } },
      { key: 'secret', icon: 'chat_i',   label: '让喃呱说句话',       act: function () { nanguaAddMessage(); N.toastOk('喃呱说了一句'); } },
      { key: 'flower', icon: 'flower_i', label: '让喃呱送我花',       act: function () { nanguaCreateInvitation('flower'); } },
      { key: 'card',   icon: 'card_i',   label: '让喃呱发兑现卡',     act: function () { nanguaCreateInvitation('card'); } },
      { key: 'chat',   icon: 'chat_i',   label: '让喃呱邀我聊一聊',    act: function () { nanguaCreateInvitation('chat'); } },
      { key: 'acc',    icon: 'check',    label: '让喃呱接受我最新邀约', act: function () { nanguaActMyPending('accepted'); } },
      { key: 'rej',    icon: 'close',    label: '让喃呱拒绝我最新邀约', act: function () { nanguaActMyPending('rejected'); } }
    ];
    var body = '<div class="muted small center" style="padding:2px 0 8px">喃呱是你的默认搭档，随时可以陪你说说话</div>' +
      '<div class="nangua-menu">' + items.map(function (it) {
        return '<button class="nm-btn" data-key="' + it.key + '">' + N.icon(it.icon) + ' ' + it.label + '</button>';
      }).join('') + '</div>';
    var s = N.openSheet({ title: '找喃呱玩', html: body });
    s.sheet.querySelectorAll('.nm-btn').forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.dataset.key;
        for (var i = 0; i < items.length; i++) if (items[i].key === k) { s.close(); setTimeout(items[i].act, 180); return; }
      };
    });
  }

  /* ---------- 喃呱自动回应（用户行为后被动触发） ---------- */
  // 用户发密语 → 喃呱 2-4s 后随机回复；教学第3步完成时推进
  function nanguaReplyMessage() {
    if (!isNanguaPartner()) return;
    // step3 教学期间：喃呱只回复一次，避免用户发多条消息导致重复回复/重复推进
    var curSp = N.Space.list()[spaceId];
    if (curSp && typeof curSp.onboardStep === 'number' && curSp.onboardStep === 3 && _step3Replied) {
      console.log('[onboard] nanguaReplyMessage skip: step3 already replied');
      return;
    }
    setTimeout(function () {
      if (!isNanguaPartner()) return;
      // timeout 执行时再次检查：用户可能发了多条消息排了多个 timeout
      var sp = N.Space.list()[spaceId];
      if (sp && typeof sp.onboardStep === 'number' && sp.onboardStep === 3) {
        if (_step3Replied) {
          console.log('[onboard] nanguaReplyMessage timeout skip: step3 already replied');
          return;
        }
        _step3Replied = true;
        console.log('[onboard] nanguaReplyMessage timeout fired (step3), sending reply + advanceOnboarding(3)');
        try { nanguaAddMessage(); }
        catch (e) { console.error('[onboard] nanguaReplyMessage nanguaAddMessage failed:', e); }
        try { advanceOnboarding(3); }
        catch (e) { console.error('[onboard] nanguaReplyMessage advanceOnboarding failed:', e); }
      } else {
        // 非教学期间（教学已完成或不在 step3）：正常回复，不推进教学
        console.log('[onboard] nanguaReplyMessage timeout fired (non-step3), sending reply only');
        try { nanguaAddMessage(); }
        catch (e) { console.error('[onboard] nanguaReplyMessage nanguaAddMessage failed:', e); }
      }
    }, 2000 + Math.floor(Math.random() * 2000));
  }
  // 用户发邀约 → 延迟 3 秒用结果回应（不再重复调用 advanceOnboarding，由 nanguaRespondInvitation 内部处理）
  function nanguaScheduleInviteResponse(invId, type) {
    if (!isNanguaPartner()) return;
    setTimeout(function () {
      if (!isNanguaPartner()) return;
      var curSp = N.Space.list()[spaceId];
      var curStep = (typeof curSp.onboardStep === 'number') ? curSp.onboardStep : -1;
      if (type === 'flower') {
        var status = (curStep === 5) ? 'accepted' : 'accepted';
        nanguaRespondInvitation(invId, status);
      } else if (type === 'chat') {
        var st = (curStep === 6) ? 'rejected' : (Math.random() < 0.5 ? 'accepted' : 'rejected');
        var msg = (curStep === 6) ? '今天有点累，下次再聊吧' : '';
        nanguaRespondInvitation(invId, st, msg);
      } else {
        nanguaRespondInvitation(invId, 'accepted');
      }
    }, 3000);
  }
  // 新手教学第2步：用户发一颗公开泡泡 → 喃呱 1.2s 后自动回一颗 + 弹通知条
  function nanguaReplyBubbleIfOnboarding() {
    var sp = N.Space.list()[spaceId];
    if (typeof sp.onboardStep !== 'number' || sp.onboardStep !== 2) return;
    // 用户发布泡泡后先等喃呱准备自己的泡泡（1.2~1.8s 随机）
    var nanguaAfter = 1200 + Math.floor(Math.random() * 600);
    setTimeout(function () {
      if (!isNanguaPartner()) return;
      var bid = nanguaAddBubble(null, true);
      // 按要求：发布后 3 秒（总时长）弹通知条
      var alreadyWaited = nanguaAfter;
      var remain = Math.max(0, 3000 - alreadyWaited);
      setTimeout(function () {
        if (!N.Onboard.isActive(spaceId)) return;
        var curStep = N.Onboard.getStep(spaceId);
        if (curStep !== 2) return;
        N.Onboard.showNotice({
          avatarUser: N.NANGUA,
          message: '<b>喃呱</b>发布了一条泡泡，快去看看吧～',
          autoMs: 15000,
          onClick: function () {
            if (bid) {
              setTimeout(function () { openBubblePop(bid); }, 120);
            }
          }
        });
        // 教学引导：给喃呱发的那颗泡泡加发光高亮，让用户一眼看出要点哪个（用户点开后 openBubblePop 会清除高亮）
        var ngBubbleEl = document.querySelector('.pool-bubble[data-bid="' + bid + '"]') ||
          document.querySelector('.pool-bubble[data-author="' + NANGUA + '"]');
        if (ngBubbleEl) N.Onboard.highlight(ngBubbleEl);
      }, remain);
    }, nanguaAfter);
  }
  // 用户在某泡泡留言后 → 若 onboard=2 且留言者是我 + 泡泡是喃呱的 → 喃呱自动再留言一条
  function nanguaReplyCommentIfOnboarding(bubbleId, author) {
    var sp = N.Space.list()[spaceId];
    if (typeof sp.onboardStep !== 'number' || sp.onboardStep !== 2) return;
    if (author !== me.username) return;
    var bub = null;
    for (var i = 0; i < sp.bubbles.length; i++) {
      if (sp.bubbles[i].id === bubbleId) { bub = sp.bubbles[i]; break; }
    }
    if (!bub || bub.author !== N.NANGUA) return;
    setTimeout(function () {
      var cmtMsgs = ['我懂你的感受～', '抱抱你', '嗯嗯我也是这么想的', '太懂了！'];
      var txt = cmtMsgs[Math.floor(Math.random() * cmtMsgs.length)];
      var r = N.Space.addBubbleComment(spaceId, bubbleId, txt, N.NANGUA);
      if (r.ok) {
        reload();
        setTimeout(function () { advanceOnboarding(2); }, 600);
      }
    }, 2000);
  }

  /* ---------- 新手教学：弹窗分步引导（空间页侧 step 2~9，共 10 步：0/1 在 profile，10 = 完成） ---------- */
  // 各步提示文案 + 高亮目标选择器；null = 不高亮
  // 编号：0/1 在 profile；2~9 在 space；10 = 完成
  var OB_STEPS = {
    2: {
      // 先一个教学弹窗介绍泡泡机制 → 用户发第一颗公开泡泡 → 等喃呱回 + 通知条 → 用户戳开+留言 → 等喃呱留言 → advance
      a: { text: '先试试发一颗泡泡吧～\n泡泡是24小时限时的心情碎片，次日会自动清零哦', next: '下一步', hl: '#writeBubble' }
    },
    3: { text: '喃呱跟你打招呼啦～\n来密语Tab回复它一句吧', next: '下一步', hl: '.tab[data-tab="secret"]' },
    4: { text: '喃呱给你发了一条阅后即焚消息\n点开那个🔥看看吧', next: '下一步', hl: '.msg.burn.unread[data-author="__nangua__"] .burn-bubble' },
    5: { text: '去邀约Tab送喃呱一束花吧，看看会发生什么', next: '下一步', hl: '.tab[data-tab="invite"]' },
    6: { text: '再试试发起聊一聊邀请吧，有时候对方可能想再等等', next: '下一步', hl: '.tab[data-tab="invite"]' },
    7: { text: '去情绪日历Tab标记一下今天的心情吧', next: '下一步', hl: '.tab[data-tab="calendar"]' },
    8: { text: '去周报Tab看看吧，这里记录了你们的情绪和互动', next: '下一步', hl: '.tab[data-tab="report"]' },
    9: { text: '恭喜你学会啦！\n现在点左上角返回主页吧，那里可以创建新空间、用钥匙图标邀请朋友加入哦', next: '完成', hl: null }
  };
  // 显示某一步引导弹窗
  function showObStep(step) {
    console.log('[onboard] showObStep called, step=', step);
    if (step === 2) {
      // step2 的教学只需要弹第一个提示；后面靠用户行为触发（发泡泡/留言等自动推进）
      var def = OB_STEPS[2].a;
      N.Onboard.showPopup({
        text: def.text,
        buttonText: def.next,
        onSkip: function () { N.Onboard.skip(spaceId); },
        onNext: function () {
          if (def.hl) {
            var el = document.querySelector(def.hl);
            N.Onboard.highlight(el);
          }
        }
      });
      return;
    }
    // step4 特殊处理：确保喃呱已发阅后即焚引导消息（带图片），再渲染列表以让 hl 选择器能命中
    if (step === 4) {
      // 即使 ensureNanguaBurnIntro 失败，也要继续显示教学弹窗，不能中断教学
      try { ensureNanguaBurnIntro(); }
      catch (e) { console.error('[onboard] showObStep(4) ensureNanguaBurnIntro threw:', e); }
      var sp4 = N.Space.list()[spaceId];
      space = sp4;
      _lastMsgSig = _msgSig(sp4);
      if (activeTab === 'secret' && sp4) {
        var list4 = sp4.messages || [];
        if (list4.length) {
          tabContent.innerHTML = list4.map(messageCard).join('');
          attachBurnHandlers();
        }
      }
      // 边界情况：喃呱的阅后即焚消息已被查看（如用户重启浏览器），改用"现在轮到你啦"文案并高亮🔥开关
      var ngBurnViewed = false;
      var sp4msgs = (sp4 && sp4.messages) ? sp4.messages : [];
      for (var j = 0; j < sp4msgs.length; j++) {
        if (sp4msgs[j].author === NANGUA && sp4msgs[j].burnAfterRead && sp4msgs[j].burnStatus === 'read') {
          ngBurnViewed = true; break;
        }
      }
      if (ngBurnViewed) {
        OB_STEPS[4].text = '现在轮到你啦！\n点输入框左边的🔥按钮，写一句话发给喃呱吧（也可选张图）';
        OB_STEPS[4].hl = '#burnToggle';
      } else {
        OB_STEPS[4].text = '喃呱给你发了一条阅后即焚消息\n点开那个🔥看看吧';
        OB_STEPS[4].hl = '.msg.burn.unread[data-author="__nangua__"] .burn-bubble';
      }
    }
    var def = OB_STEPS[step];
    if (!def) { console.log('[onboard] showObStep: OB_STEPS[' + step + '] not defined, abort'); return; }
    var isLast = step === 9;
    // step5/6 不自动切换邀约 Tab：弹窗提示用户去邀约Tab
    // 点【下一步】后的高亮分两步：先高亮邀约Tab按钮让用户点Tab；用户手动切Tab后 renderInvitations 内部再立即高亮具体邀约按钮
    // step8：高亮周报Tab按钮，让用户自己点击（不自动切换）
    console.log('[onboard] showObStep(' + step + ') scheduling popup, text=', def.text.substring(0, 30));
    setTimeout(function () {
      N.Onboard.showPopup({
        text: def.text,
        buttonText: def.next,
        onSkip: function () { N.Onboard.skip(spaceId); },
        onNext: function () {
          if (isLast) {
            N.Onboard.complete(spaceId);
            N.toastOk('新手教学完成！');
            return;
          }
          // step5/6：点下一步后，高亮邀约 Tab 或具体邀约按钮
          // 如果用户已在邀约 Tab（step6 时常见：step5 刚在邀约Tab完成送花），直接高亮具体按钮
          // 否则高亮 Tab 按钮引导用户切换，切换后 renderInvitations 会检测 onboardStep 再高亮具体按钮
          if (step === 5 || step === 6) {
            if (activeTab === 'invite') {
              // 已在邀约 Tab，直接高亮对应按钮
              var btnId = step === 5 ? '#sendFlower' : '#sendChat';
              var btn = bottomBar.querySelector(btnId);
              if (btn) N.Onboard.highlight(btn);
            } else {
              var tabEl = document.querySelector('.tab[data-tab="invite"]');
              if (tabEl) N.Onboard.highlight(tabEl);
            }
          } else if (def.hl) {
            var el2 = document.querySelector(def.hl);
            N.Onboard.highlight(el2);
          }
        }
      });
    }, 350);
  }
  // 自动关闭所有打开的 sheet 弹窗（用于教学转换时清理遮挡）
  function closeAllSheets() {
    document.querySelectorAll('.mask').forEach(function (m) {
      if (m.parentNode) m.parentNode.removeChild(m);
    });
  }
  // 当用户完成 currentStep 指定的步骤时推进教学，并弹出下一步
  function advanceOnboarding(currentStep) {
    var sp = N.Space.list()[spaceId];
    console.log('[onboard] advanceOnboarding called, current=', currentStep, 'sp.onboardStep=', sp && sp.onboardStep);
    if (typeof sp.onboardStep !== 'number') return;
    // 容错：用户在 step3 期间发的任意一条普通密语都应能推进
    // 如果当前 step 已经被推进过（>= currentStep+1），不再重复推进避免重复弹窗
    if (sp.onboardStep > currentStep) {
      console.log('[onboard] step already advanced past', currentStep, '->', sp.onboardStep);
      return;
    }
    // 如果用户跳过某一步，把当前步校验放宽：onboardStep == currentStep 才推进
    if (sp.onboardStep !== currentStep) {
      console.log('[onboard] onboardStep mismatch, expected', currentStep, 'got', sp.onboardStep);
      return;
    }
    var next = currentStep + 1;
    N.Onboard.setStep(spaceId, next);
    // step3 进入时重置 _step3Replied，确保喃呱可以回复
    if (next === 3) _step3Replied = false;
    // 教学转换时自动关闭可能遮挡的 sheet 弹窗
    // step2→3：关闭泡泡评论弹窗，引导去密语 Tab
    // step7→8：关闭日历弹窗，引导去周报 Tab
    if (next === 3 || next === 8) closeAllSheets();
    console.log('[onboard] step advanced to', next, '→ scheduling showObStep(' + next + ')');
    // step8 (周报) → 弹弹窗引导用户点周报Tab
    if (next === 8) {
      setTimeout(function () { showObStep(8); }, 350);
    } else if (next === 9) {
      setTimeout(function () { showObStep(9); }, 350);
    } else {
      setTimeout(function () { showObStep(next); }, 350);
    }
  }
  // 空间页加载时启动/恢复新手教学
  function startOnboardingIfActive() {
    var sp = N.Space.list()[spaceId];
    if (typeof sp.onboardStep !== 'number') return;
    var step = sp.onboardStep;
    // 个人主页 step1（进入空间）→ 进入空间后自动推进到 step2 并弹
    if (step === 1) {
      N.Onboard.setStep(spaceId, 2);
      step = 2;
    }
    if (step < 2 || step > 9) return;
    // step3 页面加载恢复时重置 _step3Replied（首次进入或刷新页面）
    if (step === 3) _step3Replied = false;
    // step2 需要在泡泡 Tab；step3/step4 需要在密语 Tab（基础功能引导，自动切换）
    // step5/6 不自动切邀约 Tab：让用户自己点击邀约Tab按钮，体验更自然
    if (step === 2 && activeTab !== 'bubbles') switchTab('bubbles');
    if ((step === 3 || step === 4) && activeTab !== 'secret') switchTab('secret');
    setTimeout(function () {
      if (step === 3) {
        // step3：确保喃呱欢迎消息已发
        ensureNanguaWelcomeSecret();
        showObStep(step);
      } else {
        showObStep(step);
      }
    }, 400);
  }

  /* ---------- 需求四：首次进入密语时，喃呱自动发欢迎消息（不调用 reload，返回是否改动） ---------- */
  function ensureNanguaWelcomeSecret(noReload) {
    if (!isNanguaPartner()) return false;
    var sp = N.Space.list()[spaceId];
    sp.messages = sp.messages || [];
    var welcomeKey = '_nanguaWelcomeSent';
    if (sp[welcomeKey]) return false;
    var alreadyHas = false;
    for (var i = 0; i < sp.messages.length; i++) {
      if (sp.messages[i].author === NANGUA) { alreadyHas = true; break; }
    }
    if (alreadyHas) { sp[welcomeKey] = true; N.Space.save(sp); return false; }
    var welcome = {
      id: 'm_ng_welcome_' + Date.now(),
      author: NANGUA,
      text: '我是喃呱，这是专属于我们之间的小天地哦～',
      createdAt: Date.now()
    };
    sp.messages.push(welcome);
    sp[welcomeKey] = true;
    N.Space.save(sp);
    space = sp;
    if (!noReload) setTimeout(function () { reload(); }, 50);
    return true;
  }

  /* step4 教学：喃呱先发一条阅后即焚消息（文字 + 配图 images/burn/nangua_pizza.png）
     用户点开查看 → 关闭 → 消息变灰 → 提示用户自己发一条 */
  function ensureNanguaBurnIntro() {
    if (!isNanguaPartner()) return false;
    var sp = N.Space.list()[spaceId];
    if (typeof sp.onboardStep !== 'number' || sp.onboardStep !== 4) {
      console.log('[onboard] ensureNanguaBurnIntro skip: not step4, onboardStep=', sp && sp.onboardStep);
      return false;
    }
    sp.messages = sp.messages || [];
    var burnKey = '_nanguaBurnSent';
    if (sp[burnKey]) {
      console.log('[onboard] ensureNanguaBurnIntro skip: already sent');
      return false;
    }
    // 已有喃呱发的阅后即焚消息则不再发，仅补标记
    for (var i = 0; i < sp.messages.length; i++) {
      if (sp.messages[i].author === NANGUA && sp.messages[i].burnAfterRead) {
        sp[burnKey] = true; N.Space.save(sp);
        console.log('[onboard] ensureNanguaBurnIntro skip: burn msg already exists');
        return false;
      }
    }
    try {
      var burn = {
        id: 'm_ng_burn_' + Date.now(),
        author: NANGUA,
        text: '看看呱呱今天做的爱心pizza',
        image: 'images/burn/nangua_pizza.png',
        burnAfterRead: true,
        burnStatus: 'unread',
        createdAt: Date.now()
      };
      sp.messages.push(burn);
      sp[burnKey] = true;
      N.Space.save(sp);
      space = sp;
      console.log('[onboard] ensureNanguaBurnIntro sent burn msg successfully');
      return true;
    } catch (e) {
      console.error('[onboard] ensureNanguaBurnIntro failed:', e);
      // 即使发送失败也要标记为已发，避免阻塞 showObStep 弹窗
      sp[burnKey] = true;
      try { N.Space.save(sp); } catch (e2) {}
      return false;
    }
  }

  /* ===== 喃呱定时主动行为：核心检查/发送逻辑 ===== */
  function checkNanguaScheduledActions() {
    if (!isNanguaPartner()) return; // 非喃呱搭档空间不执行
    var sp = N.Space.list()[spaceId];
    if (!sp) return;
    var today = todayKey();
    var cur = cnHour();
    var curH = cur.h;
    // 记录上次检查的小时，用于"跨点"判断：只在跨过预设小时点的那一刻发送
    var lastCheckedH = (sp._nanguaLastCheckedH === undefined) ? -1 : sp._nanguaLastCheckedH;
    var firstCheck = (lastCheckedH === -1);
    sp._nanguaLastCheckedH = curH;
    // 新手教学期间（onboardStep 存在且 < 9）不触发定时行为，避免干扰教学流程
    // 但仍保存 lastCheckedH，确保跨点判断正确（避免教学期间不更新 lastCheckedH 导致教学完成后被误判为跨点）
    if (typeof sp.onboardStep === 'number' && sp.onboardStep < 9) {
      console.log('[nangua-sched] skip during onboarding, step=', sp.onboardStep);
      try { N.Space.save(sp); } catch (e) {}
      return;
    }
    // 记录是否有改动，最后统一 reload 一次
    var changed = false;
    var needBubbleNotice = false;
    var needSecretNotice = false;

    // ---------- ① 每天3颗随机泡泡（过了时间点补发）----------
    // nanguaDailyBubbles 结构：{ date: 'YYYY-MM-DD', hours: [9,14,19], sentIndexes: [] }
    var daily = sp.nanguaDailyBubbles;
    if (!daily || daily.date !== today) {
      // 新的一天：重置并生成今日3个时间点
      daily = { date: today, hours: generateBubbleHours(), sentIndexes: [] };
      sp.nanguaDailyBubbles = daily;
      changed = true;
    }
    // 过了目标时间点就补发，不要求精确到点
    for (var idx = 0; idx < 3; idx++) {
      if (daily.sentIndexes.indexOf(idx) >= 0) continue; // 这个时间点已经发过
      var targetH = daily.hours[idx];
      if (curH >= targetH) {
        var bubbleText = rand(NG_DAILY_BUBBLES);
        var bubbleTs = cnTodayAt(targetH, 0);
        var newBubble = {
          id: 'b_ng_sched_' + Date.now() + '_' + idx,
          author: NANGUA,
          text: bubbleText,
          emotion: ngEmotion(),
          isPrivate: false, image: null, comments: [],
          createdAt: bubbleTs, updatedAt: bubbleTs
        };
        sp.bubbles.unshift(newBubble);
        _lastNanguaBubbleId = newBubble.id;
        daily.sentIndexes.push(idx);
        changed = true;
        needBubbleNotice = true;
      }
    }

    // ---------- ② 12:00 午饭密语（过了12点补发）----------
    if (curH >= 12 && sp.nanguaLunchSent !== today) {
      var food = rand(NG_LUNCH_FOODS);
      var lunchTs = cnTodayAt(12, 0);
      var lunchMsg = {
        id: 'm_ng_lunch_' + Date.now(),
        author: NANGUA,
        text: '喃呱今天吃了' + food + '，你呢？午饭吃了什么',
        createdAt: lunchTs
      };
      sp.messages.push(lunchMsg);
      sp.nanguaLunchSent = today;
      changed = true;
      needSecretNotice = true;
    }

    // ---------- ③ 23:00 晚安密语（过了23点补发）----------
    if (curH >= 23 && sp.nanguaGoodnightSent !== today) {
      var gnTs = cnTodayAt(23, 0);
      var gnMsg = {
        id: 'm_ng_goodnight_' + Date.now(),
        author: NANGUA,
        text: '晚安，喃呱去睡觉啦，你也要早点休息别熬夜哦！',
        createdAt: gnTs
      };
      sp.messages.push(gnMsg);
      sp.nanguaGoodnightSent = today;
      changed = true;
      needSecretNotice = true;
    }

    if (changed) {
      N.Space.save(sp);
      space = sp;
      setTimeout(function () {
        reload();
        // 如果在密语Tab，滚到底
        if (activeTab === 'secret') {
          try { tabContent.scrollTop = tabContent.scrollHeight; } catch (e) {}
        }
        // 显示喃呱新消息通知
        if (needBubbleNotice) showNanguaNotice('bubble', '<b>喃呱</b>有新的泡泡，快去看看吧');
        if (needSecretNotice) showNanguaNotice('secret', '<b>喃呱</b>在密语和你说了悄悄话');
      }, 50);
    }
  }

  function renderHead() {
    space = N.Space.list()[spaceId]; // 重新读取最新
    var avatars = space.members.map(function (m) {
      if (m === NANGUA) {
        // 喃呱头像可点击，呼出互动菜单
        return '<span class="avatar nangua-av" id="nanguaAvatar" title="找喃呱玩" style="width:42px;height:42px">' +
          N.avatarSvg((N.Auth.getUser(m) || {}).avatar) + '</span>';
      }
      return N.avatarHTML(m, 42);
    }).join('');
    document.getElementById('headAvatars').innerHTML = avatars;
    var ngAv = document.getElementById('nanguaAvatar');
    if (ngAv) ngAv.onclick = openNanguaMenu;
    document.getElementById('headName').textContent = space.name;
    document.getElementById('headIntro').textContent = space.intro || '还没有简介';
    document.getElementById('topTitle').innerHTML = '<span style="font-size:16px">' + N.utils.escapeHtml(space.name) + '</span>';
    // tab 红点
    refreshDots();
  }
  function refreshDots() {
    // 确保用最新的空间数据计算未读数（避免 space 变量过期导致红点不消失）
    space = N.Space.list()[spaceId];
    var tabsEl = document.getElementById('tabs');
    if (!tabsEl) return;
    var bubUnread = bubbleUnread() > 0;
    var secUnread = secretUnread() > 0;
    syncTabDot(tabsEl.querySelector('[data-tab="bubbles"]'), bubUnread);
    syncTabDot(tabsEl.querySelector('[data-tab="secret"]'), secUnread);
    syncTabDot(tabsEl.querySelector('[data-tab="invite"]'), inviteUnread() > 0);
    // 喃呱头像红点：与泡泡/密语 Tab 红点同步，任一未读即显示，点开对应 Tab 后同步消失
    var ngAv = document.getElementById('nanguaAvatar');
    if (ngAv) ngAv.classList.toggle('has-unread', bubUnread || secUnread);
  }
  // 喃呱新消息通知条
  var _noticeTimer = null;
  // type: 'bubble' | 'secret'；isPageLoad=true 时为页面加载检测，跳过 activeTab 判断（只判断教学是否完成）
  function showNanguaNotice(type, message, isPageLoad) {
    console.log('showNanguaNotice called:', type, isPageLoad, 'activeTab:', activeTab, 'bubbleUnread:', bubbleUnread(), 'secretUnread:', secretUnread());
    // 新手教学期间不弹出通知，避免干扰教学流程（step < 9 为教学中，step 9+ 为已完成）
    var sp = N.Space.list()[spaceId];
    if (sp && typeof sp.onboardStep === 'number' && sp.onboardStep < 9) return;
    // 用户已经在对应 Tab 时不显示通知（避免打扰）；但页面加载检测（isPageLoad=true）时绕过此判断
    if (!isPageLoad && type === 'bubble' && activeTab === 'bubbles') return;
    if (!isPageLoad && type === 'secret' && activeTab === 'secret') return;
    // 移除已有的通知
    var old = document.querySelector('.nangua-notice');
    if (old) old.remove();
    var notice = document.createElement('div');
    notice.className = 'nangua-notice';
    var avatarUrl = N.Auth.getUser(NANGUA) ? N.Auth.getUser(NANGUA).avatar : 'avatar1';
    notice.innerHTML = '<div class="notice-avatar"><img src="images/avatars/' + avatarUrl + '.png" onerror="this.style.display=\'none\'"></div>' +
      '<div class="notice-text">' + message + '</div>' +
      '<div class="notice-close">×</div>';
    notice.onclick = function (e) {
      if (e.target.classList.contains('notice-close')) { notice.remove(); return; }
      if (type === 'bubble') switchTab('bubbles');
      else if (type === 'secret') switchTab('secret');
      notice.remove();
    };
    // 挂到手机主容器 .app 内部（.app 已 position:relative），absolute 定位相对容器而非浏览器窗口
    var appContainer = document.querySelector('.app') || document.body;
    appContainer.appendChild(notice);
    if (_noticeTimer) clearTimeout(_noticeTimer);
    _noticeTimer = setTimeout(function () { if (notice.parentNode) notice.remove(); }, 8000);
  }
  // 页面加载后检测未读消息并提示（喃呱为搭档时）：处理"用户离开空间期间喃呱发了消息、回来后无提示"的场景
  // 与实时发消息共用 showNanguaNotice，同一时间只显示一条；教学期间/已有通知在显示时跳过
  // isPageLoad=true 让 showNanguaNotice 跳过 activeTab 判断，进入即提示（用户在泡泡Tab也弹）
  function checkUnreadNoticeOnLoad() {
    if (!isNanguaPartner()) return;
    // 已有通知条在显示（如定时补发刚触发了一条），不重复
    if (document.querySelector('.nangua-notice')) return;
    var sp = N.Space.list()[spaceId];
    if (!sp) return;
    // 教学期间（onboardStep < 9）不显示
    if (typeof sp.onboardStep === 'number' && sp.onboardStep < 9) return;
    space = sp; // 用最新数据判断未读
    var bUnread = bubbleUnread();
    var sUnread = secretUnread();
    // 两个都有时优先显示泡泡通知；用 else if 保证同一时间只显示一条
    if (bUnread > 0) {
      showNanguaNotice('bubble', '<b>喃呱</b>有新的泡泡，快去看看吧', true);
    } else if (sUnread > 0) {
      showNanguaNotice('secret', '<b>喃呱</b>在密语和你说了悄悄话', true);
    }
  }
  function bubbleUnread() {
    var n = 0;
    for (var i = 0; i < space.bubbles.length; i++) {
      var b = space.bubbles[i];
      // 未读 = 对方发的公开泡泡且我还没点开看过（viewedBy 单独记录每颗泡泡的已读用户）
      if (b.author !== me.username && !b.isPrivate && (!b.viewedBy || b.viewedBy.indexOf(me.username) < 0)) n++;
    }
    return n;
  }
  function syncTabDot(tabEl, on) {
    if (!tabEl) return;
    var old = tabEl.querySelector('.tab-dot');
    if (on && !old) tabEl.appendChild(makeDot());
    else if (!on && old) old.parentNode.removeChild(old);
  }
  function secretUnread() {
    var last = (space.read && space.read[me.username]) || 0;
    var n = 0;
    for (var i = 0; i < space.messages.length; i++) {
      var m = space.messages[i];
      if (m.author !== me.username && !m.system && m.createdAt > last) n++;
    }
    return n;
  }
  function inviteUnread() {
    var invs = space.invitations || []; var n = 0;
    for (var i = 0; i < invs.length; i++) {
      if (invs[i].toUsername === me.username && invs[i].status === 'pending') n++;
    }
    return n;
  }
  function makeDot() { var d = document.createElement('div'); d.className = 'tab-dot'; return d; }
  document.getElementById('codeBtn').onclick = function () {
    var s = N.openSheet({ title: '邀请码', html:
      '<p class="center muted small" style="margin-bottom:14px">把邀请码发给挚友，TA可申请加入</p>' +
      '<div class="card" style="text-align:center;border:2px dashed var(--fog-light)"><div style="font-size:30px;letter-spacing:6px;font-weight:700;color:var(--fog-dark)">' + space.inviteCode + '</div></div>' +
      '<button class="btn" id="cpCode" style="margin-top:16px">复制邀请码</button>' });
    s.sheet.querySelector('#cpCode').onclick = function () { copyText(space.inviteCode, function () { N.toastOk('已复制'); }); };
  };

  /* ---------- Tab 切换 ---------- */
  var tabs = document.querySelectorAll('.tab');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      // 先切换Tab（renderSecret 等可能在此期间添加新消息），切换后再标记已读
      // 这样 read 时间戳晚于 render 期间添加的消息的 createdAt，红点才会正确消失
      switchTab(t.dataset.tab);
      markTabRead(t.dataset.tab);
      refreshDots();
    });
  });
  function markTabRead(name) {
    // 重新读取最新空间数据再更新对应字段，避免覆盖喃呱并发写入；各 Tab 已读时间相互独立
    var sp = N.Space.list()[spaceId];
    if (!sp) return;
    var changed = false;
    if (name === 'bubbles') {
      sp.readBubbles = sp.readBubbles || {};
      sp.readBubbles[me.username] = Date.now();
      changed = true;
    } else if (name === 'secret') {
      sp.read = sp.read || {};
      sp.read[me.username] = Date.now();
      changed = true;
    }
    // 其他Tab（邀约/日历/周报）不更新这两个字段，保证红点独立
    if (changed) { N.Space.save(sp); space = sp; }
  }
  function switchTab(name) {
    activeTab = name;
    tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.tab === name); });
    bottomBar.classList.add('hidden');
    bottomBar.classList.remove('msg-mode', 'inv-mode');
    bottomBar.innerHTML = '';
    if (name === 'bubbles') renderBubbles();
    else if (name === 'secret') renderSecret();
    else if (name === 'invite') renderInvitations();
    else if (name === 'calendar') renderCalendar();
    else if (name === 'report') renderReport();
    if (name === 'secret') {
      setTimeout(function () { tabContent.scrollTop = tabContent.scrollHeight; }, 100);
    } else {
      tabContent.scrollTop = 0;
    }
    // 切换后刷新红点状态
    refreshDots();
  }

  /* ============================================================
   * 泡泡：漂浮池 + 戳开互动（24 小时限时，次日清零）
   * ============================================================ */
  function renderBubbles() {
    // 渲染前先清理过期泡泡（防止跨午夜停留在页面）
    N.Space.expireBubbles(spaceId);
    space = N.Space.list()[spaceId];

    // 泡泡池里只展示公开泡泡；私密泡泡仅自己可见，用"我的私密"入口
    var shared = space.bubbles.filter(function (b) { return !b.isPrivate; });
    var myPrivate = space.bubbles.filter(function (b) { return b.isPrivate && b.author === me.username; });

    var privateEntry = myPrivate.length
      ? '<div class="private-entry" id="privEntry">' + N.icon('lock') + ' 我的私密泡泡（' + myPrivate.length + '）<span class="muted"> · 仅自己可见</span></div>'
      : '';

    if (!shared.length && !myPrivate.length) {
      tabContent.innerHTML = emptyHTML('happy', '今天还没有泡泡', '写下第一颗吧') + privateEntry;
    } else if (!shared.length) {
      tabContent.innerHTML = emptyHTML('happy', '今天还没有共享泡泡', '私密泡泡可在下方入口查看') + privateEntry;
    } else {
      tabContent.innerHTML =
        '<div class="bubble-pool" id="bubblePool"></div>' + privateEntry;
      var pool = tabContent.querySelector('#bubblePool');
      // 碰撞检测 + 等尺寸 + 均匀分布
      pool.innerHTML = '';
      var layout = layoutPoolBubbles(shared, pool);
      shared.forEach(function (b, idx) {
        var el = document.createElement('div');
        el.className = 'pool-bubble' + (layout[idx].hasNew ? ' has-new' : '');
        el.dataset.bid = b.id;
        el.dataset.author = b.author;
        el.style.width = layout[idx].size + 'px';
        el.style.height = layout[idx].size + 'px';
        el.style.left = layout[idx].left + 'px';
        el.style.top = layout[idx].top + 'px';
        el.style.background = layout[idx].bg;
        el.style.animationDelay = layout[idx].delay + 's';
        el.innerHTML =
          '<div class="pb-emo">' + layout[idx].emoHTML + '</div>' +
          (b.author ? '<div class="avatar pb-avatar">' + N.avatarSvg((N.Auth.getUser(b.author) || {}).avatar) + '</div>' : '');
        pool.appendChild(el);
        el.onclick = function () { openBubblePop(b.id); };
      });
    }

    bottomBar.classList.remove('hidden');
    bottomBar.innerHTML = '<button class="btn" id="writeBubble">' + N.icon('plus') + '写个泡泡</button>';
    bottomBar.querySelector('#writeBubble').onclick = function () { openComposeBubble(); };

    var privBtn = tabContent.querySelector('#privEntry');
    if (privBtn) privBtn.onclick = function () { openPrivateList(); };
  }
  // 为漂浮泡泡布局：统一大小 + 碰撞检测（间距 ≥ 直径 * 0.5）+ 均匀分布，不扎堆左上角
  function layoutPoolBubbles(bubbles, poolEl) {
    // 让浏览器先布局好 pool，拿到可用宽高
    var rect = poolEl.getBoundingClientRect();
    var W = Math.max(260, rect.width || 320);
    var H = Math.max(260, rect.height || 420);
    // 统一泡泡大小：根据数量在 90~120px 内选
    var n = bubbles.length;
    var size;
    if (n <= 2) size = 110;
    else if (n <= 4) size = 100;
    else if (n <= 7) size = 95;
    else size = 88;
    var r = size / 2;
    var minGap = r; // 最小间距 = 0.5 倍直径 = 半径
    var placed = []; // { x, y } 圆心
    var pad = 8; // 边距
    var maxX = Math.max(pad * 2 + size, W - size - pad);
    var maxY = Math.max(pad * 2 + size, H - size - pad);
    var minX = pad;
    var minY = pad;
    // 区域划分：粗略按 √n 列，避免扎堆左上
    var cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    var colWidth = Math.max(size + minGap, (maxX - minX) / cols);
    var results = [];
    for (var i = 0; i < n; i++) {
      var b = bubbles[i];
      var color = N.emotionColor(b.emotion || 'meh');
      var emoHTML = b.emotion ? N.emoSvg(b.emotion) : N.emoSvg('meh');
      // 泡泡卡片红点 = 对方发的、我还没点开看过的（与 Tab 红点同源 viewedBy）
      var hasNew = b.author !== me.username && !b.isPrivate && (!b.viewedBy || b.viewedBy.indexOf(me.username) < 0);
      var pos = null;
      var col = i % cols;
      var baseXMin = Math.max(minX, minX + col * colWidth);
      var baseXMax = Math.min(maxX, baseXMin + Math.max(0, colWidth - size));
      if (baseXMax < baseXMin) baseXMax = baseXMin;
      // 尝试多次：在该列范围内随机，若碰撞则扩大到整池；60 次尝试后放宽 30%
      var attempts = 0;
      while (attempts < 80) {
        var rx, ry;
        if (attempts < 60) {
          rx = baseXMin + Math.random() * Math.max(0.1, baseXMax - baseXMin);
          ry = minY + Math.random() * Math.max(0.1, maxY - minY);
        } else {
          rx = minX + Math.random() * Math.max(0.1, maxX - minX);
          ry = minY + Math.random() * Math.max(0.1, maxY - minY);
        }
        var cx = rx + r;
        var cy = ry + r;
        var ok = true;
        var gap = (attempts < 70) ? minGap : minGap * 0.7;
        for (var j = 0; j < placed.length; j++) {
          var dx = cx - placed[j].x;
          var dy = cy - placed[j].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < size + gap) { ok = false; break; }
        }
        if (ok) {
          pos = { left: rx, top: ry };
          placed.push({ x: cx, y: cy });
          break;
        }
        attempts++;
      }
      if (!pos) {
        // 兜底：按顺序顺序排布
        var row = Math.floor(i / cols);
        var fallbackX = Math.max(minX, Math.min(maxX, minX + col * (size + minGap * 1.2)));
        var fallbackY = Math.max(minY, Math.min(maxY, minY + row * (size + minGap * 1.2)));
        pos = { left: fallbackX, top: fallbackY };
        placed.push({ x: fallbackX + r, y: fallbackY + r });
      }
      results.push({
        size: size,
        left: pos.left,
        top: pos.top,
        bg: color.bg,
        emoHTML: emoHTML,
        hasNew: hasNew,
        delay: +(Math.random() * 1.2).toFixed(2)
      });
    }
    return results;
  }
  function openPrivateList() {
    var list = space.bubbles.filter(function (b) { return b.isPrivate && b.author === me.username; });
    var s = N.openSheet({
      title: '我的私密泡泡（' + list.length + '）',
      html: !list.length ? emptyHTML('meh', '还没有私密泡泡', '写泡泡时勾选「私密」可见') :
        list.map(function (b) {
          var emo = b.emotion ? '<div class="emo" style="width:26px;height:26px">' + N.emoSvg(b.emotion) + '</div>' : '';
          return '<div class="bubble mine" style="margin-bottom:12px" data-bubble="' + b.id + '">' +
            '<div class="b-head"><div class="meta"><div class="who">我 · 私密</div><div class="when">' + N.utils.fmtTime(b.createdAt) + '</div></div>' + emo + '</div>' +
            '<div class="b-text">' + N.utils.escapeHtml(b.text) + '</div>' +
            '<div class="b-foot"><button class="btn-link btn-sm" data-edit>编辑</button><button class="btn-link btn-sm text-danger" data-del>删除</button></div>' +
            '</div>';
        }).join('')
    });
    s.sheet.querySelectorAll('[data-bubble]').forEach(function (el) {
      var id = el.dataset.bubble;
      var ed = el.querySelector('[data-edit]'), dl = el.querySelector('[data-del]');
      if (ed) ed.onclick = function () { s.close(); setTimeout(function () { openComposeBubble(id); }, 150); };
      if (dl) dl.onclick = function () { deleteBubble(id, s); };
    });
  }
  function deleteBubble(id, parentSheet) {
    N.confirm({ title: '删除这颗泡泡？', message: '删除后无法恢复', okText: '删除', danger: true }).then(function (ok) {
      if (!ok) return;
      var r = N.Space.deleteBubble(spaceId, id);
      if (!r.ok) { N.toastErr(r.err); return; }
      N.toastOk('已删除');
      if (parentSheet) parentSheet.close();
      reload();
    });
  }
  function openBubblePop(bid) {
    var b = space.bubbles.filter(function (x) { return x.id === bid; })[0];
    if (!b) return;
    // 用户点开泡泡后清除教学发光高亮（step2 引导点开喃呱泡泡的场景）
    N.Onboard.clearHl();
    // 点开对方泡泡时标记已读（viewedBy），让这颗泡泡的卡片红点 + Tab/头像红点同步刷新
    if (b.author !== me.username) {
      var spv = N.Space.list()[spaceId];
      if (spv) {
        var marked = false;
        for (var k = 0; k < spv.bubbles.length; k++) {
          if (spv.bubbles[k].id === bid) {
            spv.bubbles[k].viewedBy = spv.bubbles[k].viewedBy || [];
            if (spv.bubbles[k].viewedBy.indexOf(me.username) < 0) {
              spv.bubbles[k].viewedBy.push(me.username);
              marked = true;
            }
            break;
          }
        }
        if (marked) {
          N.Space.save(spv);
          space = spv;
          // 重新渲染泡泡池（卡片红点立即消失）并刷新 Tab/头像红点
          if (activeTab === 'bubbles') renderBubbles();
          refreshDots();
        }
      }
    }
    var who = N.displayName(b.author);
    var emo = b.emotion ? '<div class="emo">' + N.emoSvg(b.emotion) + '</div>' : '';
    var eName = '';
    N.EMOTIONS.forEach(function (e) { if (e.id === b.emotion) eName = e.name; });
    var img = b.image ? '<div><img src="' + b.image + '" alt=""></div>' : '';
    var isMine = b.author === me.username;
    var ops = isMine ? '<div class="row" style="gap:8px;margin-top:8px"><button class="btn btn-ghost btn-sm" id="ppEdit">编辑</button><button class="btn btn-outline btn-sm text-danger" id="ppDel">删除</button></div>' : '';

    var s = N.openSheet({
      title: eName ? '泡泡 · ' + eName : '泡泡',
      html:
        '<div class="pop-head">' +
          N.avatarHTML(b.author, 36) +
          '<div class="who">' + N.utils.escapeHtml(who) + (isMine ? ' · 我' : '') + '</div>' +
          '<div class="when">' + N.utils.fmtTime(b.createdAt) + '</div>' +
        '</div>' +
        '<div class="pop-emotion">' + emo + '<div class="ename">' + (eName || '轻轻说') + '</div></div>' +
        '<div class="pop-text">' + N.utils.escapeHtml(b.text || '') + '</div>' + img + ops +
        '<div class="divider"></div>' +
        '<div class="muted small" style="margin-bottom:6px;display:flex;align-items:center;gap:4px">' + N.icon('chat') + '留言（<span id="cmtCnt">0</span>）</div>' +
        '<div class="comments-list" id="cmtList"></div>' +
        '<div class="cmt-input-row">' +
          '<input class="input" id="cmtInput" placeholder="写下你的留言…" maxlength="300" />' +
          '<button class="btn" id="cmtSend" style="padding:0 14px">发送</button>' +
        '</div>'
    });

    var cmtList = s.sheet.querySelector('#cmtList');
    var cmtCnt = s.sheet.querySelector('#cmtCnt');
    var cmtInput = s.sheet.querySelector('#cmtInput');
    var cmtSend = s.sheet.querySelector('#cmtSend');

    function renderComments() {
      var latestSpace = N.Space.list()[spaceId];
      if (!latestSpace) return;
      space = latestSpace;
      var b2 = latestSpace.bubbles.filter(function (x) { return x.id === bid; })[0];
      var cs = (b2 && b2.comments) ? b2.comments : [];
      cmtCnt.textContent = cs.length;
      if (!cs.length) {
        cmtList.innerHTML = '<div class="cmt-empty">还没有留言，来写第一条吧～</div>';
        return;
      }
      cmtList.innerHTML = cs.map(function (c) {
        var who = N.displayName(c.author);
        var isMine = c.author === me.username;
        return '<div class="comment-item" data-cid="' + c.id + '">' +
          N.avatarHTML(c.author, 28) +
          '<div class="c-body">' +
            '<div class="c-meta"><span class="who">' + N.utils.escapeHtml(who) + (isMine ? ' · 我' : '') + '</span><span>' + N.utils.fmtTime(c.createdAt) + '</span></div>' +
            '<div class="c-text">' + N.utils.escapeHtml(c.text) + '</div>' +
          '</div></div>';
      }).join('');
    }
    renderComments();

    function doSend() {
      var t = cmtInput.value.trim();
      if (!t) return;
      var r = N.Space.addBubbleComment(spaceId, bid, t);
      if (!r.ok) { N.toastErr(r.err); return; }
      cmtInput.value = '';
      renderComments();
      // 新手教学 step2：我在喃呱的泡泡留言 → 触发喃呱自动回复留言
      nanguaReplyCommentIfOnboarding(bid, me.username);
    }
    cmtSend.onclick = doSend;
    cmtInput.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });

    var edBtn = s.sheet.querySelector('#ppEdit'), dlBtn = s.sheet.querySelector('#ppDel');
    if (edBtn) edBtn.onclick = function () { s.close(); setTimeout(function () { openComposeBubble(bid); }, 150); };
    if (dlBtn) dlBtn.onclick = function () {
      N.confirm({ title: '删除这颗泡泡？', message: '删除后无法恢复', okText: '删除', danger: true }).then(function (ok) {
        if (!ok) return;
        var r = N.Space.deleteBubble(spaceId, bid);
        if (!r.ok) { N.toastErr(r.err); return; }
        s.close(); N.toastOk('已删除'); reload();
      });
    };

    // 需求三：新手教学 step2，打开的是喃呱的泡泡 → 弹出引导留言的教学弹窗
    var curSpOb = N.Space.list()[spaceId];
    if (curSpOb && typeof curSpOb.onboardStep === 'number' && curSpOb.onboardStep === 2 && b.author === NANGUA) {
      // 用一个全局标记避免重复弹（多次打开同一泡泡或不同泡泡）
      if (!window._obBubbleGuideShown) {
        window._obBubbleGuideShown = true;
        setTimeout(function () {
          N.Onboard.showPopup({
            text: '在留言框说句话吧，喃呱会回复你的',
            buttonText: '下一步',
            onSkip: function () { N.Onboard.skip(spaceId); },
            onNext: function () {
              N.Onboard.highlight(cmtInput);
              cmtInput.focus();
            }
          });
        }, 450);
      }
    }
  }

  function openComposeBubble(editId) {
    var editing = !!editId;
    var b = editing ? space.bubbles.filter(function (x) { return x.id === editId; })[0] : null;
    var cur = { text: b ? b.text : '', emotion: b ? b.emotion : null, isPrivate: b ? b.isPrivate : false, image: b ? b.image : null };
    var emos = N.EMOTIONS.map(function (e) {
      return '<div class="emo-opt" data-emo="' + e.id + '" title="' + e.name + '">' +
        '<div class="emo">' + N.emoSvg(e.id) + '</div>' +
        '<div class="ename">' + e.name + '</div>' +
        '</div>';
    }).join('');
    var s = N.openSheet({
      title: editing ? '编辑泡泡' : '写个泡泡',
      html:
        '<div class="field"><label>情绪</label><div class="emo-picker" id="emoPick">' + emos + '</div></div>' +
        '<div class="field"><label>说点什么</label>' +
        '<textarea class="textarea" id="bText" placeholder="轻轻写下此刻的感受…" maxlength="200">' + N.utils.escapeHtml(cur.text) + '</textarea>' +
        '<div class="field-hint"><span class="muted">最多200字</span><span class="input-count" id="bTextCnt">' + cur.text.length + '/200</span></div></div>' +
        '<div class="field"><label>图片（选填）</label>' +
        '<div class="compose-imgrow" id="imgRow">' +
          '<label class="btn btn-outline btn-sm" style="width:auto;flex:0 0 auto">' + N.icon('image') + '选择图片<input type="file" accept="image/*" id="bImg" style="display:none"></label>' +
          (cur.image ? '<span class="bubble-thumb" id="bImgThumb"><img src="' + cur.image + '" onerror="this.style.display=\'none\';this.parentNode.style.display=\'none\'"></span>' : '<span class="bubble-thumb" id="bImgThumb" style="display:none"></span>') +
        '</div></div>' +
        '<div class="field"><div class="private-row" id="pRow">' +
        '<span class="ico">' + N.icon('lock') + '</span>' +
        '<span class="ptxt">私密泡泡（仅自己可见）</span>' +
        '<input type="checkbox" id="bPrivate" ' + (cur.isPrivate ? 'checked' : '') + ' /></div></div>' +
        '<button class="btn" id="bSave">' + (editing ? '保存修改' : '发布泡泡') + '</button>' +
        (cur.image ? '<input type="hidden" id="bImgKeep" value="keep">' : '')
    });
    var imgData = cur.image || null;
    // emotion select
    s.sheet.querySelectorAll('.emo-opt').forEach(function (o) {
      if (cur.emotion === o.dataset.emo) o.classList.add('sel');
      o.onclick = function () {
        s.sheet.querySelectorAll('.emo-opt').forEach(function (x) { x.classList.remove('sel'); });
        o.classList.add('sel'); cur.emotion = o.dataset.emo;
      };
    });
    var txt = s.sheet.querySelector('#bText');
    bindCount(txt, 'bTextCnt', 200);
    s.sheet.querySelector('#bImg').onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      N.toast('处理图片中…');
      readImageScaled(f, 480, 0.72, function (dataUrl) {
        if (!dataUrl) { N.toastErr('图片读取失败'); return; }
        imgData = dataUrl;
        var thumbEl = s.sheet.querySelector('#bImgThumb');
        if (thumbEl) {
          thumbEl.innerHTML = '<img src="' + dataUrl + '">';
          thumbEl.style.display = '';
        }
      });
    };
    s.sheet.querySelector('#bPrivate').onchange = function (e) { cur.isPrivate = e.target.checked; };
    // 整行点击都切换复选框（点击图标/文字区域均有效；避免点击 checkbox 时冒泡触发两次）
    var pRow = s.sheet.querySelector('#pRow');
    if (pRow) {
      pRow.addEventListener('click', function (ev) {
        var cb = s.sheet.querySelector('#bPrivate');
        if (ev.target === cb) return;
        cb.checked = !cb.checked;
        cur.isPrivate = cb.checked;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    s.sheet.querySelector('#bSave').onclick = function () {
      var text = txt.value.trim();
      if (!text && !imgData) { N.toastErr('写点什么或选张图吧'); return; }
      if (editing) {
        var r = N.Space.updateBubble(spaceId, editId, { text: text, emotion: cur.emotion, isPrivate: cur.isPrivate, image: imgData });
        if (!r.ok) { N.toastErr(r.err); return; }
        s.close(); N.toastOk('已更新'); reload();
      } else {
        var rr = N.Space.addBubble(spaceId, { text: text, emotion: cur.emotion, isPrivate: cur.isPrivate, image: imgData });
        if (!rr.ok) { N.toastErr(rr.err); return; }
        s.close(); N.toastOk('泡泡已飘起'); reload();
        // 新手教学第1步：用户发公开泡泡 → 喃呱回一颗
        if (!cur.isPrivate) nanguaReplyBubbleIfOnboarding();
      }
    };
  }

  /* ============================================================
   * 密语：留言板式持久聊天 + 阅后即焚（burnAfterRead）
   * ============================================================ */
  // 🔥 火焰图标 SVG（currentColor 可着色）
  var BURN_ICON_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 2c0 3-4 4.5-4 8 0 1.8 1.2 3 2.5 3.6C9.7 12 9 10.8 9 9.5c0-2 1.5-3.5 3-5 1.5 1.5 3 3 3 5 0 1.3-.7 2.5-1.5 4.1C14.8 13 16 11.8 16 10c0-3.5-4-5-4-8z"/>' +
    '<path d="M12 22c-3.3 0-6-2.2-6-5.5 0-2 1-3.7 2.3-5 .2 1.4 1 2.5 2 3.2-.2-1.2 0-2.3.7-3.4C12 9 13.5 7.5 13.5 5.5c0 0 4.5 2.5 4.5 7.5 0 4-2.7 9-6 9z"/>' +
    '</svg>';

  // 阅后即焚开启状态（持久化于本次会话；用户手动关闭）
  var burnMode = false;
  var burnImageData = null;
  var burnFirstShownKey = '_burnToastShown';
  // localStorage 轮询：检测另一个标签页对消息的修改（接收方查看/焚毁）
  var _lastMsgSig = '';
  function _msgSig(sp) {
    if (!sp || !sp.messages) return '';
    return sp.messages.map(function (m) { return m.id + ':' + (m.burnStatus || 'n') + ':' + (m.text || '').length + ':' + (m.image ? '1' : '0'); }).join('|');
  }
  function _startBurnPoller() {
    if (window._burnPoller) return;
    window._burnPoller = setInterval(function () {
      // 仅当当前在密语Tab时才处理
      if (activeTab !== 'secret') return;
      var sp = N.Space.list()[spaceId];
      if (!sp) return;
      var sig = _msgSig(sp);
      if (sig !== _lastMsgSig) {
        _lastMsgSig = sig;
        space = sp;
        // 重新渲染密语列表（不重置输入框与 burnMode）
        var list = sp.messages || [];
        if (!list.length) {
          tabContent.innerHTML = emptyHTML('meh', '还没有密语', '密语会一直留存，像悄悄留下的字条');
        } else {
          tabContent.innerHTML = list.map(messageCard).join('');
          attachBurnHandlers();
        }
      }
    }, 1000);
  }

  function renderSecret() {
    // 需求四：确保喃呱欢迎消息已发
    ensureNanguaWelcomeSecret(true);
    // step4 教学：确保喃呱已发阅后即焚引导消息（带图片）
    ensureNanguaBurnIntro();
    var sp0 = N.Space.list()[spaceId];
    space = sp0;
    _lastMsgSig = _msgSig(sp0);
    var list = sp0.messages || [];
    if (!list.length) {
      tabContent.innerHTML = emptyHTML('meh', '还没有密语', '密语会一直留存，像悄悄留下的字条');
    } else {
      tabContent.innerHTML = list.map(messageCard).join('');
      attachBurnHandlers();
    }
    // 底部输入栏：🔥开关 + 图片上传 + 输入框 + 发送
    bottomBar.classList.remove('hidden');
    bottomBar.classList.add('msg-mode');
    bottomBar.innerHTML =
      '<div class="burn-img-area" id="burnImgArea" style="' + (burnMode ? '' : 'display:none') + '">' +
        '<button class="burn-add-img" id="burnAddImg" type="button">' + N.icon('image') + '添加图片</button>' +
        '<input type="file" accept="image/*" id="burnFile" style="display:none">' +
      '</div>' +
      '<div class="msg-input-row">' +
        '<button class="burn-toggle' + (burnMode ? ' active' : '') + '" id="burnToggle" type="button" aria-label="阅后即焚" title="阅后即焚">' + BURN_ICON_SVG + '</button>' +
        '<textarea class="input msg-textarea' + (burnMode ? ' burn-mode' : '') + '" id="msgInput" placeholder="' + (burnMode ? '写下阅后即焚的消息...' : '写点什么留给TA…') + '" maxlength="500" rows="2"></textarea>' +
      '</div>' +
      '<div class="msg-send-row"><button class="btn msg-send-btn" id="msgSend" disabled>发送</button></div>';
    var input = bottomBar.querySelector('#msgInput'), btn = bottomBar.querySelector('#msgSend');
    var burnBtn = bottomBar.querySelector('#burnToggle');
    var burnImgArea = bottomBar.querySelector('#burnImgArea');
    var burnFile = bottomBar.querySelector('#burnFile');
    var burnAddImg = bottomBar.querySelector('#burnAddImg');
    input.addEventListener('input', function () {
      btn.disabled = !input.value.trim();
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    });
    // 图片上传
    burnAddImg.onclick = function () { burnFile.click(); };
    burnFile.onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      if (f.size > 500 * 1024) { N.toastErr('图片不能超过500KB'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        burnImageData = reader.result;
        var prev = burnImgArea.querySelector('.burn-img-preview');
        if (prev) prev.remove();
        var pv = document.createElement('div');
        pv.className = 'burn-img-preview';
        pv.innerHTML = '<img src="' + burnImageData + '"><button class="burn-img-del" type="button">×</button>';
        burnImgArea.appendChild(pv);
        pv.querySelector('.burn-img-del').onclick = function () {
          burnImageData = null; pv.remove();
          burnFile.value = '';
        };
      };
      reader.readAsDataURL(f);
      burnFile.value = '';
    };
    // 🔥 切换
    burnBtn.onclick = function () {
      burnMode = !burnMode;
      burnBtn.classList.toggle('active', burnMode);
      input.classList.toggle('burn-mode', burnMode);
      input.placeholder = burnMode ? '写下阅后即焚的消息...' : '写点什么留给TA…';
      burnImgArea.style.display = burnMode ? '' : 'none';
      if (!burnMode) { burnImageData = null; var prev = burnImgArea.querySelector('.burn-img-preview'); if (prev) prev.remove(); }
      // 首次开启提示一次
      if (burnMode && !localStorage.getItem(burnFirstShownKey)) {
        localStorage.setItem(burnFirstShownKey, '1');
        N.toast('阅后即焚仅在平台内销毁，无法阻止截图哦');
      }
    };
    function send() {
      var txt = input.value.trim();
      if (!txt) return;
      var r = N.Space.addMessage(spaceId, txt, { burnAfterRead: burnMode, image: burnImageData });
      if (!r.ok) { N.toastErr(r.err); return; }
      N.Onboard.clearHl();
      input.value = ''; btn.disabled = true;
      input.style.height = 'auto';
      // 清除图片预览
      burnImageData = null;
      var prev = burnImgArea.querySelector('.burn-img-preview');
      if (prev) prev.remove();
      burnFile.value = '';
      // 更新本地签名避免立即被轮询当成"变化"重复渲染
      var sp1 = N.Space.list()[spaceId];
      space = sp1;
      _lastMsgSig = _msgSig(sp1);
      // 重新渲染密语列表
      var list1 = sp1.messages || [];
      tabContent.innerHTML = list1.map(messageCard).join('');
      attachBurnHandlers();
      tabContent.scrollTop = tabContent.scrollHeight;
      // 喃呱自动回应（任何时候都触发，不仅限于教学）
      if (isNanguaPartner()) {
        if (!burnMode) {
          // 普通密语 → 喃呱 2-4s 后回复
          nanguaReplyMessage();
        } else if (r.message && r.message.burnAfterRead) {
          // 阅后即焚 → 喃呱 2s 后自动查看 → 变灰
          nanguaAutoViewBurn(r.message.id);
        }
      }
    }
    btn.onclick = send;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

    // 启动跨标签页轮询
    _startBurnPoller();

    // step3 教学：自动高亮密语输入框
    var spOb = N.Space.list()[spaceId];
    if (spOb && typeof spOb.onboardStep === 'number' && spOb.onboardStep === 3) {
      setTimeout(function () {
        // 重新读取当前 step，避免与 advanceOnboarding 的竞态（step 可能在 400ms 内已被推进到 4）
        var curSp = N.Space.list()[spaceId];
        if (!curSp || typeof curSp.onboardStep !== 'number' || curSp.onboardStep !== 3) return;
        var tabEl = document.querySelector('.tab[data-tab="secret"].onboard-hl');
        if (tabEl || !N.Onboard._hl) {
          N.Onboard.clearHl();
          N.Onboard.highlight(input);
          input.focus();
        }
      }, 400);
    }
    // step4 教学：高亮未读🔥消息或🔥开关
    if (spOb && typeof spOb.onboardStep === 'number' && spOb.onboardStep === 4) {
      setTimeout(function () {
        // 重新读取当前 step，避免竞态
        var curSp = N.Space.list()[spaceId];
        if (!curSp || typeof curSp.onboardStep !== 'number' || curSp.onboardStep !== 4) return;
        var tabEl = document.querySelector('.tab[data-tab="secret"].onboard-hl');
        if (tabEl || !N.Onboard._hl) {
          N.Onboard.clearHl();
          // 如果有喃呱发的未读🔥消息，高亮它；否则高亮🔥开关
          var unreadBurn = tabContent.querySelector('.msg.burn.unread[data-author="__nangua__"] .burn-bubble');
          if (unreadBurn) {
            N.Onboard.highlight(unreadBurn);
          } else {
            N.Onboard.highlight(burnBtn);
          }
        }
      }, 400);
    }
    setTimeout(function () { tabContent.scrollTop = tabContent.scrollHeight; }, 80);
  }

  /* ---------- 阅后即焚：渲染消息卡片（列表中只显示🔥图标，不显示文字/图片预览） ---------- */
  function messageCard(m) {
    if (m.system) {
      return '<div class="msg-system"><div class="msg-system-text">' + N.utils.escapeHtml(m.text) + '</div></div>';
    }
    var mine = m.author === me.username;
    // 时间显示（基于UTC+8）：当天 HH:MM，昨天 昨天 HH:MM，更早 M/D HH:MM
    var msgTime = fmtMsgTime(m.createdAt);
    // 阅后即焚消息
    if (m.burnAfterRead) {
      var viewed = m.burnStatus === 'read';
      var burnCls = 'msg burn' + (mine ? ' mine' : '') + (viewed ? ' viewed' : ' unread');
      var content = '<div class="burn-big-ico">' + BURN_ICON_SVG + '</div>' +
                    '<div class="burn-label">阅后即焚</div>';
      if (viewed) content += '<div class="burn-viewed-text">已查看</div>';
      // 接收方未读时气泡可点击（打开全屏查看弹窗）；其他情况不可点击
      var clickAttr = (!mine && !viewed) ? ' data-burn-msg="' + m.id + '"' : '';
      return '<div class="' + burnCls + '" data-msg="' + m.id + '" data-author="' + m.author + '">' +
        N.avatarHTML(m.author, 36) +
        '<div class="m-body">' +
          '<div class="m-meta"><span class="who">' + N.utils.escapeHtml(N.displayName(m.author)) + (mine ? ' · 我' : '') + '</span>' +
          '<span class="faint">' + msgTime + '</span></div>' +
          '<span class="bubble-bg burn-bubble"' + clickAttr + '>' + content + '</span>' +
        '</div></div>';
    }
    // 普通密语：永久保存，无删除按钮
    return '<div class="msg' + (mine ? ' mine' : '') + '" data-msg="' + m.id + '" data-author="' + m.author + '">' +
      N.avatarHTML(m.author, 36) +
      '<div class="m-body"><div class="m-meta"><span class="who">' + N.utils.escapeHtml(N.displayName(m.author)) + (mine ? ' · 我' : '') + '</span>' +
      '<span class="faint">' + N.utils.fmtTime(m.createdAt) + '</span></div>' +
      '<span class="bubble-bg"><span class="t">' + N.utils.escapeHtml(m.text) + '</span></span></div></div>';
  }

  /* ---------- 接收方点击未读🔥气泡 → 弹全屏查看弹窗 → 关闭后变灰 ---------- */
  function attachBurnHandlers() {
    tabContent.querySelectorAll('.burn-bubble[data-burn-msg]').forEach(function (el) {
      el.onclick = function () {
        var mid = el.dataset.burnMsg;
        openBurnViewer(mid);
      };
    });
  }
  /* 打开全屏查看弹窗：Instagram 限时动态样式，关闭后才算查看完成 */
  function openBurnViewer(msgId) {
    var sp = N.Space.list()[spaceId];
    if (!sp) return;
    var msg = null;
    for (var i = 0; i < sp.messages.length; i++) {
      if (sp.messages[i].id === msgId) { msg = sp.messages[i]; break; }
    }
    if (!msg || !msg.burnAfterRead || msg.burnStatus !== 'unread') return;

    // 图片源：优先 base64 (image)，其次路径 (imagePath)，兼容旧版 path 型（字符串存 image 字段非 base64 开头）
    var imgSrc = null;
    if (msg.image) {
      if (typeof msg.image === 'string' && (msg.image.indexOf('data:image/') === 0 || msg.image.indexOf('http') === 0 || msg.image.charAt(0) === '/')) {
        imgSrc = msg.image;
      }
    }
    if (!imgSrc && msg.imagePath) imgSrc = msg.imagePath;
    // 兜底：如果 image 字段是相对路径（如 images/burn/xxx.png）也直接使用
    if (!imgSrc && msg.image && typeof msg.image === 'string' && msg.image.indexOf('data:') < 0) imgSrc = msg.image;

    var senderName = N.displayName(msg.author);
    var timeText = fmtMsgTime(msg.createdAt);

    var viewer = document.createElement('div');
    viewer.className = 'burn-viewer';
    viewer.innerHTML =
      '<div class="bv-card">' +
        '<div class="bv-header">' +
          '<span class="bv-time">' + N.utils.escapeHtml(timeText) + '</span>' +
          '<span class="bv-sender">' + N.utils.escapeHtml(senderName) + '</span>' +
          '<button class="bv-close" type="button" aria-label="关闭">×</button>' +
        '</div>' +
        '<div class="bv-body">' +
          (imgSrc
            ? '<div class="bv-img-wrap"><img class="bv-img" src="' + imgSrc + '" alt="" data-bvimg="1"></div>'
            : '<div class="bv-img-placeholder">无图片</div>') +
          (msg.text ? '<div class="bv-text">' + N.utils.escapeHtml(msg.text) + '</div>' : '') +
        '</div>' +
      '</div>';

    var app = document.querySelector('.app') || document.body;
    app.appendChild(viewer);

    // 图片加载失败：替换为占位图（灰色背景 + "图片加载失败"文字）
    var imgEl = viewer.querySelector('.bv-img');
    if (imgEl) {
      imgEl.onerror = function () {
        var wrap = imgEl.parentNode;
        if (wrap) {
          wrap.innerHTML = '<div class="bv-img-placeholder">图片加载失败</div>';
        }
      };
    }

    function closeViewer() {
      if (viewer.parentNode) viewer.parentNode.removeChild(viewer);
      markBurnRead(msgId);
    }
    viewer.querySelector('.bv-close').onclick = closeViewer;
    viewer.onclick = function (e) { if (e.target === viewer) closeViewer(); };
  }
  /* 标记消息已查看：仅更新 burnStatus='read'，无倒计时，无销毁 */
  function markBurnRead(msgId) {
    var sp = N.Space.list()[spaceId];
    if (!sp) return;
    for (var i = 0; i < sp.messages.length; i++) {
      var m = sp.messages[i];
      if (m.id === msgId && m.burnAfterRead) {
        var wasUnread = m.burnStatus === 'unread';
        var authorIsNangua = m.author === NANGUA;
        m.burnStatus = 'read';
        m.readAt = Date.now();
        N.Space.save(sp);
        space = sp;
        _lastMsgSig = _msgSig(sp);
        // 重新渲染密语列表
        var list = sp.messages || [];
        tabContent.innerHTML = list.map(messageCard).join('');
        attachBurnHandlers();
        // 教学推进：step4 用户查看喃呱的阅后即焚消息后，弹提示让用户自己发一条
        var curStep = (typeof sp.onboardStep === 'number') ? sp.onboardStep : -1;
        if (wasUnread && curStep === 4 && authorIsNangua) {
          setTimeout(function () {
            N.Onboard.showPopup({
              text: '看到啦？现在轮到你啦！\n点输入框左边的🔥按钮，写一句话发给喃呱吧（也可选张图）',
              buttonText: '好的',
              onSkip: function () { N.Onboard.skip(spaceId); },
              onNext: function () {
                var bt = document.querySelector('#burnToggle');
                if (bt) N.Onboard.highlight(bt);
              }
            });
          }, 200);
        }
        return;
      }
    }
  }

  /* ---------- 喃呱 bot 自动查看阅后即焚消息（2s 后） ---------- */
  function nanguaAutoViewBurn(msgId) {
    if (!isNanguaPartner()) return;
    setTimeout(function () {
      var sp = N.Space.list()[spaceId];
      if (!sp) return;
      for (var i = 0; i < sp.messages.length; i++) {
        if (sp.messages[i].id === msgId && sp.messages[i].burnAfterRead && sp.messages[i].burnStatus === 'unread') {
          sp.messages[i].burnStatus = 'read';
          sp.messages[i].readAt = Date.now();
          N.Space.save(sp);
          space = sp;
          _lastMsgSig = _msgSig(sp);
          // 重新渲染密语列表（用户作为发送方，看到"已查看"灰色气泡）
          var list = sp.messages || [];
          tabContent.innerHTML = list.map(messageCard).join('');
          attachBurnHandlers();
          // 教学推进：step4 喃呱查看用户发的阅后即焚消息后 → 弹总结 → step5
          var curStep = (typeof sp.onboardStep === 'number') ? sp.onboardStep : -1;
          if (curStep === 4) {
            setTimeout(function () {
              N.Onboard.showPopup({
                text: '看到了吗？阅后即焚的消息被查看后就会变灰，再也打不开了，适合说些小秘密哦',
                buttonText: '好的',
                onSkip: function () { N.Onboard.skip(spaceId); },
                onNext: function () {
                  // 自动关闭🔥开关并清空图片预览
                  burnMode = false;
                  var bt = document.querySelector('#burnToggle');
                  if (bt) bt.classList.remove('active');
                  var mi = document.querySelector('#msgInput');
                  if (mi) { mi.classList.remove('burn-mode'); mi.placeholder = '写点什么留给TA…'; }
                  var bi = document.querySelector('#burnImgArea');
                  if (bi) bi.style.display = 'none';
                  burnImageData = null;
                  advanceOnboarding(4);
                }
              });
            }, 200);
          }
          return;
        }
      }
    }, 2000);
  }

  /* ============================================================
   * 邀约：送花 / 兑现卡 / 聊一聊邀请
   * ============================================================ */
  var INV_META = {
    flower: { name: '送花', icon: 'heart' },
    card: { name: '兑现卡', icon: 'sparkle' },
    chat: { name: '聊一聊', icon: 'chat' }
  };
  function renderInvitations() {
    var invs = (space.invitations || []).slice();
    invs.sort(function (a, b) { return b.createdAt - a.createdAt; });
    var listHTML;
    if (!invs.length) {
      listHTML = emptyHTML('blessed', '还没有邀约', '送花、兑现卡或聊一聊邀请，传递心意');
    } else {
      listHTML = '<div class="invitation-list">' + invs.map(invitationCard).join('') + '</div>';
    }
    tabContent.innerHTML = listHTML;
    // 绑定接受/拒绝按钮
    tabContent.querySelectorAll('[data-inv]').forEach(function (el) {
      var id = el.dataset.inv;
      var acceptBtn = el.querySelector('[data-act="accept"]');
      var rejectBtn = el.querySelector('[data-act="reject"]');
      if (acceptBtn) acceptBtn.onclick = function () { doActInvitation(id, 'accepted'); };
      if (rejectBtn) rejectBtn.onclick = function () { doActInvitation(id, 'rejected'); };
    });
    // 底部三个操作按钮（inv-mode：左右 16px 边距，按钮等宽、高 48px、圆角 12px、单行文字）
    bottomBar.classList.remove('hidden');
    bottomBar.classList.add('inv-mode');
    bottomBar.innerHTML =
      '<div class="invitation-actions">' +
      '<button class="btn btn-ghost inv-btn" data-type="flower" id="sendFlower">' + N.icon('heart') + '送花</button>' +
      '<button class="btn btn-ghost inv-btn" data-type="card" id="sendCard">' + N.icon('sparkle') + '兑现卡</button>' +
      '<button class="btn btn-ghost inv-btn" data-type="chat" id="sendChat">' + N.icon('chat') + '聊一聊</button>' +
      '</div>';
    bottomBar.querySelector('#sendFlower').onclick = function () { openInvitationForm('flower'); };
    bottomBar.querySelector('#sendCard').onclick = function () { openInvitationForm('card'); };
    bottomBar.querySelector('#sendChat').onclick = function () { openInvitationForm('chat'); };
    // 教学step5/6：用户自己切到邀约Tab后，立即（无延迟）高亮对应的邀约按钮（送花/聊一聊）
    var spOb = N.Space.list()[spaceId];
    if (spOb && typeof spOb.onboardStep === 'number') {
      var obStep = spOb.onboardStep;
      // 清除之前对 Tab 按钮的高亮，改为高亮具体邀约按钮
      N.Onboard.clearHl();
      if (obStep === 5) {
        var fBtn = bottomBar.querySelector('#sendFlower');
        if (fBtn) N.Onboard.highlight(fBtn);
      } else if (obStep === 6) {
        var cBtn = bottomBar.querySelector('#sendChat');
        if (cBtn) N.Onboard.highlight(cBtn);
      }
    }
  }
  function invitationCard(inv) {
    var meta = INV_META[inv.type] || { name: '邀约', icon: 'sparkle' };
    var fromName = N.displayName(inv.fromUsername);
    var isFromMe = inv.fromUsername === me.username;
    var toMe = inv.toUsername === me.username;
    var statusMeta = {
      pending: { text: '待处理', cls: 'st-pending' },
      accepted: { text: '已接受', cls: 'st-accepted' },
      rejected: { text: '已拒绝', cls: 'st-rejected' }
    }[inv.status] || { text: inv.status, cls: '' };

    var receiveHint = '';
    if (toMe && inv.status === 'pending') {
      if (inv.type === 'flower') receiveHint = N.utils.escapeHtml(fromName) + ' 向你送出一束鲜花';
      else if (inv.type === 'card') receiveHint = N.utils.escapeHtml(fromName) + ' 向你发来一张兑现卡心愿';
      else if (inv.type === 'chat') receiveHint = N.utils.escapeHtml(fromName) + ' 邀请你来一次深度对话';
    }
    var actions = '';
    if (toMe && inv.status === 'pending') {
      actions = '<div class="inv-actions">' +
        '<button class="btn btn-ghost btn-sm" data-act="reject">拒绝</button>' +
        '<button class="btn btn-sm" data-act="accept">接受</button>' +
        '</div>';
    }
    return '<div class="inv-card" data-inv="' + inv.id + '">' +
      '<div class="inv-head">' +
        '<div class="inv-ico">' + N.icon(meta.icon) + '</div>' +
        '<div class="inv-title">' + N.utils.escapeHtml(meta.name) + '</div>' +
        '<div class="inv-status ' + statusMeta.cls + '">' + statusMeta.text + '</div>' +
      '</div>' +
      '<div class="inv-meta">' +
        '<span class="muted">' + (isFromMe ? '由我发起' : '来自 ' + N.utils.escapeHtml(fromName)) + '</span>' +
        '<span class="faint">· ' + N.utils.fmtTime(inv.createdAt) + '</span>' +
      '</div>' +
      (inv.message ? '<div class="inv-msg">' + N.utils.escapeHtml(inv.message) + '</div>' : '') +
      (receiveHint ? '<div class="inv-hint">' + receiveHint + '</div>' : '') +
      actions +
      '</div>';
  }
  var INV_EFFECT_TOAST = {
    flower: '对方接受了你的送花邀请',
    card:   '对方接受了你的兑现卡邀请',
    chat:   '对方接受了你的聊一聊邀请'
  };
  // 检查空间数据里的 lastEffect，如比本地记录更新，就播放特效
  function checkEffect(newSpace) {
    if (!newSpace) return;
    var le = newSpace.lastEffect;
    if (!le || !le.type || !le.time) return;
    if (le.time > lastPlayedEffectTime) {
      lastPlayedEffectTime = le.time;
      N.playEffect(le.type);
      // 若是 accepted 场景：如果当前用户是该邀约的发起方，额外 Toast 提示"对方接受了你的…邀请"
      var invs = newSpace.invitations || [];
      for (var i = 0; i < invs.length; i++) {
        var iv = invs[i];
        if (iv.status === 'accepted' && iv.respondedAt && iv.type === le.type) {
          // 用 respondedAt 约等于 lastEffect.time 来匹配（同秒级即可）
          if (Math.abs(iv.respondedAt - le.time) < 2000 && iv.fromUsername === me.username) {
            N.toast(INV_EFFECT_TOAST[iv.type] || '对方接受了你的邀约');
            break;
          }
        }
      }
    }
  }
  function doActInvitation(invId, action) {
    // 先读取邀约详情，确认是自己要接受的场景
    var inv = null;
    for (var i = 0; i < (space.invitations || []).length; i++) {
      if (space.invitations[i].id === invId) { inv = space.invitations[i]; break; }
    }
    // 接受方：立即播放特效（accepted 才播；rejected 不播）
    var playFirst = Promise.resolve();
    if (inv && action === 'accepted') {
      playFirst = N.playEffect(inv.type) || Promise.resolve();
    }
    playFirst.then(function () {
      var r = N.Space.actInvitation(spaceId, invId, action);
      if (!r.ok) { N.toastErr(r.err); return; }
      // 写入后更新本页 lastEffect，避免重复触发自己
      var latest = N.Space.list()[spaceId];
      if (latest && latest.lastEffect && latest.lastEffect.time > lastPlayedEffectTime) {
        lastPlayedEffectTime = latest.lastEffect.time;
      }
      N.toastOk(action === 'accepted' ? '已接受' : '已拒绝');
      // 聊一聊邀请被接受 → 跳转到密语 Tab，并显示系统提示
      if (r.invitation && r.invitation.type === 'chat' && action === 'accepted') {
        reload();
        setTimeout(function () {
          switchTab('secret');
          N.toast('已开启深度对话');
          setTimeout(function () { tabContent.scrollTop = tabContent.scrollHeight; }, 100);
        }, 200);
      } else {
        reload();
      }
    });
  }
  function openInvitationForm(type) {
    if (space.members.length < 2) { N.toastErr('空间尚未满员，无法发起'); return; }
    var meta = {
      flower: { title: '送出鲜花心意', placeholder: '写下想附带说的话（选填）', btn: '发送送花邀约', hint: '' },
      card: { title: '发起兑现卡', placeholder: '填写想要对方完成的心愿', btn: '发送兑现卡邀约', hint: '例：陪我散步、一次拥抱' },
      chat: { title: '发起聊一聊邀请', placeholder: '想和对方聊聊的话题（选填）', btn: '发送聊天邀约', hint: '邀请对方开启一次深度对话' }
    }[type];
    var s = N.openSheet({
      title: meta.title,
      html:
        '<div class="field"><textarea class="textarea" id="invMsg" placeholder="' + N.utils.escapeHtml(meta.placeholder) + '" maxlength="60"></textarea>' +
        (meta.hint ? '<div class="field-hint"><span class="muted">' + N.utils.escapeHtml(meta.hint) + '</span></div>' : '') +
        '</div>' +
        '<div class="row" style="gap:10px">' +
        '<button class="btn btn-ghost" id="invCancel">取消</button>' +
        '<button class="btn" id="invSend">' + N.utils.escapeHtml(meta.btn) + '</button>' +
        '</div>'
    });
    var ta = s.sheet.querySelector('#invMsg');
    s.sheet.querySelector('#invCancel').onclick = function () { s.close(); };
    s.sheet.querySelector('#invSend').onclick = function () {
      // 发送方：先预检查（避免无意义特效），立即播放特效，然后写入数据
      var text = ta.value;
      var user = N.Auth.currentUser();
      if (!user || space.members.length < 2) { N.toastErr('空间尚未满员，无法发起'); return; }
      var ivs = space.invitations || [];
      for (var j = 0; j < ivs.length; j++) {
        if (ivs[j].type === type && ivs[j].fromUsername === user.username && ivs[j].status === 'pending') {
          N.toastErr('对方还有未处理的邀约');
          return;
        }
      }
      // 1. 播放发送特效（flower/card/chat）
      N.playEffect(type);
      var r = N.Space.createInvitation(spaceId, type, text);
      if (!r.ok) { N.toastErr(r.err); return; }
      var latest = N.Space.list()[spaceId];
      if (latest && latest.lastEffect && latest.lastEffect.time > lastPlayedEffectTime) {
        lastPlayedEffectTime = latest.lastEffect.time;
      }
      // 2. 邀约卡片显示"待处理"，顶部 toast 提示
      var sendToast = isNanguaPartner() ? '已发送，等待喃呱接受中...' : '已发送，等待对方回应';
      N.toastOk(sendToast);
      // 发送成功后立即关闭弹窗，让用户看到"待处理"状态
      s.close();
      reload();
      // 3. 喃呱 2~3 秒后自动回应（触发接受/拒绝特效 + 状态变化）
      nanguaScheduleInviteResponse(r.invitation.id, type);
    };
  }

  /* ============================================================
   * 情绪日历（修复：格子显示双人表情，点击→弹窗选情绪）
   * 月份范围：最小=当前月（calRef 初值 today），最大=2026年12月
   * ============================================================ */
  var calRef = new Date();
  var CAL_MAX = new Date(2026, 11, 1); // 2026年12月（月份从0开始）
  function renderCalendar() {
    var year = calRef.getFullYear(), month = calRef.getMonth();
    var first = new Date(year, month, 1);
    var lead = first.getDay(); lead = lead === 0 ? 6 : lead - 1; // 周一起
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var dows = ['一', '二', '三', '四', '五', '六', '日'];
    var cells = '';
    dows.forEach(function (d) { cells += '<div class="dow">' + d + '</div>'; });
    for (var i = 0; i < lead; i++) cells += '<div class="cal-cell mute"></div>';
    var todayStr = N.utils.ymd(new Date());
    var other = space.members.filter(function (m) { return m !== me.username; })[0];
    for (var day = 1; day <= daysInMonth; day++) {
      var dateStr = N.utils.ymd(new Date(year, month, day));
      var dayData = space.calendar[dateStr] || {};
      var myE = dayData[me.username];
      var otherE = other ? dayData[other] : null;
      var emos = [];
      if (myE) emos.push('<div class="emo" title="我">' + N.emoSvg(myE) + '</div>');
      if (otherE) emos.push('<div class="emo" title="搭档">' + N.emoSvg(otherE) + '</div>');
      var emosHtml = emos.length ? '<div class="cal-emos">' + emos.join('') + '</div>' : '';
      var cls = 'cal-cell' + (dateStr === todayStr ? ' today' : '');
      cells += '<div class="' + cls + '" data-date="' + dateStr + '">' +
               '<div class="d">' + day + '</div>' + emosHtml + '</div>';
    }
    // 是否到达上限/下限
    var atMax = year === CAL_MAX.getFullYear() && month === CAL_MAX.getMonth();
    var atMin = year === new Date().getFullYear() && month === new Date().getMonth();
    tabContent.innerHTML =
      '<div class="cal-head"><button class="cal-nav' + (atMin ? ' disabled' : '') + '" id="calPrev"' + (atMin ? ' disabled' : '') + '>' + N.icon('chevronLeft') + '</button>' +
      '<div class="ym">' + year + '年' + (month + 1) + '月</div>' +
      '<button class="cal-nav' + (atMax ? ' disabled' : '') + '" id="calNext"' + (atMax ? ' disabled' : '') + '>' + N.icon('chevronRight') + '</button></div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '<div class="muted small center" style="margin:12px 0">点击日期可查看详情、标记情绪</div>';
    var prevBtn = tabContent.querySelector('#calPrev');
    var nextBtn = tabContent.querySelector('#calNext');
    if (prevBtn && !atMin) prevBtn.onclick = function () { calRef = new Date(year, month - 1, 1); renderCalendar(); };
    if (nextBtn && !atMax) nextBtn.onclick = function () { calRef = new Date(year, month + 1, 1); renderCalendar(); };
    tabContent.querySelectorAll('.cal-cell[data-date]').forEach(function (c) {
      c.onclick = function () { openDayModal(c.dataset.date); };
    });
    bottomBar.classList.add('hidden');
  }
  function openDayModal(dateStr) {
    var other = space.members.filter(function (m) { return m !== me.username; })[0];
    var pickEmo = function () {
      var data = space.calendar[dateStr] || {};
      return data[me.username] || null;
    };
    function refreshSheet(s) {
      var myE = pickEmo();
      var data = space.calendar[dateStr] || {};
      var oE = other ? data[other] : null;
      var emosRow = N.EMOTIONS.map(function (e) {
        return '<div class="emo-opt ' + (myE === e.id ? 'sel' : '') + '" data-emo="' + e.id + '" title="' + e.name + '">' +
          '<div class="emo">' + N.emoSvg(e.id) + '</div>' +
          '<div class="ename">' + e.name + '</div>' +
          '</div>';
      }).join('');
      // 心情日记列表：显示自己的全部 + 对方的共享日记
      var sp2 = N.Space.list()[spaceId];
      var dayDiaries = (sp2 && sp2.diaries && sp2.diaries[dateStr]) ? sp2.diaries[dateStr] : [];
      var visibleDiaries = dayDiaries.filter(function (d) {
        return d.author === me.username || !d.isPrivate;
      });
      var diariesHTML = visibleDiaries.length ? visibleDiaries.map(function (d) {
        var isMine = d.author === me.username;
        var who = N.displayName(d.author);
        var tag = (isMine && d.isPrivate) ? '<span class="di-tag">仅自己可见</span>' : '';
        return '<div class="diary-item">' +
          '<div class="di-head">' + N.avatarHTML(d.author, 20) +
          '<span class="who">' + N.utils.escapeHtml(who) + (isMine ? ' · 我' : '') + '</span>' + tag +
          '<span class="when">' + N.utils.fmtTime(d.createdAt) + '</span></div>' +
          '<div class="di-text">' + N.utils.escapeHtml(d.text) + '</div>' +
        '</div>';
      }).join('') : '<div class="diary-empty">还没有日记，给今天写一句吧～</div>';
      var dd = new Date(dateStr + 'T00:00:00');
      var wk = '日一二三四五六'[dd.getDay()];
      var sheetContent =
        '<div class="section-title" style="margin-top:0">' + (dd.getMonth() + 1) + '月' + dd.getDate() + '日 · 周' + wk + '</div>' +
        '<div class="card">' +
        '<div class="row" style="justify-content:space-around;margin-bottom:8px">' +
        '<div class="center">' + N.avatarHTML(me.username, 40) + '<div class="small" style="margin-top:4px;font-weight:600;color:var(--ink)">你的心情</div>' +
          (myE ? '<div class="emo" style="width:30px;height:30px;margin:6px auto 0">' + N.emoSvg(myE) + '</div>' : '<div class="small faint center" style="margin-top:6px">未标记</div>') + '</div>' +
        (other ? '<div class="center">' + N.avatarHTML(other, 40) +
          '<div class="small" style="margin-top:4px;font-weight:600;color:var(--ink)">' + (other === NANGUA ? '喃呱的心情' : (N.utils.escapeHtml(N.displayName(other).slice(0, 4)) + '的心情')) + '</div>' +
          (oE ? '<div style="position:relative;display:inline-block;margin:6px auto 0">' +
              '<div class="emo" style="width:30px;height:30px">' + N.emoSvg(oE) + '</div>' +
              (other === NANGUA ? '<span class="nangua-tag" title="喃呱">呱</span>' : '') +
            '</div>' : '<div class="small faint center" style="margin-top:6px">未标记</div>') +
        '</div>' : '') +
        '</div></div>' +
        '<div class="section-title">我的心情（点击切换，再点取消）</div>' +
        '<div class="day-emo-row">' + emosRow + '</div>' +
        '<div class="diary-section">' +
        '<div class="section-title">心情日记</div>' +
        '<div class="diary-list">' + diariesHTML + '</div>' +
        '<div class="diary-toggle-row">' +
          '<div class="diary-switch" id="diarySwitch"><div class="knob"></div></div>' +
          '<span class="diary-toggle-label" id="diaryToggleLabel">私密日记（仅自己可见）</span>' +
        '</div>' +
        '<textarea class="diary-textarea" id="diaryInput" placeholder="给今天写一句话吧～" maxlength="100"></textarea>' +
        '<button class="diary-save-btn" id="diarySaveBtn">保存日记</button>' +
        '</div>';
      // 只更新 sheet-body 内容，保留 sheet-head（含关闭按钮）
      var bodyEl = s.sheet.querySelector('.sheet-body');
      if (bodyEl) bodyEl.innerHTML = sheetContent;
      else s.sheet.innerHTML = '<div class="sheet-body">' + sheetContent + '</div>';
      // 情绪选择
      s.sheet.querySelectorAll('.day-emo-row .emo-opt').forEach(function (o) {
        o.onclick = function () {
          var next = (pickEmo() === o.dataset.emo) ? null : o.dataset.emo;
          N.Space.setCalendar(spaceId, dateStr, next);
          space = N.Space.list()[spaceId];
          N.toastOk(next ? '已标记情绪' : '已取消标记');
          refreshSheet(s);
          renderCalendar();
          // 喃呱跟随标记：搭档为喃呱且用户刚选了情绪（非取消）时触发
          // 边界：同一日期喃呱已标记过的不再重复；用户改情绪不重复触发；非喃呱搭档不触发
          if (next && isNanguaPartner()) {
            var spMark = N.Space.list()[spaceId];
            var already = spMark && spMark.calendar && spMark.calendar[dateStr] && spMark.calendar[dateStr][NANGUA];
            if (!already) {
              var delay = 1000 + Math.floor(Math.random() * 1000); // 1-2 秒"思考"延迟
              setTimeout(function () {
                var rand = N.EMOTIONS[Math.floor(Math.random() * N.EMOTIONS.length)];
                var sp4 = N.Space.list()[spaceId];
                // 二次判断，避免极端并发下喃呱重复标记
                if (sp4 && sp4.calendar && sp4.calendar[dateStr] && sp4.calendar[dateStr][NANGUA]) return;
                sp4.calendar = sp4.calendar || {};
                sp4.calendar[dateStr] = sp4.calendar[dateStr] || {};
                sp4.calendar[dateStr][NANGUA] = rand.id;
                N.Space.save(sp4);
                space = sp4;
                refreshSheet(s);
                renderCalendar();
                N.toastOk('喃呱也标记了今天的心情～');
              }, delay);
            }
          }
          // 新手教学 step 7：标记今天的心情 → 喃呱同日2s后自动标记 → 确认双方图标 → 引导写日记
          // 注意：跟随标记逻辑已在上方处理（含一次性判断），step7 专属的教学弹窗流程保留在此
          if (next && dateStr === N.utils.ymd(new Date())) {
            var spOb7 = N.Space.list()[spaceId];
            if (isNanguaPartner() && spOb7 && typeof spOb7.onboardStep === 'number' && spOb7.onboardStep === 7) {
              setTimeout(function () {
                // 若喃呱在上方跟随逻辑尚未标记（极短竞态兜底），这里确保已有标记
                var sp3 = N.Space.list()[spaceId];
                if (!sp3.calendar || !sp3.calendar[dateStr] || !sp3.calendar[dateStr][NANGUA]) {
                  var rand = N.EMOTIONS[Math.floor(Math.random() * N.EMOTIONS.length)];
                  sp3.calendar = sp3.calendar || {};
                  sp3.calendar[dateStr] = sp3.calendar[dateStr] || {};
                  sp3.calendar[dateStr][NANGUA] = rand.id;
                  N.Space.save(sp3);
                  space = sp3;
                  refreshSheet(s);
                  renderCalendar();
                }
                // 确认弹窗：用户看到双方情绪图标，然后引导写日记（不直接推进）
                setTimeout(function () {
                  N.Onboard.showPopup({
                    text: '看到两个人的心情了吗～每天的情绪都会互相看见哦',
                    buttonText: '下一步',
                    onSkip: function () { N.Onboard.skip(spaceId); },
                    onNext: function () {
                      // 不直接推进，先引导写心情日记
                      // 注意：showPopup 内部会 clearHl，所以这里先不 highlight
                      setTimeout(function () {
                        N.Onboard.showPopup({
                          text: '今天心情怎么样？写一句心情日记吧～\n默认是私密的，只有你自己能看见哦',
                          buttonText: '好的',
                          onSkip: function () { N.Onboard.skip(spaceId); },
                          onNext: function () {
                            var ta2 = s.sheet.querySelector('#diaryInput');
                            if (ta2) { N.Onboard.highlight(ta2); ta2.focus(); }
                          }
                        });
                      }, 300);
                    }
                  });
                }, 800);
              }, 2000);
            } else {
              advanceOnboarding(7);
            }
          }
        };
      });
      // 心情日记：私密/共享开关
      var switchEl = s.sheet.querySelector('#diarySwitch');
      var labelEl = s.sheet.querySelector('#diaryToggleLabel');
      var diaryPrivate = true; // 默认私密
      if (switchEl) {
        switchEl.onclick = function () {
          diaryPrivate = !diaryPrivate;
          switchEl.classList.toggle('on', !diaryPrivate);
          if (labelEl) {
            labelEl.textContent = diaryPrivate ? '私密日记（仅自己可见）' : '共享日记（对方可见）';
          }
        };
      }
      // 心情日记：保存
      var saveBtn = s.sheet.querySelector('#diarySaveBtn');
      var diaryInput = s.sheet.querySelector('#diaryInput');
      if (saveBtn && diaryInput) {
        saveBtn.onclick = function () {
          var text = diaryInput.value.trim();
          if (!text) { N.toastErr('写点什么再保存吧'); return; }
          var r = N.Space.saveDiary(spaceId, dateStr, text, diaryPrivate);
          if (!r.ok) { N.toastErr(r.err); return; }
          N.toastOk(diaryPrivate ? '日记已保存（仅自己可见）' : '日记已保存（对方可见）');
          space = N.Space.list()[spaceId];
          // 新手教学 step 7：保存第一条日记后推进到 step 8（周报）
          var spOb7b = N.Space.list()[spaceId];
          if (spOb7b && typeof spOb7b.onboardStep === 'number' && spOb7b.onboardStep === 7) {
            s.close(); // 自动关闭日历弹窗
            advanceOnboarding(7); // 7 → 8
          } else {
            refreshSheet(s);
          }
        };
      }
    }
    var s = N.openSheet({ title: '当日详情', html: '<div class="sheet-body"><div class="center muted small" style="padding:30px 0">加载中…</div></div>' });
    // 需要先把 sheet.body 的 HTML 取出来作为可被 refreshSheet 覆盖的外层，
    // 但 openSheet 返回的 sheet-body 已经是 s.sheet 内容，所以直接调用即可。
    refreshSheet(s);
  }

  /* ============================================================
   * 周报
   * ============================================================ */
  function renderReport() {
    var reports = N.Space.listReports(spaceId);
    var thisWeek = N.utils.startOfWeek(new Date());
    var weekStartTs = thisWeek.getTime();
    var cur = N.Space.getReport(spaceId, weekStartTs);
    var stats = N.Space.statsForWeek(spaceId, weekStartTs);
    var wr = N.utils.weekRange(new Date());
    var rangeStr = N.utils.fmtDate(wr.start.getTime()) + ' ~ ' + N.utils.fmtDate(wr.end.getTime());
    var editableText = cur ? cur.text : templateText(stats);

    var emosRow = (stats.topEmos.length ? stats.topEmos : N.EMOTIONS.slice(0, 3).map(function (e) { return { id: e.id, count: 0 }; })).map(function (e) {
      return '<div class="pe"><div class="emo">' + N.emoSvg(e.id) + '</div><div class="c">' + N.emoName(e.id) + ' ' + e.count + '</div></div>';
    }).join('');

    // 动态标题：用户A 和 用户B 的情绪周报（按 members 顺序：创建者在前，受邀者在后）
    var memberNames = (space.members || []).slice(0, 2).map(function (m) {
      var u = N.Auth.getUser(m);
      return u ? (u.nickname || u.username) : m;
    });
    var titleText = memberNames.length >= 2
      ? memberNames[0] + ' 和 ' + memberNames[1] + '的情绪周报'
      : (memberNames[0] || '我') + '的情绪周报';
    var titleFontSize = titleText.length > 12 ? '16px' : '20px';

    tabContent.innerHTML =
      '<div class="section-title">本周周报</div>' +
      '<div id="poster" class="poster">' +
      '<div class="p-avatars">' + space.members.map(function (m) { return '<span class="avatar" style="width:28px;height:28px;border:2px solid #ECE7F3">' + N.avatarSvg((N.Auth.getUser(m) || {}).avatar) + '</span>'; }).join('') + '</div>' +
      '<div class="p-brand">喃 言</div>' +
      '<div class="p-title" style="font-size:' + titleFontSize + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + N.utils.escapeHtml(titleText) + '</div>' +
      '<div class="p-range">' + rangeStr + '</div>' +
      '<div class="p-stat-grid">' +
      '<div class="p-stat"><div class="n">' + stats.bubbles + '</div><div class="l">情绪泡泡</div></div>' +
      '<div class="p-stat"><div class="n">' + stats.messages + '</div><div class="l">密语</div></div>' +
      '<div class="p-stat"><div class="n">' + stats.invitations + '</div><div class="l">邀约</div></div>' +
      '<div class="p-stat"><div class="n">' + (stats.bubbles + stats.messages) + '</div><div class="l">轻声次数</div></div>' +
      '</div>' +
      '<div class="p-emos" id="pEmos">' + emosRow + '</div>' +
      '<div class="p-quote" id="pQuote" contenteditable="true">' + N.utils.escapeHtml(editableText) + '</div>' +
      '<div class="p-foot">有些话，轻轻说 · 喃言</div>' +
      '</div>' +
      '<div class="row mt16" style="gap:10px"><button class="btn btn-ghost" id="rReset">' + N.icon('edit') + '重新生成文案</button>' +
      '<button class="btn" id="rSave">保存周报</button></div>' +
      '<div class="row mt8" style="gap:10px"><button class="btn btn-ghost" id="rExport">' + N.icon('image') + '生成海报</button></div>' +
      '<div class="section-title">历史周报</div>' +
      '<div id="reportHistory"></div>' +
      '<div class="divider" style="margin:26px 0 10px"></div>' +
      '<div class="section-title center" style="font-weight:700;margin:14px 0 8px">我们的记录</div>' +
      '<div id="timelineBox"></div>' +
      '<div class="section-title center" style="font-weight:700;margin:14px 0 8px">我的记录</div>' +
      '<div id="myDiaryBox"></div>';
    tabContent.querySelector('#rReset').onclick = function () {
      tabContent.querySelector('#pQuote').textContent = templateText(stats);
      N.toast('已重置文案');
    };
    tabContent.querySelector('#rSave').onclick = function () {
      var text = tabContent.querySelector('#pQuote').textContent.trim();
      N.Space.saveReport(spaceId, { weekStart: weekStartTs, weekEnd: wr.end.getTime(), stats: stats, text: text });
      N.toastOk('周报已保存');
      renderReport();
    };
    tabContent.querySelector('#rExport').onclick = exportPoster;
    renderHistory();
    renderTimeline();
    renderMyDiary();

    function renderMyDiary() {
      var box = tabContent.querySelector('#myDiaryBox');
      if (!box) return;
      // 周报时间范围：本周周一 ~ 周日；日记按日期字符串(YYYY-MM-DD)存储，直接字符串比较即可覆盖整周
      var wr = N.utils.weekRange(new Date());
      var startStr = N.utils.ymd(wr.start);
      var endStr = N.utils.ymd(wr.end);
      // 直接读取 localStorage 最新数据，避免 in-scope space 变量过期
      var sp = N.Space.list()[spaceId];
      var diaries = (sp && sp.diaries) ? sp.diaries : {};
      var count = 0;
      Object.keys(diaries).forEach(function (dateStr) {
        if (dateStr >= startStr && dateStr <= endStr) {
          (diaries[dateStr] || []).forEach(function (d) {
            if (d && d.author === me.username) count++;
          });
        }
      });
      box.innerHTML =
        '<div class="report-card" style="cursor:default;display:flex;align-items:center;gap:12px">' +
          '<span style="width:34px;height:34px;border-radius:10px;background:var(--fog-soft);color:var(--fog-dark);display:flex;align-items:center;justify-content:center">' + N.icon('doc') + '</span>' +
          '<span style="font-size:14px;color:var(--ink)">本周写了 <b style="color:var(--fog-dark);font-size:18px;margin:0 2px">' + count + '</b> 条心情日记</span>' +
        '</div>';
    }

    function renderHistory() {
      var box = tabContent.querySelector('#reportHistory');
      var list = reports.filter(function (r) { return r.weekStart !== weekStartTs; });
      if (!list.length) { box.innerHTML = '<div class="center faint small" style="padding:14px 0">还没有历史周报</div>'; return; }
      box.innerHTML = list.map(function (r) {
        var range = N.utils.fmtDate(r.weekStart) + ' ~ ' + N.utils.fmtDate(r.weekEnd);
        return '<div class="report-card" data-ws="' + r.weekStart + '"><div><div class="r-range">' + range + '</div>' +
          '<div class="r-sub">' + N.utils.escapeHtml((r.text || '').slice(0, 30) + ((r.text || '').length > 30 ? '…' : '')) + '</div></div>' +
          '<span class="muted">' + N.icon('chevronRight') + '</span></div>';
      }).join('');
      box.querySelectorAll('.report-card').forEach(function (c) {
        c.onclick = function () { openHistoryReport(Number(c.dataset.ws)); };
      });
    }
    function exportPoster() {
      // 跳转到独立海报预览页：用户直接截图保存（不再走 html2canvas / 弹窗预览）
      if (!spaceId) { N.toastErr('空间参数缺失'); return; }
      var url = 'poster.html?id=' + encodeURIComponent(spaceId);
      console.log('生成海报 → 跳转', url);
      window.location.href = url;
    }

    function renderTimeline() {
      var box = tabContent.querySelector('#timelineBox');
      if (!box) return;
      var recs = {};
      function ensure(d) {
        if (!recs[d]) recs[d] = { date: d, msg: 0, inv: 0, bub: 0, events: [] };
        return recs[d];
      }
      // 聚合密语（排除阅后即焚，焚毁后无痕迹）
      (space.messages || []).forEach(function (m) {
        if (m.burnAfterRead) return;
        try {
          var d = N.utils.ymd(new Date(m.createdAt));
          ensure(d).msg++;
        } catch (e) {}
      });
      // 聚合邀约
      var firstFlower = null, firstChat = null;
      (space.invitations || []).forEach(function (inv) {
        try {
          var d = N.utils.ymd(new Date(inv.createdAt));
          ensure(d).inv++;
          if (inv.type === 'flower' && (!firstFlower || inv.createdAt < firstFlower.createdAt)) firstFlower = inv;
          if (inv.type === 'chat' && (!firstChat || inv.createdAt < firstChat.createdAt)) firstChat = inv;
        } catch (e) {}
      });
      // 聚合泡泡（仅展示公开泡泡 + 自己的私密）
      (space.bubbles || []).forEach(function (b) {
        if (b.isPrivate && b.author !== me.username) return;
        try {
          var d2 = N.utils.ymd(new Date(b.createdAt));
          ensure(d2).bub++;
        } catch (e) {}
      });
      // 特殊事件附加：第一次送花/聊一聊
      if (firstFlower) { try { ensure(N.utils.ymd(new Date(firstFlower.createdAt))).events.push('第一次送花 🌸'); } catch(e){} }
      if (firstChat) { try { ensure(N.utils.ymd(new Date(firstChat.createdAt))).events.push('第一次聊一聊 💬'); } catch(e){} }

      var keys = Object.keys(recs).sort(function (a, b) { return a < b ? 1 : -1; }); // 日期倒序
      if (!keys.length) {
        box.innerHTML = '<div class="center faint small" style="padding:26px 0 20px">还没有记录，快去创造回忆吧～</div>';
        return;
      }
      var html = '<div class="timeline">';
      keys.forEach(function (dk, idx) {
        var r = recs[dk];
        var dObj = new Date(dk + 'T00:00:00');
        var dateLabel = (dObj.getMonth() + 1) + '月' + dObj.getDate() + '日';
        var parts = [];
        if (r.msg) parts.push('聊了' + r.msg + '条密语');
        if (r.inv) parts.push('发了' + r.inv + '个邀约');
        if (r.bub) parts.push(r.bub + '颗泡泡');
        var stat = parts.length ? parts.join(' · ') : '今天没有互动';
        var evHTML = r.events.length ? r.events.map(function (t) { return '<div class="tl-event">· ' + N.utils.escapeHtml(t) + '</div>'; }).join('') : '';
        var isLast = idx === keys.length - 1;
        html +=
          '<div class="tl-item' + (isLast ? ' last' : '') + '">' +
            '<div class="tl-dot"></div>' +
            '<div class="tl-body">' +
              '<div class="tl-date">' + dateLabel + '</div>' +
              '<div class="tl-stat">' + N.utils.escapeHtml(stat) + '</div>' + evHTML +
            '</div>' +
          '</div>';
      });
      html += '</div>';
      box.innerHTML = html;
    }

    // step 8 教学：切到周报Tab → 提示往下滑看"我们的记录" → 滑到底部后推进到step 9
    var spOb8 = N.Space.list()[spaceId];
    if (spOb8 && typeof spOb8.onboardStep === 'number' && spOb8.onboardStep === 8) {
      N.Onboard.clearHl();
      setTimeout(function () {
        N.Onboard.showPopup({
          text: '周报下面还有「我们的记录」哦～\n往下滑看看你们的互动回忆吧',
          buttonText: '好的',
          onSkip: function () { N.Onboard.skip(spaceId); },
          onNext: function () {
            // 监听滚动到底部
            var scrollEl = tabContent;
            var onScroll = function () {
              if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 30) {
                scrollEl.removeEventListener('scroll', onScroll);
                advanceOnboarding(8); // 8 → 9
              }
            };
            scrollEl.addEventListener('scroll', onScroll);
            // 兜底：如果内容不够长不需要滚动，3秒后自动推进
            setTimeout(function () {
              if (spOb8.onboardStep === 8 && scrollEl.scrollHeight <= scrollEl.clientHeight + 30) {
                scrollEl.removeEventListener('scroll', onScroll);
                advanceOnboarding(8);
              }
            }, 3000);
          }
        });
      }, 500);
    }
  }
  function openHistoryReport(weekStart) {
    var r = N.Space.getReport(spaceId, weekStart);
    if (!r) { N.toastErr('周报不存在'); return; }
    var wr = N.utils.weekRange(new Date(weekStart));
    var range = N.utils.fmtDate(wr.start.getTime()) + ' ~ ' + N.utils.fmtDate(wr.end.getTime());
    var stats = r.stats || N.Space.statsForWeek(spaceId, weekStart);
    var emosRow = (stats.topEmos && stats.topEmos.length ? stats.topEmos : []).map(function (e) {
      return '<div class="pe"><div class="emo">' + N.emoSvg(e.id) + '</div><div class="c">' + N.emoName(e.id) + ' ' + e.count + '</div></div>';
    }).join('');
    var s = N.openSheet({ title: '历史周报', html:
      '<div class="poster" id="hPoster" style="margin-top:6px">' +
      '<div class="p-brand">喃 言</div>' +
      '<div class="p-title">双人情绪周报</div>' +
      '<div class="p-range">' + range + '</div>' +
      '<div class="p-stat-grid">' +
      '<div class="p-stat"><div class="n">' + stats.bubbles + '</div><div class="l">情绪泡泡</div></div>' +
      '<div class="p-stat"><div class="n">' + stats.messages + '</div><div class="l">密语</div></div>' +
      '<div class="p-stat"><div class="n">' + (stats.invitations || 0) + '</div><div class="l">邀约</div></div>' +
      '<div class="p-stat"><div class="n">' + (stats.bubbles + stats.messages) + '</div><div class="l">轻声次数</div></div>' +
      '</div>' +
      (emosRow ? '<div class="p-emos">' + emosRow + '</div>' : '') +
      '<div class="p-quote">' + N.utils.escapeHtml(r.text) + '</div>' +
      '<div class="p-foot">有些话，轻轻说 · 喃言</div>' +
      '</div>' +
      '<button class="btn mt16" id="hExport">' + N.icon('download') + '导出海报</button>' });
    s.sheet.querySelector('#hExport').onclick = function () {
      if (typeof html2canvas === 'undefined') { N.toastErr('海报库未加载（需联网）'); return; }
      N.toast('生成海报中…');
      html2canvas(s.sheet.querySelector('#hPoster'), { scale: 2, backgroundColor: '#FAF7F5', useCORS: true }).then(function (canvas) {
        var a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = '喃言周报_' + range.replace(/~| |\//g, '_') + '.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); N.toastOk('海报已下载');
      }).catch(function () { N.toastErr('导出失败'); });
    };
  }
  function templateText(stats) {
    var parts = [];
    parts.push('这周我们在喃言里相遇了 ' + stats.bubbles + ' 次。');
    if (stats.topEmos && stats.topEmos.length) {
      var names = stats.topEmos.map(function (e) { return N.emoName(e.id); }).join('、');
      parts.push('最常出现的情绪是 ' + names + '。');
    }
    parts.push('互相留了 ' + stats.messages + ' 条密语，' + (stats.invitations || 0) + ' 次邀约。');
    parts.push('有些话轻轻说，但都被记住了。');
    return parts.join('');
  }

  /* ============================================================
   * 设置 / 体面退场
   * ============================================================ */
  function openSettings() {
    var isCreator = space.creator === me.username;
    var exitLabel = isCreator ? '清空空间全部数据' : '退出空间';
    var exitDesc = isCreator ? '创建者不可退出，仅可一键清空（搭档数据也会清除）' : '仅清除你的数据，搭档数据保留';
    var nanguaInSpace = space.members.indexOf(NANGUA) >= 0;
    var nanguaBtn = (isCreator && nanguaInSpace)
      ? '<button class="btn btn-ghost mb8" id="sRemoveNangua">' + N.icon('robot') + '移除喃呱（之后可邀请真人）</button>'
      : '';
    var s = N.openSheet({ title: '空间设置', html:
      '<div class="card mb8"><div class="row between small"><span class="muted">邀请码</span><b style="letter-spacing:2px">' + space.inviteCode + '</b></div></div>' +
      '<div class="card mb8"><div class="row between small"><span class="muted">成员</span><span>' + space.members.map(function (m) { return N.utils.escapeHtml(N.displayName(m)); }).join('、') + '</span></div></div>' +
      '<button class="btn btn-ghost mb8" id="sProfile">' + N.icon('users') + '个人主页 / 切换空间</button>' +
      '<button class="btn btn-ghost mb8" id="sEditAvatar">' + N.icon('edit') + '编辑我的形象</button>' +
      nanguaBtn +
      '<div class="card" style="border:1px solid var(--danger-soft)">' +
      '<div class="small text-danger mb8" style="font-weight:600">体面退场</div>' +
      '<div class="small faint mb8">' + exitDesc + '</div>' +
      '<button class="btn btn-danger" id="sExit">' + exitLabel + '</button></div>' });
    s.sheet.querySelector('#sProfile').onclick = function () { s.close(); setTimeout(function () { location.href = 'profile.html'; }, 200); };
    s.sheet.querySelector('#sEditAvatar').onclick = function () { s.close(); editAvatarInSpace(); };
    var rmNg = s.sheet.querySelector('#sRemoveNangua');
    if (rmNg) rmNg.onclick = function () {
      N.confirm({ title: '移除喃呱？', message: '移除后喃呱的互动数据会被清除，空间将空出位置，可邀请真人搭档。', okText: '移除', danger: true }).then(function (ok) {
        if (!ok) return;
        N.Space.removeNangua(spaceId);
        s.close(); N.toastOk('喃呱已离开，现在可以邀请真人搭档');
        setTimeout(function () { location.reload(); }, 400);
      });
    };
    s.sheet.querySelector('#sExit').onclick = function () { s.close(); doExit(isCreator); };
  }
  function editAvatarInSpace() {
    var user = N.Auth.currentUser();
    var curFile = (user.avatar && user.avatar.image) ? user.avatar.image : N.avatarPresets()[0];
    var presets = N.avatarPresets();
    var avsHtml = presets.map(function (f) {
      return '<div class="av-opt ' + (f === curFile ? 'sel' : '') + '" data-file="' + f + '">' +
             '<img src="images/avatars/' + f + '" alt="" /></div>';
    }).join('');
    var s = N.openSheet({ title: '编辑形象', html:
      '<div class="center" style="margin:10px 0 18px"><div class="avatar" id="avPrev" style="width:92px;height:92px;margin:0 auto"></div></div>' +
      '<div class="muted small center" style="margin-bottom:8px">选择你喜欢的头像（1 / ' + presets.length + '）</div>' +
      '<div class="avatar-pick" id="avPick">' + avsHtml + '</div>' +
      '<div class="row" style="gap:10px"><button class="btn btn-ghost" id="avRand">' + N.icon('sparkle') + '随机换一个</button><button class="btn" id="avSave">保存形象</button></div>' });
    var prev = s.sheet.querySelector('#avPrev');
    function refresh() { prev.innerHTML = N.avatarSvg({ image: curFile }); }
    refresh();
    s.sheet.querySelectorAll('.av-opt').forEach(function (o) {
      o.onclick = function () {
        curFile = o.dataset.file;
        s.sheet.querySelectorAll('.av-opt').forEach(function (x) { x.classList.toggle('sel', x.dataset.file === curFile); });
        refresh();
      };
    });
    s.sheet.querySelector('#avRand').onclick = function () {
      var others = presets.filter(function (f) { return f !== curFile; });
      curFile = others[Math.floor(Math.random() * others.length)];
      s.sheet.querySelectorAll('.av-opt').forEach(function (x) { x.classList.toggle('sel', x.dataset.file === curFile); });
      refresh();
    };
    s.sheet.querySelector('#avSave').onclick = function () { N.Auth.updateProfile({ avatar: { image: curFile } }); s.close(); N.toastOk('形象已更新'); reload(); };
  }
  function doExit(isCreator) {
    if (isCreator) {
      // 创建者：清空全部数据，需输入"清空"
      N.confirm({
        title: '清空空间全部数据？', message: '此操作将清除本空间所有泡泡、密语、邀约、日历与周报，且不可恢复。',
        okText: '我已了解', danger: true
      }).then(function (ok) {
        if (!ok) return;
        N.confirm({
          title: '最终确认', message: '请输入"清空"以确认',
          input: true, inputPlaceholder: '输入 清空',
          validate: function (v) { return v === '清空' ? true : '请输入"清空"两个字'; },
          okText: '确认清空', danger: true
        }).then(function (val) {
          if (val !== '清空') return;
          N.Space.clearSpace(spaceId);
          N.toastOk('空间已清空');
          reload();
        });
      });
    } else {
      // 受邀成员：退出空间，清自己的数据
      N.confirm({ title: '退出空间？', message: '你的泡泡/密语/邀约/日历将被清除，搭档数据保留，且无法重新进入。', okText: '退出', danger: true }).then(function (ok) {
        if (!ok) return;
        N.Space.leaveSpace(spaceId);
        N.toastOk('已退出空间');
        setTimeout(function () { location.href = 'profile.html'; }, 400);
      });
    }
  }

  /* ============================================================
   * 工具
   * ============================================================ */
  function reload() {
    space = N.Space.list()[spaceId];
    renderHead();
    switchTab(activeTab);
  }
  function emptyHTML(emo, t, sub) {
    return '<div class="empty">' + N.emoHTML(emo, 'emo') + '<div class="t">' + t + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
  }
  function bindCount(input, cntId, max) {
    var cnt = function () { var el = document.getElementById(cntId); if (el) el.textContent = input.value.length + '/' + max; };
    input.addEventListener('input', cnt); cnt();
  }
  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fb(); });
    else fb();
    function fb() { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} document.body.removeChild(ta); }
  }
  function readImageScaled(file, maxW, quality, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        if (w > maxW) { h = h * maxW / w; w = maxW; }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        try { cb(canvas.toDataURL('image/jpeg', quality)); } catch (e) { cb(null); }
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  /* ============================================================
   * 跨标签页同步：其他标签页修改了 nanyan_ 开头的 localStorage 时，自动重新渲染
   * ============================================================ */
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key.indexOf('nanyan_') !== 0) return;
    // 会话被注销：跳回登录页
    if (e.key === 'nanyan_session' && !e.newValue) { location.href = 'index.html'; return; }
    // 空间数据变更：刷新当前空间内容（泡泡 / 密语 / 邀约 / 日历 / 周报都会随之更新）
    if (e.key === 'nanyan_spaces') {
      var latest = N.Space.list()[spaceId];
      if (!latest || !latest.members || latest.members.indexOf(me.username) < 0) {
        // 已被移出空间或空间被删
        N.toastErr('你已不在该空间中');
        setTimeout(function () { location.href = 'profile.html'; }, 600);
        return;
      }
      // 先检查特效：如果 lastEffect 更新了，先同步播放特效，再 reload 刷新界面
      checkEffect(latest);
      reload();
    }
    // 用户数据变更（如形象更新）：刷新头像
    if (e.key === 'nanyan_users') {
      reload();
    }
  });

  /* ---------- 启动 ---------- */
  renderHead();
  // 从 URL 读取 ?tab= 参数（如从 poster.html 返回时带 &tab=report），匹配则默认切对应 Tab，否则走泡泡 Tab
  var urlTab = new URLSearchParams(location.search).get('tab');
  var firstTab = 'bubbles';
  if (urlTab === 'report') firstTab = 'report';
  else if (urlTab === 'secret' || urlTab === 'invite' || urlTab === 'calendar' || urlTab === 'bubbles') firstTab = urlTab;
  switchTab(firstTab);
  // 若新手教学正在进行中，从当前步恢复弹窗引导
  startOnboardingIfActive();
  // 喃呱定时主动行为：启动时立即检查一次（会触发补发），之后每60秒轮询
  if (isNanguaPartner()) {
    try { checkNanguaScheduledActions(); } catch (e) {}
    window._nanguaScheduledTimer = setInterval(function () {
      try { checkNanguaScheduledActions(); } catch (e) {}
    }, 60 * 1000);
  }
  // 页面加载后延迟 600ms 检测未读消息并弹通知条（处理用户离开期间喃呱发消息、回来无提示的场景）
  // 与定时补发/实时通知共用 showNanguaNotice，同一时间只显示一条；教学期间不显示
  setTimeout(checkUnreadNoticeOnLoad, 600);
  // 验证 html2canvas 库是否正确加载（已改成本地 js/html2canvas.min.js）
  console.log('html2canvas已加载:', typeof html2canvas !== 'undefined');
})();

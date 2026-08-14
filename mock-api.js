/* SongSeed 静态版 · 固定数据层
 *
 * 作用：在没有后端的情况下，拦截页面发出的 /api/* 请求，返回内置的固定演示数据，
 *       并用 localStorage 持久化（增删改、登录状态、新建作品在本地生效）。
 *
 * 说明：
 *   - 页面本身（app.js / routes.js / styles.css / index.html）未做任何改动。
 *   - 若之后要接真实后端，只需在 index.html 里删除对 mock-api.js 的引入即可。
 */
(function () {
  "use strict";

  var DB_KEY = "songseed-static-db-v1";
  var MINUTE = 60 * 1000;
  var DAY = 24 * 60 * MINUTE;

  function now() { return new Date().toISOString(); }
  function ago(ms) { return new Date(Date.now() - ms).toISOString(); }
  function uid(prefix) {
    return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function seedFrom(text) {
    return String(text || "").split("").reduce(function (sum, char) { return sum + char.charCodeAt(0); }, 0);
  }

  // ===== 内置风格 → 编曲参数映射 =====
  var STYLE_PROFILE = {
    "流行": { bpm: 96, key: "C 大调", meter: "4/4 拍", instrument: "钢琴 + 弦乐" },
    "民谣": { bpm: 84, key: "G 大调", meter: "4/4 拍", instrument: "木吉他 + 口琴" },
    "R&B": { bpm: 78, key: "降E 大调", meter: "4/4 拍", instrument: "电钢琴 + 贝斯" },
    "摇滚": { bpm: 128, key: "E 小调", meter: "4/4 拍", instrument: "电吉他 + 鼓" },
    "电子": { bpm: 122, key: "A 小调", meter: "4/4 拍", instrument: "合成器 + 鼓机" }
  };

  // ===== 歌词生成（本地模板） =====
  var LYRICS_TEMPLATES = {
    "治愈": [
      { name: "主歌", lines: ["风轻轻吹过旧巷口", "把心事都染成了温柔", "我们慢慢走着 不用开口", "影子在路灯下牵手"] },
      { name: "副歌", lines: ["让晚风替我轻轻说", "那些藏了太久的温柔", "世界再大 也有盏灯", "为你亮到最后"] }
    ],
    "浪漫": [
      { name: "主歌", lines: ["你眼里的光 落在我心上", "像星星住进了海洋", "时间忽然变得很慢", "慢到能听见心跳的声响"] },
      { name: "副歌", lines: ["想把整个宇宙 都唱给你听", "每一颗星 都是我的回应", "如果爱有形状 一定是", "你笑起来的样子"] }
    ],
    "忧伤": [
      { name: "主歌", lines: ["雨落在窗台 像谁的叹息", "旧照片里还留着你", "我们走散在那个雨季", "从此再没有你的消息"] },
      { name: "副歌", lines: ["后来的后来 我学会忘记", "却忘不了你转身的背影", "时间它撒谎 说会治愈", "可夜里还是会想起"] }
    ],
    "梦幻": [
      { name: "主歌", lines: ["霓虹在夜里 开成一条河", "我沿着光 慢慢飘着", "城市睡着了 梦还醒着", "等一个不再经过的人"] },
      { name: "副歌", lines: ["在梦的尽头 有一片海", "倒映着所有 未说的对白", "如果闭上眼 就能回来", "我想再抱你 一个时代"] }
    ]
  };
  function makeLyrics(inspiration, mood) {
    var base = LYRICS_TEMPLATES[mood] || LYRICS_TEMPLATES["治愈"];
    return base.map(function (section) { return { name: section.name, lines: section.lines.slice() }; });
  }

  // ===== 构造一个完整的 version 对象 =====
  function makeVersion(input, owner) {
    input = input || {};
    var style = input.style || "流行";
    var profile = STYLE_PROFILE[style] || STYLE_PROFILE["流行"];
    var mood = input.mood || "治愈";
    var inspiration = input.inspiration || "一句没有写下的灵感";
    var isLyricsMode = input.mode === "lyrics";
    var isInstrumental = input.mode === "instrumental";
    var lyrics;
    if (input.lyrics && typeof input.lyrics === "string" && input.lyrics.trim()) {
      lyrics = parseLyricsText(input.lyrics);
    } else if (input.userLyrics && input.userLyrics.trim()) {
      lyrics = parseLyricsText(input.userLyrics);
    } else {
      lyrics = makeLyrics(inspiration, mood);
    }
    var title = input.title || ("《" + trimTitle(inspiration) + "》");
    return {
      id: input.id || uid("v"),
      versionNumber: input.versionNumber || 1,
      versionName: "V" + (input.versionNumber || 1),
      title: title,
      inspiration: inspiration,
      audioInspiration: input.audioInspiration || null,
      mode: input.mode || "inspiration",
      style: style,
      subgenre: input.subgenre || style,
      mood: mood,
      vocal: input.vocal || (isInstrumental ? "纯音乐" : "温暖女声"),
      instrument: input.instrument || profile.instrument,
      mature: input.mature !== undefined ? input.mature : false,
      integratedCollaborationIds: input.integratedCollaborationIds || [],
      collaborators: input.collaborators || [],
      edited: !!input.edited,
      editedFromVersionId: input.editedFromVersionId || "",
      audioMode: input.audioMode || "regenerate",
      trackPlan: input.trackPlan || {},
      variation: input.variation || "明显",
      meter: input.meter || profile.meter,
      bpm: input.bpm || profile.bpm,
      key: input.key || profile.key,
      duration: input.duration || Math.round(16 + Math.random() * 22),
      lyrics: lyrics,
      userLyrics: input.userLyrics || "",
      arrangement: input.arrangement || ("前奏由" + profile.instrument + "铺陈，主歌留白，副歌层层递进，尾奏渐弱收束。"),
      prompt: input.prompt || ("以「" + inspiration.slice(0, 20) + "」为核心，采用" + style + "曲风，营造" + mood + "氛围。"),
      seed: input.seed || seedFrom(inspiration + style + mood),
      featured: input.featured !== undefined ? input.featured : false,
      provider: input.provider || "local",
      createdAt: input.createdAt || now(),
      creatorId: (owner && owner.id) || input.creatorId || "u-ck",
      creatorName: (owner && owner.username) || input.creatorName || "ck",
      audioUrl: input.audioUrl || ""
    };
  }

  function parseLyricsText(text) {
    var sections = [];
    var lines = text.split("\n");
    var current = null;
    lines.forEach(function (line) {
      var match = line.match(/^【(.+?)】/);
      if (match) {
        current = { name: match[1], lines: [] };
        sections.push(current);
      } else if (line.trim()) {
        if (!current) { current = { name: "主歌", lines: [] }; sections.push(current); }
        current.lines.push(line.trim());
      }
    });
    return sections.length ? sections : [{ name: "主歌", lines: [text.trim()] }];
  }

  function trimTitle(text) {
    var clean = String(text || "").replace(/[《》【】\n，。！？,.!?\s]/g, "").slice(0, 6);
    return clean || "未命名";
  }

  // ===== 构造 project 对象 =====
  function makeProject(owner, version) {
    return {
      id: uid("p"),
      title: version.title,
      inspiration: version.inspiration,
      ownerId: owner.id,
      ownerName: owner.username,
      updatedAt: now(),
      versions: [version]
    };
  }

  // ===== 种子数据 =====
  function buildSeed() {
    var ck = { id: "u-ck", username: "ck", password: "123456", createdAt: ago(45 * DAY) };
    var pjr = { id: "u-pjr", username: "pjr", password: "123456", createdAt: ago(44 * DAY) };
    var djw = { id: "u-djw", username: "djw", password: "123456", createdAt: ago(43 * DAY) };

    // ck 的作品
    var v1 = makeVersion({
      id: "v-wanfeng-1", versionNumber: 1, title: "《晚风以后》", inspiration: "晚风把路灯吹成一片暖黄，像打翻的蜂蜜。",
      style: "流行", mood: "治愈", vocal: "温暖女声", mode: "inspiration", mature: true, featured: true,
      seed: 20260801, duration: 24, createdAt: ago(6 * DAY),
      arrangement: "前奏由钢琴与弦乐缓缓铺陈，主歌留白让呼吸感透出来，副歌加入鼓点层层推进，尾奏回到钢琴独奏渐弱收束。"
    }, ck);
    var v2 = makeVersion({
      id: "v-wanfeng-2", versionNumber: 2, title: "《晚风以后》", inspiration: "晚风把路灯吹成一片暖黄，像打翻的蜂蜜。",
      style: "流行", mood: "浪漫", vocal: "清澈男声", mode: "inspiration", mature: true,
      seed: 20260802, duration: 26, createdAt: ago(4 * DAY),
      edited: true, editedFromVersionId: "v-wanfeng-1",
      integratedCollaborationIds: ["col-1"],
      collaborators: [{ id: "u-pjr", username: "pjr" }],
      arrangement: "在原有钢琴底色上，改为男女声对唱，副歌加入和声，节奏感更强。"
    }, ck);
    var project1 = {
      id: "p-wanfeng", title: "《晚风以后》", inspiration: "晚风把路灯吹成一片暖黄，像打翻的蜂蜜。",
      ownerId: ck.id, ownerName: ck.username, updatedAt: ago(4 * DAY), versions: [v1, v2]
    };

    var v3 = makeVersion({
      id: "v-xiatian-1", versionNumber: 1, title: "《写给夏天》", inspiration: "夏天和毕业一起结束了，教室窗外的蝉还在叫。",
      style: "民谣", mood: "忧伤", vocal: "磁性男声", mode: "inspiration", mature: true, featured: true,
      seed: 20260803, duration: 28, createdAt: ago(3 * DAY)
    }, ck);
    var project2 = {
      id: "p-xiatian", title: "《写给夏天》", inspiration: "夏天和毕业一起结束了，教室窗外的蝉还在叫。",
      ownerId: ck.id, ownerName: ck.username, updatedAt: ago(3 * DAY), versions: [v3]
    };

    var v4 = makeVersion({
      id: "v-nihong-1", versionNumber: 1, title: "《霓虹回声》", inspiration: "凌晨的城市像一条发光的河，霓虹是它的回声。",
      style: "电子", mood: "梦幻", vocal: "空灵女声", mode: "inspiration", mature: false,
      seed: 20260804, duration: 20, createdAt: ago(1 * DAY)
    }, ck);
    var project3 = {
      id: "p-nihong", title: "《霓虹回声》", inspiration: "凌晨的城市像一条发光的河，霓虹是它的回声。",
      ownerId: ck.id, ownerName: ck.username, updatedAt: ago(1 * DAY), versions: [v4]
    };

    // pjr 的作品（用于分享给 ck）
    var v5 = makeVersion({
      id: "v-nanfang-1", versionNumber: 1, title: "《南方的雨》", inspiration: "南方的雨下得很慢，像把整座城都泡软了。",
      style: "R&B", mood: "浪漫", vocal: "慵懒女声", mode: "inspiration", mature: true, featured: true,
      seed: 20260805, duration: 22, createdAt: ago(2 * DAY)
    }, pjr);
    var projectPjr = {
      id: "p-nanfang", title: "《南方的雨》", inspiration: "南方的雨下得很慢，像把整座城都泡软了。",
      ownerId: pjr.id, ownerName: pjr.username, updatedAt: ago(2 * DAY), versions: [v5]
    };

    // 灵感
    var inspirations = [
      { id: "i-1", userId: ck.id, content: "晚风把路灯吹成一片暖黄，像打翻的蜂蜜。", mode: "inspiration", audioInspiration: null, createdAt: ago(7 * DAY) },
      { id: "i-2", userId: ck.id, content: "【主歌】\n夏天和毕业一起结束了\n教室窗外的蝉还在叫\n【副歌】\n我们把青春 折成纸飞机\n让它飞向 没有答案的天际", mode: "lyrics", audioInspiration: null, createdAt: ago(5 * DAY) },
      { id: "i-3", userId: ck.id, content: "想写一首纯音乐的电子曲子，给凌晨的城市，霓虹像河流一样流动。", mode: "instrumental", audioInspiration: null, createdAt: ago(2 * DAY) }
    ];

    // 好友关系（双向）
    var friends = {};
    friends[ck.id] = [pjr.id, djw.id];
    friends[pjr.id] = [ck.id];
    friends[djw.id] = [ck.id];

    // 消息
    var messages = {};
    messages[convKey(ck.id, pjr.id)] = [
      { id: "m-1", senderId: pjr.id, content: "晚风以后那首的副歌太抓耳了！", kind: "text", createdAt: ago(3 * DAY) },
      { id: "m-2", senderId: ck.id, content: "哈哈谢谢，还在打磨第二版", kind: "text", createdAt: ago(3 * DAY - 20 * MINUTE) }
    ];

    // 分享：pjr 分享《南方的雨》给 ck
    var shareToken = "NANFANG-DEMO-2026";
    var shares = [{
      token: shareToken,
      creatorId: pjr.id,
      creatorName: pjr.username,
      project: clone(projectPjr),
      version: clone(v5),
      expiresAt: new Date(Date.now() + 5 * DAY).toISOString(),
      code: "",
      feedback: [
        { id: "f-1", author: "ck", content: "副歌的转音很喜欢，鼓点可以再晚两拍进。", section: "副歌", source: "试听", createdAt: ago(1 * DAY), replies: [] }
      ]
    }];

    var receivedShares = {};
    receivedShares[ck.id] = [{
      token: shareToken,
      title: "《南方的雨》",
      creatorName: pjr.username,
      inspiration: "南方的雨下得很慢，像把整座城都泡软了。",
      versionNumber: 1, style: "R&B", mood: "浪漫", duration: 22,
      expiresAt: shares[0].expiresAt
    }];

    // 接力：pjr 对 ck《晚风以后》V1 发起接力方案
    var colVersion = makeVersion({
      id: "v-wanfeng-col1", versionNumber: 1, title: "《晚风以后》",
      inspiration: "晚风把路灯吹成一片暖黄，像打翻的蜂蜜。",
      style: "摇滚", mood: "热烈", vocal: "力量女声", mode: "inspiration", mature: true,
      seed: 20260806, duration: 25, createdAt: ago(2 * DAY)
    }, pjr);
    var collaborations = [{
      id: "col-1",
      ownerId: ck.id,
      collaboratorId: pjr.id,
      collaboratorName: pjr.username,
      sourceTitle: "《晚风以后》",
      sourceVersionNumber: 1,
      instruction: "保留主歌旋律，把副歌改成更有爆发力的摇滚编曲，第二遍加入和声。",
      version: colVersion,
      adopted: true,
      createdAt: ago(2 * DAY)
    }];

    // 评论（ck 对《晚风以后》V1）
    var comments = {};
    comments["p-wanfeng_v-wanfeng-1"] = [
      { id: "c-1", author: "pjr", status: "accepted", content: "主歌的钢琴进得很好听，副歌可以更放开一点。", source: "整体", section: "主歌", createdAt: ago(2 * DAY), replies: [{ author: "ck", content: "收到，第二版已经改了！", createdAt: ago(2 * DAY - 30 * MINUTE) }] }
    ];

    return {
      users: [ck, pjr, djw],
      sessions: {},
      projects: [project1, project2, project3, projectPjr],
      inspirations: inspirations,
      friends: friends,
      friendRequests: [],
      messages: messages,
      shares: shares,
      receivedShares: receivedShares,
      collaborations: collaborations,
      comments: comments,
      jobs: {}
    };
  }

  function convKey(a, b) { return [a, b].sort().join("__"); }

  // ===== 数据库读写 =====
  function loadDB() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    var seed = buildSeed();
    try { localStorage.setItem(DB_KEY, JSON.stringify(seed)); } catch (e) { /* ignore */ }
    return seed;
  }
  function saveDB(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
  }

  var DB = loadDB();

  // ===== 响应工具 =====
  function json(data, status) {
    return new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
  function error(message, status, extra) {
    var body = { error: message };
    if (extra) Object.keys(extra).forEach(function (key) { body[key] = extra[key]; });
    return json(body, status || 400);
  }
  function ok(data) { return json(data || { ok: true }); }

  // ===== 鉴权 =====
  function authUser(headers) {
    var auth = headers.Authorization || headers.authorization || "";
    var token = String(auth).replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;
    var userId = DB.sessions[token];
    if (!userId) return null;
    return DB.users.find(function (user) { return user.id === userId; }) || null;
  }

  function publicUser(user) {
    return { id: user.id, username: user.username, createdAt: user.createdAt };
  }

  // ===== 好友关系辅助 =====
  function friendIdsOf(userId) { return DB.friends[userId] || []; }
  function isFriend(a, b) { return friendIdsOf(a).indexOf(b) !== -1; }

  function incomingRequests(userId) {
    return DB.friendRequests
      .filter(function (req) { return req.toId === userId && req.status === "pending"; })
      .map(function (req) {
        var from = DB.users.find(function (u) { return u.id === req.fromId; });
        return { id: req.id, username: from ? from.username : "未知用户", createdAt: req.createdAt };
      });
  }
  function outgoingRequests(userId) {
    return DB.friendRequests
      .filter(function (req) { return req.fromId === userId && req.status === "pending"; })
      .map(function (req) {
        var to = DB.users.find(function (u) { return u.id === req.toId; });
        return { id: req.id, username: to ? to.username : "未知用户", createdAt: req.createdAt };
      });
  }

  function addFriendPair(a, b) {
    if (!isFriend(a, b)) { DB.friends[a] = DB.friends[a] || []; DB.friends[a].push(b); }
    if (!isFriend(b, a)) { DB.friends[b] = DB.friends[b] || []; DB.friends[b].push(a); }
  }

  // ===== 生成流程（创建 / 编辑 / 拆分 / 接力 统一走 job） =====
  function spawnJob(result) {
    var job = { id: uid("job"), status: "ready", message: "", result: result, createdAt: now() };
    DB.jobs[job.id] = job;
    saveDB(DB);
    return { jobId: job.id, status: job.status, message: job.message };
  }

  function createProjectFor(user, input) {
    var version = makeVersion(input, user);
    version.mature = true;
    version.featured = true;
    var project = makeProject(user, version);
    project.inspiration = version.inspiration;
    DB.projects.push(project);
    saveDB(DB);
    return { project: project, version: version };
  }

  function addVersionToProject(user, pid, input, edited) {
    var project = DB.projects.find(function (p) { return p.id === pid && p.ownerId === user.id; });
    if (!project) return null;
    var nextNumber = (project.versions || []).reduce(function (max, v) { return Math.max(max, v.versionNumber || 0); }, 0) + 1;
    var version = makeVersion(input, user);
    version.versionNumber = input.versionNumber || nextNumber;
    version.versionName = "V" + version.versionNumber;
    version.title = project.title;
    version.inspiration = project.inspiration;
    if (edited) {
      version.edited = true;
      version.editedFromVersionId = input.editedFromVersionId || (project.versions.length ? project.versions[project.versions.length - 1].id : "");
      version.mature = true;
    }
    project.versions.push(version);
    project.updatedAt = now();
    saveDB(DB);
    return { project: project, version: version };
  }

  // ===== 核心请求处理 =====
  function handleApi(method, path, query, headers, body) {
    // ---- 健康 / meta ----
    if (method === "GET" && path === "/health") {
      return ok({ ok: true, service: "SongSeed", providers: ["local"], mode: "static" });
    }
    if (method === "GET" && path === "/meta") {
      return ok({
        minimaxAvailable: false,
        deepseekAvailable: false,
        stemSeparationAvailable: false,
        providers: ["local"]
      });
    }
    if (method === "POST" && path === "/uploads/audio") {
      var filename = body && body.name ? body.name : "audio-inspiration.wav";
      return ok({ url: "/uploads/" + filename, filename: filename });
    }

    // ---- 认证 ----
    if (method === "POST" && path === "/auth/register") {
      var username = (body && body.username || "").trim();
      var password = (body && body.password) || "";
      if (!username || !password) return error("请填写用户名和密码");
      if (DB.users.some(function (u) { return u.username === username; })) return error("用户名已存在");
      var user = { id: uid("u"), username: username, password: password, createdAt: now() };
      DB.users.push(user);
      DB.friends[user.id] = [];
      var token = uid("tok");
      DB.sessions[token] = user.id;
      saveDB(DB);
      return ok({ token: token, user: publicUser(user) });
    }
    if (method === "POST" && path === "/auth/login") {
      var loginUser = DB.users.find(function (u) { return u.username === (body && body.username) && u.password === (body && body.password); });
      if (!loginUser) return error("用户名或密码错误", 401);
      var loginToken = uid("tok");
      DB.sessions[loginToken] = loginUser.id;
      saveDB(DB);
      return ok({ token: loginToken, user: publicUser(loginUser) });
    }
    if (method === "POST" && path === "/auth/logout") {
      var logoutToken = String(headers.Authorization || "").replace(/^Bearer\s+/i, "");
      delete DB.sessions[logoutToken];
      saveDB(DB);
      return ok();
    }
    if (method === "GET" && path === "/auth/me") {
      var me = authUser(headers);
      if (!me) return error("未登录", 401);
      return ok({ user: publicUser(me) });
    }

    // ---- 灵感 ----
    if (method === "GET" && path === "/inspirations") {
      var inspUser = authUser(headers);
      if (!inspUser) return error("未登录", 401);
      return ok({ inspirations: DB.inspirations.filter(function (i) { return i.userId === inspUser.id; }).sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }) });
    }
    if (method === "POST" && path === "/inspirations") {
      var inspOwner = authUser(headers);
      if (!inspOwner) return error("未登录", 401);
      var inspiration = {
        id: uid("i"),
        userId: inspOwner.id,
        content: (body && body.content) || "",
        mode: (body && body.mode) || "inspiration",
        audioInspiration: (body && body.audioInspiration) || null,
        createdAt: now()
      };
      DB.inspirations.push(inspiration);
      saveDB(DB);
      return ok({ inspiration: inspiration });
    }
    var inspDel = path.match(/^\/inspirations\/([^/]+)$/);
    if (method === "DELETE" && inspDel) {
      var delUser = authUser(headers);
      if (!delUser) return error("未登录", 401);
      DB.inspirations = DB.inspirations.filter(function (i) { return !(i.id === inspDel[1] && i.userId === delUser.id); });
      saveDB(DB);
      return ok();
    }

    // ---- 项目 ----
    if (method === "GET" && path === "/projects") {
      var projectsUser = authUser(headers);
      if (!projectsUser) return error("未登录", 401);
      var projects = DB.projects.filter(function (p) { return p.ownerId === projectsUser.id; })
        .sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
      return ok({ projects: projects });
    }
    if (method === "POST" && path === "/projects") {
      var createUser = authUser(headers);
      if (!createUser) return error("未登录", 401);
      var result = createProjectFor(createUser, body || {});
      return json(spawnJob(result), 202);
    }
    var projDelete = path.match(/^\/projects\/([^/]+)$/);
    if (method === "DELETE" && projDelete) {
      var pdUser = authUser(headers);
      if (!pdUser) return error("未登录", 401);
      DB.projects = DB.projects.filter(function (p) { return !(p.id === projDelete[1] && p.ownerId === pdUser.id); });
      saveDB(DB);
      return ok();
    }
    var verNew = path.match(/^\/projects\/([^/]+)\/versions$/);
    if (method === "POST" && verNew) {
      var vnUser = authUser(headers);
      if (!vnUser) return error("未登录", 401);
      var vnResult = addVersionToProject(vnUser, verNew[1], body || {}, false);
      if (!vnResult) return error("项目不存在", 404);
      return json(spawnJob(vnResult), 202);
    }
    var verEdit = path.match(/^\/projects\/([^/]+)\/versions\/([^/]+)\/edit$/);
    if (method === "POST" && verEdit) {
      var veUser = authUser(headers);
      if (!veUser) return error("未登录", 401);
      var veResult = addVersionToProject(veUser, verEdit[1], body || {}, true);
      if (!veResult) return error("项目不存在", 404);
      return json(spawnJob(veResult), 202);
    }
    var verStems = path.match(/^\/projects\/([^/]+)\/versions\/([^/]+)\/stems$/);
    if (method === "POST" && verStems) {
      var vsUser = authUser(headers);
      if (!vsUser) return error("未登录", 401);
      return error("当前为纯前端演示模式，音轨拆分不可用", 400);
    }
    var verDelete = path.match(/^\/projects\/([^/]+)\/versions\/([^/]+)$/);
    if (method === "DELETE" && verDelete) {
      var vdUser = authUser(headers);
      if (!vdUser) return error("未登录", 401);
      var vdProject = DB.projects.find(function (p) { return p.id === verDelete[1] && p.ownerId === vdUser.id; });
      if (!vdProject) return error("项目不存在", 404);
      vdProject.versions = vdProject.versions.filter(function (v) { return v.id !== verDelete[2]; });
      if (!vdProject.versions.length) DB.projects = DB.projects.filter(function (p) { return p.id !== vdProject.id; });
      saveDB(DB);
      return ok();
    }

    // ---- 评论 ----
    var commentKey = function (pid, vid) { return pid + "_" + vid; };
    var comGet = path.match(/^\/projects\/([^/]+)\/versions\/([^/]+)\/comments$/);
    if (method === "GET" && comGet) {
      var cgUser = authUser(headers);
      if (!cgUser) return error("未登录", 401);
      return ok({ comments: DB.comments[commentKey(comGet[1], comGet[2])] || [] });
    }
    var comPost = path.match(/^\/projects\/([^/]+)\/versions\/([^/]+)\/comments$/);
    if (method === "POST" && comPost) {
      var cpUser = authUser(headers);
      if (!cpUser) return error("未登录", 401);
      var comment = {
        id: uid("c"),
        author: cpUser.username,
        status: "pending",
        content: (body && body.content) || "",
        source: (body && body.source) || "整体",
        section: (body && body.section) || "整体",
        createdAt: now(),
        replies: []
      };
      var cKey = commentKey(comPost[1], comPost[2]);
      DB.comments[cKey] = DB.comments[cKey] || [];
      DB.comments[cKey].push(comment);
      saveDB(DB);
      return ok({ comment: comment });
    }
    var comPatch = path.match(/^\/projects\/([^/]+)\/versions\/([^/]+)\/comments\/([^/]+)$/);
    if (method === "PATCH" && comPatch) {
      var cmUser = authUser(headers);
      if (!cmUser) return error("未登录", 401);
      var cmKey = commentKey(comPatch[1], comPatch[2]);
      var list = DB.comments[cmKey] || [];
      var target = list.find(function (c) { return c.id === comPatch[3]; });
      if (!target) return error("评论不存在", 404);
      target.status = (body && body.status) || target.status;
      saveDB(DB);
      return ok({ comment: target });
    }
    var comReply = path.match(/^\/projects\/([^/]+)\/versions\/([^/]+)\/comments\/([^/]+)\/replies$/);
    if (method === "POST" && comReply) {
      var crUser = authUser(headers);
      if (!crUser) return error("未登录", 401);
      var crKey = commentKey(comReply[1], comReply[2]);
      var crList = DB.comments[crKey] || [];
      var crTarget = crList.find(function (c) { return c.id === comReply[3]; });
      if (!crTarget) return error("评论不存在", 404);
      crTarget.replies = crTarget.replies || [];
      crTarget.replies.push({ author: crUser.username, content: (body && body.content) || "", createdAt: now() });
      saveDB(DB);
      return ok({ comment: crTarget });
    }

    // ---- 好友 / 搜索 / 消息 ----
    if (method === "GET" && path === "/friends") {
      var fUser = authUser(headers);
      if (!fUser) return error("未登录", 401);
      var friends = friendIdsOf(fUser.id).map(function (id) {
        var friend = DB.users.find(function (u) { return u.id === id; });
        var unread = countUnread(id, fUser.id);
        return { id: id, username: friend ? friend.username : id, unread: unread, createdAt: friend ? friend.createdAt : now() };
      });
      return ok({ friends: friends, incomingRequests: incomingRequests(fUser.id), outgoingRequests: outgoingRequests(fUser.id) });
    }
    if (method === "GET" && path === "/users/search") {
      var sUser = authUser(headers);
      if (!sUser) return error("未登录", 401);
      var q = (query.q || "").trim().toLowerCase();
      var exact = query.exact === "1";
      var users = DB.users.filter(function (u) {
        if (u.id === sUser.id) return false;
        var name = u.username.toLowerCase();
        return exact ? name === q : (q ? name.indexOf(q) !== -1 : true);
      }).map(function (u) {
        var relation = "none";
        if (isFriend(sUser.id, u.id)) relation = "friend";
        else if (DB.friendRequests.some(function (r) { return r.fromId === sUser.id && r.toId === u.id && r.status === "pending"; })) relation = "requested";
        else if (DB.friendRequests.some(function (r) { return r.fromId === u.id && r.toId === sUser.id && r.status === "pending"; })) relation = "incoming";
        return { id: u.id, username: u.username, relation: relation };
      });
      return ok({ users: users });
    }
    if (method === "POST" && path === "/friend-requests") {
      var frUser = authUser(headers);
      if (!frUser) return error("未登录", 401);
      var targetId = body && body.userId;
      var target = DB.users.find(function (u) { return u.id === targetId; });
      if (!target) return error("用户不存在", 404);
      if (isFriend(frUser.id, targetId)) return error("你们已经是好友");
      DB.friendRequests.push({ id: uid("fr"), fromId: frUser.id, toId: targetId, status: "pending", createdAt: now() });
      saveDB(DB);
      return ok();
    }
    var frPatch = path.match(/^\/friend-requests\/([^/]+)$/);
    if (method === "PATCH" && frPatch) {
      var fpUser = authUser(headers);
      if (!fpUser) return error("未登录", 401);
      var req = DB.friendRequests.find(function (r) { return r.id === frPatch[1]; });
      if (!req) return error("申请不存在", 404);
      var action = body && body.action;
      if (action === "accept") { addFriendPair(req.fromId, req.toId); req.status = "accepted"; }
      else { req.status = "rejected"; }
      saveDB(DB);
      return ok();
    }
    var msgGet = path.match(/^\/friends\/([^/]+)\/messages$/);
    if (method === "GET" && msgGet) {
      var mgUser = authUser(headers);
      if (!mgUser) return error("未登录", 401);
      var key = convKey(mgUser.id, msgGet[1]);
      return ok({ messages: DB.messages[key] || [] });
    }
    var msgPost = path.match(/^\/friends\/([^/]+)\/messages$/);
    if (method === "POST" && msgPost) {
      var mpUser = authUser(headers);
      if (!mpUser) return error("未登录", 401);
      var mk = convKey(mpUser.id, msgPost[1]);
      DB.messages[mk] = DB.messages[mk] || [];
      var message = { id: uid("m"), senderId: mpUser.id, content: (body && body.content) || "", kind: "text", createdAt: now() };
      DB.messages[mk].push(message);
      saveDB(DB);
      return ok({ message: message });
    }
    var msgShare = path.match(/^\/friends\/([^/]+)\/share$/);
    if (method === "POST" && msgShare) {
      var msUser = authUser(headers);
      if (!msUser) return error("未登录", 401);
      var msk = convKey(msUser.id, msgShare[1]);
      DB.messages[msk] = DB.messages[msk] || [];
      DB.messages[msk].push({
        id: uid("m"), senderId: msUser.id,
        content: (body && body.title) || "分享了一首 Demo",
        kind: "demo", shareToken: (body && body.shareToken) || "",
        createdAt: now()
      });
      saveDB(DB);
      return ok();
    }

    // ---- 分享 ----
    if (method === "GET" && path === "/received-shares") {
      var rsUser = authUser(headers);
      if (!rsUser) return error("未登录", 401);
      return ok({ receivedShares: DB.receivedShares[rsUser.id] || [] });
    }
    var rsDelete = path.match(/^\/received-shares\/([^/]+)$/);
    if (method === "DELETE" && rsDelete) {
      var rdUser = authUser(headers);
      if (!rdUser) return error("未登录", 401);
      DB.receivedShares[rdUser.id] = (DB.receivedShares[rdUser.id] || []).filter(function (s) { return s.token !== rsDelete[1]; });
      saveDB(DB);
      return ok();
    }
    var shareCreate = path.match(/^\/projects\/([^/]+)\/shares$/);
    if (method === "POST" && shareCreate) {
      var scUser = authUser(headers);
      if (!scUser) return error("未登录", 401);
      var scProject = DB.projects.find(function (p) { return p.id === shareCreate[1] && p.ownerId === scUser.id; });
      if (!scProject) return error("项目不存在", 404);
      var scVersion = body && body.versionId
        ? scProject.versions.find(function (v) { return v.id === body.versionId; })
        : (scProject.versions.find(function (v) { return v.featured; }) || scProject.versions[scProject.versions.length - 1]);
      if (!scVersion) return error("没有可分享的版本", 404);
      var token = uid("share").toUpperCase();
      var share = {
        token: token,
        creatorId: scUser.id,
        creatorName: scUser.username,
        project: clone(scProject),
        version: clone(scVersion),
        expiresAt: new Date(Date.now() + 7 * DAY).toISOString(),
        code: "",
        feedback: []
      };
      DB.shares.push(share);
      // 若选择分享给好友，写入对方 receivedShares 并留言
      var toFriendId = body && body.friendId;
      if (toFriendId) {
        DB.receivedShares[toFriendId] = DB.receivedShares[toFriendId] || [];
        DB.receivedShares[toFriendId].push({
          token: token, title: scVersion.title, creatorName: scUser.username,
          inspiration: scProject.inspiration, versionNumber: scVersion.versionNumber,
          style: scVersion.style, mood: scVersion.mood, duration: scVersion.duration,
          expiresAt: share.expiresAt
        });
      }
      saveDB(DB);
      return ok({ share: { token: token, shareUrl: shareUrl(token) } });
    }
    var shareGet = path.match(/^\/share\/([^/]+)$/);
    if (method === "GET" && shareGet) {
      var share = DB.shares.find(function (s) { return s.token === shareGet[1]; });
      if (!share) return error("分享不存在或已删除", 404);
      if (share.code) {
        var code = headers["X-Share-Code"] || headers["x-share-code"] || "";
        if (code !== share.code) return error("访问口令不正确", 401, { locked: true });
      }
      return ok({ project: share.project, version: share.version, feedback: share.feedback });
    }
    var fbPost = path.match(/^\/share\/([^/]+)\/feedback$/);
    if (method === "POST" && fbPost) {
      var share2 = DB.shares.find(function (s) { return s.token === fbPost[1]; });
      if (!share2) return error("分享不存在", 404);
      var feedback = {
        id: uid("f"),
        author: (body && body.author) || "游客",
        content: (body && body.content) || "",
        section: (body && body.section) || "整体",
        source: (body && body.source) || "试听",
        createdAt: now(),
        replies: []
      };
      share2.feedback = share2.feedback || [];
      share2.feedback.push(feedback);
      saveDB(DB);
      return ok({ feedback: feedback });
    }
    var shareCol = path.match(/^\/share\/([^/]+)\/collaborations$/);
    if (method === "POST" && shareCol) {
      var scUser2 = authUser(headers);
      if (!scUser2) return error("未登录", 401);
      var share3 = DB.shares.find(function (s) { return s.token === shareCol[1]; });
      if (!share3) return error("分享不存在", 404);
      var colInput = Object.assign({}, body || {}, { inspiration: share3.project.inspiration });
      var colVersion2 = makeVersion(colInput, scUser2);
      colVersion2.mature = true;
      var colItem = {
        id: uid("col"),
        ownerId: share3.creatorId,
        collaboratorId: scUser2.id,
        collaboratorName: scUser2.username,
        sourceTitle: share3.project.title,
        sourceVersionNumber: share3.version.versionNumber,
        instruction: (body && body.instruction) || "按照灵感修改",
        version: colVersion2,
        adopted: false,
        createdAt: now()
      };
      DB.collaborations.push(colItem);
      saveDB(DB);
      return json(spawnJob({ project: share3.project, version: colVersion2, collaborationId: colItem.id }), 202);
    }

    // ---- 接力 ----
    if (method === "GET" && path === "/collaborations") {
      var colUser = authUser(headers);
      if (!colUser) return error("未登录", 401);
      var collaborations = DB.collaborations
        .filter(function (c) { return c.ownerId === colUser.id || c.collaboratorId === colUser.id; })
        .map(function (c) {
          var role = c.ownerId === colUser.id ? "creator" : "collaborator";
          return {
            id: c.id, role: role, sourceTitle: c.sourceTitle, sourceVersionNumber: c.sourceVersionNumber,
            collaboratorName: c.collaboratorName, collaboratorId: c.collaboratorId,
            instruction: c.instruction, version: c.version, adopted: c.adopted, createdAt: c.createdAt
          };
        })
        .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
      return ok({ collaborations: collaborations });
    }
    var colPatch = path.match(/^\/collaborations\/([^/]+)$/);
    if (method === "PATCH" && colPatch) {
      var cpUser2 = authUser(headers);
      if (!cpUser2) return error("未登录", 401);
      var colTarget = DB.collaborations.find(function (c) { return c.id === colPatch[1]; });
      if (!colTarget) return error("接力方案不存在", 404);
      if (body && body.adopted !== undefined) colTarget.adopted = !!body.adopted;
      saveDB(DB);
      return ok({ collaboration: {
        id: colTarget.id, role: "creator", sourceTitle: colTarget.sourceTitle,
        sourceVersionNumber: colTarget.sourceVersionNumber, collaboratorName: colTarget.collaboratorName,
        collaboratorId: colTarget.collaboratorId, instruction: colTarget.instruction,
        version: colTarget.version, adopted: colTarget.adopted, createdAt: colTarget.createdAt
      } });
    }
    if (method === "POST" && path === "/collaborations/integrate") {
      var ciUser = authUser(headers);
      if (!ciUser) return error("未登录", 401);
      var ids = (body && body.collaborationIds) || [];
      var picked = DB.collaborations.filter(function (c) { return ids.indexOf(c.id) !== -1 && c.ownerId === ciUser.id; });
      var sourceProject = DB.projects.find(function (p) {
        return p.ownerId === ciUser.id && p.title === (picked[0] && picked[0].sourceTitle);
      });
      var project = sourceProject || DB.projects.find(function (p) { return p.ownerId === ciUser.id; });
      if (!project) return error("没有可整合的项目", 404);
      var integrated = makeVersion({
        inspiration: project.inspiration, style: "流行", mood: "治愈",
        integratedCollaborationIds: picked.map(function (c) { return c.id; }),
        collaborators: picked.map(function (c) { return { id: c.collaboratorId, username: c.collaboratorName }; }),
        mature: true
      }, ciUser);
      integrated.title = project.title;
      integrated.versionNumber = (project.versions || []).length + 1;
      integrated.versionName = "V" + integrated.versionNumber;
      project.versions.push(integrated);
      project.updatedAt = now();
      saveDB(DB);
      return json(spawnJob({ project: project, version: integrated }), 202);
    }

    // ---- 歌词优化 ----
    if (method === "POST" && path === "/lyrics/improve") {
      var liUser = authUser(headers);
      if (!liUser) return error("未登录", 401);
      var original = (body && body.lyrics) || "";
      var improved = "【主歌】\n" + (original.split("\n")[0] || "让晚风把心事慢慢说") + "\n【副歌】\n把每个孤独的夜都点亮\n陪你走过漫长时光";
      return ok({ lyrics: improved });
    }

    // ---- 任务 ----
    var jobGet = path.match(/^\/jobs\/([^/]+)$/);
    if (method === "GET" && jobGet) {
      var job = DB.jobs[jobGet[1]];
      if (!job) return error("任务不存在", 404);
      return ok({ id: job.id, status: job.status, message: job.message, result: job.result });
    }
    var jobCancel = path.match(/^\/jobs\/([^/]+)\/cancel$/);
    if (method === "POST" && jobCancel) {
      var jcJob = DB.jobs[jobCancel[1]];
      if (jcJob) jcJob.status = "cancelled";
      saveDB(DB);
      return ok();
    }

    return error("接口不存在：" + method + " " + path, 404);
  }

  function countUnread(fromId, toId) {
    var key = convKey(fromId, toId);
    var list = DB.messages[key] || [];
    return list.filter(function (m) { return m.senderId === fromId && !m.read; }).length;
  }

  function shareUrl(token) {
    return (location.origin || "") + "/share/" + token;
  }

  // ===== 拦截 fetch =====
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  window.fetch = function (input, init) {
    init = init || {};
    var urlString = typeof input === "string" ? input : (input && input.url ? input.url : "");
    var resolved;
    try { resolved = new URL(urlString, location.href); } catch (e) { return nativeFetch ? nativeFetch(input, init) : Promise.reject(e); }

    var pathname = resolved.pathname;
    if (pathname.indexOf("/api") !== 0) {
      return nativeFetch ? nativeFetch(input, init) : Promise.reject(new Error("fetch 不可用"));
    }

    var apiPath = pathname.replace(/^\/api/, "") || "/";
    var method = String(init.method || "GET").toUpperCase();

    var headers = {};
    if (init.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach(function (value, key) { headers[key] = value; });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(function (pair) { headers[pair[0]] = pair[1]; });
      } else {
        Object.keys(init.headers).forEach(function (key) { headers[key] = init.headers[key]; });
      }
    }

    var body = init.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (e) { body = body; }
    } else if (body instanceof FormData) {
      var fd = {};
      body.forEach(function (value, key) { fd[key] = value; });
      body = fd;
    }

    // 模拟轻微网络延迟，让加载态更自然
    var query = {};
    if (resolved.searchParams) {
      resolved.searchParams.forEach(function (value, key) { query[key] = value; });
    }

    return new Promise(function (resolve) {
      setTimeout(function () {
        try {
          resolve(handleApi(method, apiPath, query, headers, body));
        } catch (e) {
          resolve(error(e.message || "内部错误", 500));
        }
      }, 120);
    });
  };

  // 暴露重置入口（控制台可用 window.__resetSongSeedMock()）
  window.__resetSongSeedMock = function () {
    localStorage.removeItem(DB_KEY);
    location.reload();
  };
})();

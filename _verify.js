// 临时冒烟测试：模拟浏览器环境，验证 mock-api.js 各接口返回正确
const fs = require("fs");

// ---- stub 浏览器 API ----
const storage = {};
global.window = global;
global.localStorage = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
};
global.location = { origin: "http://localhost:8899", href: "http://localhost:8899/" };
global.Response = class {
  constructor(body, init) { this._body = body; this.status = init.status || 200; this.headers = init.headers || {}; }
  json() { return Promise.resolve(JSON.parse(this._body)); }
};
global.Headers = class { forEach() {} };
global.FormData = class { forEach() {} };

const code = fs.readFileSync(__dirname + "/mock-api.js", "utf8");
eval(code);

function api(path, init) {
  return window.fetch(path, init).then((r) => r.json().then((body) => ({ status: r.status, body })));
}

(async () => {
  const out = [];
  const check = (name, ok, extra) => out.push((ok ? "PASS" : "FAIL") + "  " + name + (extra ? "  -> " + extra : ""));

  // 1. meta
  let r = await api("/api/meta");
  check("GET /meta", r.body.minimaxAvailable === false, JSON.stringify(r.body));

  // 2. login
  r = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "ck", password: "123456" }) });
  const token = r.body.token;
  check("POST /auth/login", r.status === 200 && token && r.body.user.username === "ck", "user=" + (r.body.user && r.body.user.username));
  const H = { Authorization: "Bearer " + token };

  // 3. auth/me
  r = await api("/api/auth/me", { headers: H });
  check("GET /auth/me", r.body.user && r.body.user.username === "ck");

  // 4. projects
  r = await api("/api/projects", { headers: H });
  check("GET /projects", Array.isArray(r.body.projects) && r.body.projects.length === 3, "count=" + (r.body.projects || []).length);

  // 5. inspirations
  r = await api("/api/inspirations", { headers: H });
  check("GET /inspirations", (r.body.inspirations || []).length === 3);

  // 6. friends
  r = await api("/api/friends", { headers: H });
  check("GET /friends", (r.body.friends || []).length === 2, "friends=" + (r.body.friends || []).map((f) => f.username).join(","));

  // 7. received-shares
  r = await api("/api/received-shares", { headers: H });
  check("GET /received-shares", (r.body.receivedShares || []).length === 1, "title=" + (r.body.receivedShares[0] && r.body.receivedShares[0].title));

  // 8. collaborations
  r = await api("/api/collaborations", { headers: H });
  check("GET /collaborations", (r.body.collaborations || []).length === 1, "role=" + (r.body.collaborations[0] && r.body.collaborations[0].role));

  // 9. users/search
  r = await api("/api/users/search?q=pj&exact=0", { headers: H });
  check("GET /users/search", (r.body.users || []).some((u) => u.username === "pjr"), "relation=" + (r.body.users[0] && r.body.users[0].relation));

  // 10. share 公开访问
  r = await api("/api/share/NANFANG-DEMO-2026");
  check("GET /share/:token", r.body.project && r.body.version && r.body.version.title === "《南方的雨》");

  // 11. 创作流程：POST /projects -> job -> ready
  r = await api("/api/projects", { method: "POST", headers: H, body: JSON.stringify({ inspiration: "测试灵感", style: "流行", mood: "治愈", mode: "inspiration" }) });
  const jobId = r.body.jobId;
  check("POST /projects (job)", r.status === 202 && !!jobId, "jobId=" + jobId);
  r = await api("/api/jobs/" + jobId, { headers: H });
  check("GET /jobs/:id", r.body.status === "ready" && r.body.result.project && r.body.result.version, "status=" + r.body.status);
  r = await api("/api/projects", { headers: H });
  check("projects 新增后 = 4", (r.body.projects || []).length === 4);

  // 12. 评论
  r = await api("/api/projects/p-wanfeng/versions/v-wanfeng-1/comments", { headers: H });
  check("GET comments", (r.body.comments || []).length === 1);

  console.log(out.join("\n"));
  const fails = out.filter((l) => l.startsWith("FAIL")).length;
  console.log("\n" + (fails ? fails + " 个失败" : "全部通过"));
  process.exit(fails ? 1 : 0);
})();

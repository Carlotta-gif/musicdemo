(function exposeRouter(global) {
  const paths = {
    studio: "/studio",
    inspirations: "/inspirations",
    library: "/demos",
    received: "/shared-demos",
    collaborations: "/collaborations",
    login: "/login",
    register: "/register",
  };

  function parse(pathname, search = "") {
    const path = pathname.replace(/\/+$/, "") || "/";
    const legacyShare = new URLSearchParams(search).get("share");
    if (legacyShare) return { name: "share", token: legacyShare, legacy: true };
    if (path === "/") return { name: "studio", root: true };
    if (path === paths.studio) return { name: "studio" };
    if (path === paths.inspirations) return { name: "inspirations" };
    if (path === paths.library) return { name: "library" };
    if (path === paths.received) return { name: "received" };
    if (path === paths.collaborations) return { name: "collaborations" };
    if (path === paths.login) return { name: "login" };
    if (path === paths.register) return { name: "register" };

    const editor = path.match(/^\/demos\/([^/]+)\/versions\/([^/]+)\/edit$/);
    if (editor) {
      return {
        name: "editor",
        projectId: decodeURIComponent(editor[1]),
        versionId: decodeURIComponent(editor[2]),
      };
    }

    const demo = path.match(/^\/demos\/([^/]+)\/versions\/([^/]+)$/);
    if (demo) {
      return {
        name: "demo",
        projectId: decodeURIComponent(demo[1]),
        versionId: decodeURIComponent(demo[2]),
      };
    }

    const share = path.match(/^\/share\/([^/]+)$/);
    if (share) return { name: "share", token: decodeURIComponent(share[1]) };
    return { name: "not-found" };
  }

  function pathFor(name, values = {}) {
    if (name === "demo") {
      return `/demos/${encodeURIComponent(values.projectId)}/versions/${encodeURIComponent(values.versionId)}`;
    }
    if (name === "editor") {
      return `/demos/${encodeURIComponent(values.projectId)}/versions/${encodeURIComponent(values.versionId)}/edit`;
    }
    if (name === "share") return `/share/${encodeURIComponent(values.token)}`;
    return paths[name] || paths.studio;
  }

  global.AppRouter = { parse, pathFor, paths };
  if (typeof module !== "undefined") {
    module.exports = global.AppRouter;
    if (require.main === module) {
      console.assert(parse("/inspirations").name === "inspirations");
      console.assert(parse("/collaborations").name === "collaborations");
      console.assert(parse("/demos/p1/versions/v2").versionId === "v2");
      console.assert(parse("/demos/p1/versions/v2/edit").name === "editor");
      console.assert(pathFor("share", { token: "a b" }) === "/share/a%20b");
      console.log("Frontend routes: OK");
    }
  }
})(globalThis);

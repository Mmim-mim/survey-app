(function () {
  "use strict";
  const nativeFetch = window.fetch.bind(window);
  let sessionRequest;
  let expired = false;
  let loggingOut = false;
  const authKeys = ["isLoggedIn", "user", "displayName", "role", "dept_name"];
  const protectedPage = location.pathname === '/' || /^\/(?:index|admin|admin-users|admin-forms|admin-questions|admin-structure|admin-departments|dashboard|strategy-dashboard|from)\.html$/i.test(location.pathname);
  function clearAuthState() {
    for (const key of authKeys) localStorage.removeItem(key);
  }
  function protectedRequest(url, method) {
    const path = url.pathname.toLowerCase().replace(/\/+$/, "");
    if (["/api/login", "/api/logout", "/api/submissions"].includes(path)) return false;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
    return path === '/api/session' || path === '/api/departments' || path === '/api/forms' ||
      path.startsWith('/api/admin/') ||
      (/^\/api\/(dashboard|strategy-dashboard)\//.test(path) && url.searchParams.get('role') !== 'public');
  }
  function handleExpired(response, url, method) {
    if (response.status !== 401 || !protectedPage || loggingOut || !protectedRequest(url, method)) return response;
    if (!expired) {
      expired = true;
      sessionRequest = null;
      clearAuthState();
      alert("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
      location.replace('/login.html');
    }
    // Navigation replaces this document. Do not let page-level handlers render
    // empty data or raise duplicate alerts while the redirect is in progress.
    return new Promise(() => {});
  }
  async function session() {
    if (!sessionRequest) sessionRequest = nativeFetch("/api/session", { cache: "no-store", credentials: "same-origin" })
      .then(async response => {
        if (!response.ok) { sessionRequest = null; return { response }; }
        return { data: await response.json() };
      }).catch(error => { sessionRequest = null; throw error; });
    return sessionRequest;
  }
  window.fetch = async function (input, options = {}) {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href);
    const method = String(options.method || input?.method || "GET").toUpperCase();
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return nativeFetch(input, options);
    const write = !["GET", "HEAD", "OPTIONS"].includes(method);
    if (write && !["/api/login", "/api/submissions"].includes(url.pathname)) {
      const current = await session();
      if (!current.data) return handleExpired(current.response.clone(), url, method);
      const headers = new Headers(options.headers || input?.headers);
      headers.set("X-Survey-CSRF", current.data.csrfToken);
      options = { ...options, headers, credentials: "same-origin" };
    }
    const response = await nativeFetch(input, options);
    if ([401, 403].includes(response.status) || url.pathname === "/api/login" || url.pathname === "/api/logout") sessionRequest = null;
    return handleExpired(response, url, method);
  };
  // Some protected screens initially read public structure APIs only.
  // Check the session explicitly without changing those APIs' public behavior.
  if (protectedPage) document.addEventListener('DOMContentLoaded', () => {
    session().then(current => {
      if (current.response) return handleExpired(current.response, new URL('/api/session', location.href), 'GET');
    }).catch(() => {}); // Network/503 errors are not proof of an expired session.
  });
  // Capture before existing localStorage-only logout handlers, without changing the UI.
  document.addEventListener("click", async event => {
    const link = event.target.closest?.('a[href="login.html"], #btnLogout');
    if (!link || !(link.id === "btnLogout" || link.textContent.includes("ออกจากระบบ"))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    loggingOut = true;
    try {
      const response = await window.fetch("/api/logout", { method: "POST" });
      if (!response.ok && response.status !== 401) throw Error("ออกจากระบบไม่สำเร็จ กรุณาลองใหม่");
      clearAuthState();
      location.href = "login.html";
    } catch (error) { loggingOut = false; alert(error.message); }
  }, true);
})();

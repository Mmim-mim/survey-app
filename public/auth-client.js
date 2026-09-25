(function () {
  "use strict";
  const nativeFetch = window.fetch.bind(window);
  let sessionRequest;
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
      if (!current.data) return current.response.clone();
      const headers = new Headers(options.headers || input?.headers);
      headers.set("X-Survey-CSRF", current.data.csrfToken);
      options = { ...options, headers, credentials: "same-origin" };
    }
    const response = await nativeFetch(input, options);
    if ([401, 403].includes(response.status) || url.pathname === "/api/login" || url.pathname === "/api/logout") sessionRequest = null;
    return response;
  };
  // Capture before existing localStorage-only logout handlers, without changing the UI.
  document.addEventListener("click", async event => {
    const link = event.target.closest?.('a[href="login.html"], #btnLogout');
    if (!link || !(link.id === "btnLogout" || link.textContent.includes("ออกจากระบบ"))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      const response = await window.fetch("/api/logout", { method: "POST" });
      if (!response.ok && response.status !== 401) throw Error("ออกจากระบบไม่สำเร็จ กรุณาลองใหม่");
      localStorage.clear();
      location.href = "login.html";
    } catch (error) { alert(error.message); }
  }, true);
})();

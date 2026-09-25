(function (root) {
  "use strict";
  // Resolve an entire year before changing the UI. Late responses cannot replace a newer year.
  function create(fetcher) {
    let revision = 0;
    return {
      async load(year, structure = true) {
        const current = ++revision;
        const query = "?" + new URLSearchParams({ fiscal_year: year ?? "legacy" });
        async function get(path) {
          const response = await fetcher(path + query);
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "โหลด Question Bank ไม่สำเร็จ");
          return data;
        }
        const [questions, form] = await Promise.all([
          get("/api/question-bank/active"), structure ? get("/api/survey-structure/form") : null,
        ]);
        if (current !== revision) return null;
        if (!Array.isArray(questions)) throw new Error("Question Bank response ไม่ถูกต้อง");
        return { year, questions, form };
      },
      invalidate() { revision += 1; },
    };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { create };
  else root.BankYearLoader = { create };
})(typeof globalThis !== "undefined" ? globalThis : this);

(function (root) {
  "use strict";
  function invalid(message) {
    const error = new Error(message);
    error.status = 409;
    error.code = "FORM_FISCAL_YEAR_CONFLICT";
    throw error;
  }
  // Parse a date-only value without browser/server timezone conversion.
  function fromStartDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) invalid("กรุณาระบุวันที่เริ่มกิจกรรมให้ครบถ้วน (ปี-เดือน-วัน)");
    const [, y, m, d] = match.map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
      invalid("วันที่เริ่มกิจกรรมไม่ถูกต้อง");
    }
    return y + 543 + (m >= 10 ? 1 : 0);
  }
  function resolve(form = {}, columns = {}, requireYear = false) {
    const dates = [form.start_date, columns.start_date].filter(v => v !== null && v !== undefined && v !== "");
    if (!dates.length) invalid("ฟอร์มไม่มีวันที่เริ่มกิจกรรม กรุณาให้ผู้ดูแลตรวจสอบก่อนส่งคำตอบหรือบันทึก");
    if (dates.some(v => v !== dates[0])) invalid("วันที่เริ่มกิจกรรมในฟอร์มและข้อมูลโครงการไม่ตรงกัน กรุณาตรวจสอบ");
    const year = fromStartDate(dates[0]);
    const years = [form.fiscal_year, columns.fiscal_year].filter(v => v !== null && v !== undefined && v !== "");
    if (requireYear && !years.length) invalid("กรุณาระบุปีงบประมาณของฟอร์มให้ตรงกับวันที่เริ่มกิจกรรม");
    if (years.some(v => !/^\d{4}$/.test(String(v)) || Number(v) !== year)) {
      invalid(`ปีงบประมาณของฟอร์มไม่ตรงกับวันที่เริ่มกิจกรรม ซึ่งอยู่ในปีงบประมาณ พ.ศ. ${year} กรุณาตรวจสอบปีและวันที่เริ่มกิจกรรม`);
    }
    return { fiscal_year: year, fiscal_year_source: "form_start_date" };
  }
  // Only persisted pre-year-bank forms may use the former calendar-year policy.
  // Create/Edit must continue using resolve(), which never permits missing dates.
  function resolveSubmission(form = {}, columns = {}, now = new Date()) {
    const missingDate = value => value === null || value === undefined || value === "";
    if (missingDate(form.start_date) && missingDate(columns.start_date) &&
        !Object.prototype.hasOwnProperty.call(form, "question_bank_fiscal_year")) {
      const year = Number(new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Bangkok", year: "numeric", calendar: "gregory",
      }).format(now));
      return { fiscal_year: year + 543, fiscal_year_source: "legacy_calendar_year" };
    }
    return resolve(form, columns);
  }
  // New submissions use the saved snapshot only. Never infer a new year at read time.
  // undefined means Legacy: the caller must keep its existing fallback policy.
  function submissionYear(payload = {}) {
    if (payload.fiscal_year_source !== "form_start_date") return undefined;
    return /^\d{4}$/.test(String(payload.fiscal_year))
      ? Number(payload.fiscal_year) : null;
  }
  const api = { fromStartDate, resolve, resolveSubmission, submissionYear };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FiscalYear = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

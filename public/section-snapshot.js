(function (root) {
  "use strict";
  const definitions = [
    ["respondent_info", "ข้อมูลผู้ประเมิน"],
    ["rating_questions", "ส่วนของคำถาม (Rating Scale 5 ระดับ)"],
    ["dissatisfaction", "ท่านมีความไม่พึงพอใจต่อการจัดกิจกรรม (โปรดระบุ)"],
    ["activity_referral", "ท่านจะบอกต่อกิจกรรมนี้ให้เพื่อนหรือคนรู้จักหรือไม่"],
    ["suggestions", "ข้อเสนอแนะ"],
  ];
  function normalize(form = {}) {
    const sections = {};
    definitions.forEach(([key, defaultTitle], index) => {
      const saved = form.sections?.[key];
      if (saved && saved.section_key !== key) {
        throw new Error("Invalid section identity: " + key);
      }
      const legacyTitle = key === "activity_referral"
        ? form.engagement_question : key === "suggestions" ? form.suggestion_prompt : "";
      sections[key] = {
        section_key: key,
        title: saved ? saved.title : (legacyTitle || defaultTitle),
        description: saved ? (saved.description ?? "") : "",
        enabled: typeof saved?.enabled === "boolean"
          ? saved.enabled : form[`section${index + 1}_enabled`] !== false,
      };
      if (typeof sections[key].title !== "string" || !sections[key].title.trim() ||
          typeof sections[key].description !== "string") {
        throw new Error("Invalid section title/description: " + key);
      }
    });
    return sections;
  }
  function fromAdmin(rows) {
    const sections = {};
    definitions.forEach(([key]) => {
      const matches = rows.filter(row => row.section_key === key);
      if (matches.length !== 1) throw new Error("Missing or duplicate Section: " + key);
      const row = matches[0];
      sections[key] = { section_key: key, title: row.title,
        description: row.description ?? "", enabled: false };
    });
    return normalize({ sections });
  }
  function attach(form, sections = normalize(form)) {
    const result = { ...form, section_snapshot_version: 1, sections };
    definitions.forEach(([key], index) => {
      result[`section${index + 1}_enabled`] = sections[key].enabled;
    });
    return result;
  }
  function render(document, sections, builder = false) {
    definitions.forEach(([key], index) => {
      const section = document.querySelector(`[data-section-key="${key}"]`) || (builder
        ? document.querySelector(`[data-sec="s${index + 1}"]`)
        : document.getElementById(`sec${index + 1}`));
      if (!section) return;
      section.dataset.sectionKey = key;
      const title = section.querySelector(builder ? ".head .title" : ".title");
      if (!title) return;
      title.textContent = sections[key].title;
      let description = section.querySelector("[data-section-description]");
      if (!description) {
        description = document.createElement("div");
        description.setAttribute("data-section-description", "");
        description.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0;";
        if (builder) section.querySelector(".head").after(description);
        else title.after(description);
      }
      description.textContent = sections[key].description;
      description.hidden = !sections[key].description;
    });
  }
  const api = { definitions, normalize, fromAdmin, attach, render };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SectionSnapshot = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

'use strict';
let departments = [], editing = null, opener = null, busy = false;
const rows = document.getElementById('departmentRows'), dialog = document.getElementById('departmentDialog'),
  form = document.getElementById('departmentForm'), nameInput = document.getElementById('departmentName'), notice = document.getElementById('notice');
async function api(url, options = {}) {
  const response = await fetch(url, {...options, headers: {'Content-Type':'application/json'}, cache:'no-store'});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'ดำเนินการไม่สำเร็จ');
  return data;
}
function render() {
  rows.replaceChildren();
  departments.forEach((d, index) => {
    const tr = document.createElement('tr');
    for (const value of [index + 1, d.dept_name]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
    const status = document.createElement('td'), badge = document.createElement('span');
    badge.className = 'badge ' + (d.is_active ? 'on' : 'off'); badge.textContent = d.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'; status.append(badge); tr.append(status);
    const actions = document.createElement('td'), button = document.createElement('button');
    button.type = 'button'; button.className = 'btn'; button.textContent = 'แก้ไข'; button.setAttribute('aria-label', 'แก้ไข ' + d.dept_name);
    button.onclick = () => openEditor(d, button); actions.append(button); tr.append(actions); rows.append(tr);
  });
  document.getElementById('departmentCount').textContent = departments.length + ' ฝ่าย';
}
async function load() { departments = await api('/api/admin/departments'); render(); }
function openEditor(department, button) {
  editing = department; opener = button; form.reset(); nameInput.setCustomValidity('');
  document.getElementById('deleteDepartment').hidden = !department;
  document.getElementById('dialogTitle').textContent = department ? 'แก้ไขฝ่าย' : 'เพิ่มฝ่าย';
  if (department) { nameInput.value = department.dept_name; form.elements.status.value = department.is_active ? 'active' : 'inactive'; }
  dialog.showModal(); nameInput.focus();
}
async function saveAction(action, message) {
  if (busy) return;
  busy = true;
  try { await action(); dialog.close(); await load(); notice.textContent = message; }
  catch (error) { alert(error.message); }
  finally { busy = false; }
}
document.getElementById('addDepartment').onclick = e => openEditor(null, e.currentTarget);
document.getElementById('cancelDepartment').onclick = () => { if (!busy) dialog.close(); };
document.getElementById('deleteDepartment').onclick = () => {
  if (!editing || !confirm('ยืนยันลบฝ่าย “' + editing.dept_name + '” หรือไม่?')) return;
  const id = editing.id;
  saveAction(() => api('/api/admin/departments/' + id, {method:'DELETE'}), 'ลบฝ่ายแล้ว');
};
dialog.addEventListener('close', () => { if (opener?.isConnected) opener.focus(); else document.getElementById('addDepartment').focus(); });
nameInput.oninput = () => nameInput.setCustomValidity('');
form.onsubmit = e => {
  e.preventDefault(); const dept_name = nameInput.value.trim();
  if (!dept_name) { nameInput.setCustomValidity('กรุณากรอกชื่อฝ่าย'); nameInput.reportValidity(); return; }
  const body = {dept_name, is_active:form.elements.status.value === 'active', sort_order: editing?.sort_order ?? 0};
  const url = '/api/admin/departments' + (editing ? '/' + editing.id : '');
  const method = editing ? 'PUT' : 'POST';
  saveAction(() => api(url, {method, body:JSON.stringify(body)}), 'บันทึกฝ่ายแล้ว');
};
(async () => {
  try {
    const session = await api('/api/session');
    if (session.user.role !== 'admin') throw new Error('หน้านี้สำหรับ admin เท่านั้น');
    await load();
  } catch (error) { notice.textContent = error.message; document.getElementById('addDepartment').disabled = true; }
})();

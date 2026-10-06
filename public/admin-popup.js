(function () {
  'use strict';
  const titles = {success: 'สำเร็จ', warning: 'แจ้งเตือน', error: 'เกิดข้อผิดพลาด', info: 'ข้อมูล'};
  let queue = Promise.resolve();
  async function show(options, confirmation = false) {
    if (!document.body) await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once: true}));
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'admin-popup';
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'admin-popup-title');
    dialog.setAttribute('aria-describedby', 'admin-popup-message');
    const type = confirmation ? (options.destructive ? 'error' : 'info') : Object.hasOwn(titles, options.type) ? options.type : 'info';
    dialog.dataset.type = type;
    const icon = document.createElement('span');
    icon.className = 'admin-popup-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = type === 'success' ? '✓' : type === 'info' ? 'i' : '!';
    const title = document.createElement('h2');
    title.id = 'admin-popup-title';
    title.textContent = options.title ?? (confirmation ? 'ยืนยันการดำเนินการ' : titles[type]);
    const message = document.createElement('p');
    message.id = 'admin-popup-message';
    message.textContent = options.message ?? '';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = options.confirmText ?? (confirmation ? 'ยืนยัน' : 'ตกลง');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'admin-popup-cancel';
    cancel.textContent = options.cancelText ?? 'ยกเลิก';
    dialog.append(icon, title, message);
    if (confirmation) {
      const actions = document.createElement('div');
      actions.className = 'admin-popup-actions';
      actions.append(cancel, button);
      dialog.append(actions);
    } else dialog.append(button);
    document.body.append(dialog);
    let confirmed = false;
    await new Promise(resolve => {
      button.addEventListener('click', () => { confirmed = true; dialog.close(); });
      cancel.addEventListener('click', () => dialog.close());
      dialog.addEventListener('cancel', event => { event.preventDefault(); if (options.dismissible !== false) dialog.close(); });
      dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') event.stopPropagation();
        if (event.key === 'Tab') {
          event.preventDefault();
          (confirmation && document.activeElement === button ? cancel : button).focus();
        }
      });
      dialog.addEventListener('close', resolve, {once: true});
      // Native top layer supports an alert above an existing department dialog.
      // Backdrop clicks intentionally do not dismiss an acknowledgement.
      dialog.showModal();
      (confirmation ? cancel : button).focus();
    });
    dialog.remove();
    if (previous?.isConnected) previous.focus();
    return confirmation ? confirmed : undefined;
  }
  function enqueue(options, confirmation) {
    const snapshot = {...options};
    const result = queue.then(() => show(snapshot, confirmation));
    queue = result.catch(() => {});
    return result;
  }
  window.AdminPopup = Object.freeze({
    alert(options = {}) {
      return enqueue(options, false);
    },
    confirm(options = {}) { return enqueue(options, true); }
  });
})();

/* Shared UI only. Logout remains handled by auth-client.js. */
(() => {
  const button = document.getElementById('hamburgerBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  function setOpen(open) {
    document.body.classList.toggle('sidebar-open', open);
    button.setAttribute('aria-expanded', String(open));
    sidebar.inert = !open;
  }
  setOpen(false);
  button.addEventListener('click', () => setOpen(!document.body.classList.contains('sidebar-open')));
  overlay.addEventListener('click', () => setOpen(false));
  sidebar.addEventListener('click', event => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
      setOpen(false);
      button.focus();
    }
  });
})();

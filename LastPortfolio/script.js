const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('#site-nav');

menuButton.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
});

nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
}));


const signalButton = document.querySelector('.signal-check');
const signalResult = document.querySelector('.signal-result');


signalButton.addEventListener('click', () => {

    signalButton.disabled = true;
    signalResult.textContent = 'checking…';
    window.setTimeout(() => {
      signalResult.textContent = ' signal clear';
      signalButton.disabled = false;
    }, 650);

});

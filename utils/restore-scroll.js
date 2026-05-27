document.body.style.opacity = 0;

// dev template helper
function saveScroll() {
	localStorage.setItem('scrollY', window.scrollY);
}

function restoreScroll() {
	let y = localStorage.getItem('scrollY');
	document.body.style.opacity = 1;

	if (y === null) {
		return;
	}

	window.scrollTo(0, +y);
}

window.addEventListener('beforeunload', saveScroll);

(async () => {
	await wait.Until(() => document.querySelector('._app').dataset.isReady);
	restoreScroll();
})();

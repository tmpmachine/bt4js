let wait = (function () {
	let SELF = {
		Until,
	};

	function Until(stateCheckCallback, delayMs = 100, timeoutMs = null, initialDelayMs = 0) {
		let useTimeout = timeoutMs !== null;
		delayMs = delayMs ?? 100;

		return new Promise((resolve, reject) => {
			let interval;

			function checkFunction() {
				let shouldResolve = stateCheckCallback();

				timeoutMs -= delayMs;

				if (shouldResolve) {
					window.clearInterval(interval);
					resolve();
				} else if (useTimeout && timeoutMs <= 0) {
					window.clearInterval(interval);
					reject();
				}
			}

			window.setTimeout(() => {
				checkFunction();
				interval = window.setInterval(checkFunction, delayMs);
			}, initialDelayMs);
		});
	}

	return SELF;
})();

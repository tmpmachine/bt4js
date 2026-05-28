// @ts-check

// version: 6.19
function appBuilder(options) {
	// tags: #vars
	let $ = document.querySelector.bind(document);
	let devTemplate = null;
	let sections = {};
	let widgets = [];
	let widgetsMap = new Map();
	let dataDoc = document;
	let htmlWidgets = [];
	let templateMap = new Map();
	let _globalData = {};
	let _isDevelopment = options?.isDevelopment ?? true;
	const ATTR_BINDINGS = ['href', 'src', 'title', 'alt'];
	const attrSelector = ['[b-data]', ...ATTR_BINDINGS.map((x) => `[b-attr-${x}]`)].join(',');

	// #function

	function readChildData(node, data) {
		for (const branchNode of node.children) {
			if (branchNode.tagName !== 'DATA') continue;

			readBranchNode(branchNode, data);
		}
	}

	function readChildArray(node, items) {
		let data = {};

		for (const branchNode of node.children) {
			if (branchNode.tagName !== 'DATA') continue;

			readBranchNode(branchNode, data);
		}

		items.push(data);
	}

	function readBranchNode(branchNode, data) {
		let key = branchNode.getAttribute('key');

		if (!key) return;

		// array
		if (key.endsWith('[]')) {
			let items = [];

			for (const twigNode of branchNode.children) {
				if (twigNode.tagName !== 'DIV') continue;

				readChildArray(twigNode, items);
			}

			data[key.replace('[]', '')] = items;
			return;
		}

		// boolean
		if (branchNode.getAttribute('type') === 'boolean') {
			data[key] = branchNode.textContent.trim() === 'true';
			return;
		}

		// node/html content
		if (branchNode.getAttribute('type') === 'node') {
			data[key] = {
				type: 'node',
				value: [...branchNode.childNodes].map((n) => n.cloneNode(true)),
			};

			return;
		}

		// text
		data[key] = branchNode.textContent.trim();
	}

	// tags: #load_data
	// #load data
	function loadData() {
		let nodes = dataDoc.querySelectorAll('.WidgetData');

		for (let node of nodes) {
			let widget = widgetsMap.get(node.id);

			if (!widget) {
				widget = {
					id: node.id,
					title: node.content.querySelector('[key="title"]')?.textContent.trim(),
					sectionId: node.parentElement?.parentElement?.id,
					data: {},
				};

				widgets.push(widget);
				widgetsMap.set(widget.id, widget);

				if (widget.sectionId != '') {
					if (!sections[widget.sectionId]) {
						sections[widget.sectionId] = [];
					}

					sections[widget.sectionId].push(widget);
				}
			}

			readChildData(node.content.firstElementChild, widget.data);
		}
	}

	// #builder
	const widgetBase = {
		templateSelector: '',
		templateNode: null,
		data: {},
		build() {
			let docFrag = document.createDocumentFragment();

			let templateNode = this.templateNode ?? templateMap.get(this.templateSelector.slice(1));

			if (!templateNode) {
				return docFrag;
			}

			let data = this.data;

			let containerEl =
				(templateNode.content ?? templateNode).cloneNode(true) ?? document.createDocumentFragment();

			removeConditionalWidgets(containerEl, data);
			fillDataSlots(containerEl, data);

			docFrag.append(containerEl);

			return docFrag;
		},
	};

	// tags: #file
	async function replaceFileTags_(containerEl, baseURL = location.href) {
		const fileTags = [...containerEl.content.querySelectorAll('file')];

		await Promise.all(
			fileTags.map(async (el) => {
				const src = el.getAttribute('src');

				if (!src) {
					el.remove();
					return;
				}

				const resolvedSrc = new URL(src, baseURL).href;

				const html = await fetch(resolvedSrc).then((r) => r.text());

				const templateEl = document.createElement('template');
				templateEl.innerHTML = html;

				el.replaceWith(templateEl.content);
			}),
		);
	}

	// #build
	async function build_() {
		if (_isDevelopment) {
			let docEl = $('._appTemplate');

			// replace template file
			await replaceFileTags_(docEl);

			buildTemplateMap(docEl.content);

			// replace includables
			{
				for (const templateTag of docEl.content.querySelectorAll('template')) {
					replaceIncludables(templateTag);
				}

				replaceIncludables(docEl);
			}

			let content = docEl.content;
			devTemplate = content;

			fillWidgets();
			$('._app').replaceChildren(content);
		} else {
			let content = $('._appTemplate').content.cloneNode(true);

			$('._appTemplate').remove();

			const fragment = document.createDocumentFragment();

			content.querySelectorAll('.widget-content').forEach((widget) => {
				fragment.append(...widget.childNodes);
			});

			devTemplate = fragment;

			// build template map from flattened structure
			buildTemplateMap(devTemplate);

			// replace includables in production mode
			{
				for (const templateTag of devTemplate.querySelectorAll('template')) {
					replaceIncludables(templateTag);
				}

				replaceIncludables({ content: devTemplate });
			}

			fillWidgets();
			$('._app').replaceChildren(...devTemplate.childNodes);
		}

		// release from memory
		if (!_isDevelopment) {
			widgets.length = 0;
			widgetsMap.clear();
			sections = {};
		}
	}

	function replaceIncludables(rootTemplate) {
		const pending = [rootTemplate];

		while (pending.length > 0) {
			const parentTemplate = pending.pop();

			const includeTags = parentTemplate.content.querySelectorAll('b-include');

			for (const includeTag of includeTags) {
				const target = includeTag.getAttribute('template');

				if (!target) {
					console.warn('b-include: `template` attribute is required', includeTag);

					includeTag.remove();
					continue;
				}

				const templateTag = findTemplate(parentTemplate, target);

				if (!templateTag) {
					console.warn(`Cannot find template ${target} for b-include`, includeTag);

					includeTag.remove();
					continue;
				}

				const cloned = templateTag.content.cloneNode(true);

				// scan newly inserted templates later
				for (const nestedTemplate of cloned.querySelectorAll('template')) {
					pending.push(nestedTemplate);
				}

				includeTag.before(cloned);
				includeTag.remove();
			}
		}
	}

	function buildTemplateMap(root) {
		templateMap.clear();

		for (const template of root.querySelectorAll('template[id]')) {
			templateMap.set(template.id, template);
		}
	}

	function getWidgetType(text) {
		const match = text.match(/^([A-Za-z]+)/);
		const result = match ? match[1] : null;
		return result;
	}

	// #condition
	function evalKey(key, data) {
		let isInverse = false;

		if (key.startsWith('!')) {
			isInverse = true;
			key = key.slice(1);
		}

		let value = data[key];
		let evalResult = false;

		if (typeof value === 'boolean') {
			evalResult = value;
		} else if (Array.isArray(value)) {
			evalResult = value.length > 0;
		} else {
			evalResult = !!value;
		}

		return isInverse ? !evalResult : evalResult;
	}

	function evalExpr(str, data) {
		let orParts = str.split(/\s+or\s+/i).map((s) => s.trim());
		return orParts.some((orPart) => {
			let andParts = orPart.split(/\s+and\s+/i).map((s) => s.trim());
			return andParts.every((key) => evalKey(key, data));
		});
	}

	function removeConditionalWidgets(container = devTemplate, data = {}) {
		let nodes = container.querySelectorAll('[b-if]');

		for (const node of nodes) {
			let expr = node.getAttribute('b-if').trim();
			let isCondMet = evalExpr(expr, data);

			if (!isCondMet) node.remove();
			else node.removeAttribute('b-if');
		}
	}

	// this is the initial process of replacing custom template tags
	// tags: #fill
	function fillWidgets() {
		let globalData = widgetsMap.get('Global')?.data ?? {};
		_globalData = globalData;

		removeConditionalWidgets(devTemplate, _globalData);
		fillDataSlots(devTemplate, _globalData);

		let processedCount = 0;

		// A rendered widget template can have a b-section,
		// and that section can render widgets.
		// Stop after a pass where neither processor replaces anything.
		do {
			processedCount = processSection();
			processedCount += processWidget();
		} while (processedCount > 0);
	}

	function fillDataSlots(containerEl, data) {
		const bindings = {
			data: new Map(),
			attr: new Map(),
		};

		// single DOM traversal
		for (const el of containerEl.querySelectorAll(attrSelector)) {
			const dataKey = el.getAttribute('b-data');

			if (dataKey) {
				if (!bindings.data.has(dataKey)) {
					bindings.data.set(dataKey, []);
				}

				bindings.data.get(dataKey).push(el);
			}

			for (const attr of [...el.attributes]) {
				if (!attr.name.startsWith('b-attr-')) continue;

				const realAttr = attr.name.slice(7);
				const key = attr.value;

				if (!bindings.attr.has(realAttr)) {
					bindings.attr.set(realAttr, new Map());
				}

				const attrMap = bindings.attr.get(realAttr);

				if (!attrMap.has(key)) {
					attrMap.set(key, []);
				}

				attrMap.get(key).push(el);
			}
		}

		for (const [key, value] of Object.entries(data)) {
			// array template rendering
			if (Array.isArray(value) && value?.type !== 'node') {
				const elements = bindings.data.get(key);

				if (!elements) continue;

				for (const el of elements) {
					const docFrag = document.createDocumentFragment();
					const templateName = el.getAttribute('b-template');

					for (const v of value) {
						const widgetBuilder = Object.create(widgetBase);

						widgetBuilder.data = {
							..._globalData,
							...data,
							...v,
						};

						widgetBuilder.templateSelector = `#${templateName}`;

						const childNodes = widgetBuilder.build();

						docFrag.append(...childNodes.childNodes);
					}

					el.replaceChildren(docFrag);

					el.removeAttribute('b-data');
					el.removeAttribute('b-template');
				}

				continue;
			}

			// generic attr bindings
			if (typeof value === 'string') {
				for (const [attrName, attrMap] of bindings.attr) {
					const elements = attrMap.get(key);

					if (!elements) continue;

					for (const el of elements) {
						el.setAttribute(attrName, value);
						el.removeAttribute(`b-attr-${attrName}`);
					}
				}
			}

			// text / node bindings
			const dataElements = bindings.data.get(key);

			if (dataElements) {
				for (const el of dataElements) {
					if (typeof value === 'string' || typeof value === 'number') {
						el.textContent = value;
					} else if (value?.type === 'node') {
						el.replaceChildren(...value.value.map((n) => n.cloneNode(true)));
					}

					el.removeAttribute('b-data');
				}
			}
		}
	}

	// tags: #section
	function processSection() {
		let nodes = devTemplate.querySelectorAll('b-section');
		let processedCount = 0;

		for (let node of nodes) {
			let sectionId = node.getAttribute('id');
			let sectionContainer = dataDoc.getElementById(sectionId);

			if (!sectionContainer?.classList.contains('section')) {
				continue;
			}

			let sectionNode = sectionContainer.cloneNode(true);
			let widgetNodes = [...sectionNode.children].filter((n) => n.classList.contains('widget'));

			widgetNodes.forEach((widgetNode) => {
				let instanceId = widgetNode.id;
				let widgetType = getWidgetType(instanceId);
				let templateNode =
					devTemplate.querySelector(`template#${widgetType}[b-section="${sectionId}"]`) ||
					devTemplate.querySelector(`template#${widgetType}`);

				if (widgetType == 'HTML') {
					htmlWidgets.push(widgetNode);
				}

				if (!templateNode) {
					// display as is
					node.parentNode.insertBefore(widgetNode, node);
					return;
				}

				let widgetBuilder = Object.create(widgetBase);
				let widgetData = widgetsMap.get(instanceId);

				widgetBuilder.data = Object.assign(widgetData?.data ?? {}, _globalData);
				widgetBuilder.templateNode = templateNode;

				const childNode = widgetBuilder.build();

				node.parentNode.insertBefore(childNode, node);
			});

			node.remove();
			processedCount++;
		}

		return processedCount;
	}

	// #widgets
	function processWidget() {
		let processedCount = 0;

		// keep processing to handle nested b-widget tags
		while (true) {
			let nodes = devTemplate.querySelectorAll('b-widget');

			if (nodes.length === 0) break;

			for (let node of nodes) {
				let widgetId = node.getAttribute('id');
				let widgetType = getWidgetType(widgetId);
				let templateId = node.getAttribute('template');
				let widgetData = widgetsMap.get(widgetId);
				let templateNode =
					devTemplate.querySelector(`template#${templateId}`) ||
					devTemplate.querySelector(`template#${widgetType}:not([b-section])`);

				if (!templateNode) {
					console.log(`Widget template not found for widget:`, widgetId);
					node.remove();
					processedCount++;
					continue;
				}

				if (!widgetData) {
					console.log(`WidgetData with ID ${widgetId} not found.`);
					node.remove();
					processedCount++;
					continue;
				}

				let widgetBuilder = Object.create(widgetBase);
				widgetBuilder.data = Object.assign(widgetData.data, _globalData, {
					widgetId: widgetId,
				});
				widgetBuilder.templateNode = templateNode;

				const childNode = widgetBuilder.build();

				node.parentNode.insertBefore(childNode, node);
				node.remove();
				processedCount++;
			}
		}

		return processedCount;
	}

	function findTemplate(parentTemplate, target) {
		for (const node of parentTemplate.content.children) {
			if (node.tagName === 'TEMPLATE' && node.id === target) {
				return node;
			}
		}

		return templateMap.get(target);
	}

	// #self
	let SELF = {
		GetWidgetsData: () => widgets,

		//  #init
		async init() {
			if (_isDevelopment) {
				let url = new URL(location.href);
				let fileName = options.fileName ?? url.pathname.split('/').pop();
				let pageDataUrl = [options.dataPath, fileName].join('/');
				let html = await fetch(pageDataUrl).then((response) => response.text());
				const parser = new DOMParser();
				const doc = parser.parseFromString(html, 'text/html');
				dataDoc = doc;
			}

			loadData();

			if (_isDevelopment) {
				console.log('sections in this page:', sections);
				console.log('widgets in this page:', widgets);
			}

			await build_();

			// for use in application script
			$('._app').dataset.isReady = true;
		},
	};

	return SELF;
}

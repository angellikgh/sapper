import { writable } from 'svelte/store';
import App from '@sapper/internal/App.svelte';
import {
	extract_query,
	init as init_router,
	load_current_page,
	select_target
} from './router';
import { get_prefetched, start as start_prefetching } from './prefetch';
import {
	DOMComponentLoader,
	DOMComponentModule,
	ErrorComponent,
	components,
	root_comp
} from '@sapper/internal/manifest-client';
import {
	HydratedTarget,
	Target,
	Redirect,
	Branch,
	Page,
	PageContext
} from './types';
import goto from './goto';
import { page_store } from './stores';

declare const __SAPPER__;
export const initial_data = typeof __SAPPER__ !== 'undefined' && __SAPPER__;

let ready = false;
let root_component: InstanceType<typeof App>;
let current_token: {};
let root_preloaded: Promise<any>;
let current_branch = [];
let current_query = '{}';

const stores = {
	page: page_store({}),
	preloading: writable(null),
	session: writable(initial_data && initial_data.session)
};

let $session;
let session_dirty: boolean;

stores.session.subscribe(async value => {
	$session = value;

	if (!ready) return;
	session_dirty = true;

	const dest = select_target(new URL(location.href));

	const token = current_token = {};
	const { redirect, props, branch } = await hydrate_target(dest);
	if (token !== current_token) return; // a secondary navigation happened while we were loading

	if (redirect) {
		await goto(redirect.location, { replaceState: true });
	} else {
		await render(branch, props, buildPageContext(props, dest.page));
	}
});

export let target: Element;
export function set_target(element) {
	target = element;
}

export default function start(opts: {
	target: Node
}): Promise<void> {
	set_target(opts.target);

	init_router(initial_data.baseUrl, handle_target);

	start_prefetching();

	if (initial_data.error) {
		return Promise.resolve().then(() => {
			return handle_error(new URL(location.href));
		});
	}

	return load_current_page();
}

function handle_error(url: URL) {
	const { host, pathname, search } = location;
	const { session, preloaded, status, error } = initial_data;

	if (!root_preloaded) {
		root_preloaded = preloaded && preloaded[0];
	}

	const props = {
		error,
		status,
		session,
		level0: {
			props: root_preloaded
		},
		level1: {
			props: {
				status,
				error
			},
			component: ErrorComponent
		},
		segments: preloaded

	};
	const query = extract_query(search);
	render([], props, { host, path: pathname, query, params: {}, error });
}


function buildPageContext(props: any, page: Page): PageContext {
  const { error } = props;

  return { error, ...page };
}

async function handle_target(dest: Target): Promise<void> {
	if (root_component) stores.preloading.set(true);

	const hydrating = get_prefetched(dest);

	const token = current_token = {};
	const hydrated_target = await hydrating;
	const { redirect } = hydrated_target;
	if (token !== current_token) return; // a secondary navigation happened while we were loading

	if (redirect) {
		await goto(redirect.location, { replaceState: true });
	} else {
		const { props, branch } = hydrated_target;
		await render(branch, props, buildPageContext(props, dest.page));
	}
}

async function render(branch: Branch, props: any, page: PageContext) {
	stores.page.set(page);
	stores.preloading.set(false);

	if (root_component) {
		root_component.$set(props);
	} else {
		props.stores = {
			page: { subscribe: stores.page.subscribe },
			preloading: { subscribe: stores.preloading.subscribe },
			session: stores.session
		};
		props.level0 = {
			props: await root_preloaded
		};
		props.notify = stores.page.notify;

		root_component = new App({
			target,
			props,
			hydrate: true
		});
	}

	current_branch = branch;
	current_query = JSON.stringify(page.query);
	ready = true;
	session_dirty = false;
}

function part_changed(i, segment, match, stringified_query) {
	// TODO only check query string changes for preload functions
	// that do in fact depend on it (using static analysis or
	// runtime instrumentation)
	if (stringified_query !== current_query) return true;

	const previous = current_branch[i];

	if (!previous) return false;
	if (segment !== previous.segment) return true;
	if (previous.match) {
		if (JSON.stringify(previous.match.slice(1, i + 2)) !== JSON.stringify(match.slice(1, i + 2))) {
			return true;
		}
	}
}

export async function hydrate_target(dest: Target): Promise<HydratedTarget> {
	const { route, page } = dest;
	const segments = page.path.split('/').filter(Boolean);

	let redirect: Redirect = null;

	const props = { error: null, status: 200, segments: [segments[0]] };

	const preload_context = {
		fetch: (url: string, opts?: any) => fetch(url, opts),
		redirect: (statusCode: number, location: string) => {
			if (redirect && (redirect.statusCode !== statusCode || redirect.location !== location)) {
				throw new Error('Conflicting redirects');
			}
			redirect = { statusCode, location };
		},
		error: (status: number, error: Error | string) => {
			props.error = typeof error === 'string' ? new Error(error) : error;
			props.status = status;
		}
	};

	if (!root_preloaded) {
		const root_preload = root_comp.preload || (() => {});
		root_preloaded = initial_data.preloaded[0] || root_preload.call(preload_context, {
			host: page.host,
			path: page.path,
			query: page.query,
			params: {}
		}, $session);
	}

	let branch: Branch;
	let l = 1;

	try {
		const stringified_query = JSON.stringify(page.query);
		const match = route.pattern.exec(page.path);

		let segment_dirty = false;

		branch = await Promise.all(route.parts.map(async (part, i) => {
			const segment = segments[i];

			if (part_changed(i, segment, match, stringified_query)) segment_dirty = true;

			props.segments[l] = segments[i + 1]; // TODO make this less confusing
			if (!part) return { segment };

			const j = l++;

			if (!session_dirty && !segment_dirty && current_branch[i] && current_branch[i].part === part.i) {
				return current_branch[i];
			}

			segment_dirty = false;

			const { default: component, preload } = await load_component(components[part.i]);

			let preloaded;
			if (ready || !initial_data.preloaded[i + 1]) {
				preloaded = preload
					? await preload.call(preload_context, {
						host: page.host,
						path: page.path,
						query: page.query,
						params: part.params ? part.params(dest.match) : {}
					}, $session)
					: {};
			} else {
				preloaded = initial_data.preloaded[i + 1];
			}

			return (props[`level${j}`] = { component, props: preloaded, segment, match, part: part.i });
		}));
	} catch (error) {
		props.error = error;
		props.status = 500;
		branch = [];
	}

	return { redirect, props, branch };
}

export function load_component(component: DOMComponentLoader): Promise<DOMComponentModule> {
	const promises: Array<Promise<any>> = [component.js()];
	return Promise.all(promises).then(values => values[0]);
}

function detach(node: Node) {
	node.parentNode.removeChild(node);
}

import * as fs from 'fs';
import * as path from 'path';
import { posixify, stringify, walk, write_if_changed } from '../utils';
import { Page, PageComponent, ManifestData } from '../interfaces';

const app = fs.readFileSync(path.resolve(__dirname, '../templates/App.html'), 'utf-8');
const internal = fs.readFileSync(path.resolve(__dirname, '../templates/internal.mjs'), 'utf-8');
const layout = fs.readFileSync(path.resolve(__dirname, '../templates/layout.html'), 'utf-8');

export function create_main_manifests({
	bundler,
	manifest_data,
	dev_port,
	dev,
	cwd,
	src,
	dest,
	routes,
	output
}: {
	bundler: string,
	manifest_data: ManifestData;
	dev_port?: number;
	dev: boolean;
	cwd: string;
	src: string;
	dest: string;
	routes: string;
	output: string
}) {
	if (!fs.existsSync(output)) fs.mkdirSync(output);

	const path_to_routes = path.relative(output, routes);

	const client_manifest = generate_client(manifest_data, path_to_routes, bundler, dev, dev_port);
	const server_manifest = generate_server(manifest_data, path_to_routes, cwd, src, dest, dev);

	write_if_changed(`${output}/_layout.html`, layout);
	write_if_changed(`${output}/internal.mjs`, internal);
	write_if_changed(`${output}/App.html`, app);
	write_if_changed(`${output}/app.mjs`, client_manifest);
	write_if_changed(`${output}/server.mjs`, server_manifest);
}

export function create_serviceworker_manifest({ manifest_data, output, client_files, static_files }: {
	manifest_data: ManifestData;
	output: string;
	client_files: string[];
	static_files: string;
}) {
	let files: string[] = ['/service-worker-index.html'];

	if (fs.existsSync(static_files)) {
		files = files.concat(walk(static_files));
	} else {
		// TODO remove in a future version
		if (fs.existsSync('assets')) {
			throw new Error(`As of Sapper 0.21, the assets/ directory should become static/`);
		}
	}

	let code = `
		// This file is generated by Sapper — do not edit it!
		export const timestamp = ${Date.now()};

		export const files = [\n\t${files.map((x: string) => stringify(x)).join(',\n\t')}\n];
		export { files as assets }; // legacy

		export const shell = [\n\t${client_files.map((x: string) => stringify(x)).join(',\n\t')}\n];

		export const routes = [\n\t${manifest_data.pages.map((r: Page) => `{ pattern: ${r.pattern} }`).join(',\n\t')}\n];
	`.replace(/^\t\t/gm, '').trim();

	write_if_changed(`${output}/service-worker.js`, code);
}

function generate_client(
	manifest_data: ManifestData,
	path_to_routes: string,
	bundler: string,
	dev: boolean,
	dev_port?: number
) {
	const template_file = path.resolve(__dirname, '../templates/app.mjs');
	const template = fs.readFileSync(template_file, 'utf-8');

	const page_ids = new Set(manifest_data.pages.map(page =>
		page.pattern.toString()));

	const server_routes_to_ignore = manifest_data.server_routes.filter(route =>
		!page_ids.has(route.pattern.toString()));

	const component_indexes: Record<string, number> = {};

	const components = `[
		${manifest_data.components.map((component, i) => {
			const annotation = bundler === 'webpack'
				? `/* webpackChunkName: "${component.name}" */ `
				: '';

			const source = get_file(path_to_routes, component);

			component_indexes[component.name] = i;

			return `{
			js: () => import(${annotation}${stringify(source)}),
			css: "__SAPPER_CSS_PLACEHOLDER:${stringify(component.file, false)}__"
		}`;
		}).join(',\n\t\t')}
	]`.replace(/^\t/gm, '').trim();

	let needs_decode = false;

	let pages = `[
		${manifest_data.pages.map(page => `{
			// ${page.parts[page.parts.length - 1].component.file}
			pattern: ${page.pattern},
			parts: [
				${page.parts.map(part => {
					if (part === null) return 'null';

					if (part.params.length > 0) {
						needs_decode = true;
						const props = part.params.map((param, i) => `${param}: d(match[${i + 1}])`);
						return `{ i: ${component_indexes[part.component.name]}, params: match => ({ ${props.join(', ')} }) }`;
					}

					return `{ i: ${component_indexes[part.component.name]} }`;
				}).join(',\n\t\t\t\t')}
			]
		}`).join(',\n\n\t\t')}
	]`.replace(/^\t/gm, '').trim();

	if (needs_decode) {
		pages = `(d => ${pages})(decodeURIComponent)`
	}

	let footer = '';

	if (dev) {
		const sapper_dev_client = posixify(
			path.resolve(__dirname, '../sapper-dev-client.js')
		);

		footer = `

			if (typeof window !== 'undefined') {
				import(${stringify(sapper_dev_client)}).then(client => {
					client.connect(${dev_port});
				});
			}`.replace(/^\t{3}/gm, '');
	}

	return `// This file is generated by Sapper — do not edit it!\n` + template
		.replace(/__ROOT__/g, stringify(get_file(path_to_routes, manifest_data.root), false))
		.replace(/__ROOT_PRELOAD__/g, manifest_data.root.has_preload ? stringify(get_file(path_to_routes, manifest_data.root), false) : './internal')
		.replace(/__ERROR__/g, stringify(posixify(`${path_to_routes}/_error.html`), false))
		.replace(/__IGNORE__/g, `[${server_routes_to_ignore.map(route => route.pattern).join(', ')}]`)
		.replace(/__COMPONENTS__/g, components)
		.replace(/__PAGES__/g, pages) +
		footer;
}

function generate_server(
	manifest_data: ManifestData,
	path_to_routes: string,
	cwd: string,
	src: string,
	dest: string,
	dev: boolean
) {
	const template_file = path.resolve(__dirname, '../templates/server.mjs');
	const template = fs.readFileSync(template_file, 'utf-8');

	const imports = [].concat(
		manifest_data.server_routes.map(route =>
			`import * as __${route.name} from ${stringify(posixify(`${path_to_routes}/${route.file}`))};`),
		manifest_data.components.map(component =>
			`import __${component.name}${component.has_preload ? `, { preload as __${component.name}_preload }` : ''} from ${stringify(get_file(path_to_routes, component))};`),
		`import root${manifest_data.root.has_preload ? `, { preload as root_preload }` : ''} from ${stringify(get_file(path_to_routes, manifest_data.root))};`,
		`import error from ${stringify(posixify(`${path_to_routes}/_error.html`))};`
	);

	let code = `
		${imports.join('\n')}${manifest_data.root.has_preload ? '' : `\n\nconst root_preload = () => {};`}

		const d = decodeURIComponent;

		export const manifest = {
			server_routes: [
				${manifest_data.server_routes.map(route => `{
					// ${route.file}
					pattern: ${route.pattern},
					handlers: __${route.name},
					params: ${route.params.length > 0
						? `match => ({ ${route.params.map((param, i) => `${param}: d(match[${i + 1}])`).join(', ')} })`
						: `() => ({})`}
				}`).join(',\n\n\t\t\t\t')}
			],

			pages: [
				${manifest_data.pages.map(page => `{
					// ${page.parts[page.parts.length - 1].component.file}
					pattern: ${page.pattern},
					parts: [
						${page.parts.map(part => {
							if (part === null) return 'null';

							const props = [
								`name: "${part.component.name}"`,
								`file: ${stringify(part.component.file)}`,
								`component: __${part.component.name}`,
								part.component.has_preload && `preload: __${part.component.name}_preload`
							].filter(Boolean);

							if (part.params.length > 0) {
								const params = part.params.map((param, i) => `${param}: d(match[${i + 1}])`);
								props.push(`params: match => ({ ${params.join(', ')} })`);
							}

							return `{ ${props.join(', ')} }`;
						}).join(',\n\t\t\t\t\t\t')}
					]
				}`).join(',\n\n\t\t\t\t')}
			],

			root,
			root_preload,
			error
		};`.replace(/^\t\t/gm, '').trim();

	const build_dir = posixify(path.relative(cwd, dest));
	const src_dir = posixify(path.relative(cwd, src));

	return `// This file is generated by Sapper — do not edit it!\n` + template
		.replace('__BUILD__DIR__', JSON.stringify(build_dir))
		.replace('__SRC__DIR__', JSON.stringify(src_dir))
		.replace('__DEV__', dev ? 'true' : 'false')
		.replace(/const manifest = __MANIFEST__;/, code);
}

function get_file(path_to_routes: string, component: PageComponent) {
	if (component.default) {
		return `./_layout.html`;
	}

	return posixify(`${path_to_routes}/${component.file}`);
}

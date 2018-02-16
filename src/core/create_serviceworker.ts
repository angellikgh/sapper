import * as fs from 'fs';
import * as path from 'path';
import glob from 'glob';
import create_routes from './create_routes';
import { fudge_mtime, posixify, write } from './utils';
import { Route } from '../interfaces';

export default function create_serviceworker({ routes, client_files, src }: {
	routes: Route[];
	client_files: string[];
	src: string;
}) {
	const assets = glob.sync('**', { cwd: 'assets', nodir: true });

	let code = `
		export const timestamp = ${Date.now()};

		export const assets = [\n\t${assets.map((x: string) => `"${x}"`).join(',\n\t')}\n];

		export const shell = [\n\t${client_files.map((x: string) => `"${x}"`).join(',\n\t')}\n];

		export const routes = [\n\t${routes.filter((r: Route) => r.type === 'page').map((r: Route) => `{ pattern: ${r.pattern} }`).join(',\n\t')}\n];
	`.replace(/^\t\t/gm, '');

	write('app/manifest/service-worker.js', code);
}
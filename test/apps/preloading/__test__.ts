import * as path from 'path';
import * as assert from 'assert';
import * as puppeteer from 'puppeteer';
import { build } from '../../../api';
import { wait } from '../../utils';
import { AppRunner } from '../AppRunner';

declare const fulfil: () => Promise<void>;

describe('preloading', function() {
	this.timeout(10000);

	let runner: AppRunner;
	let page: puppeteer.Page;
	let base: string;

	// helpers
	let start: () => Promise<void>;
	let prefetchRoutes: () => Promise<void>;

	// hooks
	before(() => {
		return new Promise((fulfil, reject) => {
			// TODO this is brittle. Make it unnecessary
			process.chdir(__dirname);
			process.env.NODE_ENV = 'production';

			// TODO this API isn't great. Rethink it
			const emitter = build({
				bundler: 'rollup'
			}, {
				src: path.join(__dirname, 'src'),
				routes: path.join(__dirname, 'src/routes'),
				dest: path.join(__dirname, '__sapper__/build')
			});

			emitter.on('error', reject);

			emitter.on('done', async () => {
				try {
					runner = new AppRunner(__dirname, '__sapper__/build/server/server.js');
					({ base, page, start, prefetchRoutes } = await runner.start());

					fulfil();
				} catch (err) {
					reject(err);
				}
			});
		});
	});

	after(() => runner.end());

	const title = () => page.$eval('h1', node => node.textContent);

	it('serializes Set objects returned from preload', async () => {
		await page.goto(`${base}/preload-values/set`);

		assert.equal(await title(), 'true');

		await start();
		assert.equal(await title(), 'true');
	});

	it('bails on custom classes returned from preload', async () => {
		await page.goto(`${base}/preload-values/custom-class`);

		assert.equal(await title(), '42');

		await start();
		assert.equal(await title(), '42');
	});

	it('sets preloading true when appropriate', async () => {
		await page.goto(base);
		await start();
		await prefetchRoutes();

		await page.click('a[href="slow-preload"]');

		assert.ok(await page.evaluate(() => !!document.querySelector('progress')));

		await page.evaluate(() => fulfil());
		assert.ok(await page.evaluate(() => !document.querySelector('progress')));
	});

	it('runs preload in root component', async () => {
		await page.goto(`${base}/preload-root`);
		assert.equal(await title(), 'root preload function ran: true');
	});

	it('cancels navigation if subsequent navigation occurs during preload', async () => {
		await page.goto(base);
		await start();
		await prefetchRoutes();

		await page.click('a[href="slow-preload"]');
		await wait(100);
		await page.click('a[href="foo"]');

		assert.equal(page.url(), `${base}/foo`);
		assert.equal(await title(), 'foo');

		await page.evaluate(() => fulfil());
		await wait(100);
		assert.equal(page.url(), `${base}/foo`);
		assert.equal(await title(), 'foo');
	});
});
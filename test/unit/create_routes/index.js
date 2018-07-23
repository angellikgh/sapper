const path = require('path');
const assert = require('assert');
const { create_routes } = require('../../../dist/core.ts.js');

describe('create_routes', () => {
	it('creates routes', () => {
		const { components, pages, server_routes } = create_routes(path.join(__dirname, 'samples/basic'));

		const index = { name: 'index', file: 'index.html' };
		const about = { name: 'about', file: 'about.html' };
		const blog = { name: 'blog', file: 'blog/index.html' };
		const blog_$slug = { name: 'blog_$slug', file: 'blog/[slug].html' };

		assert.deepEqual(components, [
			index,
			about,
			blog,
			blog_$slug
		]);

		assert.deepEqual(pages, [
			{
				pattern: /^\/?$/,
				parts: [
					{ component: index, params: [] }
				]
			},

			{
				pattern: /^\/about\/?$/,
				parts: [
					{ component: about, params: [] }
				]
			},

			{
				pattern: /^\/blog\/?$/,
				parts: [
					null,
					{ component: blog, params: [] }
				]
			},

			{
				pattern: /^\/blog\/([^\/]+?)\/?$/,
				parts: [
					null,
					{ component: blog_$slug, params: ['slug'] }
				]
			}
		]);

		assert.deepEqual(server_routes, [
			{
				name: 'route_blog_json',
				pattern: /^\/blog.json\/?$/,
				file: 'blog/index.json.js',
				params: []
			},

			{
				name: 'route_blog_$slug_json',
				pattern: /^\/blog\/([^\/]+?).json\/?$/,
				file: 'blog/[slug].json.js',
				params: ['slug']
			}
		]);
	});

	it('encodes invalid characters', () => {
		const { components, pages } = create_routes(path.join(__dirname, 'samples/encoding'));

		// had to remove ? and " because windows

		// const quote = { name: '$34', file: '".html' };
		const hash = { name: '$35', file: '#.html' };
		// const question_mark = { name: '$63', file: '?.html' };

		assert.deepEqual(components, [
			// quote,
			hash,
			// question_mark
		]);

		assert.deepEqual(pages.map(p => p.pattern), [
			// /^\/%22\/?$/,
			/^\/%23\/?$/,
			// /^\/%3F\/?$/
		]);
	});

	it('allows regex qualifiers', () => {
		const { pages } = create_routes(path.join(__dirname, 'samples/qualifiers'));

		assert.deepEqual(pages.map(p => p.pattern), [
			/^\/([0-9-a-z]{3,})\/?$/,
			/^\/([a-z]{2})\/?$/,
			/^\/([^\/]+?)\/?$/
		]);
	});

	it('sorts routes correctly', () => {
		const { pages } = create_routes(path.join(__dirname, 'samples/sorting'));

		assert.deepEqual(pages.map(p => p.parts.map(part => part && part.component.file)), [
			['index.html'],
			['about.html'],
			[null, 'post/index.html'],
			[null, 'post/bar.html'],
			[null, 'post/foo.html'],
			[null, 'post/f[xx].html'],
			[null, 'post/[id([0-9-a-z]{3,})].html'],
			[null, 'post/[id].html'],
			['[wildcard].html']
		]);
	});

	it('ignores files and directories with leading underscores', () => {
		const { server_routes } = create_routes(path.join(__dirname, 'samples/hidden-underscore'));

		assert.deepEqual(server_routes.map(r => r.file), [
			'index.js',
			'e/f/g/h.js'
		]);
	});

	it('ignores files and directories with leading dots except .well-known', () => {
		const { server_routes } = create_routes(path.join(__dirname, 'samples/hidden-dot'));

		assert.deepEqual(server_routes.map(r => r.file), [
			'.well-known/dnt-policy.txt.js'
		]);
	});

	it('fails on clashes', () => {
		assert.throws(() => {
			const { pages } = create_routes(path.join(__dirname, 'samples/clash-pages'));
		}, /The \[bar\]\/index\.html and \[foo\]\.html pages clash/);

		assert.throws(() => {
			const { server_routes } = create_routes(path.join(__dirname, 'samples/clash-routes'));
			console.log(server_routes);
		}, /The \[bar\]\/index\.js and \[foo\]\.js routes clash/);
	});

	it('fails if dynamic params are not separated', () => {
		assert.throws(() => {
			create_routes(path.join(__dirname, 'samples/invalid-params'));
		}, /Invalid route \[foo\]\[bar\]\.js — parameters must be separated/);
	});

	it('errors when trying to use reserved characters in route regexp', () => {
		assert.throws(() => {
			create_routes(path.join(__dirname, 'samples/invalid-qualifier'));
		}, /Invalid route \[foo\(\[a-z\]\(\[0-9\]\)\)\].js — cannot use \(, \), \? or \: in route qualifiers/);
	});
});
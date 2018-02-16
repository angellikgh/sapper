// This file is generated by Sapper — do not edit it!
import _ from '../../routes/index.html';
import _4xx from '../../routes/4xx.html';
import about from '../../routes/about.html';
import show_url from '../../routes/show-url.html';
import slow_preload from '../../routes/slow-preload.html';
import delete_test from '../../routes/delete-test.html';
import _5xx from '../../routes/5xx.html';
import blog from '../../routes/blog/index.html';
import * as api_blog_contents from '../../routes/api/blog/contents.js';
import * as api_delete_$id$ from '../../routes/api/delete/[id].js';
import * as api_blog_$slug$ from '../../routes/api/blog/[slug].js';
import blog_$slug$ from '../../routes/blog/[slug].html';

export const routes = [
	{ id: '_', type: 'page', pattern: /^\/?$/, params: () => ({}), module: _ },
	{ id: '_4xx', type: 'page', pattern: /^\/4xx\/?$/, params: () => ({}), module: _4xx },
	{ id: 'about', type: 'page', pattern: /^\/about\/?$/, params: () => ({}), module: about },
	{ id: 'show_url', type: 'page', pattern: /^\/show-url\/?$/, params: () => ({}), module: show_url },
	{ id: 'slow_preload', type: 'page', pattern: /^\/slow-preload\/?$/, params: () => ({}), module: slow_preload },
	{ id: 'delete_test', type: 'page', pattern: /^\/delete-test\/?$/, params: () => ({}), module: delete_test },
	{ id: '_5xx', type: 'page', pattern: /^\/5xx\/?$/, params: () => ({}), module: _5xx },
	{ id: 'blog', type: 'page', pattern: /^\/blog\/?$/, params: () => ({}), module: blog },
	{ id: 'api_blog_contents', type: 'route', pattern: /^\/api\/blog\/contents\/?$/, params: () => ({}), module: api_blog_contents },
	{ id: 'api_delete_$id$', type: 'route', pattern: /^\/api\/delete(?:\/([^\/]+))?\/?$/, params: match => ({ id: match[1] }), module: api_delete_$id$ },
	{ id: 'api_blog_$slug$', type: 'route', pattern: /^\/api\/blog(?:\/([^\/]+))?\/?$/, params: match => ({ slug: match[1] }), module: api_blog_$slug$ },
	{ id: 'blog_$slug$', type: 'page', pattern: /^\/blog(?:\/([^\/]+))?\/?$/, params: match => ({ slug: match[1] }), module: blog_$slug$ }
];
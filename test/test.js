/*jshint expr: true*/

'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var chai = require('chai');
var expect = chai.expect;
var chaiAsPromised = require('chai-as-promised');
var request = require('supertest');
var merge = require('merge');
var etag = require('etag');
var MemoryCache = require('@donotjs/donot-cache-memory');
var ssRoute = require('../');
var Donot = require('../').Donot;
var TestTransform = require('./lib/test-transform');
var ReverseTransform = require('./lib/reverse-transform');
var utils = require('../lib/utils.js');

chai.should();
chai.use(chaiAsPromised);

function createServer(transform, opt) {

	var options = merge(opt, {});

	if (transform.constructor.name !== 'Array') {
		transform = [transform];
	}

	options.transforms = transform;
	options.index = ['index.txt'];

	var instance = ssRoute(__dirname + '/data', options);
	return http.createServer(instance);

}

describe('Donot', () => {

	describe('constructing', () => {

		it ('should throw TypeError if root is not supplied', () => {
			expect(() => {
				new Donot();
			}).to.throw(TypeError);
		});

		it ('should throw TypeError if root is not a string', () => {
			expect(() => {
				new Donot(1);
			}).to.throw(TypeError);
		});

		it ('should throw TypeError if opt is not an object', () => {
			expect(() => {
				new Donot("", 1);
			}).to.throw(TypeError);
		});

		it ('should throw Error if root does not exist', () => {
			expect(() => {
				new Donot(__dirname + '/not-exist');
			}).to.throw(Error);
		});

		it ('should throw Error if root is not a directory', () => {
			expect(() => {
				new Donot(__dirname + '/data/static.txt');
			}).to.throw(Error);
		});

		it ('should throw TypeError if cache does not inherit from Cache', () => {
			expect(() => {
				new Donot(__dirname + '/data/static.txt', {
					cache: {}
				});
			}).to.throw(TypeError);
		});

		it ('should throw a TypeError if serveDir is not a string', () => {
			expect(() => {
				new Donot('', {
					serveDir: true
				});
			}).to.throw(TypeError);
		});

		it('should throw a TypeError if accessControl is not an object', () => {
			expect(() => {
				new Donot('', {
					accessControl: true
				});
			}).to.throw(TypeError);
		});

		it ('should throw a TypeError if both allow and deny is set on accessControl', () => {
			expect(() => {
				new Donot('', {
					accessControl: {
						allow: [],
						deny: []
					}
				});
			}).to.throw(TypeError);
		});

		it ('should throw a TypeError if accessControl.allow isn\'t an array', () => {
			expect(() => {
				new Donot('', {
					accessControl: {
						allow: true
					}
				});
			}).to.throw(TypeError);
		});

		it ('should throw a TypeError if accessControl.deny isn\'t an array', () => {
			expect(() => {
				new Donot('', {
					accessControl: {
						deny: true
					}
				});
			}).to.throw(TypeError);
		});

		it ('should throw a TypeError if accessControl.deny contains non-string or non-regexp', () => {
			expect(() => {
				new Donot('', {
					accessControl: {
						deny: [true]
					}
				});
			}).to.throw(TypeError);
		});

		it ('should throw a TypeError if accessControl.allow contains non-string or non-regexp', () => {
			expect(() => {
				new Donot('', {
					accessControl: {
						allow: [true]
					}
				});
			}).to.throw(TypeError);
		});

		it ('should return an instance', () => {
			expect(new Donot(__dirname + '/data')).to.be.instanceof(Donot);
		});

	});

	describe('adding transforms', () => {

		var ss;
		before(() => {
			ss = new Donot(__dirname + '/data');
		});

		it ('should throw TypeError on missing transform', () => {
			expect(() => {
				ss.transform();
			}).to.throw(TypeError);
		});

		it ('should throw TypeError if transform is not an instance of Transform', () => {
			expect(() => {
				ss.transform({});
			}).to.throw(TypeError);
		});

	});

	describe('renderer', () => {

		var ss;

		before(() => {
			ss = new Donot(__dirname + '/data', {
				transforms: [new TestTransform()]
			});
		});

		it ('should throw TypeError if file name is missing', () => {
			return ss.render().should.eventually.be.rejected;
		});

		it ('should throw TypeError if file name is not a string', () => {
			return ss.render(1).should.eventually.be.rejected;
		});

	});

	describe('route', () => {

		var testTransform = new TestTransform();
		var reverseTransform = new ReverseTransform();

		describe('common', () => {

			var server;
			before(() => {
				server = createServer([reverseTransform, testTransform]);
			});

			it ('should return 404 on not found', (done) => {
				request(server)
				.get('/not-found.txt')
				.expect(404, 'not found', done);
			});

			it ('should return index on directory', (done) => {
				request(server)
				.get('/')
				.expect(200, 'index test\n', done);
			});

			it ('should return 404 on non-existing files without extension', (done) => {
				request(server)
				.get('/static')
				.expect(404, 'not found', done);
			});

			it ('should return 404 on non-GET requests', (done) => {
				request(server)
				.post('/static.txt')
				.expect(404, 'not found', done);
			});

			it ('should return 200 on HEAD requests', (done) => {
				request(server)
				.head('/static.txt')
				.expect(200, done);
			});

			it ('should send static files', (done) => {
				request(server)
				.get('/static.txt')
				.expect('Content-Type', 'text/plain; charset=UTF-8')
				.expect(200, 'This is a static file.\n', done);
			});

			it ('should send rendered template file', (done) => {
				request(server)
				.get('/template.txt')
				.expect('Content-Type', 'text/plain; charset=UTF-8')
				.expect(200, 'this is a template\ntest', done);
			});

			it ('should send chained rendered template file', (done) => {
				request(server)
				.get('/template.reversed.txt')
				.expect('Content-Type', 'text/plain; charset=UTF-8')
				.expect(200, 'tset\netalpmet a si siht', done);
			});

			it ('should send rendered index template file', (done) => {
				request(server)
				.get('/sub')
				.expect('Content-Type', 'text/plain; charset=UTF-8')
				.expect(200, 'index\ntest', done);
			});

			describe('source maps', () => {

				var server;
				before(() => {
					server = createServer([
						new (require('@donotjs/donot-transform-minify'))(),
						new (require('@donotjs/donot-transform-es5'))()
					]);
				});

				it ('should come back with es5\'ed minified data', (done) => {
					request(server)
					.get('/test.es5.min.js')
					.expect('Content-Type', 'application/javascript; charset=UTF-8')
					.expect(200, '"use strict";!function(){console.log("test")}();\n//# sourceMappingURL=test.es5.min.js.map', done);
				});

				it ('should come back with a source map', (done) => {
					request(server)
					.get('/test.es5.min.js.map')
					.expect('Content-Type', 'application/octet-stream; charset=UTF-8')
					.expect(200, done);
				});

			});

			describe('serveDir', () => {

				var server;
				before(() => {
					server = createServer(testTransform, {
						serveDir: '/test'
					});
				});

				it ('should come back with 404 if not in path', (done) => {
					request(server)
					.get('/template.txt')
					.expect(404, done);
				});

				it ('should come back with 200 if in path', (done) => {
					request(server)
					.get('/test/template.txt')
					.expect(200, 'this is a template\ntest', done);
				});

			});

			describe('cache control', () => {

				var headers;
				before((done) => {
					(new Donot(__dirname + '/data', {
						transforms: [testTransform]
					})).render('/template.txt').then((result) => {
						headers = {
							lastModified: result.modificationDate,
							etag: etag(result.data)
						};
						done();
					});
				});

				it ('should have correct cache headers set', (done) => {
					request(server)
					.get('/template.txt')
					.expect('Last-Modified', headers.lastModified.toUTCString())
					.expect('Etag', headers.etag)
					.expect(200, done);
				});

				it ('should return 304 on If-None-Match', (done) => {
					request(server)
					.get('/template.txt')
					.set('If-None-Match', headers.etag)
					.expect(304, done);
				});

				it ('should return 200 on non-matching If-None-Match', (done) => {
					request(server)
					.get('/template.txt')
					.set('If-None-Match', 'non-matching-tag')
					.expect(200, 'this is a template\ntest', done);
				});

			});

		});

		describe('access', () => {

			describe('hidden files', () => {

				describe('restrictive', () => {

					var server;
					before(() => {
						server = createServer(testTransform, {
							etag: false,
							lastModified: false
						});
					});

					it ('should return 404 on hidden files', (done) => {
						request(server)
						.get('/.hidden.txt')
						.expect(404, 'not found', done);
					});

					it ('should return 404 on hidden directories', (done) => {
						request(server)
						.get('/.hidden/test.txt')
						.expect(404, 'not found', done);
					});

					it ('should return 404 on template files', (done) => {
						request(server)
						.get('/template.test')
						.expect(404, 'not found', done);
					});

					it ('should not cache headers', (done) => {
						request(server)
						.get('/template.txt')
						.expect((res) => {
							if (res.header['last-modified'] !== undefined) {
								return "Last-Modified should not be set";
							}
							if (res.header.etag !== undefined) {
								return "Etag should not be set";
							}
						})
						.expect(200, done);
					});

				});

				describe('permissive', () => {

					var server;
					before(() => {
						server = createServer(testTransform, {
							dotFiles: true,
							templates: true
						});
					});

					it ('should send hidden files', (done) => {
						request(server)
						.get('/.hidden.txt')
						.expect(200, 'hidden\n', done);
					});

					it ('should send file in hidden directories', (done) => {
						request(server)
						.get('/.hidden/test.txt')
						.expect(200, 'hidden directory\n', done);
					});

					it ('should send template files', (done) => {
						request(server)
						.get('/template.test')
						.expect(200, 'test this is a template\n', done);
					});

				});

			});

			describe('access control', () => {

				describe('deny (String - file ext)', () => {

					var server;
					before(() => {
						server = createServer(testTransform, {
							accessControl: {
								deny: ['.txt']
							}
						});
					});

					it ('should come back with 404', (done) => {
						request(server)
						.get('/index.txt')
						.expect(404, done);
					});

					it ('should come back with 404', (done) => {
						request(server)
						.get('/template.txt')
						.expect(404, done);
					});

					it ('should come back with 200', (done) => {
						request(server)
						.get('/test.allow')
						.expect(200, 'allow this\n', done);
					});

				});

				describe('allow (RegExp)', () => {

					var server;
					before(() => {
						server = createServer(testTransform, {
							accessControl: {
								allow: [/^.*?\.allow$/]
							}
						});
					});

					it ('should come back with 404', (done) => {
						request(server)
						.get('/index.txt')
						.expect(404, done);
					});

					it ('should come back with 404', (done) => {
						request(server)
						.get('/template.txt')
						.expect(404, done);
					});

					it ('should come back with 200', (done) => {
						request(server)
						.get('/test.allow')
						.expect(200, 'allow this\n', done);
					});

				});

			});

		});

	});

	describe('cache', () => {

		var ss;
		var cache = new MemoryCache();
		before(() => {
			ss = new Donot(__dirname + '/data', {
				transforms: [new TestTransform()],
				cache: cache
			});
		});

		it ('should compile and render template', () => {
			return ss.render('/template.txt').then((result) => {
				expect(result).to.be.an('object');
				expect(result.data.toString()).to.equal('this is a template\ntest');
				expect(result.cached).to.be.false;
			}).should.eventually.be.fulfilled;
		});

		it ('should render template from cache', () => {
			return ss.render('/template.txt').then((result) => {
				expect(result).to.be.an('object');
				expect(result.data.toString()).to.equal('this is a template\ntest');
				expect(result.cached).to.be.true;
			}).should.eventually.be.fulfilled;
		});

		describe('after cache invalidated', () => {

			before((done) => {
				// Get the modified date of template and set back cache one year
				fs.stat(path.normalize(__dirname + '/data/template.test'), function(err, stats) {
					expect(err).to.be.null;
					var date = stats.mtime;
					date.setFullYear(date.getFullYear() - 1);
					cache.cache[utils.hash({filename: '/template.txt'})].modificationDate = date;
					done();
				});
			});

			it ('should recompile and render template', () => {
				return ss.render('/template.txt').then((result) => {
					expect(result).to.be.an('object');
					expect(result.data.toString()).to.equal('this is a template\ntest');
					expect(result.cached).to.be.false;
				});
			});

		});

	});

});

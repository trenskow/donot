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

chai.should();
chai.use(chaiAsPromised);

function createServer(transform, opt) {

	var options = merge(opt, {});

	options.transforms = [transform];
	options.index = ['index.txt'];

	var instance = ssRoute(__dirname + '/data', options);
	return http.createServer(instance);

}

describe('Donot', function() {

	describe('constructing', function() {

		it ('should throw TypeError if root is not supplied', function() {
			expect(function() {
				new Donot();
			}).to.throw(TypeError);
		});

		it ('should throw TypeError if root is not a string', function() {
			expect(function() {
				new Donot(1);
			}).to.throw(TypeError);
		});

		it ('should throw TypeError if opt is not an object', function() {
			expect(function() {
				new Donot("", 1);
			}).to.throw(TypeError);
		});

		it ('should throw Error if root does not exist', function() {
			expect(function() {
				new Donot(__dirname + '/not-exist');
			}).to.throw(Error);
		});

		it ('should throw Error if root is not a directory', function() {
			expect(function() {
				new Donot(__dirname + '/data/static.txt');
			}).to.throw(Error);
		});

		it ('should throw TypeError if cache does not inherit from Cache', function() {
			expect(function() {
				new Donot(__dirname + '/data/static.txt', {
					cache: {}
				});
			}).to.throw(TypeError);
		});

		it ('should throw a TypeError if serveDir is not a string', function() {
			expect(function() {
				new Donot('', {
					serveDir: true
				});
			}).to.throw(TypeError);
		});

		it('should throw a TypeError if accessControl is not an object', function() {
			expect(function() {
				new Donot('', {
					accessControl: true
				});
			}).to.throw(TypeError);
		});

		it ('should throw a TypeError if both allow and deny is set on accessControl', function() {
			expect(function() {
				new Donot('', {
					accessControl: {
						allow: [],
						deny: []
					}
				});
			}).to.throw(TypeError);
		});

		it ('should throw a TypeError if accessControl.allow isn\'t an array', function() {
			expect(function() {
				new Donot('', {
					accessControl: {
						allow: true
					}
				});
			}).to.throw(TypeError);
		});

		it ('should throw a TypeError if accessControl.deny isn\'t an array', function() {
			expect(function() {
				new Donot('', {
					accessControl: {
						deny: true
					}
				});
			}).to.throw(TypeError);
		});

		it ('should throw a TypeError if accessControl.deny contains non-string or non-regexp', function() {
			expect(function() {
				new Donot('', {
					accessControl: {
						deny: [true]
					}
				});
			}).to.throw(TypeError);
		});

		it ('should throw a TypeError if accessControl.allow contains non-string or non-regexp', function() {
			expect(function() {
				new Donot('', {
					accessControl: {
						allow: [true]
					}
				});
			}).to.throw(TypeError);
		});

		it ('should return an instance', function() {
			expect(new Donot(__dirname + '/data')).to.be.instanceof(Donot);
		});

	});

	describe('adding transforms', function() {

		var ss;
		before(function() {
			ss = new Donot(__dirname + '/data');
		});

		it ('should throw TypeError on missing transform', function() {
			expect(function() {
				ss.transform();
			}).to.throw(TypeError);
		});

		it ('should throw TypeError if transform is not an instance of Transform', function() {
			expect(function() {
				ss.transform({});
			}).to.throw(TypeError);
		});

	});

	describe('renderer', function() {

		var ss;

		before(function() {
			ss = new Donot(__dirname + '/data', {
				transforms: [new TestTransform()]
			});
		});

		it ('should throw TypeError if url is missing', function() {
			return ss.render().should.eventually.be.rejected;
		});

		it ('should throw TypeError if url is not a string', function() {
			return ss.render(1).should.eventually.be.rejected;
		});

	});

	describe('route', function() {

		var transform = new TestTransform();

		describe('common', function() {

			var server;
			before(function() {
				server = createServer(transform);
			});

			it ('should return 404 on not found', function(done) {
				request(server)
				.get('/not-found.txt')
				.expect(404, 'not found', done);
			});

			it ('should return index on directory', function(done) {
				request(server)
				.get('/')
				.expect(200, 'index test\n', done);
			});

			it ('should return 404 on non-existing files without extension', function(done) {
				request(server)
				.get('/static')
				.expect(404, 'not found', done);
			});

			it ('should return 404 on non-GET requests', function(done) {
				request(server)
				.post('/static.txt')
				.expect(404, 'not found', done);
			});

			it ('should return 200 on HEAD requests', function(done) {
				request(server)
				.head('/static.txt')
				.expect(200, done);
			});

			it ('should send static files', function(done) {
				request(server)
				.get('/static.txt')
				.expect('Content-Type', 'text/plain; charset=UTF-8')
				.expect(200, 'This is a static file.\n', done);
			});

			it ('should send rendered template file', function(done) {
				request(server)
				.get('/template.txt')
				.expect('Content-Type', 'text/plain; charset=UTF-8')
				.expect(200, 'this is a template\ntest', done);
			});

			it ('should send rendered index template file', function(done) {
				request(server)
				.get('/sub')
				.expect('Content-Type', 'text/plain; charset=UTF-8')
				.expect(200, 'index\ntest', done);
			});

			describe('serveDir', function() {

				var server;
				before(function() {
					server = createServer(transform, {
						serveDir: '/test'
					});
				});

				it ('should come back with 404 if not in path', function(done) {
					request(server)
					.get('/template.txt')
					.expect(404, done);
				});

				it ('should come back with 200 if in path', function(done) {
					request(server)
					.get('/test/template.txt')
					.expect(200, 'this is a template\ntest', done);
				});

			});

			describe('cache control', function() {

				var headers;
				before(function(done) {
					(new Donot(__dirname + '/data', {
						transforms: [transform]
					})).render('/template.txt').then((result) => {
						headers = {
							lastModified: result.options.modified,
							etag: etag(result.data)
						};
						done();
					});
				});

				it ('should have correct cache headers set', function(done) {
					request(server)
					.get('/template.txt')
					.expect('Last-Modified', headers.lastModified.toUTCString())
					.expect('Etag', headers.etag)
					.expect(200, done);
				});

				it ('should return 304 on If-None-Match', function(done) {
					request(server)
					.get('/template.txt')
					.set('If-None-Match', headers.etag)
					.expect(304, done);
				});

				it ('should return 200 on non-matching If-None-Match', function(done) {
					request(server)
					.get('/template.txt')
					.set('If-None-Match', 'non-matching-tag')
					.expect(200, 'this is a template\ntest', done);
				});

			});

		});

		describe('access', function() {

			describe('hidden files', function() {

				describe('restrictive', function() {

					var server;
					before(function() {
						server = createServer(transform, {
							etag: false,
							lastModified: false
						});
					});

					it ('should return 404 on hidden files', function(done) {
						request(server)
						.get('/.hidden.txt')
						.expect(404, 'not found', done);
					});

					it ('should return 404 on hidden directories', function(done) {
						request(server)
						.get('/.hidden/test.txt')
						.expect(404, 'not found', done);
					});

					it ('should return 404 on template files', function(done) {
						request(server)
						.get('/template.test')
						.expect(404, 'not found', done);
					});

					it ('should not cache headers', function(done) {
						request(server)
						.get('/template.txt')
						.expect(function(res) {
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

				describe('permissive', function() {

					var server;
					before(function() {
						server = createServer(transform, {
							dotFiles: true,
							templates: true
						});
					});

					it ('should send hidden files', function(done) {
						request(server)
						.get('/.hidden.txt')
						.expect(200, 'hidden\n', done);
					});

					it ('should send file in hidden directories', function(done) {
						request(server)
						.get('/.hidden/test.txt')
						.expect(200, 'hidden directory\n', done);
					});

					it ('should send template files', function(done) {
						request(server)
						.get('/template.test')
						.expect(200, 'test this is a template\n', done);
					});

				});

			});

			describe('access control', function() {

				describe('deny (String - file ext)', function() {

					var server;
					before(function() {
						server = createServer(transform, {
							accessControl: {
								deny: ['.txt']
							}
						});
					});

					it ('should come back with 404', function(done) {
						request(server)
						.get('/index.txt')
						.expect(404, done);
					});

					it ('should come back with 404', function(done) {
						request(server)
						.get('/template.txt')
						.expect(404, done);
					});

					it ('should come back with 200', function(done) {
						request(server)
						.get('/test.allow')
						.expect(200, 'allow this\n', done);
					});

				});

				describe('allow (RegExp)', function() {

					var server;
					before(function() {
						server = createServer(transform, {
							accessControl: {
								allow: [/^.*?\.allow$/]
							}
						});
					});

					it ('should come back with 404', function(done) {
						request(server)
						.get('/index.txt')
						.expect(404, done);
					});

					it ('should come back with 404', function(done) {
						request(server)
						.get('/template.txt')
						.expect(404, done);
					});

					it ('should come back with 200', function(done) {
						request(server)
						.get('/test.allow')
						.expect(200, 'allow this\n', done);
					});

				});

			});

		});

	});

	describe('cache', function() {

		var ss;
		var cache = new MemoryCache();
		before(function() {
			ss = new Donot(__dirname + '/data', {
				transforms: [new TestTransform()],
				cache: cache
			});
		});

		it ('should compile and render template', function() {
			return ss.render('/template.txt').then((result) => {
				expect(result).to.be.an('object');
				expect(result.data).to.equal('this is a template\ntest');
				expect(result.ctx).to.be.an('object');
				expect(result.options.cached).to.be.false;
			}).should.eventually.be.fulfilled;
		});

		it ('should render template from cache', function() {
			return ss.render('/template.txt').then((result) => {
				expect(result).to.be.an('object');
				expect(result.data).to.equal('this is a template\ntest');
				expect(result.options).to.be.an('object');
				expect(result.options.cached).to.be.true;
			}).should.eventually.be.fulfilled;
		});

		describe('after cache invalidated', function() {

			before(function(done) {
				// Get the modified date of template and set back cache one year
				fs.stat(path.normalize(__dirname + '/data/template.test'), function(err, stats) {
					expect(err).to.be.null;
					var date = stats.mtime;
					date.setFullYear(date.getFullYear() - 1);
					cache.invalidate(date);
					done();
				});
			});

			it ('should recompile and render template', function() {
				return ss.render('/template.txt').then((result) => {
					expect(result).to.be.an('object');
					expect(result.data).to.equal('this is a template\ntest');
					expect(result.options).to.be.an('object');
					expect(result.options.cached).to.be.false;
				});
			});

		});

	});

});

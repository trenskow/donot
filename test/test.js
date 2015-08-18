'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var expect = require('chai').expect;
var request = require('supertest');
var merge = require('merge');
var etag = require('etag');
var ssRoute = require('../');
var SmartStatic = require('../').SmartStatic;
var testEngine = require('./lib/test-engine');
var memCache = require('./lib/mem-cache');

function createServer(engine, opt) {

  var options = merge(opt, {
    engines: [engine],
    index: ['index.txt']
  });

  var instance = ssRoute(__dirname + '/data', options);
  return http.createServer(instance);

};

describe('smart-static', function() {

  describe('constructing', function() {

    it ('should throw TypeError if root is not supplied', function() {
      expect(function() {
        new SmartStatic();
      }).to.throw(TypeError);
    });

    it ('should throw TypeError if root is not a string', function() {
      expect(function() {
        new SmartStatic(1);
      }).to.throw(TypeError);
    });

    it ('should throw TypeError if opt is not an object', function() {
      expect(function() {
        new SmartStatic("", 1);
      }).to.throw(TypeError);
    });

    it ('should throw Error if root does not exist', function() {
      expect(function() {
        new SmartStatic(__dirname + '/not-exist');
      }).to.throw(Error);
    });

    it ('should throw Error if root is not a directory', function() {
      expect(function() {
        new SmartStatic(__dirname + '/data/static.txt');
      }).to.throw(Error);
    });

    it ('should throw TypeError if cache does not have a get function', function() {
      expect(function() {
        new SmartStatic(__dirname + '/data/static.txt', {
          cache: {}
        });
      }).to.throw(TypeError);
    });

    it ('should throw TypeError if cache does not have a set function', function() {
      expect(function() {
        new SmartStatic(__dirname + '/data/static.txt', {
          cache: {
            get: function() {}
          }
        });
      }).to.throw(TypeError);
    });

    it('should throw a TypeError if accessControl is not an object', function() {
      expect(function() {
        new SmartStatic('', {
          accessControl: true
        });
      }).to.throw(TypeError);
    });

    it ('should throw a TypeError if both allow and deny is set on accessControl', function() {
      expect(function() {
        new SmartStatic('', {
          accessControl: {
            allow: [],
            deny: []
          }
        })
      }).to.throw(TypeError);
    })

    it ('should throw a TypeError if accessControl.allow isn\'t an array', function() {
      expect(function() {
        new SmartStatic('', {
          accessControl: {
            allow: true
          }
        });
      }).to.throw(TypeError);
    });

    it ('should throw a TypeError if accessControl.deny isn\'t an array', function() {
      expect(function() {
        new SmartStatic('', {
          accessControl: {
            deny: true
          }
        });
      }).to.throw(TypeError);
    });

    it ('should throw a TypeError if accessControl.deny contains non-string or non-regexp', function() {
      expect(function() {
        new SmartStatic('', {
          accessControl: {
            deny: [true]
          }
        });
      }).to.throw(TypeError);
    });

    it ('should throw a TypeError if accessControl.allow contains non-string or non-regexp', function() {
      expect(function() {
        new SmartStatic('', {
          accessControl: {
            allow: [true]
          }
        });
      }).to.throw(TypeError);
    });

    it ('should return an instance', function() {
      expect(new SmartStatic(__dirname + '/data')).to.be.instanceof(SmartStatic);
    });

  });

  describe('adding engines', function() {

    var ss;
    before(function() {
      ss = new SmartStatic(__dirname + '/data');
    });

    it ('should throw TypeError on missing engine', function() {
      expect(function() {
        ss.engine();
      }).to.throw(TypeError);
    });

    it ('should throw TypeError if engine is missing a map', function() {
      expect(function() {
        ss.engine({});
      }).to.throw(TypeError);
    });

    it ('should throw TypeError if map is not an object', function() {
      expect(function() {
        ss.engine(1);
      }).to.throw(TypeError);
    });

    it ('should throw TypeError if engine is missing compiler', function() {
      expect(function() {
        ss.engine({map:{'.test':'.txt'}});
      }).to.throw(TypeError);
    });

    it ('should throw TypeError if compiler is not a function', function() {
      expect(function() {
        ss.engine({map:{'.test':'.txt'}, compiler: ''});
      }).to.throw(TypeError);

    });

    it ('should throw TypeError if render is not a function', function() {
      expect(function() {
        ss.engine({map:{'.test':'.txt'}, compiler: function() {}, render: ''});
      }).to.throw(TypeError);

    });

  });

  describe('renderer', function() {

    var ss;

    before(function() {
      ss = new SmartStatic(__dirname + '/data', {
        engines: [testEngine]
      });
    });

    it ('should throw TypeError if url is missing', function() {
      expect(function() {
        ss.render();
      }).to.throw(TypeError);
    });

    it ('should throw TypeError if url is not a string', function() {
      expect(function() {
        ss.render(1);
      }).to.throw(TypeError);
    });

    it ('should throw TypeError if cb is missing', function() {
      expect(function() {
        ss.render('/');
      }).to.throw(TypeError);
    });

    it ('should throw TypeError if cb is not a function', function() {
      expect(function() {
        ss.render('/', 1);
      }).to.throw(TypeError);
    });

    it ('should render and callback with context', function(done) {
      ss.render('/template.txt', 'cache', function(err, source, opt) {
        expect(err).to.be.null;
        expect(opt).to.be.an('object');
        expect(opt.ctx).to.equal('cache');
        done();
      });
    });

  });

  describe('route', function() {

    var engine = testEngine;

    describe('common', function() {

      var server;
      before(function() {
        server = createServer(engine);
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

      describe('cache control', function() {

        var headers;
        before(function(done) {
          (new SmartStatic(__dirname + '/data', {
            engines: [engine]
          })).render('/template.txt', function(err, data, opt) {
            headers = {
              lastModified: opt.modified,
              etag: etag(data)
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
            server = createServer(engine, {
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
              if (res.header["etag"] !== undefined) {
                return "Etag should not be set";
              }
            })
            .expect(200, done);
          });

        });

        describe('permissive', function() {

          var server;
          before(function() {
            server = createServer(engine, {
              allowHidden: true,
              allowTemplates: true
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

        describe('deny', function() {

          var server;
          before(function() {
            server = createServer(testEngine, {
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

        describe('allow', function() {

          var server;
          before(function() {
            server = createServer(testEngine, {
              accessControl: {
                allow: ['.allow']
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
    var cache = memCache;
    before(function() {
      ss = new SmartStatic(__dirname + '/data', {
        engines: [testEngine],
        cache: cache
      });
    });

    it ('should compile and render template', function(done) {
      ss.render('/template.txt', function(err, source, opt) {
        expect(err).to.be.null;
        expect(source).to.equal('this is a template\ntest');
        expect(opt).to.be.an('object');
        expect(opt.cached).to.be.false;
        done();
      });
    });

    it ('should render template from cache', function(done) {
      ss.render('/template.txt', function(err, source, opt) {
        expect(err).to.be.null;
        expect(source).to.equal('this is a template\ntest');
        expect(opt).to.be.an('object');
        expect(opt.cached).to.be.true;
        done();
      });
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

      it ('should recompile and render template', function(done) {
        ss.render('/template.txt', function(err, source, opt) {
          expect(err).to.be.null;
          expect(source).to.equal('this is a template\ntest');
          expect(opt).to.be.an('object');
          expect(opt.cached).to.be.false;
          done();
        });
      });

    });

  });

});

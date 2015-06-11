'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var expect = require('chai').expect;
var request = require('supertest');
var smartStatic = require('../');
var testEngine = require('./lib/test-engine');
var memCache = require('./lib/mem-cache');

function createServer(engine) {

  var cache = {};

  var instance = smartStatic(__dirname + '/data', {
    engines: [engine],
    index: ['index.html', 'index.txt']
  });

  return http.createServer(function(req, res) {
    instance(req, res, function(err) {
      res.statusCode = err ? (err.status || 500) : 404;
      res.end(err ? err.stack : 'not found');
    });
  });

};

describe('smart-static', function() {
  describe('constructing', function() {

    it ('should throw TypeError if root is not supplied', function() {
      expect(function() {
        smartStatic();
      }).to.throw(TypeError);
    });

    it ('should throw TypeError if root is not a string', function() {
      expect(function() {
        smartStatic(1);
      }).to.throw(TypeError);
    });

    it ('should throw TypeError if opt is not an object', function() {
      expect(function() {
        smartStatic("", 1);
      }).to.throw(TypeError);
    });

    it ('should throw Error if root does not exist', function() {
      expect(function() {
        smartStatic(__dirname + '/not-exist');
      }).to.throw(Error);
    });

    it ('should throw Error if root is not a directory', function() {
      expect(function() {
        smartStatic(__dirname + '/data/static.txt');
      }).to.throw(Error);
    });

    it ('should throw TypeError if cache does not have a getCache function', function() {
      expect(function() {
        smartStatic(__dirname + '/data/static.txt', {
          cache: {}
        });
      }).to.throw(TypeError);
    });

    it ('should throw TypeError if cache does not have a setCache function', function() {
      expect(function() {
        smartStatic(__dirname + '/data/static.txt', {
          cache: {
            getCache: function() {}
          }
        });
      }).to.throw(TypeError);
    });

    it ('should return a function', function() {
      expect(function() {
        return smartStatic(__dirname + '/data');
      }).to.be.a('function');
    });

  });

  describe('adding engines', function() {

    it ('should throw error when called prior to module initialization', function() {
      expect(function() {
        smartStatic.engine();
      }).to.throw(Error);
    });

    describe('after module initialization', function() {

      before(function() {
        smartStatic(__dirname + '/data');
      });

      after(function() {
        smartStatic.reset();
      });

      it ('should throw TypeError on missing engine', function() {
        expect(function() {
          smartStatic.engine();
        }).to.throw(TypeError);
      });

      it ('should throw TypeError if engine is missing a map', function() {
        expect(function() {
          smartStatic.engine({});
        }).to.throw(TypeError);
      });

      it ('should throw TypeError if map is not an object', function() {
        expect(function() {
          smartStatic.engine(1);
        }).to.throw(TypeError);
      });

      it ('should throw TypeError if engine is missing compiler', function() {
        expect(function() {
          smartStatic.engine({map:{'.test':'.txt'}});
        }).to.throw(TypeError);
      });

      it ('should throw TypeError if compiler is not a function', function() {
        expect(function() {
          smartStatic.engine({map:{'.test':'.txt'}, compiler: ''});
        }).to.throw(TypeError);

      });

      it ('should throw TypeError if render is not a function', function() {
        expect(function() {
          smartStatic.engine({map:{'.test':'.txt'}, compiler: function() {}, render: ''});
        }).to.throw(TypeError);

      });

    });

  });

  describe('renderer', function() {

    it ('should throw error when called prior to module initialization', function() {
      expect(function() {
        smartStatic.render();
      }).to.throw(Error);
    });

    describe('after module initialization', function() {

      before(function() {
        smartStatic(__dirname + '/data', {
          engines: [testEngine]
        });
      });

      after(function() {
        smartStatic.reset();
      });

      it ('should throw TypeError if url is missing', function() {
        expect(function() {
          smartStatic.render();
        }).to.throw(TypeError);
      });

      it ('should throw TypeError if url is not a string', function() {
        expect(function() {
          smartStatic.render(1);
        }).to.throw(TypeError);
      });

      it ('should throw TypeError if cb is missing', function() {
        expect(function() {
          smartStatic.render('/');
        }).to.throw(TypeError);
      });

      it ('should throw TypeError if cb is not a function', function() {
        expect(function() {
          smartStatic.render('/', 1);
        }).to.throw(TypeError);
      });

      it ('should render and callback with context', function(done) {
        smartStatic.render('/template.txt', 'cache', function(err, source, opt) {
          expect(err).to.be.null;
          expect(opt).to.be.an('object');
          expect(opt.ctx).to.equal('cache');
          done();
        });
      });

    });

  });

  describe('route', function() {

    var engine = testEngine;
    var server;
    before(function() {
      server = createServer(engine);
    });

    after(function() {
      smartStatic.reset();
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
      .expect(200, 'this is a template test\n', done);
    });

    it ('should send rendered index template file', function(done) {
      request(server)
      .get('/sub')
      .expect('Content-Type', 'text/plain; charset=UTF-8')
      .expect(200, 'index test\n', done);
    });

  });

  describe('cache', function() {

    var cache = memCache;
    before(function() {
      smartStatic(__dirname + '/data', {
        engines: [testEngine],
        cache: cache
      });
    });

    after(function() {
      smartStatic.reset();
    });

    it ('should compile and render template', function(done) {
      smartStatic.render('/template.txt', function(err, source, opt) {
        expect(err).to.be.null;
        expect(source).to.equal('this is a template test\n');
        expect(opt).to.be.an('object');
        expect(opt.cache).to.be.false;
        done();
      });
    });

    it ('should render template from cache', function(done) {
      smartStatic.render('/template.txt', function(err, source, opt) {
        expect(err).to.be.null;
        expect(source).to.equal('this is a template test\n');
        expect(opt).to.be.an('object');
        expect(opt.cache).to.be.true;
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
        smartStatic.render('/template.txt', function(err, source, opt) {
          expect(err).to.be.null;
          expect(source).to.equal('this is a template test\n');
          expect(opt).to.be.an('object');
          expect(opt.cache).to.be.false;
          done();
        });
      });

    });

  });

});

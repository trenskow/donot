'use strict';

var fs = require('fs');
var path = require('path');
var url = require('url');
var send = require('send');
var mime = require('mime');
var merge = require('merge');
var async = require('async');
var etag = require('etag');

/**
 * Constructor for Donot
 * @param  {string} root root of served directory
 * @param  {object} opt  options object
 * @return {Donot} instance of Donot
 */
 var Donot = function(root, opt) { var self = this;

   if (!(self instanceof Donot)) return new Donot(root, opt);

  // Check arguments
  if (typeof root !== 'string') {
    throw new TypeError('root is required and must be a string');
  }

  if (opt && typeof opt !== 'object') {
    throw new TypeError('opt must be an object');
  }

  // Copy options
  self.options = merge(true, opt || {}, {});

  // Setup default options
  self.options.index = self.options.index || ['index.html'];
  self.options.etag = self.options.etag !== false;
  self.options.lastModified = self.options.lastModified !== false;
  self.options.allowHidden = self.options.allowHidden === true;
  self.options.allowTemplates = self.options.allowTemplates === true;
  self.options.root = root;
  self.options.serveDir = self.options.serveDir || '/';
  self.options.accessControl = self.options.accessControl || { deny: [] };

  // Add engines
  self.options.engines = [];
  ((opt || {}).engines || []).forEach(function(e) {
    self.engine(e);
  });

  // Set default void cache
  self.options.cache = self.options.cache || {
    get: function(file, cb) {
      cb();
    },
    set: function(file, data, cb) {
      cb();
    }
  };

  // Check serveDir
  if (typeof self.options.serveDir !== 'string') {
    throw new TypeError('serveDir must be a string');
  }

  // Normalize serveDir
  self.options.serveDir = path.normalize('/' + self.options.serveDir + '/');

  // Check access control
  if (typeof self.options.accessControl !== 'object') {
    throw new TypeError('accessControl must be of type object');
  }

  // Check access control is both allow or deny
  if (typeof self.options.accessControl.deny !== 'undefined' &&
      typeof self.options.accessControl.allow !== 'undefined') {
    throw new TypeError('accessControl cannot have both allow and deny.');
  }

  // Check deny
  if (self.options.accessControl.deny &&
      (typeof self.options.accessControl.deny !== 'object' ||
      self.options.accessControl.deny.constructor.name !== 'Array')) {
    throw new TypeError('accessControl.deny must be of type array');
  }

  // Check allow
  if (self.options.accessControl.allow &&
      (typeof self.options.accessControl.allow !== 'object' ||
      self.options.accessControl.allow.constructor.name !== 'Array')) {
    throw new TypeError('accessControl.deny must be of type array');
  }

  // Apply default if either allow or deny is set
  if (!self.options.accessControl.deny && !self.options.accessControl.allow) {
    self.options.accessControl.deny = [];
  }

  // Check allow and deny items
  var checkArray = function(arr) {
    if (typeof arr == 'undefined') return true;
    for (var idx in arr) {
      if ((typeof arr[idx] !== 'object' || arr[idx].constructor.name !== 'RegExp') && typeof arr[idx] !== 'string') {
        return false;
      }
    }
    return true;
  };

  if (!checkArray(self.options.accessControl.deny)) {
    throw new TypeError('accessControl.deny can only contain Strings and RegExps');
  }

  if (!checkArray(self.options.accessControl.allow)) {
    throw new TypeError('accessControl.allow can only contain Strings and RegExps');
  }

  // Check cache object
  if (!self.options.cache.get || typeof self.options.cache.get !== 'function') {
    throw new TypeError('cache must have a get function');
  }

  if (!self.options.cache.set || typeof self.options.cache.set !== 'function') {
    throw new TypeError('cache must have a set function');
  }

  // We make sure root exists and is a directory
  var rootStat = fs.statSync(root); // Will throw if root does not exist
  if (!rootStat.isDirectory()) throw new Error('root is not a directory');

};

/**
 * Gets the most recent modification time of an array of files
 * @param  {array}    files array of files
 * @param  {function} cb    callback
 */
function newest(files, cb) {

  var dates = [];
  async.eachSeries(files, function(file, next) {
    fs.stat(file, function(err, stats) {
      // If stat fails we rebuild
      if (err) return next(err);
      dates.push(stats.mtime);
      next();
    });
  }, function(err) {
    if (err) return cb(err);
    cb(null, dates.reduce(function(p, c) {
      return (p > c ? p : c);
    }));
  });

}

/**
 * Escapes a string for usage in a regular expression.
 * @param  {String} str The string to escape.
 * @return {String}     The escaped string.
 */
function escapeRegExp(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

/**
 * Test access to file
 * @param  {[type]} file The path and filename of the file to test
 * @return {[type]}      Boolean indicating if access is allowed
 * @api private
 */
Donot.prototype.testAccess = function(file) { var self = this;

  var allows = (typeof self.options.accessControl.allow !== 'undefined');
  var list = self.options.accessControl.allow || self.options.accessControl.deny;

  for (var idx in list) {
    var item = list[idx];

    // File extension
    if (typeof item === 'string') {
      item = new RegExp(escapeRegExp(item) + '$', 'i');
    }

    // Regular expression
    if (item.test(file)) {
      return allows;
    }
  }

  return !allows;

};

Donot.prototype.remoteToLocalPath = function(u) { var self = this;

  var pathname = url.parse(u).pathname;

  var tester = new RegExp('^' + escapeRegExp(self.options.serveDir), 'i');

  // Make sure pathname is in our serveDir
  if (!tester.test(pathname)) return false;

  // Convert to relative to root
  pathname = pathname.substr(self.options.serveDir.length, pathname.length - self.options.serveDir.length);

  // Map to local file
  var file = path.normalize(self.options.root + '/' + pathname);

  return file;

};

/**
 * Compiles a template
 * @param  {object}   engine the engine
 * @param  {string}   file   the template file
 * @param  {function} cb     callback
 * @api private
 */
Donot.prototype.compile = function(engine, file, cb) { var self = this;
  self.options.cache.get(file, function(err, cache) {
    if (err) return cb(err);

    // Actual build function
    function build() {
      // Read the content of the template
      fs.readFile(file, engine.encoding || 'utf8', function(err, data) {
        if (err) return cb(err);
        // Ask engine to compile
        engine.compile(file, data, {}, function(err, data, files) {
          if (err) return cb(err);
          // Set default files
          files = files || [file];

          // Get the modification time
          newest(files, function(err, modified) {
            if (err) return cb(err);

            if (typeof modified == 'number') throw new Error('here');

            // Update cache
            self.options.cache.set(file, {
              files: files,
              modified: modified,
              data: data
            }, function(err) {
              if (err) {
                console.error('WARNING: error saving \'' + file + '\' to cache (error: \'' + err.message + '\')');
              }
            });

            // Callback with compiled template
            cb(err, data, {
              cached: false,
              modified: modified
            });

          });

        });
      });
    }

    // Rebuild if cache is invalid
    if (!cache || !cache.modified || !cache.files || !cache.data) {
      return build();
    }

    // If string is a date (happens when serialized to JSON)
    // convert back to date.
    if (typeof cache.modified === 'string') {
      try {
        cache.modified = new Date(cache.modified);
      } catch(err) {
        return cb(err);
      }
    }

    // Figure if cache is outdated
    // - enumerate files used
    newest(cache.files, function(err, newest) {
      if (err) return cb(err);
      // If files have been modified - rebuild
      if (newest > cache.modified) return build();
      // - else returned cached compiled data
      cb(null, cache.data, {
        cached: true,
        modified: cache.modified
      });
    });

  });
};

/**
 * Renders a template
 * @param  {string}   file url to render
 * @param  {object}   ctx  context to pass to render callback
 * @param  {function} cb   callback with rendered url
 * @api public
 */
Donot.prototype.render = function(u, ctx, cb) { var self = this;

  // If no context
  if (cb === undefined) {
    cb = ctx;
    ctx = undefined;
  }

  // Check arguments
  if (!u || typeof u !== 'string') {
    throw new TypeError('url is required and must be a string');
  }

  if (!cb || typeof cb !== 'function') {
    throw new TypeError('cb is required and must be a function');
  }

  var pathname = self.remoteToLocalPath(u);

  // Iterate engines
  async.eachSeries(self.options.engines, function(engine, nextEngine) {
    // Iterate extensions
    async.forEachOfSeries(engine.map, function(templateExt, targetExt, nextExt) {

      // Use regular expression to match extension
      var extname = ((new RegExp(escapeRegExp(targetExt) + '$', 'i')).exec(pathname) || [])[0];

      if (extname !== targetExt) return nextExt();

      // Build actual local filename
      var basename = path.basename(pathname, extname);
      var dirname = path.dirname(pathname);
      var templateFile = path.normalize(dirname + '/' + basename + templateExt);

      // Check if template file exists
      fs.exists(templateFile, function(exists) {

        // If not found - continue with next ext
        if (!exists) return nextExt();

        // Compile
        self.compile(engine, templateFile, function(err, data, opt) {

          // If compile did not succeed - continue with next ext.
          if (err || !data || data === '') return nextExt(err);

          // Ask engine to render and return
          engine.render(url, data, { ctx: ctx }, function(err, source) {
            cb(err, source, merge(opt, {
              ctx: ctx
            }));
          });

        });

      });

    }, nextEngine);

  }, cb);

};

/**
 * http route
 * @param  {request}  req  http request
 * @param  {response} res  http response
 * @param  {function} next next handler (optional)
 */
Donot.prototype.route = function(req, res, next) { var self = this;

  // Set default next handler if used without Express or Connect
  if (!next) {
    next = function(err) {
      res.statusCode = err ? (err.status || 500) : 404;
      res.end(err ? err.stack : 'not found');
    };
  }

  // Ignore non-GET and non-HEAD requests.
  if (req.method != 'GET' && req.method != 'HEAD') return next();

  // Convert URL to local path
  var file = self.remoteToLocalPath(req.url);

  // If not in path
  if (file === false) return next();

  // Test access
  if (!self.testAccess(file)) return next();

  // Check if file exists
  fs.exists(file, function(exists) {

    // File does not exist
    if (!exists) {
      return self.render(req.url, req, function(err, data, opt) {
        if (err) return next(err);

        // If no data - next route
        if (!data) return next();

        // - else send response
        res.setHeader('Content-Type', mime.lookup(file) + '; charset=UTF-8');

        // Set Last-Modified header
        if (self.options.lastModified === true) {
          res.setHeader('Last-Modified', opt.modified.toUTCString());
        }

        // Use Etag cache control if enabled.
        if (self.options.etag === true) {
          // Generate etag
          var tag = etag(data);
          res.setHeader('Etag', tag);

          // If client sent If-None-Match and it matches etag - send 304 Not Modified
          if (req.headers['if-none-match'] === tag) {
            res.statusCode = 304;
            return res.end();
          }

        }

        // - else just send
        return res.end(data);

      });
    }

    // File exists
    else {

      // Get stats
      fs.stat(file, function(err, stats) {
        if (err) return next(err);

        // If directory we iterate through indexes
        if (stats.isDirectory()) {

          // Save origin url
          var originalUrl = req.url;
          return async.eachSeries(self.options.index, function(index, next) {

            // Update and assign to new url
            var urlObj = url.parse(originalUrl);
            urlObj.pathname = path.normalize(urlObj.pathname + '/' + index);
            req.url = url.format(urlObj);

            // Route to the new url
            self.route(req, res, next);

          }, next);

        } // end if directory

        // Ignore hidden files and folders
        if (!self.options.allowHidden) {
          var parts = file.split(path.sep);
          for (var idx in parts) {
            if (parts[idx].substr(0, 1) == '.') {
              return next();
            }
          }
        }

        // Ignore template files
        if (!self.options.allowTemplates) {
          for (var eidx in self.options.engines) {
            var engine = self.options.engines[eidx];
            for (var key in engine.map) {
              // If engine does not allow template access and
              // extname matches a template extension - go to next route
              if (engine.options.allowTemplates === false &&
                  (new RegExp(escapeRegExp(engine.map[key]) + '$', 'i')).test(file) &&
			      !(new RegExp(escapeRegExp(key) + '$', 'i')).test(file)) {
                return next();
              }
            }
          }
        }

        // We did not match any template - send file.
        // - We allow for hidden files as we safe guarded for it above
        // - also indexes are handled above so we also disable that.
        send(req, file, {
          dotfiles: 'allow',
          index: false,
          lastModified: true,
          etag: self.options.etag
        }).pipe(res);

      });

    }

  });

};

/**
 * Adds an engine
 * @param  {object} eng engine
 * @param  {object} opt options
 * @api public
 */
Donot.prototype.engine = function(eng, opt) {

  // Check arguments
  if (!eng || typeof eng !== 'object') {
    throw new TypeError('eng is required and must be an object');
  }

  if (!eng.map || typeof eng.map !== 'object') {
    throw new TypeError('engine must have a extension map and it must be an object');
  }

  if (!eng.compile || typeof eng.compile !== 'function') {
    throw new TypeError('engine must have a compile function');
  }

  if (eng.render !== undefined && typeof eng.render !== 'function') {
    throw new TypeError('engine render must be a function');
  }

  // Copy engine
  var engine = merge(true, eng, {});

  // We ensure engine extension maps are `.` prefixed
  engine.map = {};
  var keys = Object.keys(eng.map);
  for (var idx in keys) {
    var key = keys[idx];
    var val = eng.map[key];
    if (typeof val !== 'string') {
      throw new TypeError('engine map must be string -> string');
    }
    if (key.trim() === '' || val.trim() === '') {
      throw new TypeError('engine map key and value must not be \'\'');
    }
    if (!/^\./.test(key)) key = '.' + key;
    if (!/^\./.test(val)) val = '.' + val;
    engine.map[key] = val;
  }

  // Set engine options
  engine.options = merge(true, opt, {});
  if (typeof engine.options.allowTemplates === 'undefined') {
    engine.options.allowTemplates = this.options.allowTemplates;
  }

  // Set default engine parameters
  engine.render = engine.render || function(url, source, encoding, cb) {
    cb(null, source);
  };
  engine.encoding = engine.encoding || 'utf8';

  // - and finally add the engine
  this.options.engines.push(engine);

};

// Expose Donot
exports = module.exports = Donot;
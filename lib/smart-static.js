'use strict';

var fs = require('fs');
var path = require('path');
var url = require('url');
var send = require('send');
var mime = require('mime');
var merge = require('merge');
var async = require('async');

var memCache = require('./mem-cache');

var options = {};

/**
 * Compiles a template
 * @param  {object}   engine the engine
 * @param  {string}   file   the template file
 * @param  {function} cb     callback
 * @api private
 */
function compile(engine, file, cb) {
  options.cache.get(file, function(err, cache) {
    if (err) return cb(err);

    // Actual build function
    function build() {
      // Read the content of the template
      fs.readFile(file, { encoding: 'utf8' }, function(err, data) {
        if (err) return cb(err);
        // Ask engine to compile
        engine.compile(file, data, 'utf8', function(err, data, files) {
          if (err) return cb(err);
          // Set default files
          files = files || [file];

          // Update cache
          options.cache.set(file, {
            files: files,
            created: new Date(),
            data: data
          }, function(err) {
            if (err) {
              console.err('WARNING: error saving \'' + file + '\' to cache (error: \'' + err.message + '\')');
            }
          });

          // Callback with compiled template
          cb(err, data, false);

        });
      });
    }

    // Rebuild if cache is invalid
    if (!cache || !cache.created || !cache.files || !cache.data) {
      return build();
    }

    // Figure if cache is outdated
    // - enumerate files used
    var newest;
    async.eachSeries(cache.files, function(file, next) {
      fs.stat(file, function(err, stats) {
        // If stat fails we rebuild
        if (err) return build();
        newest = (!newest ? stats.mtime : Math.max(newest, stats.mtime));
        next();
      });
    }, function(err) {
      if (err) return cb(err);
      // If files are newer - rebuild
      if (newest > cache.created) return build();
      // - else returned cached compiled data
      cb(null, cache.data, true);
    });

  });
}

/**
 * Renders a template
 * @param  {string}   file url to render
 * @param  {function} cb   callback with rendered url
 * @api public
 */
function render(u, ctx, cb) {

  // If no context
  if (cb === undefined && typeof ctx == 'function') {
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

  var pathname = url.parse(u).pathname;
  var extname = path.extname(pathname);

  // We do not support files without extension.
  if (!extname || extname == '') return cb();

  // Iterate engines
  async.eachSeries(options.engines, function(engine, nextEngine) {
    // Iterate extensions
    async.forEachOfSeries(engine.map, function(templateExt, targetExt, nextExt) {

      // If not correct extension - continue
      if (extname != targetExt) return nextExt();

      // Build actual local filename
      var basename = path.basename(pathname, extname);
      var dirname = path.dirname(pathname);
      var templateFile = path.normalize(options.root + '/' + dirname + '/' + basename + templateExt);

      // Check if template file exists
      fs.exists(templateFile, function(exists) {

        // If not found - continue with next ext
        if (!exists) return nextExt();

        // Compile
        compile(engine, templateFile, function(err, data, cached) {

          // If compile did not succeed - continue with next ext.
          if (err || !data || data == '') return nextExt(err);

          // Ask engine to render and return
          engine.render(url, data, 'utf8', ctx, function(err, source) {
            cb(err, source, cached);
          });

        });

      })

    }, nextEngine)

  }, cb);

}

/**
 * Returns a route for smart static
 * @param  {string}   root root of static directory
 * @param  {object}   opt  options
 * @return {function}      the route
 * @api public
 */
function smartStatic(root, opt) {

  // Check arguments
  if (typeof root !== 'string') {
    throw new TypeError('root is required and must be a string');
  }

  if (opt && typeof opt !== 'object') {
    throw new TypeError('opt must be an object');
  }

  // Copy options
  options = merge(true, opt || {}, {});

  // Setup default options
  options.index = options.index || ['index.html'];
  options.root = root;

  // Add engines
  options.engines = [];
  ((opt || {}).engines || []).forEach(function(e) {
    engine(e);
  });

  // Set default memory cache
  options.cache = options.cache || memCache;

  // Check cache object
  if (!options.cache.get || typeof options.cache.get !== 'function') {
    throw new TypeError('cache must have a get function');
  }

  if (!options.cache.set || typeof options.cache.set !== 'function') {
    throw new TypeError('cache must have a set function');
  }

  // We make sure root exists and is a directory
  var rootStat = fs.statSync(root); // Will throw if root does not exist
  if (!rootStat.isDirectory()) throw new Error('root is not a directory');

  // Return the route
  return function route(req, res, next) {

    // Ignore non-GET and non-HEAD requests.
    if (req.method != 'GET' && req.method != 'HEAD') return next();

    // Map to local file
    var file = path.normalize(root + '/' + url.parse(req.url).pathname);

    // Check if file exists
    fs.exists(file, function(exists) {

      // File does not exist
      if (!exists) {
        return render(req.url, req, function(err, data) {
          if (err) return next(err);

          // If no data - next route
          if (!data) return next();

          // - else send data
          res.setHeader('Content-Type', mime.lookup(file) + '; charset=UTF-8');
          res.end(data);

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
            return async.eachSeries(options.index, function(index, next) {

              // Update and assign to new url
              var urlObj = url.parse(originalUrl);
              urlObj.pathname = path.normalize(urlObj.pathname + '/' + index);
              req.url = url.format(urlObj);

              // Route to the new url
              route(req, res, function(err) {
                next(err);
              });

            }, function(err) {
              next(err);
            });

          }; // end if directory

          // Ignore hidden files and folders
          if (!options.allowHidden) {
            var parts = file.split(path.sep);
            for (var idx in parts) {
              if (parts[idx].substr(0, 1) == '.') {
                return next();
              }
            }
          }

          // Ignore template files
          for (var idx in options.engines) {
            var engine = options.engines[idx];
            for (var key in engine.map) {
              // If extname matches a template extension - go to next route
              if (engine.map[key].toLowerCase() == path.extname(file).toLowerCase()) {
                return next();
              }
            }
          }

          // We did not match any template. Send file.
          // - remark we allow for hidden files as we safe guard for it above
          send(req, file, { dotfiles: 'allow' }).pipe(res);

        });

      }

    });

  };

}

/**
 * Adds an engine
 * @param  {object} opt options
 * @api public
 */
function engine(opt) {

  // Check arguments
  if (!opt || typeof opt !== 'object') {
    throw new TypeError('opt is required and must be an object');
  }

  if (!opt.map || typeof opt.map !== 'object') {
    throw new TypeError('engine must have a must and it must be an object');
  }

  if (!opt.compile || typeof opt.compile !== 'function') {
    throw new TypeError('engine must have a compile function');
  }

  if (opt.render !== undefined && typeof opt.render !== 'function') {
    throw new TypeError('engine render must be a function');
  }

  // Copy options
  var engine = merge(true, opt, {});

  // Set default options
  engine.render = engine.render || function(url, source, encoding, cb) {
    cb(null, source);
  };
  engine.encoding = engine.encoding || 'utf8';

  // - and finally add the engine
  options.engines.push(engine);

}

exports = module.exports = smartStatic;

exports.render = render;
exports.engine = engine;

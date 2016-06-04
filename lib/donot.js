'use strict';

var fs = require('fs');
var path = require('path');
var url = require('url');
var send = require('send');
var mime = require('mime');
var merge = require('merge');
var async = require('async');
var etag = require('etag');

var utils = require('./utils');
var Cache = require('@donotjs/donot-cache');
var Transform = require('@donotjs/donot-transform');

class Donot {
	/**
	 * Constructor for Donot
	 * @param	{string} root root of served directory
	 * @param	{object} opt	options object
	 * @return {Donot} instance of Donot
	 */
	constructor(root, opt) {
		// Check arguments
		if (typeof root !== 'string') {
			throw new TypeError('root is required and must be a string');
		}

		if (opt && typeof opt !== 'object') {
			throw new TypeError('opt must be an object');
		}

		opt = opt || {};

		// Copy options
		this.options = {};

		// Setup default options
		this.options.index = opt.index || ['index.html'];
		this.options.etag = opt.etag !== false;
		this.options.lastModified = opt.lastModified !== false;
		this.options.dotFiles = opt.dotFiles === true;
		this.options.templates = opt.templates === true;
		this.options.root = root;
		this.options.serveDir = opt.serveDir || '/';
		this.options.accessControl = opt.accessControl || { deny: [] };

		// Add transforms
		this.transforms = [];
		(opt.transforms || []).forEach((e) => {
			this.transform(e);
		});

		// Set default dummy cache
		this.options.cache = opt.cache || new Cache();

		// Wrap cache in array if not already.
		if (this.options.cache.constructor.name !== 'Array') {
			this.options.cache = [this.options.cache];
		}

		// Check serveDir
		if (typeof this.options.serveDir !== 'string') {
			throw new TypeError('serveDir must be a string');
		}

		// Normalize serveDir
		this.options.serveDir = path.normalize('/' + this.options.serveDir + '/');

		// Check access control
		if (typeof this.options.accessControl !== 'object') {
			throw new TypeError('accessControl must be of type object');
		}

		// Check access control is both allow or deny
		if (typeof this.options.accessControl.deny !== 'undefined' &&
				typeof this.options.accessControl.allow !== 'undefined') {
			throw new TypeError('accessControl cannot have both allow and deny.');
		}

		// Check deny
		if (this.options.accessControl.deny &&
				(typeof this.options.accessControl.deny !== 'object' ||
				this.options.accessControl.deny.constructor.name !== 'Array')) {
			throw new TypeError('accessControl.deny must be of type array');
		}

		// Check allow
		if (this.options.accessControl.allow &&
				(typeof this.options.accessControl.allow !== 'object' ||
				this.options.accessControl.allow.constructor.name !== 'Array')) {
			throw new TypeError('accessControl.deny must be of type array');
		}

		// Apply default if either allow or deny is set
		if (!this.options.accessControl.deny && !this.options.accessControl.allow) {
			this.options.accessControl.deny = [];
		}

		// Check allow and deny items
		var checkArray = (arr) => {
			if (typeof arr == 'undefined') return true;
			for (var idx in arr) {
				if ((typeof arr[idx] !== 'object' || arr[idx].constructor.name !== 'RegExp') && typeof arr[idx] !== 'string') {
					return false;
				}
			}
			return true;
		};

		if (!checkArray(this.options.accessControl.deny)) {
			console.log('deny');
			throw new TypeError('accessControl.deny can only contain Strings and RegExps');
		}

		if (!checkArray(this.options.accessControl.allow)) {
			console.log('allow');
			throw new TypeError('accessControl.allow can only contain Strings and RegExps');
		}

		// Check cache objects
		this.options.cache.forEach((cache) => {
			if (!utils.isKindOf(cache, Cache)) {
				throw new TypeError('cache must be of type Cache.');
			}
		});

		// We make sure root exists and is a directory
		var rootStat = fs.statSync(root); // Will throw if root does not exist
		if (!rootStat.isDirectory()) throw new Error('root is not a directory');
	}

	/**
	 * Test access to file
	 * @param	{[type]} file The path and filename of the file to test
	 * @return {[type]}			Boolean indicating if access is allowed
	 * @api private
	 */
	testAccess(file) {

		var allows = (typeof this.options.accessControl.allow !== 'undefined');
		var list = this.options.accessControl.allow || this.options.accessControl.deny;

		for (var idx in list) {
			var item = list[idx];

			// File extension
			if (typeof item === 'string') {
				item = new RegExp(utils.escapeRegExp(item) + '$', 'i');
			}

			// Regular expression
			if (item.test(file)) {
				return allows;
			}
		}

		return !allows;

	}

	remoteToLocalPath(u) {
		var pathname = url.parse(u).pathname;

		var tester = new RegExp('^' + utils.escapeRegExp(this.options.serveDir), 'i');

		// Make sure pathname is in our serveDir
		if (!tester.test(pathname)) return false;

		// Convert to relative to root
		pathname = pathname.substr(this.options.serveDir.length, pathname.length - this.options.serveDir.length);

		// Map to local file
		var file = path.normalize(this.options.root + '/' + pathname);

		return file;
	}

	/**
	 * Adds a transform
	 * @param	{object} transform tranform
	 * @param	{object} options options
	 * @api public
	 */
	transform(transform, options) {

		if (!transform || !utils.isKindOf(transform, Transform)) {
			throw new TypeError('transform is required and must be an instance of Transform');
		}

		this.transforms.push(transform);

	}

	render(u, ctx) {
		return new Promise((resolved, rejected) => {

			// Check arguments
			if (!u || typeof u !== 'string') {
				return rejected(TypeError('url is required and must be a string'));
			}

			var filename = this.remoteToLocalPath(u);

			resolved();

		});
	}

	route(req, res, next) {

		// Set default next handler if used without Express or Connect
		if (!next) {
			next = (err) => {
				res.statusCode = err ? (err.status || 500) : 404;
				res.end(err ? err.stack : 'not found');
			};
		}

		// Ignore non-GET and non-HEAD requests.
		if (req.method != 'GET' && req.method != 'HEAD') return next();

		// Convert URL to local path
		var filename = this.remoteToLocalPath(req.url);

		// If not in path
		if (filename === false) return next();

		// Test access
		if (!this.testAccess(filename)) return next();

		// Ask transform
		if (!this.options.templates) {
			if (this.transforms.some((transform) => {
				return !transform.allowAccess(filename);
			})) {
				return next();
			}
		}

		// Ignore hidden files and folders
		if (!this.options.dotFiles) {
			var parts = filename.split(path.sep);
			for (var idx in parts) {
				if (parts[idx].substr(0, 1) == '.') {
					return next();
				}
			}
		}

		// Check if file exists
		fs.exists(filename, (exists) => {

			// File does not exist
			if (!exists) {

				return this.render(req.url, req).then((result) => {

					// If no data - next route
					if (!result || !result.data) return next();

					// - else send response
					res.setHeader('Content-Type', mime.lookup(filename) + '; charset=UTF-8');

					// Set Last-Modified header
					if (this.options.lastModified === true) {
						res.setHeader('Last-Modified', result.modified.toUTCString());
					}

					// Use Etag cache control if enabled.
					if (this.options.etag === true) {
						// Generate etag
						var tag = etag(result.data);
						res.setHeader('Etag', tag);

						// If client sent If-None-Match and it matches etag - send 304 Not Modified
						if (req.headers['if-none-match'] === tag) {
							res.statusCode = 304;
							return res.end();
						}

					}

					// - else just send
					return res.end(result.data);

				}, next);
			}

			// File exists
			else {

				// Get stats
				fs.stat(filename, (err, stats) => {
					if (err) return next(err);

					// If directory we iterate through indexes
					if (stats.isDirectory()) {

						// Save origin url
						var originalUrl = req.url;
						return async.eachSeries(this.options.index, (index, next) => {

							// Update and assign to new url
							var urlObj = url.parse(originalUrl);
							urlObj.pathname = path.normalize(urlObj.pathname + '/' + index);
							req.url = url.format(urlObj);

							// Route to the new url
							this.route(req, res, next);

						}, next);

					} // end if directory

					// We did not match any template - send file.
					// - We allow for hidden files as we safe guarded for it above
					// - also indexes are handled above so we also disable that.
					send(req, filename, {
						dotfiles: 'allow',
						index: false,
						lastModified: true,
						etag: this.options.etag
					}).pipe(res);

				});

			}

		});

	}

}

/**
 * Gets the most recent modification time of an array of files
 * @param	{array}		files array of files
 * @param	{function} cb		callback
 */
/*
function newest(files, cb) {

	var dates = [];
	async.eachSeries(files, (file, next) => {
		fs.stat(file, (err, stats) => {
			// If stat fails we rebuild
			if (err) return next(err);
			dates.push(stats.mtime);
			next();
		});
	}, (err) => {
		if (err) return cb(err);
		cb(null, dates.reduce((p, c) => {
			return (p > c ? p : c);
		}));
	});

}

/**
 * Compiles a template
 * @param	{object}	 engine the engine
 * @param	{string}	 file	 the template file
 * @param	{function} cb		 callback
 * @api private
 */
/*
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
 * @param	{string}	 file url to render
 * @param	{object}	 ctx	context to pass to render callback
 * @param	{function} cb	 callback with rendered url
 * @api public
 */
/*
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
			var extname = ((new RegExp(utils.escapeRegExp(targetExt) + '$', 'i')).exec(pathname) || [])[0];

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
 * @param	{request}	req	http request
 * @param	{response} res	http response
 * @param	{function} next next handler (optional)
 */
/*
Donot.prototype.route = function(req, res, next) { var self = this;

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
									(new RegExp(utils.escapeRegExp(engine.map[key]) + '$', 'i')).test(file) &&
						!(new RegExp(utils.escapeRegExp(key) + '$', 'i')).test(file)) {
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

*/
// Expose Donot
exports = module.exports = Donot;

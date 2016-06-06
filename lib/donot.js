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
var CacheChain = require('./cache-chain');
var TransformChain = require('./transform-chain');

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

		this.root = root;

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
			throw new TypeError('accessControl.deny can only contain Strings and RegExps');
		}

		if (!checkArray(this.options.accessControl.allow)) {
			throw new TypeError('accessControl.allow can only contain Strings and RegExps');
		}

		// Check cache objects
		this.options.cache.forEach((cache) => {
			if (!utils.isKindOf(cache, Cache)) {
				throw new TypeError('cache must be of type Cache.');
			}
		});

		// Create CacheChain
		this.cacheChain = new CacheChain(this.options.cache, this.root, this.options.serveDir);

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
	testAccess(filename) {

		var allows = (typeof this.options.accessControl.allow !== 'undefined');
		var list = this.options.accessControl.allow || this.options.accessControl.deny;

		for (var idx in list) {
			var item = list[idx];

			// File extension
			if (typeof item === 'string') {
				item = new RegExp(utils.escapeRegExp(item) + '$', 'i');
			}

			// Regular expression
			if (item.test(filename)) {
				return allows;
			}
		}

		return !allows;

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

	render(remoteFilename, ctx) {
		return new Promise((resolved, rejected) => {

			if (!remoteFilename || typeof remoteFilename !== 'string') {
				return rejected(TypeError('filename is required and must be a string'));
			}

			// Check arguments
			var transformChain = new TransformChain(this.transforms, this.cacheChain);

			transformChain.render(utils.remoteToLocalFilename(remoteFilename, this.root, this.options.serveDir), ctx).then((result) => {

				resolved(result);

			}, rejected);

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

		// Convert URL to remote path
		var remoteFilename = url.parse(req.url).pathname;
		var localFilename = utils.remoteToLocalFilename(remoteFilename, this.root, this.options.serveDir);

		// If not in path
		if (!localFilename) return next();

		// Test access
		if (!this.testAccess(remoteFilename)) return next();

		// Ask transform
		if (!this.options.templates) {
			if (this.transforms.some((transform) => {
				return !transform.allowAccess(remoteFilename);
			})) {
				return next();
			}
		}

		// Ignore hidden files and folders
		if (!this.options.dotFiles) {
			var parts = localFilename.split(path.sep);
			for (var idx in parts) {
				if (parts[idx].substr(0, 1) == '.') {
					return next();
				}
			}
		}

		// Check if file exists
		fs.exists(localFilename, (exists) => {

			// File does not exist
			if (!exists) {

				return this.render(remoteFilename, req).then((result) => {

					// If no data - next route
					if (!result || !result.data) return next();

					// - else send response
					res.setHeader('Content-Type', mime.lookup(result.filename) + '; charset=UTF-8');

					// Set Last-Modified header
					if (this.options.lastModified === true) {
						res.setHeader('Last-Modified', result.modificationDate.toUTCString());
					}

					// Use Etag cache control if enabled.
					if (this.options.etag === true) {
						// Generate etag
						var tag = etag(result.data.toString());
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
				fs.stat(localFilename, (err, stats) => {
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
					send(req, localFilename, {
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

// Expose Donot
exports = module.exports = Donot;

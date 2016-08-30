'use strict';

var async = require('async');
var fs = require('fs');
var path = require('path');
var utils = require('./utils');

class CacheChain {

	constructor(caches, root, serveDir) {
		this.caches = caches;
		this.root = root;
		this.serveDir = serveDir;
	}

	_key(localFilename, options) {
		return utils.hash({
			filename: utils.localToRemoteFilename(localFilename, this.root, this.serveDir),
			options: options
		});
	}

	get(localFilename, options) {

		const key = this._key(localFilename, options);

		return new Promise((resolved, rejected) => {
			this.caches[0].get(key).then((result) => {
				if (!result) return resolved();
				async.reduce(result.files, new Date(0), (date, filename, next) => {
					var testForFilename = path.resolve(path.dirname(localFilename), filename);
					fs.access(testForFilename, (err) => {
						if (err) return this.invalidate(key).then(resolved, rejected);
						fs.stat(path.resolve(path.dirname(localFilename), filename), (err, stats) => {
							if (err) return next(err);
							var modificationDate = stats.mtime > stats.ctime ? stats.mtime : stats.ctime;
							next(null, modificationDate > date ? modificationDate : date);
						});
					});
				}, (err, date) => {
					if (err) return rejected(err);
					if (date > result.modificationDate) {
						return this.invalidate(key).then(resolved, rejected);
					}
					resolved(result);
				});
			}, rejected);
		});
	}

	set(localFilename, options, data) {
		return this.caches[0].set(this._key(localFilename, options), data);
	}

	invalidate(localFilename, options, data) {
		return this.caches[0].invalidate(this._key(localFilename, options));
	}

}

module.exports = exports = CacheChain;

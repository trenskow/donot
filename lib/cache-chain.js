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

	get(localFilename) {
		return new Promise((resolved, rejected) => {
			this.caches[0].get(utils.localToRemoteFilename(localFilename, this.root, this.serveDir)).then((result) => {
				if (!result) return resolved();
				async.reduce(result.files, new Date(0), (date, filename, next) => {
					var testForFilename = path.resolve(path.dirname(localFilename), filename);
					fs.access(testForFilename, (err) => {
						if (err) return this.invalidate(localFilename).then(resolved, rejected);
						fs.stat(path.resolve(path.dirname(localFilename), filename), (err, stats) => {
							if (err) return next(err);
							var modificationDate = stats.mtime > stats.ctime ? stats.mtime : stats.ctime;
							next(null, modificationDate > date ? modificationDate : date);
						});
					});
				}, (err, date) => {
					if (err) return rejected(err);
					if (date > result.modificationDate) {
						return this.invalidate(localFilename).then(resolved, rejected);
					}
					resolved(result);
				});
			}, rejected);
		});
	}

	set(filename, data) {
		return this.caches[0].set(utils.localToRemoteFilename(filename, this.root, this.serveDir), data);
	}

	invalidate(filename, data) {
		return this.caches[0].invalidate(utils.localToRemoteFilename(filename, this.root, this.serveDir));
	}

}

module.exports = exports = CacheChain;

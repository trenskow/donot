'use strict';

const fs = require('fs');
const path = require('path');
const async = require('async');
const merge = require('merge');
const sorcery = require('sorcery');

const FileReader = require('./file-reader');

class TransformChain {

	constructor(transforms, cacheChain, opt) {
		this.transforms = transforms;
		this.cacheChain = cacheChain;
		this.options = opt || {};
	}

	_buildChain(localFilename, remoteFilename) {
		var result = [];
		// We're going to mutate array - so we copy it using concat.
		var transforms = this.transforms.concat();

		var getDstFilename = function() {
			return {
				local: ((result[result.length - 1] || {}).srcFilename || {}).local || localFilename,
				remote: ((result[result.length - 1] || {}).srcFilename || {}).remote || remoteFilename
			};
		};

		// Loop until no more transforms are found.
		do {
			var found = false;
			for (var idx in transforms) {
				var transform = transforms[idx];
				var dstFilename = getDstFilename();
				if (transform.canTransform(dstFilename.local)) {
					result.push({
						srcFilename: {
							local: transform.map(dstFilename.local),
							remote: transform.map(dstFilename.remote)
						},
						dstFilename: dstFilename,
						transform: transform
					});
					transforms.splice(idx, 1);
					found = true;
					break;
				}
			}
			if (!found) break;
		} while (true);
		result.push({
			srcFilename: getDstFilename(),
			dstFilename: getDstFilename(),
			transform: new FileReader()
		});
		return result.reverse();
	}

	render(localFilename, remoteFilename, ctx) {
		return new Promise((resolved, rejected) => {
			this.cacheChain.get(localFilename).then((result) => {
				if (result) return resolved(merge(result, { cached: true }));
				var renderChain = this._buildChain(localFilename, remoteFilename);
				async.forEachOfSeries(renderChain, (item, idx, next) => {
					var lastResult = (renderChain[idx - 1] || {}).result || {};
					item.transform.compile(item.srcFilename.local, lastResult.data, lastResult.map, ctx).then((itemResult) => {
						if (!itemResult) return resolved();
						async.reduce(itemResult.files || [], [], (files, file, next) => {
							fs.access(file, (err) => {
								next(null, files.concat(!err ? [file] : []));
							});
						}, (err, files) => {
							if (err) return rejected(err);
							item.result =  merge(itemResult, {
								files: files.map((filename) => {
									return path.relative(path.dirname(localFilename), filename);
								}),
								modificationDate: new Date()
							});
							next();
						});
					}, next);
				}, (err) => {
					if (err) return rejected(err);
					var lastResult = renderChain[renderChain.length - 1].result;
					var files = renderChain.reduce((files, item) => {
						return (files || []).concat(item.result.files || []);
					}, []);
					var uniqueFiles = [];
					files.forEach((file) => {
						if (uniqueFiles.indexOf(file) == -1) uniqueFiles.push(file);
					});
					lastResult = merge(lastResult, {
						filename: localFilename,
						files: uniqueFiles
					});
					if (lastResult.map) {
						lastResult.map.sources = lastResult.map.files = lastResult.files;
						lastResult.map.file = path.basename(remoteFilename);
						if (this.options.sourceMaps === true) {
							lastResult.data = new Buffer(lastResult.data.toString().replace(/# sourceMappingURL=.+($| |\*)/, '# sourceMappingURL=' + path.basename(remoteFilename) + '.map'));
						}
					}
					this.cacheChain.set(localFilename, lastResult).then(() => {
						resolved(merge(lastResult, { cached: false }));
					}, rejected);
				});
			}, rejected);
		});
	}

}

module.exports = exports = TransformChain;

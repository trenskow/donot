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

	_buildLeaf(transforms, localFilename, remoteFilename, callback, level) {

		level = level || 0;

		const ts = transforms.concat();

		async.filter(ts, (transform, next) => {
			if (transform.canTransform.length == 2) {
				return transform.canTransform(localFilename, next);
			}
			return next(transform.canTransform(localFilename));
		}, (result) => {
			async.map(result, (transform, next) => {
				const transforms = ts.concat();
				transforms.splice(transforms.indexOf(transform), 1);
				const lf = transform.map(localFilename);
				const rf = transform.map(remoteFilename);
				this._buildLeaf(transforms, lf, rf, leaf => {
					next(null, {
						src: {
							local: localFilename,
							remote: remoteFilename,
						},
						dst: {
							local: lf,
							remote: rf,
						},
						transform: transform,
						leaf: leaf
					});
				}, level + 1);
			}, (err, result) => {
				callback(result);
			});
		});

	}

	_flattenLeaf(leaf, base) {
		base = base || [];
		var ret = [];
		leaf.forEach(item => {
			const chain = base.concat(item);
			ret.push(chain);
			ret = ret.concat(this._flattenLeaf(item.leaf, chain));
		});
		return ret;
	}

	_buildChain(localFilename, remoteFilename, callback) {
		this._buildLeaf(this.transforms.concat(new FileReader()), localFilename, remoteFilename, leaf => {
			callback((this._flattenLeaf(leaf).filter(chain => {
				const lastItem = chain[chain.length - 1];
				return (lastItem.transform.canProcessFilenames || () => {})();
			}).sort((a, b) => b.length - a.length)[0] || []).reverse());
		});
	}

	render(localFilename, remoteFilename, ctx) {
		return new Promise((resolved, rejected) => {
			this.cacheChain.get(localFilename).then((result) => {
				if (result) return resolved(merge(result, { cached: true }));
				this._buildChain(localFilename, remoteFilename, renderChain => {
					async.waterfall(renderChain.map(item => {
						return (lastResult, next) => {
							if (!next) {
								next = lastResult;
								lastResult = undefined;
							}
							lastResult = lastResult || {};
							item.transform.compile(item.src.local, lastResult.data || item.src.local, lastResult.map, ctx)
							.then(itemResult => {
								async.filter(itemResult.files, (file, next) => {
									fs.access(file, err => next(!err));
								}, files => {
									next(null, merge(itemResult, {
										files: files.map(filename => {
											return path.relative(path.dirname(localFilename), filename);
										}).concat(lastResult.files || []),
										modificationDate: new Date()
									}));
								});
							})
							.catch(next);
						};
					}), (err, lastResult) => {
						if (err) return rejected(err);
						if (!lastResult) return resolved();
						lastResult = merge(lastResult, {
							filename: localFilename,
							files: lastResult.files.reduce((files, file) => files.concat(files.indexOf(file) == -1 ? file : []), [])
						});
						if (lastResult.map) {
							lastResult.map.sources = lastResult.map.files = lastResult.files;
							lastResult.map.file = path.basename(remoteFilename);
							lastResult.data = new Buffer(
								lastResult.data.toString().replace(
									/# sourceMappingURL=.+($| |\*)/,
									(this.options.sourceMaps === true ? '# sourceMappingURL=' + path.basename(remoteFilename) + '.map' : '')
								)
							);
						}
						this.cacheChain.set(localFilename, lastResult).then(() => {
							resolved(merge(lastResult, { cached: false }));
						}, rejected);
					});
				});
			}, rejected);
		});
	}

}

module.exports = exports = TransformChain;

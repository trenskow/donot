'use strict';

const fs = require('fs');
const path = require('path');
const async = require('async');
const tmp = require('tmp');
const merge = require('merge');

class TransformChain {

	constructor(transforms, cacheChain) {
		this.transforms = transforms.concat();
		this.chain = [];
		this.cacheChain = cacheChain;
	}

	_buildChain(destFilename) {
		var found = true;
		var srcFilename = destFilename;
		while (found) {
			found = false;
			for (var idx in this.transforms) {
				var transform = this.transforms[idx];
				if (transform.canTransform(srcFilename)) {
					srcFilename = transform.map(srcFilename);
					this.chain.push({
						transform: transform,
						filename: srcFilename
					});
					this.transforms.splice(idx, 1);
					found = true;
					break;
				}
			}
		}
		return srcFilename;
	}

	render(localFilename, options) {
		return new Promise((resolved, rejected) => {
			this.cacheChain.get(localFilename).then((result) => {
				if (result) return resolved(merge(result, { cached: true }));
				var srcFilename = this._buildChain(localFilename);
				if (!srcFilename) return resolved();
				fs.exists(srcFilename, (exists) => {
					if (!exists) return resolved();
					fs.readFile(srcFilename, (err, data) => {
						if (err) return rejected(err);
						async.reduce(
							this.chain,
							{
								data: data,
								filename: localFilename,
								modificationDate: new Date(),
								files: []
							},
							(result, item, next) => {
								item.transform.compile(item.filename, result.data, options).then((compilerResult) => {
									result.data = compilerResult.data;
									async.each(compilerResult.files || [], (filename, next) => {
										fs.exists(filename, (exists) => {
											if (exists) result.files.push(filename);
											next();
										});
									}, (err) => {
										next(err, result);
									});
								}, next);
							}, (err, result) => {
								if (err) return rejected(err);
								result.files = result.files.map((filename) => {
									return path.relative(path.dirname(localFilename), filename);
								});
								this.cacheChain.set(localFilename, result).then(() => {
									resolved(merge(result, { cached: false }));
								}, rejected);
							});
					});
				});
			}, rejected);
		});
	}

}

module.exports = exports = TransformChain;

'use strict';

var fs = require('fs');
var Transform = require('@donotjs/donot-transform');

/// Simple engine for testing
/// Removes prefixed 'test ' at compile
/// Appends 'test' at render
class TestTransform extends Transform {

	canTransform(filename) {
		return /\.txt$/i.test(filename);
	}

	allowAccess(filename) {
		return !/\.test$/i.test(filename);
	}

	map(filename) {
		return filename.replace(/\.txt$/i, '.test');
	}

	compile(srcFilename, destFilename) {
		return new Promise((resolved, rejected) => {
			fs.readFile(srcFilename, 'utf8', (err, data) => {
				if (err) return rejected(err);
				fs.writeFile(destFilename, data.substr(5), 'utf8', (err) => {
					if (err) return rejected(err);
					resolved({
						files: [srcFilename]
					});
				});
			});
		});
	}

	needsRendering() {
		return true;
	}

	render(compiledData, options) {
		return new Promise.resolve(compiledData + 'test');
	}

}

exports = module.exports = TestTransform;

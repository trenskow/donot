'use strict';

var Transform = require('@donotjs/donot-transform');

/// Simple engine for testing
/// Removes prefixed 'test ' at compile
/// Appends 'test' at render
class ReverseTransform extends Transform {

	canTransform(filename) {
		return /\.reversed\.txt$/i.test(filename);
	}

	map(filename) {
		return filename.replace(/\.reversed\.txt$/i, '.txt');
	}

	compile(filename, data) {
		return Promise.resolve({
			data: new Buffer(data.toString().split('').reverse().join('')),
			files: [filename]
		});
	}

}

exports = module.exports = ReverseTransform;

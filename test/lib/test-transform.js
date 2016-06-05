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

	compile(filename, data) {
		return Promise.resolve({
			data: new Buffer(data.toString().substr(5) + 'test'),
			files: [filename]
		});
	}

}

exports = module.exports = TestTransform;

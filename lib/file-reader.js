'use strict';

const fs = require('fs');
const Transform = require('@donotjs/donot-transform');

class FileReader extends Transform {

	canTransform (filename, callback) {
		fs.access(filename, fs.V_OK | fs.R_OK, err => {
			callback(!err);
		});
	}

	map(filename) {
		return filename;
	}

	canProcessFilenames() {
		return true;
	}

	compile(filename) {
		return new Promise((resolved, rejected) => {
			fs.access(filename, (err) => {
				if (err) return resolved();
				fs.readFile(filename, (err, data) => {
					if (err) return rejected(err);
					resolved({
						data: data,
						filename: filename,
						modificationDate: new Date(),
						files: [filename]
					});
				});
			});
		});
	}

}

exports = module.exports = FileReader;

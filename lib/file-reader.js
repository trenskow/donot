'use strict';

const fs = require('fs');
const Transform = require('@donotjs/donot-transform');

class FileReader extends Transform {

	map(filename) {
		return filename;
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

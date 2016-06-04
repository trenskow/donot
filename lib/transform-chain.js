'use strict';

class TransformChain {

	constructor(transforms) {
		this.transforms = transforms;
		this.chain = [];
	}

	resolve(filename) {
		for (var idx in this.transforms) {
			var transform = this.transforms[idx];
			if (transform.canTransform(filename)) {
				this.chain.push(transform);
				this.transforms.splice(idx, 1);
				return transform.map(filename);
			}
		}
	}

	transform(file) {
		return new Promise((resolved, rejected) => {
			while (this.transforms.length > 0) {
				
			}
		});
	}

}

module.exports = exports = TransformChain;

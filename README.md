donot
=====

[![Build Status](https://travis-ci.org/donotjs/donot.svg?branch=master)](https://travis-ci.org/donotjs/donot)

A middleware inspired by [static-serve](https://github.com/expressjs/serve-static), but with support for JIT compilation.

*Can be used as Express or Connect middleware - or with just plain `http`*.

# How it Works

*donot* is an engine. Build-in is the ability to serve static files, just like static files - being able to serve a local directory as a directory of an http server.

But being smart, it also supports plug-ins for transforming files - which means it automatically compiles and renders local templates, and/or transforms files (eg. ES6 to ES5, Stylus to CSS or pug to HTML).

## Usage

*donot* is created like this.

    var donot = require('donot');

    donot(root, options)

Returns a route to be used with Express, Connect or `http`.

## Example

Consider the following example.

    var http = require('http');

    var donot = require('donot');

    var PugTransform = require('donot-transform-pug');
    var StylusTransform = require('donor-transform-stylus');

	var server = http.createServer(donot(__dirname + '/public', {
		transform: [
		    new PugTransform(),
		    new StylusTransform()
		]
	}));

	server.listen(8000);

Now an http server is listening on port 8000 with the content of local directory `/public` being served at `http://localhost:8000/`.

But beyond serving static files it will automatically render templates when requested, so the above example will map the local file structure like below.

    /public/index.html      as     http://localhost:8000/index.html
    /public/images/my.png   as     http://localhost:8000/images/my.png
    ----
    /public/about.pug       as     http://localhost:8000/about.html
    /public/style/my.styl   as     http://localhost:8000/style/my.css

`index.html` and `images/my.png` are served as-is, but `about.pug` and `style/my.styl` are served as their rendered content - all automatically because of the transforms added above.

# Transforms

Currently [pug](https://github.com/donotjs/donot-transform-pug) and [Stylus](https://github.com/donotjs/donot-transform-stylus) transforms are available. Also a [minifier](https://github.com/donotjs/donot-transform-minify) and an [ES2015](https://github.com/donotjs/donot-transform-es5) transform is available.

> See section "Customizing" below on how to implement your own transforms.

# Caching

The build-in default of *donot* is to just re-transform files whenever they are requested. This might work with small websites with relative small amounts of users, but transforming can be an expensive task - so caching them is a good idea.

As with transforms - *donot* also supports cache plug-ins.

## Example

Below we have extended the above example with caching.

    var http = require('http');

    var donot = require('donot');

    var PugTransform = require('donot-transform-pug');
    var StylusTransform = require('donot-transform-stylus');

    var MemoryCache = require('donot-cache-memory');

	var server = http.createServer(donot(__dirname + '/public', {
		transforms: [ new PugTransform(), new StylusTransform() ],
		cache: new MemoryCache()
	}));

	server.listen(8000);

Now all transformed files will be cached in memory and served from there - if the source files has not been modified.

Currently a [memory](https://github.com/donotjs/donot-cache-memory), [file system](https://github.com/donotjs/donot-cache-filesystem) and [redis](https://github.com/donotjs/donot-cache-redis) cache plug-in are available.

> See the "Customizing" section below on how to implement your own cache plug-ins.

# Options

*donot* supports some options - some of them you've already seen practiced above - more specifically the `transforms` and `cache` option.

Currently these options are available.

| Option             | Type      | Dafault          | Description |
|:-------------------|:----------|:-----------------|:------------|
| **transforms**     | Array   | None             | An array of transforms. |
| **cache**          | Object  | None             | A cache plug-in to provide caching |
| **etag**           | Boolean | `true`           | Use Etag for HTTP cache control |
| **lastModified**   | Boolean | `true`           | Send Last-Modified header. Uses source file or transformed files modification date. |
| **index**          | Array   | `['index.html']` | An array of file names to be tested for and used - in prefered order - when directories are requested. |
| **serveDir**       | String  | '/'              | Serve files from a subdirectory. |
| **allowDotFiles**  | Boolean | `false`          | Allow access to hidden (dot) files. |
| **allowTemplates** | Boolean | `false`          | Allow access to template files. |
| **accessControl**  | Object  | None             | Specify access (*see section Access Control*) |

# Access Control

Besides the `allowHidden` and `allowTemplates` options, *donot* also supports more fine-grained control through the `accessControl` option.

An example below.

    {
        accessControl: {
            deny: [
            	'.ext',
            	/^.*?\.ext2$/
            ],
        }
    }

The above example denies access to files with the `.ext` extension or with filenames that match the regular expression `^.?\.ext2$` - all other files are allowed. If you replace `deny` with `allow` it turns around - allowing only the files specified and denying all others.

The array can contain strings which match file extensions, or regular expressions which are matched against the entire filename.

# Customizing

See [Transform](https://github.com/donotjs/donot-transform) or [Cache](https://github.com/donotjs/donot-cache).

# License

MIT

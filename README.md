donot
=====

[![Build Status](https://travis-ci.org/trenskow/donot.svg?branch=master)](https://travis-ci.org/trenskow/donot)

A middleware inspired by [static-serve](https://github.com/expressjs/serve-static), but with support for JIT compilation.

*Can be used as Express or Connect middleware - or with just plain `http`*.

# How it Works

*donot* is an engine. Build-in is the ability to serve static files, just like static files - being able to serve a local directory as a directory of an http server.

But being smart, it also support plug-ins for rendering templates - which means it automatically compiles and renders local templates - and/or transforms files from eg. ES6 to ES5.

## Usage

*donot* is created like this.

    var donot = require('donot');
    
    donot(root, options)

Returns a route to be used with Express, Connect or `http`.

## Example

Consider the following example.

    var http = require('http');
    
    var donot = require('donot');
    
	var server = http.createServer(donot(__dirname + '/public', {
		engines: [
		    require('donot-jade'), // Jade rendering engine.
		    require('donot-stylus') // Stylus rendering engine.
		]
	}));
	
	server.listen(8000);

Now an http server is listening on port 8000 with the content of local directory `/public` being served at `http://localhost:8000/`.

But beyond serving static files it will automatically render templates when requested, so the above example will map the local file structure like below.

    /public/index.html      as     http://localhost:8000/index.html
    /public/images/my.png   as     http://localhost:8000/images/my.png
    ----
    /public/about.jade      as     http://localhost:8000/about.html
    /public/style/my.styl   as     http://localhost:8000/style/my.css

`index.html` and `images/my.png` are served as-is, but `about.jade` and `style/my.styl` are served as their rendered content - all automatically because of the engines added above.

# Rendering engines

Currently [Jade](https://github.com/trenskow/donot-jade) and [Stylus](https://github.com/trenskow/donot-stylus) rendering engines are available. Also a [minifier](https://github.com/trenskow/donot-minify) engine is available.

> See section "Customizing" below on how to implement your own engines.

# Caching

The build-in default of *donot* is to just re-render the templates whenever they are requested. This might work with small websites with relative small amounts of users, but rendering can be a cumbersome task - so caching them is a good idea.

As with engines - *donot* also supports cache plug-ins.

## Example

Below we have extended the above example with caching.

    var http = require('http');
    
    var donot = require('donot');
    
    var jade = require('donot-jade'); // Jade rendering engine.
    var stylus = require('donot-stylus'); // Stylus rendering engine.
    
    var memCache = require('donot-mem-cache'); // Memory cache
	
	var server = http.createServer(donot(__dirname + '/public', {
		engines: [ jade(), stylus() ],
		cache: memCache()
	}));
	
	server.listen(8000);

Now all template renderings will be cached in memory and served from there - if the originating templates has not been modified.

Currently a [memory](https://github.com/trenskow/donot-cache-memory), [file system](https://github.com/trenskow/donot-cache-filesystem) and [redis](https://github.com/trenskow/donot-cache-redis) cache plug-in are available.

> See the "Customizing" section below on how to implement your own cache plug-ins.

# Options

*donot* supports some options when creating - some of them you've already seen practiced above - more specifically the `engines` and `cache` option.

Currently these options are available.

| Option             | Type      | Dafault          | Description |
|:-------------------|:----------|:-----------------|:------------|
| **engine**         | Array   | None             | An array of template engines. |
| **cache**          | Object  | None             | A cache plug-in to provide caching |
| **etag**           | Boolean | `true`           | Use Etag for HTTP cache control |
| **lastModified**   | Boolean | `true`           | Send Last-Modified header. Uses file or template modification date. |
| **index**          | Array   | `['index.html']` | An array of file names to be tested for and used - in prefered order - when directories are requested. |
| **serveDir**       | String  | '/'              | Serve files from a subdirectory. |
| **allowHidden**    | Boolean | `false`          | Allow acces to hidden (dot) files |
| **allowTemplates** | Boolean | `false`          | Allow access to template files |
| **accessControl**  | Object  | None             | Specify access (*see section Access Control*) |

# Access Control

Besides the `allowHidden` and `allowTemplates` options, *donot* also supports more fine-grained control through the `accessControl` option.

An example below.

    {
        accessControl: {
            deny: [
            	'.ext',
            	/^.*?\.ext2$/
            ]
        }
    }

The above example denies access to files with the `.ext` extension or with filenames that match the regular expression `^.?\.ext2$` - all other files are allowed. If you replace `deny` with `allow` it turns around - allowing only the files specified and denying all others.

The array can contain strings which match file extensions, or regular expressions which are matched against the entire filename.

# Customizing

TODO

In the meanwhile check how the [Jade](https://github.com/trenskow/donot-engine-jade), [Stylus](https://github.com/trenskow/donot-engine-stylus), [memory cache](https://github.com/trenskow/donot-cache-memory), [file system cache](https://github.com/trenskow/donot-cache-filesystem) and [Redis cache](https://github.com/trenskow/donot-cache-redis) plug-ins are implemented.

# License

MIT

'use strict';

var
	parse = require('path').parse,
	each = require('lodash.forEach'),
	extname = require('path').extname,
	wikify = require('./wikify'),
	plugin;


plugin = function(opts){
	opts = opts || {};
	opts.savePath = opts.savePath || 'path';
	opts.removeExtension = opts.removeExtension || false;

	return function(files, metalsmith, done) {
		setImmediate(done);

		var metadata = metalsmith.metadata();
		opts.metadata = metadata;
		var wikifyNav = wikify.initWikiNav(opts);
		metadata.wikifyNav = wikifyNav; // used in sidebar template
		wikify.loadShortcodes();

		metadata.wikifyFiles = files;

		each(files, (function(file, path) {
			if (!html(path)) { return; }

			if (opts.savePath) {
				file[ opts.savePath ]=path;
			}

			delete files[path];

			// get path components
			var pobj = parse( path );
			var parts = [];
			if (pobj.dir.length>0) {
				parts = pobj.dir.split('/');
			}

			// if name is 'index' and have a dir path
			// then rewrite to last path element
			// will not process top-level 'index.md'
			var name = pobj.base
			if (pobj.name=='index' && parts.length>0) {
				name = parts.pop()+pobj.ext;
			}

			if (parts.length==0 && name==wikifyNav.file) {
				// process top-level 'index.html'
				wikifyNav.me = file;
				wikifyNav.title = file.title;
				file._wikiNode = wikifyNav;
			} else {
				var wikiNode = wikify.createWikiNodeFromPath( wikifyNav.children, parts, name );
				wikiNode.me = file;
				wikiNode.title = file.title;
				file._wikiNode = wikiNode;
			}

			// save new name, check for conflicts
			if (hasOwnProperty.call(files, name)) {
				done( new Error( "Existing page name ''"+name ) );
			}
			files[name]=file;

		})); // each

		// tidy up linking between parent/children
		wikify.linkWikiNodes( wikifyNav );

		// printChildren( wikifyNav, '' ); // testing

		each(files, (function(file, path) {
			if (!html(path)) { return; }
			wikify.processShortcodes( file, path );
		})); // each

	};
}

module.exports = plugin;


/*
// debugging
function printChildren( p_node, indent ) {
	console.log(indent+p_node.file ); // << keep this
	each(p_node.children, (function(c_node, name) {
		printChildren( c_node, indent+'----' );
	}));
}
*/


/**
 * Check whether a file/path is HTML.
 *
 * @param {String} path
 * @return {Boolean}
 */
function html( path ) {
	return /.html/.test(extname(path));
}

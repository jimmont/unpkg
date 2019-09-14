/*
 *

TODO
setup to alias bare-import to version @ redirect
symlink dirs,
report out the module for the importable path './thing/there/name.js' and './thing@version/there/name.js'
build queue of imports to complete, process them to the local path (stat and if missing get save to target file stream)
when find a bare-import go get it;
collect errors and report them out at the end;



hit https://unpkg.com/module
=> 301/302
=> 200 https://..../module@version/file.extension
import from "lit-html" => "./lit-html@version/file.extension"
import from "lit-html/anything" => "./lit-html@version/anything"
also import("lit-html")
all other imports untouched, just retrieve
always quoted 'module' or "module"

module
module@version
htt..../module
htt..../module@version

handle any redirect
save the response to a file with appropriate name

TODO
for each import

	* first interpolate/translate a bare import, in such a way it can be resolved by all that follow
	* build an index of the bare version with a reference to the resolved fs-dest for that translated bare import (file when alone or dir when that)
	* go get that file content and write it to the fs-dest
	=> TODO rewrite the RESOLVED bare import!

	module@version => full path... && mdule is SAME
	module => module@version => full path to dir AND file
	full path ... => module AND module@version all resolve to SAME UNLESS OTHERWISE DEFINED (allow multiple versions)

TODO add ?module flag

Promise.all(fs-prepare-dest, http/fs-read)
	write result to dest

analyze content
	=> find import
	=> pass found for translation

 *
 * */
const https = require('https');
const fs = require('fs');
const pafs = require('path');
const {URL} = require('url');

const options = {
	url: ''
	, origin: 'https://unpkg.com'
	, requests: {}
	, dest: './unpkg-src'
	, default: 'unpkg-import.js'
	, alias: {
		'/bare-module': './bare-module/path/to/file.js'
	}
	, max: 5
	, importPattern: /(\bimport\b[^;]*?[\'\"])([^\'\"]+)/g
	// http:// or ./path
	, importPatternStart: /^(?:[a-z]{2,10}:\/\/|\.+\/)/i
	// anything/file.extension
	, importPatternEnd: /\/[^\/]+\.[a-z]+$/i
	, importPatternUrl: /^[a-z]{2,}:\/\/[^\/]{3,}/i
	// import "bare-module" => import "./bare-module/unpkg-import.js"
	// symlink (later) ./bare-module/unpkg-import.js => ./bare-module@version/real-file.js
	// import "bare-module/path/to/any" => import "./bare-module/path/to/any"
	// symlink (later) ./bare-module/ => ./bare-module@version/
	//
	// TODO static aliases before running
};

process.argv.reduce(function configure(options, arg, i){
	// allow name=value or name:value
	var parts = arg.match(/^-*([a-z][a-z0-9]+)(?:[=:]?(.+))?/i);
	if(parts){
		let name = parts[1];
		let value = (parts[2] || '').trim();
		options[ name ] = value;
	}
	return options;
}, options);
console.log(options);

function exiting(type){
	// this === process
	console.log('TODO cleanup work', type, this===process);
	this.exit(0);
}

const registry = {};
/* SIGINT Control+C (not-windows only); SIGHUP terminal closed (all); 
https://nodejs.org/api/process.html#process_process_exit_code
 * */
'beforeExit SIGHUP SIGINT SIGUSR1 SIGUSR2 uncaughtException SIGTERM'.trim().split(/[,\s]+/).forEach((event)=>process.on(event, exiting));

process.on('beforeExit',function beforeExit(...args){
	console.warn('TODO cleanup work, save session, etc');
	console.log('exiting with',args);
});

const requests = Object.defineProperties({}, {
	pending: {value:new Set()}
	, active: {value:new Set()}
	, all: {value: {}}
	, imports: {value: {}}
});

class BareImport{
	constructor(url, conf=options){
		this.url = new URL(url, conf.origin);
		// http://domain/bare-import/any /bare-import/any bare-import
		this.name = url.replace(/^(?:[a-z]+:\/\/[^\/]+)?\/?([^\/]+)(?:\/[^\/]*)?$/i,'$1');
		if(requests.imports[ this.name ]) return requests.imports[ this.name ];
		requests.imports[ this.name ] = this;
		this.alias = [];
		this.importable = this.importable.bind(this);
		this.config = conf;
	}
	fs(path){
		// translate url patterns to file-system
		// ./the/dir/file => ./the/dir
		return new Promise((resolve, reject)=>{
			var file = pafs.resolve(path);
			var dir = pafs.resolve( path.replace(/\/[^\/]*$/, '') );
			fs.mkdir(dir, {recursive: true}, (err)=>{
				if(err) return reject(err);
				resolve( fs.createWriteStream( file ) );//, {emitClose: true} ) );
			});
		});
	}
	path(base, path){
		return `${ base }/${ path }`.replace(/\/{2,}/g, '/');
	}
	/*
	 * setup for figuring out the import
	 * hand-off to being getting files
	 * when done alias bare import
		alias './bare-module' to './bare-module@version'
		alias './bare-module/alias.js' to './bare-module@version/real-file.js'

		allowing these transformations and resolution of them:
		import 'bare-module' => import './bare-module/alias.js'
		import 'bare-module@version' => import './bare-module@version/alias.js'
		all this will be imported relative to the target destination, so all paths relative to ./
		then imported separately from external scripts, all resolving to 'real-file.js'
	 */
	resolve(){
		// setup Promise.all and start the process...
debugger;
		return this.next(this.url)
			.then((res)=>{
console.log(this.name, 'finish with symlinks');
				var dest = this.config.dest;
				var target = this.path(dest, this.url.pathname);
				var dir = target.replace(/\/[^\/]+$/,'');
console.log(target, requests);
debugger;
	//			fs.symlink(pafs.resolve( dir ), pafs.resolve(  ), this.error);
	//			fs.symlink('TODO', this.url.pathname, this.error);
			});
	}
	// for each url setup a req until the max
	// for the remaining queue for later
	// when those resolve, do the next set, pass the urls in
	next(...urls){
		var url, req;
		while(url = urls.shift()){
			requests.pending.add(url);
		};
		var list = Array.from(requests.active), next = (res)=>{
			console.log('next(?)', res.req.path, requests);
debugger;

		};
		while(req = list.shift()){
			if(req.status) requests.active.delete(req);
		};
		while(requests.pending.size && requests.active.size < options.max){
			url = requests.pending.values().next().value;
			requests.pending.delete(url);
			requests.active.add(url);
			req = this.request(url).then(next);
			list.push(req);
		};
debugger;
		return Promise.all(list).then((all)=>{
			console.warn('FINISHED',list.length, urls, all);
			console.warn('pending>',requests.pending.size, 'active>',requests.active.size);

			var res;
			while(res = all.shift()){
				requests.active.delete( requests.all[ res.req.path ] );
			}
debugger;
			return requests.pending.size ? this.next() : '~done~';
		});
	}
	/* responsibility: setup a request, response handling, return promise that resolves correctly */
	request(url){
		var req = requests.all[ url.pathname ];
		if(!req){
//			url.searchParams.set('module','');
			req = requests.all[ url.pathname ] = new Promise((resolve, reject)=>{
				var req;
				req = https.get(url, (res)=>{
				// res.req.path === this.url.pathname
				// req.path returned here from https.get()
					requests.all[ url.pathname ].status = 1;
					requests.all[ url.pathname ].req = req;
					resolve( this.response(res) );
				})
				.on('error', (err)=>{
					requests.all[ url.pathname ].status = -1;
					requests.all[ url.pathname ].req = req;
					reject( this.error(err) );
				})
				;
			});
		};
		req.status = 0;
		return req;
	}
	error(err, ...args){
		console.warn(err, args);
		console.error(err);
		return err;
	}
	response(res){
		const statusCode = res.statusCode;
		if(statusCode > 300 && statusCode <= 302){
		// assuming these redirects only happen with top-level bare imports
		// so we modify this.url based on this assumption
			this.config.alias[ this.url.pathname ] = res.headers.location;
			this.alias.push( this.url.pathname );
			this.url.pathname = res.headers.location;
			// continue this active request, only in this case, into the next because we change its url directly
			return this.request(this.url);
		}
		if(statusCode !== 200){
			throw `${statusCode} for ${ this.url.href }`;
		}
		// ?NO TODO REMOVE? this.config.alias[ this.name ] = this.config.alias[ this.alias[ 0 ] ];
		// res.req.path === this.url.pathname
		// TODO REMOVE res.bareImport = this;
		res.pending = [];
		res.on('data', this.write);
		return Promise.all([
			this.fs( this.path( this.config.dest, res.req.path ), res )
			,new Promise(function(resolve, reject){
				res.on('end', resolve);
				res.on('error', reject);
			})
		]).then((all)=>{
			return new Promise((resolve, reject)=>{
				const stream = all[0];
				stream.on('error', (err)=>{
					reject( this.error(err) );
				});
				stream.write( this.rewriteImports( res.pending.join('') ) || '' );
				resolve( res );
			});
		})
		;
	}
	// import "bare-module" => import "./bare-module/unpkg-import.js"
	// symlink (later) ./bare-module/unpkg-import.js => ./bare-module@version/real-file.js
	// import "bare-module/path/to/any" => import "./bare-module/path/to/any"
	// symlink (later) ./bare-module/ => ./bare-module@version/
	//
	// rewrite anything that isn't protocol://... or ./path
	importable(all, importing, path){
		var config = this.config;
		if(!config.importPatternStart.test(path)){
			if(!config.importPatternEnd.test(path)){
				console.log(`~import bare "${path}"`);
				new BareImport(this.config.origin + '/' + path).resolve();
				path = path + (path.endsWith('/') ? '':'/') + config.default;

			}else{
				// ignore, resolve by symlink later
				console.log(`~import rewrote "${path}"`);
			};
			// fix prefix
			path = './'+path;
		}else if(!config.importPatternUrl.test(path)){
			var url = new URL(this.url.href.replace(/^(.*\/)[^\/]*$/, '$1') + path, this.url.origin);
			console.log(`~import "${path}" from "${url.href}"`);
			this.next(url);
		}
		return importing + path;
	}
	rewriteImports(str){
		return str.replace(this.config.importPattern, this.importable);
	}
	write(d){
		// this === res; this.req === original request
		// this.req.path === url.pathname can retrieve from config.requests[ url.pathname ]
		this.pending.push( d.toString() );
	}
}

/**
TODO AFTER finishes
AND after directories created
THEN write contents info destination
....
when there is a target file, ensure the destination path exits (at some point, when though?)
then write to that path in the local destination
			const fromImport = importPaths(str);
			if(fromImport){
debugger;
				console.log('imports:',fromImport.join(', '));
			}
		});
	})
*/

new BareImport(options.url).resolve();

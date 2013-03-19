var ternServer = null;
var ternDocs = [];

function startServer(env) {
	env = _.map(env, function(v, k) {
		return _.isString(v) ? JSON.parse(v) : v;
	});

	ternServer = new tern.Server({
		getFile: getFile, 
		environment: env, 
		debug: true
	});

	log('TernJS server started');
}

function getFile(file) {
	var text = sublimeReadFile(file), env = [];
	var envSpec = /\/\/ environment=(\w+)\n/g, m;
	while (m = envSpec.exec(text)) 
		env.push(envData[m[1]]);

	return {
		text: text, 
		name: file, 
		env: env, 
		ast: acorn.parse(text)
	};
}

function registerDoc(name) {
	if (!_.isString(name)) {
		name = sublimeGetFileNameFromView(name);
	}

	// check if current document already exists
	var hasDoc = !!_.find(ternDocs, function(d) {
		return d.name == name;
	});

	if (hasDoc) {
		log('Document ' + name + ' is already registered');
		return;
	}

	var data = {
		name: name, 
		changed: null
	};

	ternDocs.push(data);
	ternServer.addFile(name);
}

function unregisterDoc(name) {
	if (!_.isString(name)) {
		name = sublimeGetFileNameFromView(name);
	}

	ternServer.delFile(name);

	for (var i = 0; i < ternDocs.length && name != ternDocs[i].name; ++i) {}
	ternDocs.splice(i, 1);

	if (ternServer) {
		ternServer.reset();
	}
}

/**
 * Returns reference to registered document from given
 * view object
 * @param  {sublime.View} view 
 * @return {Objec}
 */
function docFromView(view) {
	var fileName = sublimeGetFileNameFromView(view);
	return _.find(ternDocs, function(d) {
		return d.name == fileName;
	});
}

function buildRequest(view, query, allowFragments) {
	var files = [], offset = 0, startPos, endPos;
	var sel = view.sel()[0];

	if (typeof query == "string") {
		query = {type: query};
	}

	if (query.end == null && query.start == null) {
		query.end = endPos = sel.end();
		if (!sel.empty()) {
			query.start = startPos = sel.begin();
		}
	} else {
		endPos = query.end;
		// query.end = cm.indexFromPos(endPos = query.end);
		if (query.start != null) {
			startPos = query.start;
		}
	}

	if (!startPos) startPos = endPos;

	
	var curDoc = docFromView(view);
	if (!curDoc) {
		throw 'Unable to locate document for given view';
	}

	// TODO handle incremental doc change
	query.file = curDoc.name;
	// if (curDoc.changed) {
	// 	if (cm.lineCount() > 100 && allowFragments !== false &&
	// 			curDoc.changed.to - curDoc.changed.from < 100 &&
	// 			curDoc.changed.from <= startPos.line && curDoc.changed.to > endPos.line) {
	// 		files.push(getFragmentAround(cm, startPos, endPos));
	// 		query.file = "#0";
	// 		offset = files[0].offset;
	// 		if (query.start != null) query.start -= offset;
	// 		query.end -= offset;
	// 	} else {
	// 		files.push({type: "full",
	// 								name: curDoc.name,
	// 								text: cm.getValue()});
	// 		query.file = curDoc.name;
	// 		curDoc.changed = null;
	// 	}
	// } else {
	// 	query.file = curDoc.name;
	// }


	// for (var i = 0; i < docs.length; ++i) {
	// 	var doc = docs[i];
	// 	if (doc.changed && doc != curDoc) {
	// 		files.push({type: "full", name: doc.name, text: doc.doc.getValue()});
	// 		doc.changed = null;
	// 	}
	// }
	files.push({
		name: curDoc.name,
		type: 'full',
		text: sublimeReadFile(curDoc.name)
	});

	return {
		request: {
			query: query, 
			files: files
		},
		offset: offset
	};
}

function ternHints(view, callback) {
	var req = buildRequest(view, "completions");
	var res = null;

	ternServer.request(req.request, function(error, data) {
		if (error) {
			throw error;
		}

		var completions = _.map(data.completions, function(completion) {
			return {
				text: completion.name,
				type: completion.type,
				guess: !!data.guess
			};
		});

		res = {
			from: data.from + req.offset,
			to: data.to + req.offset,
			list: completions
		};

		if (callback) {
			callback(res);
		}
	});

	return res;
}
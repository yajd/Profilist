const {interfaces: Ci, utils: Cu, classes: Cc} = Components;
const self = {
	name: 'Profilist',
	chrome_path: 'chrome://profilist/content/',
	aData: 0,
};

const myServices = {};
var cssUri;
var collapsedheight = 0; //holds height stack should be when collapsed
var expandedheight = 0; //holds height stack should be when expanded
var stackDOMJson = []; //array holding menu structure in stack
var exeInited = false;
var unloaders = {};

Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/devtools/Console.jsm');
Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import('resource://gre/modules/osfile.jsm');
Cu.import('resource://gre/modules/FileUtils.jsm');
XPCOMUtils.defineLazyGetter(myServices, 'sss', function(){ return Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService) });
XPCOMUtils.defineLazyGetter(myServices, 'proc', function(){ return Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess) });

var cProfDirPath = OS.Constants.Path.profileDir;
var cProfDirName = OS.Path.basename(cProfDirPath);
var cProfId = cProfDirName.substr(0, cProfDirName.indexOf('.')); //used to create initial menu if promise does not complete before PanelUI is shown
var cProfName = cProfDirName.substr(cProfId.length + 1); //used to create initial menu if promise does not complete before PanelUI is shown

var profDirPath = cProfDirPath.replace(cProfDirName, ''); //contains ending slash
var profToolkit = {
	dirPath: profDirPath, //path to default profile folder that holds all the profiles
	profileDirs: [], //file entries
	profileCount: 0,
	profileNames: [], //array of all profile names
	profileIds: [], //array holding all profileIds
	profileNameKey_IdVal: {}, //object with keys being the profile name, and its value being the profile id, a quick way to get the id of a profile name
	profiles: {},
	selectedProfile: 0, //reference to the profiles object but to the current profile in the profiles object
};

function refreshProfToolkit() {
	//goes through default profile dir and updates toolkit with all profiles that are not found already in it
	
	let iterator = new OS.File.DirectoryIterator(profToolkit.dirPath);
	let promise = iterator.forEach(
		function onEntry(entry) {
			/*entry structure
			Object
			isDir: true
			isSymLink: false
			name: "ncc90nnv.default"
			path: "C:\Users\ali57233\AppData\Roaming\Mozilla\Firefox\Profiles\ncc90nnv.default"
			winCreationDate:Date 2012-11-05T21:42:51.447Z
			winLastAccessDate:Date 2014-03-19T01:59:46.290Z
			winLastWriteDate:Date 2014-03-19T01:59:46.290Z
			*/
			if (entry.isDir) {
				var entryId = entry.name.substr(0, entry.name.indexOf('.'));
				var entryName = entry.name.substr(entry.name.indexOf('.') + 1);
				
				if (profToolkit.profileNames.indexOf(entryName) == -1) {
					if (profToolkit.profileIds.indexOf(entryId) > -1) {
						//so since last refresh, it's been renamed. as id is already in toolkit but name is not.
						var oldName = profToolkit.profiles[entryId].name;
						profToolkit.profileNames.splice(profToolkit.profileNames.indexOf(oldName),1,entryName);
						delete profToolkit.profiles[entryId];
						delete profToolkit.profileNameKey_IdVal[oldName];
					} else {
						profToolkit.profileIds.push(entryId);
					}
					profToolkit.profileNames.push(entryName);
					profToolkit.profileCount = profToolkit.profileNames.length;
					
					profToolkit.profileNameKey_IdVal[entryName] = entryId;
					
					profToolkit.profiles[entryId] = {
						dirFileEntry: entry,
						dirName: entry.name,
						id: entryId,
						name: entryName
					}
				}
			}
		}
	);
	promise.then(
		function onSuccess() {
			//set selectedProfile to reference of current profile object
			profToolkit.selectedProfile = profToolkit.profiles[cProfId];
			
			return updateStackDOMJson_basedOnToolkit();
			
			iterator.close();
		},
		function onFailure(reason) {
			// Close the iterator, propagate any error
			iterator.close();
			Services.prompt.alert(null, self.name + ' - ' + 'ERROR', 'An error occured while reading contenst of Default Profile folder. See Browser Console for details.');
			console.warn('An error occured while reading contenst of Default Profile folder. Reason = ', reason)
			throw reason;
		}
	);
	
	return promise;
}

refreshProfToolkit();

function updateStackDOMJson_basedOnToolkit() {
			//update stackDOMJson based on profToolkit
			var stackUpdated = false; //if splice in anything new in or anything old out then set this to true, if true then run dom update
			if (stackDOMJson.length == 0) {
				stackDOMJson = [
					{nodeToClone:'PUIsync', identifier:'.create', label:'Create New Profile', class:'PanelUI-profilist create', id:null, oncommand:null, status:null, tooltiptext:null, signedin:null, defaultlabel:null, errorlabel:null,  addEventListener:['command',createProfile,false], style:'-moz-appearance:none; padding:10px 0 10px 15px; margin-bottom:-1px; border-top:1px solid rgba(24,25,26,0.14); border-bottom:1px solid transparent; border-right:0 none rgb(0,0,0); border-left:0 none rgb(0,0,0);'},
					{nodeToClone:'PUIsync', identifier:'[label="' + profToolkit.selectedProfile.name + '"]', label:profToolkit.selectedProfile.name, class:'PanelUI-profilist', id:null, oncommand:null, tooltiptext:null, signedin:null, defaultlabel:null, errorlabel:null,   status:'active', addEventListener:['mousedown', makeRename, false], style:'-moz-appearance:none; padding:10px 0 10px 15px; margin-bottom:-1px; border-top:1px solid rgba(24,25,26,0.14); border-bottom:1px solid transparent; border-right:0 none rgb(0,0,0); border-left:0 none rgb(0,0,0);', props:{profid:profToolkit.selectedProfile.id, profname:profToolkit.selectedProfile.name}}
				];
				var profNamesCurrentlyInMenu = [profToolkit.selectedProfile.name];
				var profIdsCurrentlyInMenu = [profToolkit.selectedProfile.id];
				stackUpdated = true;
			} else {
				var profNamesCurrentlyInMenu = [];
				var profIdsCurrentlyInMenu = [];
				for (var i=0; i<stackDOMJson.length; i++) {
					var m = stackDOMJson[i];
					if ('props' in m && 'profid' in m.props) {
						if (profToolkit.profileNames.indexOf(m.props.profname) == -1) {
							//this is in the stack/menu but no longer exists so need to remove
							stackUpdated = true;
							stackDOMJson.splice(i, 1);
							i--;
						} else {
							profNamesCurrentlyInMenu.push(m.props.profname);
							profNamesCurrentlyInMenu.push(m.props.profid);
						}
					}
				}
			}			
			
			for (var p in profToolkit.profiles) {
				if (profNamesCurrentlyInMenu.indexOf(profToolkit.profiles[p].name) > -1) { continue }
				

					console.log('splicing p = ', profToolkit.profiles[p]);
					stackUpdated = true;
					(function(pClosure) {
						//stackDOMJson.splice(0, 0, {nodeToClone:'PUIsync', identifier:'[label="' + profToolkit.profiles[p].name + '"]', label:profToolkit.profiles[p].name, class:'PanelUI-profilist', id:null, oncommand:null, status:'inactive', addEventListener:['command', function(){ launchProfile(profToolkit.profiles[p].name) }, false], style:'-moz-appearance:none; padding:10px 0 10px 15px; margin-bottom:-1px; border-top:1px solid rgba(24,25,26,0.14); border-bottom:1px solid transparent; border-right:0 none rgb(0,0,0); border-left:0 none rgb(0,0,0);', props:{profid:profToolkit.profiles[p].id, profname:profToolkit.profiles[p].name}});
						var objToSplice = {nodeToClone:'PUIsync', identifier:'[label="' + profToolkit.profiles[pClosure].name + '"]', label:profToolkit.profiles[pClosure].name, class:'PanelUI-profilist', id:null, oncommand:null, tooltiptext:null, signedin:null, defaultlabel:null, errorlabel:null,  status:'inactive', addEventListener:['command', function(){ launchProfile(profToolkit.profiles[pClosure].name) }, false], addEventListener2:['mousedown', makeRename, false], style:'-moz-appearance:none; padding:10px 0 10px 15px; margin-bottom:-1px; border-top:1px solid rgba(24,25,26,0.14); border-bottom:1px solid transparent; border-right:0 none rgb(0,0,0); border-left:0 none rgb(0,0,0);', props:{profid:profToolkit.profiles[pClosure].id, profname:profToolkit.profiles[pClosure].name}};
						
						
						if (profToolkit.profiles[pClosure].name == profToolkit.selectedProfile.name) {
							//should never happend because stackDOMJson length was not 0 if in this else of the parent if IT WIL CONTNIUE on this: if (profIdsCurrentlyInMenu.indexOf(p.id) > -1) { continue }
							//actually this CAN happen because i will now be running refresh from time to time and user may rename current profile
							//stackDOMJson.push({nodeToClone:'PUIsync', identifier:'[label="' + p.name + '"]', label:p.name, class:'PanelUI-profilist', id:null, status:'active', style:'-moz-appearance:none; padding:10px 0 10px 15px; margin-bottom:-1px; border-top:1px solid rgba(24,25,26,0.14); border-bottom:1px solid transparent; border-right:0 none rgb(0,0,0); border-left:0 none rgb(0,0,0);', props:{profid:p.id, profname:p.name}});
							objToSplice.status = 'active';
							delete objToSplice.addEventListener;
						}
						
						stackDOMJson.splice(0, 0, objToSplice);
					})(p);
			}
			console.info('stackDOMJson after promise fin = ', stackDOMJson);
			if (stackUpdated) {
				console.info('something was changed in stack so will update all menus now');
				let DOMWindows = Services.wm.getEnumerator(null);
				while (DOMWindows.hasMoreElements()) {
					let aDOMWindow = DOMWindows.getNext();
					if (aDOMWindow.document.querySelector('#profilist_box')) { //if this is true then the menu was already crated so lets update it, otherwise no need to update as we updated the stackDOMJson and the onPopupShowing will handle menu create
						updateMenuDOM(aDOMWindow, stackDOMJson);
					}
				}
			}
}

var observers = {
    /*
    inlineOptsHid: {
        observe:    function(aSubject, aTopic, aData) {
                        //##Cu.reportError('incoming inlineOptsHid: aSubject = ' + aSubject + ' | aTopic = ' + aTopic + ' | aData = ' + aData);
                        if (aTopic == 'addon-options-hidden' && aData == selfId + '@jetpack') {
                            addonMgrXulWin = null; //trial as of 112713
                        }
                    },
        reg:    function() {
                obs.addObserver(observers.inlineOptsHid, 'addon-options-hidden', false);
            },
        unreg:    function() {
                obs.removeObserver(observers.inlineOptsHid, 'addon-options-hidden');
            }
    }
    */
    'profile-do-change': {
        observe: function(aSubject, aTopic, aData) {
			console.info('incoming profile-do-change: aSubject = ' + aSubject + ' | aTopic = ' + aTopic + ' | aData = ' + aData);
        },
        reg: function() {
			Services.obs.addObserver(observers['profile-do-change'], 'profile-do-change', false);
        },
        unreg: function() {
			Services.obs.removeObserver(observers['profile-do-change'], 'profile-do-change');
        }
    },
    'profile-before-change': {
        observe: function(aSubject, aTopic, aData) {
			console.info('incoming profile-before-change: aSubject = ' + aSubject + ' | aTopic = ' + aTopic + ' | aData = ' + aData);
        },
        reg: function() {
			Services.obs.addObserver(observers['profile-before-change'], 'profile-before-change', false);
        },
        unreg: function() {
			Services.obs.removeObserver(observers['profile-before-change'], 'profile-before-change');
        }
    }
};

function makeRename() {
	//only allow certain chracters
	//cannot rename profile to a name that already exists
	
	//makes the menu button editable field and keeps popup open till blur from field
	var el = this;
	el.style.fontWeight = 'bold';
	
	var doc = this.ownerDocument;
	//var PanelUI = doc.querySelector('#PanelUI-popup');
	//PanelUI.addEventListener('popuphiding', prevHide, false) // //add on blur it should remove prevHide //actually no need for this because right now on blur it is set up to hide popup
	
	//make the el button an editable field
	//add event listener on blur it should cancel and restore menu look (as in not editable)
	//add event listener on enter submitRename
	
	if (this.getAttribute('status') == 'active') {
		//make editable right away
	} else {
		//make editable in 300ms if user doesnt mouseup
	}
}

function submitRename() {
	//when user presses enter in field
}

function launchProfile(profName) {

	Services.prompt.alert(null, self.name + ' - ' + 'INFO', 'Will attempt to launch profile named "' + profName + '".');

	var found = false;
	for (var p in profToolkit.profiles) {
		if (profName == profToolkit.profiles[p].name) {
			found = true;
		}
	}
			
	if (!found) {
		Services.prompt.alert(null, self.name + ' - ' + 'ERROR', 'An error occured while trying to launch profile named "' + profName + '": Proflie name not found in memory.');
		console.info('dump of profiles = ', profToolkit.profiles);
		return false;
	}

	if (!exeInited) {
		var exe = FileUtils.getFile('XREExeF', []); //this gives path to executable
		try {
			myServices.proc.init(exe);
			exeInited = true;
		} catch (ex) {
			console.warn('exception thrown on nsiProc.init of exe, probably already initalized: ex = ', ex);
		}
	}
	var args = ['-P', profName, '-no-remote'];
	myServices.proc.run(false, args, args.length);
}

function createProfile() {
	//creating profile with name that already exists does nothing
	
	if (!exeInited) {
		var exe = FileUtils.getFile('XREExeF', []); //this gives path to executable
		try {
			myServices.proc.init(exe);
			exeInited = true;
		} catch (ex) {
			console.warn('exception thrown on nsiProc.init of exe, probably already initalized: ex = ', ex);
		}
	}
	
	var profNamesCurrentlyInMenu = [];
	for (var p in profToolkit.profiles) {
		profNamesCurrentlyInMenu.push(profToolkit.profiles[p].name);
	}
	
	var digit = 1;
	var profName = 'Nameless Profile'; //creates with default name
	while (profNamesCurrentlyInMenu.indexOf(profName + ' ' + digit) > -1) {
		digit++;
	}
	profName = profName + ' ' + digit;

		var obsToLaunchProfAfterCreate = {
			observe: function(aSubject, aTopic, aData) {
				//update profToolkit then check if 
				console.info('incoming obsToLaunchProfAfterCreate: aSubject = ' + aSubject + ' | aTopic = ' + aTopic + ' | aData = ' + aData, {aSubject: aSubject, aTopic: aTopic, aData: aData});
				
				let promise = refreshProfToolkit();
				promise.then(
					function onSuccess() {
						//set selectedProfile to reference of current profile object
						console.log('obsToLaunch promise success');
						if (profToolkit.profileNames.indexOf(profName) > -1) {
							console.info('profName was succesfully made named = ' + profName + ' so launch it now');
							var args = ['-P', profName, '-no-remote'];
							myServices.proc.run(false, args, args.length);
						} else {
							console.warn('profName was FAILED to make named = ' + profName + ' so ya');
							Services.prompt.alert(null, self.name + ' - ' + 'EXCEPTION', 'New profile failed to be created due to an unknown excpetion.');
						}
					},
					function onFailure(reason) {
						// Close the iterator, propagate any error
						console.log('obsToLaunch promise fail');
						
					}
				);
				
				//path to self xpi to install to this profile == self.aData.installPath.path
			}
		};

	var args = ['-CreateProfile', profName, '-no-remote'];
	myServices.proc.runAsync(args, args.length, obsToLaunchProfAfterCreate);
}

function prevHide(e) {
	e.preventDefault();
	e.stopPropagation();
}

function updateMenuDOM(aDOMWindow, json) {
	//identifier is the querySelector to run to match the element, if its matched it updates this el, if not matched then creates new el based on nodeToClone
	var profilist_box = aDOMWindow.document.querySelector('#profilist_box');
	if (!profilist_box) {
		console.warn('no profilist_box to add to');
		return;
	}
	var stack = profilist_box.childNodes[0];
	var stackChilds = stack.childNodes;
	[].forEach.call(stackChilds, function(sc) {
		stack.removeChild(sc);
	});
	
	var cumHeight = 0;
	var elRefs = [];
	var setTops = [];
	var PUIsync;
	for (var i=0; i<json.length; i++) {
		console.log('in json arr = ', i);
		var el = null;
		var appendChild = false;
		if (json[i].identifier) {
			el = stack.querySelector(json[i].identifier);
			console.log('identifier  string = "' + json[i].identifier + '"');
			console.log('el = ' + el);
		}
		if (!el) {
			if (json[i].nodeToClone == 'PUIsync') {
				if (!PUIsync) {
					PUIsync = aDOMWindow.document.querySelector('#PanelUI-popup').querySelector('#PanelUI-fxa-status');
				}
				json[i].nodeToClone = PUIsync;
			}
			el = json[i].nodeToClone.cloneNode(true);
			appendChild = true;
			console.log('el created');
		} else {
			console.log('el idented');
		}
		elRefs.push(el);
		
		for (var p in json[i]) {
			if (p == 'nodeToClone' || p == 'identifier' || p == 'props') { continue }
			if (p.indexOf('addEventListener') == 0) {
				(function(elClosure, jsonIClosure, pClosure) {
					console.log('elClosure',elClosure.getAttribute('label'),'jsonIClosure',jsonIClosure);
					elClosure.addEventListener(jsonIClosure[pClosure][0], jsonIClosure[pClosure][1], jsonIClosure[pClosure][2]);
				})(el, json[i], p);
				continue;
			}
			if (json[i][p] === null) {
				el.removeAttribute(p);
			} else {
				el.setAttribute(p, json[i][p]);
			}
		}
		if (appendChild) {
			stack.appendChild(el);
			console.log('appended', el);
		}
		console.log('el.boxObject.height = ', el.boxObject);
		cumHeight += el.boxObject.height;
		console.log('cumHeight after adding = ' + cumHeight);
		if (i < json.length - 1) {
			//el.setAttribute('top', cumHeight); //cant do this here because stack element expands to fit contents so this will mess up the cumHeight and make it think the element is longe that it is 
			setTops.push(cumHeight);
		} else {
			setTops.push(0);
		}
	}
	collapsedheight = el.boxObject.height;
	expandedheight = cumHeight;
	console.log('collapsedheight', collapsedheight);
	console.log('expandedheight', expandedheight);
	
	[].forEach.call(elRefs, function(elRef, i) {
		elRef.setAttribute('top', setTops[i]);
	});
}

/*start - windowlistener*/
var windowListener = {
	//DO NOT EDIT HERE
	onOpenWindow: function (aXULWindow) {
		// Wait for the window to finish loading
		let aDOMWindow = aXULWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
		aDOMWindow.addEventListener("load", function () {
			aDOMWindow.removeEventListener("load", arguments.callee, false);
			windowListener.loadIntoWindow(aDOMWindow);
		}, false);
	},
	onCloseWindow: function (aXULWindow) {},
	onWindowTitleChange: function (aXULWindow, aNewTitle) {},
	register: function () {
		// Load into any existing windows
		let DOMWindows = Services.wm.getEnumerator(null);
		while (DOMWindows.hasMoreElements()) {
			let aDOMWindow = DOMWindows.getNext();
			windowListener.loadIntoWindow(aDOMWindow);
		}
		// Listen to new windows
		Services.wm.addListener(windowListener);
	},
	unregister: function () {
		// Unload from any existing windows
		let DOMWindows = Services.wm.getEnumerator(null);
		while (DOMWindows.hasMoreElements()) {
			let aDOMWindow = DOMWindows.getNext();
			windowListener.unloadFromWindow(aDOMWindow);
		}
		
		for (var u in unloaders) {
			unloaders[u]();
		}
		
		//Stop listening so future added windows dont get this attached
		Services.wm.removeListener(windowListener);
	},
	//END - DO NOT EDIT HERE
	loadIntoWindow: function (aDOMWindow) {
		if (!aDOMWindow) {
			return;
		}
		
		var PanelUI = aDOMWindow.document.querySelector('#PanelUI-popup');
		if (PanelUI) {
			var PUIsync = PanelUI.querySelector('#PanelUI-fxa-status');
			console.info('PUIsync on start up = ', PUIsync);
			var PUIsync_height = PUIsync.boxObject.height; //parseInt(aDOMWindow.getComputedStyle(PUIsync, null).getPropertyValue('height'));
			if (PanelUI.state != 'open' && PanelUI.state != 'showing') { //USED TO BE "if (PUIsync_height == 0)"
				console.warn('PanelUI not open', PanelUI);
				var unloaderId = new Date().getTime();
				var createMenuOnPopup = function() {
					PanelUI.removeEventListener('popupshowing', createMenuOnPopup, false);
					delete unloaders[unloaderId];
					console.warn('running loading into window to create menuuuuuuuuuu....');
					windowListener.loadIntoWindow(aDOMWindow);
				}
				unloaders[unloaderId] = function() {
					console.log('RUNNING UNLOADER');
					PanelUI.removeEventListener('popupshowing', createMenuOnPopup, false);
				}
				PanelUI.addEventListener('popupshowing', createMenuOnPopup, false);
				return;
			}
			var PUIf = PanelUI.querySelector('#PanelUI-footer');
			var PUIcs = PanelUI.querySelector('#PanelUI-contents-scroller');
			
			//console.log('PUIcs.style.width',PUIcs.style.width);
			var profilistHBoxJSON =
			['xul:vbox', {id: 'profilist_box'},
				['xul:stack', {key:'profilist_stack',style:'width:100%'}]
			];
			var referenceNodes = {};
			PUIf.insertBefore(jsonToDOM(profilistHBoxJSON, aDOMWindow.document, referenceNodes), PUIf.firstChild);
			
			/*must insert the "Default: profile" into stack last*/
			
			console.log('CREATING MENU JSON');
			var PUIfi = PanelUI.querySelector('#PanelUI-footer-inner');
			console.log('PUIsync height', PUIsync.boxObject);
			console.log('PUIfi height', PUIfi.boxObject);
			if (stackDOMJson.length == 0) {
				stackDOMJson = [
					//{nodeToClone:PUIsync, identifier:'.create', label:'Create New Profile', class:'PanelUI-profilist create', id:null, status:null, style:'-moz-appearance:none; padding:10px 0 10px 15px; margin-bottom:-1px; border-top:1px solid rgba(24,25,26,0.14); border-bottom:1px solid transparent; border-right:0 none rgb(0,0,0); border-left:0 none rgb(0,0,0);'},
					//{nodeToClone:PUIsync, identifier:'[label="' + cProfName + '"]', label:cProfName, class:'PanelUI-profilist', id:null, status:'active', style:'-moz-appearance:none; padding:10px 0 10px 15px; margin-bottom:-1px; border-top:1px solid rgba(24,25,26,0.14); border-bottom:1px solid transparent; border-right:0 none rgb(0,0,0); border-left:0 none rgb(0,0,0);', props:{profid:cProfId, profname:cProfName}}
					{nodeToClone:PUIsync, identifier:'.create', label:'Create New Profile', class:'PanelUI-profilist create', id:null, oncommand:null, tooltiptext:null, signedin:null, defaultlabel:null, errorlabel:null,  status:null, addEventListener:['command',createProfile,false], style:'-moz-appearance:none; padding:10px 0 10px 15px; margin-bottom:-1px; border-top:1px solid rgba(24,25,26,0.14); border-bottom:1px solid transparent; border-right:0 none rgb(0,0,0); border-left:0 none rgb(0,0,0);'},
					{nodeToClone:PUIsync, identifier:'[label="' + cProfName + '"]', label:cProfName, class:'PanelUI-profilist', id:null, oncommand:null, tooltiptext:null, signedin:null, defaultlabel:null, errorlabel:null,  status:'active', addEventListener:['mousedown', makeRename, false], style:'-moz-appearance:none; padding:10px 0 10px 15px; margin-bottom:-1px; border-top:1px solid rgba(24,25,26,0.14); border-bottom:1px solid transparent; border-right:0 none rgb(0,0,0); border-left:0 none rgb(0,0,0);', props:{profid:cProfId, profname:cProfName}}
				];
			}
			
			updateMenuDOM(aDOMWindow, stackDOMJson);
			
			referenceNodes.profilist_stack.style.height = collapsedheight + 'px';

			//todo: probably should only do this overflow stuff if scrollbar is not vis prior to mouseenter, but i think for usual case scrollbar is not vis.
			referenceNodes.profilist_stack.addEventListener('mouseenter', function() {
				if (referenceNodes.profilist_stack.lastChild.hasAttribute('disabled')) {
					return;
				}
				PUIcs.style.overflow = 'hidden'; //prevents scrollbar from showing
				referenceNodes.profilist_stack.style.height = expandedheight + 'px';
				referenceNodes.profilist_stack.lastChild.classList.add('perm-hover');
			}, false);
			referenceNodes.profilist_stack.addEventListener('mouseleave', function() {
				if (referenceNodes.profilist_stack.lastChild.hasAttribute('disabled')) {
					return;
				}
				referenceNodes.profilist_stack.addEventListener('transitionend', function() {
					referenceNodes.profilist_stack.removeEventListener('transitionend', arguments.callee, false);
					if (referenceNodes.profilist_stack.style.height == collapsedheight + 'px') {
						PUIcs.style.overflow = ''; //remove the hidden style i had forced on it
						console.info('overflow RESET');
					} else {
						console.info('overflow not reset as height is not collapsed height (' + collapsedheight + ') but it is right now = ', referenceNodes.profilist_stack.style.height);
					}
				}, false);
				referenceNodes.profilist_stack.style.height = collapsedheight + 'px';
				referenceNodes.profilist_stack.lastChild.classList.remove('perm-hover');
			}, false);
		}
		
	},
	unloadFromWindow: function (aDOMWindow) {
		if (!aDOMWindow) {
			return;
		}
		
		var PanelUI = aDOMWindow.document.querySelector('#PanelUI-popup');
		if (PanelUI) {
			PanelUI.removeEventListener('popuphiding', prevHide, false)
			var profilistHBox = aDOMWindow.document.querySelector('#profilist_box');
			if (profilistHBox) {
				profilistHBox.parentNode.removeChild(profilistHBox);
			}
		}
	}
};
/*end - windowlistener*/

/*dom insertion library function from MDN - https://developer.mozilla.org/en-US/docs/XUL_School/DOM_Building_and_HTML_Insertion*/
jsonToDOM.namespaces = {
    html: 'http://www.w3.org/1999/xhtml',
    xul: 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul'
};
jsonToDOM.defaultNamespace = jsonToDOM.namespaces.html;
function jsonToDOM(xml, doc, nodes) {
    function namespace(name) {
        var m = /^(?:(.*):)?(.*)$/.exec(name);        
        return [jsonToDOM.namespaces[m[1]], m[2]];
    }

    function tag(name, attr) {
        if (Array.isArray(name)) {
            var frag = doc.createDocumentFragment();
            Array.forEach(arguments, function (arg) {
                if (!Array.isArray(arg[0]))
                    frag.appendChild(tag.apply(null, arg));
                else
                    arg.forEach(function (arg) {
                        frag.appendChild(tag.apply(null, arg));
                    });
            });
            return frag;
        }

        var args = Array.slice(arguments, 2);
        var vals = namespace(name);
        var elem = doc.createElementNS(vals[0] || jsonToDOM.defaultNamespace, vals[1]);

        for (var key in attr) {
            var val = attr[key];
            if (nodes && key == 'key')
                nodes[val] = elem;

            vals = namespace(key);
            if (typeof val == 'function')
                elem.addEventListener(key.replace(/^on/, ''), val, false);
            else
                elem.setAttributeNS(vals[0] || '', vals[1], val);
        }
        args.forEach(function(e) {
			try {
				elem.appendChild(
									Object.prototype.toString.call(e) == '[object Array]'
									?
										tag.apply(null, e)
									:
										e instanceof doc.defaultView.Node
										?
											e
										:
											doc.createTextNode(e)
								);
			} catch (ex) {
				elem.appendChild(doc.createTextNode(ex));
			}
        });
        return elem;
    }
    return tag.apply(null, xml);
}
/*end - dom insertion library function from MDN*/

function startup(aData, aReason) {
	self.aData = aData; //must go first, because functions in loadIntoWindow use self.aData
	console.log('aData', aData);
	//var css = '.findbar-container {-moz-binding:url(' + self.path.chrome + 'findbar.xml#matchword_xbl)}';
	//var cssEnc = encodeURIComponent(css);
	var newURIParam = {
		aURL: self.aData.resourceURI.spec + 'main.css', //'data:text/css,' + cssEnc,
		aOriginCharset: null,
		aBaseURI: null
	}
	cssUri = Services.io.newURI(newURIParam.aURL, newURIParam.aOriginCharset, newURIParam.aBaseURI);
	myServices.sss.loadAndRegisterSheet(cssUri, myServices.sss.USER_SHEET);
	
	windowListener.register();
	
	//register all observers
	for (var o in observers) {
		observers[o].reg();
	}
}

function shutdown(aData, aReason) {
	if (aReason == APP_SHUTDOWN) return;
	
	//unregister all observers
	for (var o in observers) {
		observers[o].unreg();
	}
	
	myServices.sss.unregisterSheet(cssUri, myServices.sss.USER_SHEET);
	
	windowListener.unregister();
}

function install() {}

function uninstall() {}
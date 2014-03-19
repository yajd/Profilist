var me = Services.wm.getMostRecentWindow(null);
Cu.import('resource://gre/modules/osfile.jsm');
var cProf = {
    dirPath: OS.Constants.Path.profileDir,
    dirName: 0,
    id: 0,
    name: 0
};
cProf.dirName = OS.Path.basename(cProf.dirPath)
cProf.id = cProf.dirName.substr(0, cProf.dirName.indexOf('.'));
cProf.name = cProf.dirName.substr(cProf.id.length + 1);



var profDirPath = cProf.dirPath.replace(cProf.dirName, ''); //contains ending slashs
 
 
//me.alert(profDirPath)
//console.log(cProf);

/*test if is dir
let promise = OS.File.stat(profDirPath);
promise = promise.then(
  function onSuccess(stat) {
    if (stat.isDir) {
      // The path represents a directory
        me.alert('is dir')
        console.log('id dir=',stat)
    } else {
      // The path represents a file, not a directory
        me.alert('is file')
    }
  },
  function onFailure(reason) {
    if (reason instanceof OS.File.Error && reason.becauseNoSuchFile) {
      // The file does not exist
        me.alert('path dne')
    } else {
      // Some other error
        me.alert('path exists but some other error occred:\n' + reason)
      console.warn(reason);
    }
  }
);
*/

/*get dirs in profile dir*/
let iterator = new OS.File.DirectoryIterator(profDirPath);
let entries = [];
let promise = iterator.forEach(
  function onEntry(entry) {
      console.info('entry:', entry);
      me.alert('entry:', entry);
  }
);
promise.then(
  function onSuccess() {
    // Close the iterator, sort the array, return it
    iterator.close();
  },
  function onFailure(reason) {
     // Close the iterator, propagate any error
    iterator.close();
      me.alert('error occured while iterating through profile directory, reason=' + reason)
      console.warn('error occured while iterating through profile directory, reason=', reason)
    throw reason;
  }
);

